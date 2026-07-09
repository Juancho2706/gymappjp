import { useEffect, useState } from 'react'
import { Modal, Pressable, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ChevronLeft } from 'lucide-react-native'
import type { OptimisticLogPayload } from '@eva/workout-engine'
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
}

const NUMERIC_FIELDS = [
  { key: 'weight', mode: 'weight' as const, unit: 'kg', label: 'Peso (kg)' },
  { key: 'reps', mode: 'reps' as const, unit: 'reps', label: 'Repeticiones' },
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

/**
 * Host del teclado tipado (mobile). Orquesta la secuencia peso → reps → (esfuerzo RPE/RIR) para una
 * serie, montando el `TypedKeypad` (numérico) o el `EffortScale` (dots) del contrato dentro de un
 * panel inferior propio. El commit arma el `OptimisticLogPayload` y lo entrega al padre; el draft se
 * reporta en cada cambio para la resiliencia (E2-03).
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

  // (Re)inicializa al abrir un target: valores iniciales (draft/autofill) o prefill de peso sugerido.
  useEffect(() => {
    if (!target) return
    const seed: Record<string, string> =
      target.initialValues ?? { weight: target.suggestedWeight != null ? String(target.suggestedWeight) : '' }
    setValues(seed)
    setFieldIndex(target.initialFieldIndex ?? 0)
  }, [target])

  if (!target) return null

  const totalSteps = NUMERIC_FIELDS.length + (target.effortKind ? 1 : 0)
  const onEffortStep = target.effortKind != null && fieldIndex >= NUMERIC_FIELDS.length
  const currentField = onEffortStep ? null : NUMERIC_FIELDS[Math.min(fieldIndex, NUMERIC_FIELDS.length - 1)]

  const update = (next: Record<string, string>, idx: number) => {
    setValues(next)
    onDraftChange(next, idx)
  }

  const commit = () => {
    const payload: OptimisticLogPayload = {
      blockId: target.blockId,
      setNumber: target.setNumber,
      weightKg: num(values.weight),
      repsDone: int(values.reps),
      rpe: target.effortKind === 'rpe' ? int(values.effort) : null,
      rir: target.effortKind === 'rir' ? int(values.effort) : null,
    }
    onCommit(payload)
  }

  const goNext = () => {
    if (fieldIndex + 1 >= totalSteps) {
      commit()
      return
    }
    setFieldIndex(fieldIndex + 1)
  }
  const goBack = () => setFieldIndex((i) => Math.max(0, i - 1))

  const objective = `${target.targetReps || '—'} reps${target.suggestedWeight != null ? ` · ${target.suggestedWeight} kg` : ''}`

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
            {fieldIndex > 0 && (
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

          {onEffortStep ? (
            <View className="gap-4 pb-2">
              <Text style={TYPE.label} className="text-on-dark">
                {target.effortKind === 'rir' ? 'RIR (reps en reserva)' : 'RPE (esfuerzo percibido)'}
              </Text>
              <EffortScale
                kind={target.effortKind as 'rpe' | 'rir'}
                value={int(values.effort)}
                onSelect={(v: number) => update({ ...values, effort: String(v) }, fieldIndex)}
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
          ) : currentField ? (
            <View className="pb-1">
              <Text style={TYPE.label} className="mb-2 text-on-dark">{currentField.label}</Text>
              <TypedKeypad
                mode={currentField.mode}
                unit={currentField.unit}
                value={values[currentField.key] ?? ''}
                onChange={(v: string) => update({ ...values, [currentField.key]: v }, fieldIndex)}
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
