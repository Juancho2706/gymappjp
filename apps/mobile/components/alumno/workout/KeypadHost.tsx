import { useEffect, useMemo, useState } from 'react'
import { Modal, Pressable, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ChevronLeft } from 'lucide-react-native'
import type { OptimisticLogPayload, TypedKeypadFieldDef, TypedKeypadMode } from '@eva/workout-engine'
import { TYPE } from '../../../lib/typography'
// Contrato de la ola (otro worker): teclado tipado + selector de esfuerzo. Se importan asumiendo la
// firma exacta del contrato; el orquestador integra. NO stubear.
import { TypedKeypad, EffortScale } from './TypedKeypad'

const ON_DARK = '#F4F6F8'

/** Objetivo del teclado: qué serie de qué bloque se está registrando + el estado inicial. */
export interface KeypadTarget {
  blockId: string
  setNumber: number
  exerciseName: string
  targetReps: string
  suggestedWeight: number | null
  /** Si el bloque pide esfuerzo: 'rpe' | 'rir'; null ⇒ el flujo termina en reps. */
  effortKind: 'rpe' | 'rir' | null
  /** Valores iniciales (draft restaurado o autollenado "última vez"). */
  initialValues?: Record<string, string>
  /** Paso inicial (draft restaurado). */
  initialFieldIndex?: number
  /**
   * Bloques TIPADOS (cardio/movilidad/roller): reemplaza el flujo peso→reps→esfuerzo por los campos
   * tipados de `typedKeypadFields`. Ausente ⇒ flujo strength. El commit mapea las keys tipadas a las
   * columnas `actual_*` / `reps_done` (mismo pipeline que web `TypedLogSetRow`).
   */
  typed?: { mode: TypedKeypadMode; fields: TypedKeypadFieldDef[]; objective: string }
}

/** Paso del host: una pantalla de teclado numérico, o el paso de esfuerzo (dots). */
type KeypadStep =
  | { kind: 'keypad'; key: string; mode: 'weight' | 'reps' | 'decimal' | 'integer'; unit: string; label: string }
  | { kind: 'effort' }

const STRENGTH_KEYPAD_STEPS: KeypadStep[] = [
  { kind: 'keypad', key: 'weight', mode: 'weight', unit: 'kg', label: 'Peso (kg)' },
  { kind: 'keypad', key: 'reps', mode: 'reps', unit: 'reps', label: 'Repeticiones' },
]

