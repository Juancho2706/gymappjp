import { useEffect, useMemo, useRef, useState } from 'react'
import { Modal, Pressable, Text, TextInput, View } from 'react-native'
import { Check, ChevronRight, CloudOff, HelpCircle, StickyNote } from 'lucide-react-native'
import {
  formatWeightEsCl,
  typedKeypadFields,
  type OptimisticLogPayload,
  type ReconciledSessionLog,
  type TypedKeypadMode,
} from '@eva/workout-engine'
import { FONT, TYPE, textStyle } from '../../../lib/typography'
import { haptics } from '../../../lib/haptics'
import { fmtTypedLoggedLine } from './workout-ui'
// RPE_HELP/RIR_HELP se importan (fuente única mobile) en vez de re-declararlos: evita el drift que la
// Ola 0 flagueó (#1). Son mirror literal —con tildes— de la web (`EffortScale.tsx:17-20`).
import { TypedKeypad, EffortScale, RPE_HELP, RIR_HELP } from './TypedKeypad'
import { buildStrengthPayload, buildTypedPayload, int } from './set-log-payload'

const SPORT_400 = '#5C9DFF'
const WARNING_500 = '#F5A524' // --color-warning-500 (serie sin sincronizar)
const ON_DARK_MUTED = '#939DAB'

/**
 * Fila de una serie (mobile). Espeja el chip recap de `LogSetForm` de web: la serie logueada muestra
 * su marca (`{peso} × {reps}` en mono, "×" atenuada) + RPE/RIR, y la activa es un tap que abre el
 * TypedKeypad. El prompt "Toca para registrar" va en Hanken (sans), NO en mono — el mono se reserva a
 * las métricas (paridad web: la frase es cuerpo, los números son datos).
 *
 * `typedMode` (cardio/movilidad/roller) muta la línea de valores a las columnas `actual_*`/`reps_done`
 * (E2-10). Ausente ⇒ strength (peso × reps · RPE/RIR).
 */