function num(v: string | undefined): number | null {
  if (!v) return null
  const n = parseFloat(v.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}
function int(v: string | undefined): number | null {
  const n = num(v)
  return n == null ? null : Math.round(n)
}

/** Mapea los valores tipados (por modo) a las columnas del log (`actual_*` / `reps_done`). */
function typedPayload(mode: TypedKeypadMode, values: Record<string, string>) {
  let actualDurationSec: number | null = null
  let actualDistanceM: number | null = null
  let actualHoldSec: number | null = null
  let actualAvgHr: number | null = null
  let repsDone: number | null = null
  if (mode === 'cardio') {
    const min = num(values.cardio_min)
    actualDurationSec = min != null && min > 0 ? Math.round(min * 60) : null
    actualDistanceM = num(values.actual_distance_m)
    actualAvgHr = int(values.actual_avg_hr)
  } else if (mode === 'mobility') {
    actualHoldSec = int(values.actual_hold_sec)
  } else {
    // roller
    actualDurationSec = int(values.actual_duration_sec)
    repsDone = int(values.reps_done)
  }
  return { actualDurationSec, actualDistanceM, actualHoldSec, actualAvgHr, repsDone }
}

/**
 * Host del teclado tipado (mobile). Orquesta la secuencia de registro de una serie montando el
 * `TypedKeypad` (numérico) o el `EffortScale` (dots) del contrato dentro de un panel inferior propio.
 *
 * Dos flujos según el bloque:
 *  - Strength: peso → reps → (esfuerzo RPE/RIR opcional).
 *  - Tipado (cardio/movilidad/roller): recorre los `typedKeypadFields` del modo (min/metros/FC ·
 *    hold · segundos/pasadas) y arma el payload con las columnas `actual_*`/`reps_done`.
 *
 * El commit arma el `OptimisticLogPayload` y lo entrega al padre; el draft se reporta en cada cambio
 * para la resiliencia (E2-03).
 */
export function KeypadHost({
  target,
  onClose,
  onCommit,
  onDraftChange,
}: {
  target: KeypadTarget | null
  onClose: () => void
  onCommit: (payload: OptimisticLogPayload) => void
  onDraftChange: (values: Record<string, string>, fieldIndex: number) => void
}) {
  const insets = useSafeAreaInsets()
  const [values, setValues] = useState<Record<string, string>>({})
  const [fieldIndex, setFieldIndex] = useState(0)

  // Secuencia de pasos según el tipo del bloque.
  const steps = useMemo<KeypadStep[]>(() => {
    if (!target) return []
    if (target.typed) {
      return target.typed.fields.map((f) => ({
        kind: 'keypad' as const,
        key: f.key,
        mode: f.allowDecimal ? ('decimal' as const) : ('integer' as const),
        unit: f.unit,
        label: f.label,
      }))
    }
    return [...STRENGTH_KEYPAD_STEPS, ...(target.effortKind ? [{ kind: 'effort' as const }] : [])]
  }, [target])

  // (Re)inicializa al abrir un target: valores iniciales (draft/autofill) o prefill de peso sugerido.
  useEffect(() => {
    if (!target) return
    const seed: Record<string, string> =
      target.initialValues ??
      (target.typed ? {} : { weight: target.suggestedWeight != null ? String(target.suggestedWeight) : '' })
    setValues(seed)
    setFieldIndex(target.initialFieldIndex ?? 0)
  }, [target])

  if (!target || steps.length === 0) return null

  const idx = Math.min(fieldIndex, steps.length - 1)
  const current = steps[idx]

  const update = (next: Record<string, string>, i: number) => {
    setValues(next)
    onDraftChange(next, i)
  }

  const commit = () => {
    if (target.typed) {
      const { actualDurationSec, actualDistanceM, actualHoldSec, actualAvgHr, repsDone } = typedPayload(
        target.typed.mode,
        values,
      )
      onCommit({
        blockId: target.blockId,
        setNumber: target.setNumber,
        weightKg: null,
        repsDone,
        rpe: null,
        rir: null,
        actualDurationSec,
        actualDistanceM,
        actualHoldSec,
        actualAvgHr,
      })
      return
    }
    onCommit({
      blockId: target.blockId,
      setNumber: target.setNumber,
      weightKg: num(values.weight),
      repsDone: int(values.reps),
      rpe: target.effortKind === 'rpe' ? int(values.effort) : null,
      rir: target.effortKind === 'rir' ? int(values.effort) : null,
    })
  }

  const goNext = () => {
    if (idx + 1 >= steps.length) {
      commit()
      return
    }
    setFieldIndex(idx + 1)
  }
  const goBack = () => setFieldIndex((i) => Math.max(0, i - 1))

  const objective = target.typed
    ? target.typed.objective || '—'
    : `${target.targetReps || '—'} reps${target.suggestedWeight != null ? ` · ${target.suggestedWeight} kg` : ''}`

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
        <Pressable className="flex-1" onPress={onClose} accessibilityLabel="Cerrar teclado" />
        <View
          className="rounded-t-sheet border-t border-inverse/50 bg-ink-900 px-4 pt-3"
          style={{ paddingBottom: insets.bottom + 12 }}
        >
          <View className="mb-2 items-center">
            <View className="h-1 w-10 rounded-pill bg-white/15" />
          </View>

          <View className="mb-3 flex-row items-center gap-2">
            {idx > 0 && (
              <Pressable testID="keypad-back" onPress={goBack} hitSlop={8} className="h-9 w-9 items-center justify-center rounded-control bg-white/[0.06]">
                <ChevronLeft size={18} color={ON_DARK} />
              </Pressable>
            )}
            <View className="min-w-0 flex-1">
              <Text style={TYPE.eyebrow} className="text-on-dark-muted" numberOfLines={1}>
                Serie {target.setNumber} · objetivo {objective}
              </Text>
              <Text className="font-display-bold text-[16px] text-on-dark" numberOfLines={1}>{target.exerciseName}</Text>
            </View>
          </View>

          {current.kind === 'effort' && target.effortKind ? (
            <View className="gap-4 pb-2">
              <Text style={TYPE.label} className="text-on-dark">
                {target.effortKind === 'rir' ? 'RIR (reps en reserva)' : 'RPE (esfuerzo percibido)'}
              </Text>
              <EffortScale
                kind={target.effortKind}
                value={int(values.effort)}
                onSelect={(v: number) => update({ ...values, effort: String(v) }, idx)}
              />
              <View className="flex-row gap-2">
                <Pressable testID="keypad-skip-effort" onPress={commit} className="h-12 flex-1 items-center justify-center rounded-control border border-inverse/50">
                  <Text style={TYPE.label} className="text-on-dark-muted">Omitir</Text>
                </Pressable>
                <Pressable testID="keypad-save-set" onPress={commit} className="h-12 flex-1 items-center justify-center rounded-control bg-sport-500">
                  <Text style={TYPE.label} className="text-on-sport">Guardar serie</Text>
                </Pressable>
              </View>
            </View>
          ) : current.kind === 'keypad' ? (
            <View className="pb-1">
              <Text style={TYPE.label} className="mb-2 text-on-dark">{current.label}</Text>
              <TypedKeypad
                mode={current.mode}
                unit={current.unit}
                value={values[current.key] ?? ''}
                onChange={(v: string) => update({ ...values, [current.key]: v }, idx)}
                onNext={goNext}
                onDone={commit}
              />
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  )
}