export function SetRow({
  setNumber,
  log,
  isActive,
  typedMode,
  onPress,
  onRpeUpdate,
}: {
  setNumber: number
  log?: ReconciledSessionLog
  isActive: boolean
  typedMode?: TypedKeypadMode | null
  onPress: () => void
  /**
   * Registro de RPE POST-log en series tipadas (cardio/movilidad/roller) — mirror de
   * `TypedLogSetRow` web (`LogSetForm.tsx:1112-1136`): al loguear una serie tipada se despliega la
   * MISMA escala de dots RPE; cambiarla re-submitea el log completo preservando los ejes `actual_*`
   * (crítico anti-bug hold). Opcional: sin este callback la serie tipada queda como chip simple
   * (comportamiento previo, sin regresión). No aplica a fuerza (RPE/RIR se capturan en la fila activa).
   */
  onRpeUpdate?: (payload: OptimisticLogPayload) => void
}) {
  const logged = !!log
  const pending = log?._pending === true
  const [rpeHelpOpen, setRpeHelpOpen] = useState(false)

  // Paridad web B.3: una serie TIPADA logueada muestra la escala RPE debajo de su marca; cambiarla
  // reconstruye el payload desde el log (preservando `actual_*`) y re-submitea vía `onRpeUpdate`.
  if (logged && typedMode && onRpeUpdate && log) {
    const rpePayload = (v: number): OptimisticLogPayload => ({
      blockId: log.block_id,
      setNumber,
      weightKg: log.weight_kg ?? null,
      repsDone: log.reps_done ?? null,
      rpe: v,
      rir: log.rir ?? null,
      note: log.note ?? null,
      actualDurationSec: log.actual_duration_sec ?? null,
      actualDistanceM: log.actual_distance_m ?? null,
      actualHoldSec: log.actual_hold_sec ?? null,
      actualAvgHr: log.actual_avg_hr ?? null,
    })
    return (
      <View
        testID={`set-row-${setNumber}`}
        className="gap-2 rounded-control border border-sport-500/30 bg-sport-500/[0.06] px-3 py-2.5"
      >
        <Pressable
          onPress={onPress}
          className="flex-row items-center gap-3"
          accessibilityRole="button"
          accessibilityLabel={`Editar serie ${setNumber}`}
        >
          <View className="h-7 w-7 items-center justify-center rounded-full bg-sport-500/20">
            <Check size={15} color={SPORT_400} strokeWidth={2.6} />
          </View>
          <View className="min-w-0 flex-1">
            <Text style={TYPE.eyebrow} className="text-on-dark-muted">
              Serie {setNumber}
            </Text>
            <Text
              style={TYPE.mono}
              className={`text-[13px] ${pending ? 'text-warning-500' : 'text-on-dark'}`}
              numberOfLines={1}
            >
              {fmtTypedLoggedLine(log, typedMode)}
            </Text>
          </View>
          {pending && (
            <View className="flex-row items-center gap-1">
              <CloudOff size={13} color={WARNING_500} />
              <Text
                style={{ fontFamily: FONT.uiBold, fontSize: 10, letterSpacing: 0.6, textTransform: 'uppercase' }}
                className="text-warning-500"
              >
                Sin sincronizar
              </Text>
            </View>
          )}
        </Pressable>

        {/* RPE post-registro con la MISMA escala segmentada (mirror `LogSetForm.tsx:1121-1135`) */}
        <View>
          <View className="mb-1 flex-row items-center gap-1">
            <Text style={TYPE.eyebrow} className="text-on-dark-muted">
              Esfuerzo · RPE
            </Text>
            <EffortLabel label="RPE" open={rpeHelpOpen} onToggle={() => setRpeHelpOpen((o) => !o)} />
          </View>
          {rpeHelpOpen && (
            <Text style={TYPE.caption} className="mb-1.5 text-[11px] text-on-dark-muted">
              {RPE_HELP}
            </Text>
          )}
          <EffortScale kind="rpe" value={log.rpe ?? null} onSelect={(v) => onRpeUpdate(rpePayload(v))} compact />
        </View>
      </View>
    )
  }

  return (
    <Pressable
      testID={`set-row-${setNumber}`}
      onPress={onPress}
      className={`flex-row items-center gap-3 rounded-control border px-3 py-2.5 ${
        logged
          ? 'border-sport-500/30 bg-sport-500/[0.06]'
          : isActive
            ? 'border-sport-500/50 bg-white/[0.04]'
            : 'border-inverse/50 bg-white/[0.02]'
      }`}
      accessibilityRole="button"
      accessibilityLabel={logged ? `Editar serie ${setNumber}` : `Registrar serie ${setNumber}`}
    >
      <View
        className={`h-7 w-7 items-center justify-center rounded-full ${
          logged ? 'bg-sport-500/20' : 'bg-white/[0.06]'
        }`}
      >
        {logged ? (
          <Check size={15} color={SPORT_400} strokeWidth={2.6} />
        ) : (
          <Text style={TYPE.mono} className="text-[12px] text-on-dark-muted">
            {setNumber}
          </Text>
        )}
      </View>
      <View className="min-w-0 flex-1">
        <Text style={TYPE.eyebrow} className="text-on-dark-muted">
          Serie {setNumber}
        </Text>
        {!logged ? (
          <Text style={TYPE.caption} className="text-[13px] text-on-dark-muted" numberOfLines={1}>
            Toca para registrar
          </Text>
        ) : typedMode ? (
          <Text
            style={TYPE.mono}
            className={`text-[13px] ${pending ? 'text-warning-500' : 'text-on-dark'}`}
            numberOfLines={1}
          >
            {fmtTypedLoggedLine(log, typedMode)}
          </Text>
        ) : (
          <View className="flex-row flex-wrap items-center gap-x-2">
            <Text
              style={TYPE.mono}
              className={`text-[13px] font-mono-bold ${pending ? 'text-warning-500' : 'text-on-dark'}`}
            >
              {log?.weight_kg ?? '–'}
              <Text className="text-on-dark-muted"> × </Text>
              {log?.reps_done ?? '–'}
            </Text>
            {log?.rpe != null && (
              <Text style={TYPE.mono} className="text-[11px] text-on-dark-muted">RPE {log.rpe}</Text>
            )}
            {log?.rir != null && (
              <Text style={TYPE.mono} className="text-[11px] text-on-dark-muted">RIR {log.rir}</Text>
            )}
            {/* Ícono nota (paridad web A.3, `LogSetForm.tsx:553-555`): señala que la serie lleva nota
                para el coach. Sin token `amber` en el theme mobile ⇒ warning-500 (mismo ámbar del pending). */}
            {log?.note?.trim() ? (
              <StickyNote size={13} color={WARNING_500} accessibilityLabel="Serie con nota" />
            ) : null}
          </View>
        )}
      </View>
      {!logged ? (
        <ChevronRight size={18} color={SPORT_400} />
      ) : pending ? (
        <View className="flex-row items-center gap-1">
          <CloudOff size={13} color={WARNING_500} />
          <Text
            style={{ fontFamily: FONT.uiBold, fontSize: 10, letterSpacing: 0.6, textTransform: 'uppercase' }}
            className="text-warning-500"
          >
            Sin sincronizar
          </Text>
        </View>
      ) : null}
    </Pressable>
  )
}

// ─── ActiveSetRow ─────────────────────────────────────────────────────────────

const BOX_VALUE_STYLE = textStyle('2xl', FONT.monoBold, { ls: 'tight' })

type FieldMode = 'weight' | 'reps' | 'decimal' | 'integer'
interface RowField {
  key: string
  label: string
  unit: string
  mode: FieldMode
}

/** Caja de input visible (label arriba + borde + valor/placeholder). Tap abre el TypedKeypad. */
function FieldBox({
  label,
  value,
  active,
  onPress,
  testID,
}: {
  label: string
  value: string
  active: boolean
  onPress: () => void
  testID: string
}) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      className="flex-1"
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value || 'sin valor'}, toca para editar`}
    >
      <Text style={TYPE.eyebrow} className="mb-1 text-on-dark-muted">
        {label}
      </Text>
      <View
        className={`h-14 items-center justify-center rounded-control border bg-white/[0.06] ${
          active ? 'border-sport-500' : 'border-inverse'
        }`}
      >
        <Text style={BOX_VALUE_STYLE} className={value ? 'text-on-dark' : 'text-on-dark-muted/40'}>
          {value || '-'}
        </Text>
      </View>
    </Pressable>
  )
}

/**
 * Botoncito (?) que despliega una ayuda corta inline junto al label de esfuerzo (mirror de `EffortHelp`
 * web `EffortScale.tsx:29-44`). El ícono es chico (14px) pero el hit-area es ≥44px vía `hitSlop` — la web
 * exige ≥44px con `h-11 w-11` y márgenes negativos para no inflar la fila (Ola 0 · discrepancia #6, el
 * puerto previo daba ~30px con `hitSlop={8}`). `label` da la etiqueta específica "¿Qué es el RPE/RIR?".
 */
function EffortLabel({ label, open, onToggle }: { label: 'RPE' | 'RIR'; open: boolean; onToggle: () => void }) {
  return (
    <Pressable
      onPress={onToggle}
      hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
      accessibilityRole="button"
      accessibilityLabel={`¿Qué es el ${label}?`}
      accessibilityState={{ expanded: open }}
    >
      <HelpCircle size={14} color={ON_DARK_MUTED} />
    </Pressable>
  )
}

/**
 * Fila de REGISTRO expandida de la serie activa (mobile) — reconstrucción visual 1:1 de la fila
 * activa del `LogSetForm` web (QA Ronda 5): cajas KG/REPS grandes con label arriba y borde
 * (placeholder "-"), el simbolo × entre ambas, ESFUERZO · RPE y REPS EN RESERVA · RIR con sus dots
 * inline (`EffortScale`, mirror de `ScaleDots`) y readout a la derecha, y el boton circulo-check para
 * confirmar la serie. Para bloques TIPADOS (cardio/movilidad/roller) muestra sus campos como la web.
 *
 * El TypedKeypad sigue siendo el MECANISMO de entrada numerica (tap en una caja lo abre); la FILA es
 * lo que debe verse igual a la web. El commit no cambia: arma el `OptimisticLogPayload` con los mismos
 * builders puros que el keypad y lo entrega al padre (`onCommit` → `logSet` intacto).
 */
export function ActiveSetRow({
  blockId,
  setNumber,
  typedMode,
  suggestedWeight,
  seedValues,
  autofill,
  onDraftChange,
  onCommit,
}: {
  blockId: string
  setNumber: number
  typedMode: TypedKeypadMode | null
  /** Peso sugerido (sobrecarga) — pre-llena la caja KG en strength. */
  suggestedWeight: number | null
  /** Draft restaurado de ESTA serie (resiliencia E2-03); pre-llena las cajas al reabrir. */
  seedValues?: Record<string, string> | null
  /** Autollenado "= usar ultima vez" (nonce dispara la re-siembra de KG/REPS). */
  autofill?: { weight: number | null; reps: number | null; nonce: number } | null
  onDraftChange: (values: Record<string, string>, fieldIndex: number) => void
  onCommit: (payload: OptimisticLogPayload) => void
}) {
  const fields: RowField[] = useMemo(() => {
    if (typedMode) {
      return typedKeypadFields(typedMode).map((f) => ({
        key: f.key,
        label: f.label,
        unit: f.unit,
        mode: f.allowDecimal ? ('decimal' as const) : ('integer' as const),
      }))
    }
    return [
      { key: 'weight', label: 'Kg', unit: 'kg', mode: 'weight' },
      { key: 'reps', label: 'Reps', unit: 'reps', mode: 'reps' },
    ]
  }, [typedMode])

  const [values, setValues] = useState<Record<string, string>>(() => {
    if (seedValues) return { ...seedValues }
    if (!typedMode && suggestedWeight != null) return { weight: formatWeightEsCl(suggestedWeight) }
    return {}
  })
  const valuesRef = useRef(values)
  valuesRef.current = values
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [helpKey, setHelpKey] = useState<'rpe' | 'rir' | null>(null)
  // Nota rápida por serie (strength) — desplegable como en web (A.4.d). El texto vive en `values.note`
  // (mismo carril que rpe/rir → viaja al draft y al `buildStrengthPayload`).
  const [noteOpen, setNoteOpen] = useState(false)
  const noteTrimmed = (values.note ?? '').trim()

  // Escritura única: sincroniza ref + estado + reporta el draft (resiliencia). idx = campo tocado.
  const patch = (p: Record<string, string>, idx = 0) => {
    const next = { ...valuesRef.current, ...p }
    valuesRef.current = next
    setValues(next)
    onDraftChange(next, idx)
  }

  // Autollenado "= usar": re-siembra KG/REPS cuando cambia el nonce (no en cada render).
  const lastAutofill = useRef<number | null>(null)
  useEffect(() => {
    if (!autofill || autofill.nonce === lastAutofill.current) return
    lastAutofill.current = autofill.nonce
    patch({
      weight: autofill.weight != null ? formatWeightEsCl(autofill.weight) : valuesRef.current.weight ?? '',
      reps: autofill.reps != null ? String(autofill.reps) : valuesRef.current.reps ?? '',
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autofill?.nonce])

  const idxOf = (key: string) => Math.max(0, fields.findIndex((f) => f.key === key))
  const openField = (key: string) => {
    haptics.tap()
    setOpenKey(key)
  }
  const goNext = () => {
    const i = fields.findIndex((f) => f.key === openKey)
    if (i >= 0 && i + 1 < fields.length) setOpenKey(fields[i + 1].key)
    else setOpenKey(null)
  }

  const commit = () => {
    const payload = typedMode
      ? buildTypedPayload(typedMode, valuesRef.current, blockId, setNumber)
      : buildStrengthPayload(valuesRef.current, blockId, setNumber)
    onCommit(payload)
  }

  const currentField = openKey ? fields.find((f) => f.key === openKey) ?? null : null

  return (
    <View
      testID={`active-set-row-${setNumber}`}
      className="gap-3 rounded-control border border-sport-500/50 bg-sport-500/[0.06] p-3"
    >
      {/* Cajas KG × REPS (strength) o campos tipados — label arriba + borde, tap abre el keypad */}
      <View className="flex-row items-end gap-2.5">
        <View className="h-14 w-7 items-center justify-center">
          <View className="h-7 w-7 items-center justify-center rounded-full bg-sport-500/20">
            <Text style={TYPE.mono} className="text-[13px] text-sport-300">
              {setNumber}
            </Text>
          </View>
        </View>
        {typedMode ? (
          fields.map((f) => (
            <FieldBox
              key={f.key}
              label={f.label}
              value={values[f.key] ?? ''}
              active={openKey === f.key}
              onPress={() => openField(f.key)}
              testID={`set-field-${setNumber}-${f.key}`}
            />
          ))
        ) : (
          <>
            <FieldBox
              label="Kg"
              value={values.weight ?? ''}
              active={openKey === 'weight'}
              onPress={() => openField('weight')}
              testID={`set-field-${setNumber}-weight`}
            />
            <View className="pb-4">
              <Text style={textStyle('xl', FONT.ui)} className="text-on-dark-muted">
                ×
              </Text>
            </View>
            <FieldBox
              label="Reps"
              value={values.reps ?? ''}
              active={openKey === 'reps'}
              onPress={() => openField('reps')}
              testID={`set-field-${setNumber}-reps`}
            />
          </>
        )}
      </View>

      {/* Esfuerzo RPE + RIR con dots inline (strength) — mirror de ScaleDots web */}
      {!typedMode && (
        <View className="gap-2.5">
          <View>
            <View className="mb-1 flex-row items-center gap-1">
              <Text style={TYPE.eyebrow} className="text-on-dark-muted">
                Esfuerzo · RPE
              </Text>
              <EffortLabel label="RPE" open={helpKey === 'rpe'} onToggle={() => setHelpKey((k) => (k === 'rpe' ? null : 'rpe'))} />
            </View>
            {helpKey === 'rpe' && (
              <Text style={TYPE.caption} className="mb-1.5 text-[11px] text-on-dark-muted">
                {RPE_HELP}
              </Text>
            )}
            <EffortScale kind="rpe" value={int(values.rpe)} onSelect={(v) => patch({ rpe: String(v) })} />
          </View>
          <View>
            <View className="mb-1 flex-row items-center gap-1">
              <Text style={TYPE.eyebrow} className="text-on-dark-muted">
                Reps en reserva · RIR
              </Text>
              <EffortLabel label="RIR" open={helpKey === 'rir'} onToggle={() => setHelpKey((k) => (k === 'rir' ? null : 'rir'))} />
            </View>
            {helpKey === 'rir' && (
              <Text style={TYPE.caption} className="mb-1.5 text-[11px] text-on-dark-muted">
                {RIR_HELP}
              </Text>
            )}
            <EffortScale kind="rir" value={int(values.rir)} onSelect={(v) => patch({ rir: String(v) })} />
          </View>
        </View>
      )}

      {/* Nota rápida por serie (strength) — mirror web A.4.d (`LogSetForm.tsx:699-736`): toggle + input
          desplegable, máx 300 chars, viaja al coach vía `values.note` → `buildStrengthPayload`. */}
      {!typedMode && (
        <View>
          <Pressable
            testID={`note-toggle-${setNumber}`}
            onPress={() => setNoteOpen((o) => !o)}
            accessibilityRole="button"
            accessibilityState={{ expanded: noteOpen }}
            accessibilityLabel={noteTrimmed ? 'Editar la nota de la serie' : 'Agregar una nota a la serie'}
            className="min-h-[36px] flex-row items-center gap-1.5 self-start rounded-control px-2 active:opacity-70"
          >
            <StickyNote size={14} color={noteTrimmed ? WARNING_500 : ON_DARK_MUTED} />
            <Text
              style={[TYPE.caption, { fontFamily: FONT.uiSemibold }]}
              className={`text-[11px] ${noteTrimmed ? 'text-warning-500' : 'text-on-dark-muted'}`}
            >
              {noteTrimmed ? 'Nota añadida' : 'Agregar nota'}
            </Text>
          </Pressable>
          {noteOpen && (
            <TextInput
              testID={`note-input-${setNumber}`}
              value={values.note ?? ''}
              onChangeText={(t) => patch({ note: t })}
              maxLength={300}
              placeholder="Ej: sentí molestia en el hombro"
              placeholderTextColor={ON_DARK_MUTED}
              accessibilityLabel="Nota de la serie para tu coach"
              style={textStyle('xs', FONT.ui)}
              className="mt-1.5 rounded-control border border-inverse bg-white/[0.06] px-3 py-2 text-on-dark"
            />
          )}
        </View>
      )}

      {/* Boton circulo-check para confirmar la serie (commit intacto) */}
      <View className="flex-row justify-end">
        <Pressable
          testID={`confirm-set-${setNumber}`}
          onPress={() => {
            haptics.setDone()
            commit()
          }}
          className="h-12 w-12 items-center justify-center rounded-full border-2 border-sport-500 bg-sport-500"
          accessibilityRole="button"
          accessibilityLabel={`Confirmar serie ${setNumber}`}
        >
          <Check size={22} color="#FFFFFF" strokeWidth={2.6} />
        </Pressable>
      </View>

      {/* Teclado numerico: mecanismo de entrada de la caja tocada (tap abre / Siguiente / Listo) */}
      {openKey && currentField && (
        <Modal transparent visible animationType="none" onRequestClose={() => setOpenKey(null)}>
          <View className="flex-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
            <Pressable className="flex-1" onPress={() => setOpenKey(null)} accessibilityLabel="Cerrar teclado" />
            <TypedKeypad
              mode={currentField.mode}
              unit={currentField.unit}
              value={values[openKey] ?? ''}
              onChange={(v) => patch({ [openKey]: v }, idxOf(openKey))}
              onNext={goNext}
              onDone={() => {
                setOpenKey(null)
                commit()
              }}
            />
          </View>
        </Modal>
      )}
    </View>
  )
}
