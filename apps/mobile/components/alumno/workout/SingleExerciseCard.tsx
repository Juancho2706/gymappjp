import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { MotiView } from 'moti'
import {
  ArrowRightLeft,
  CheckCircle2,
  ChevronDown,
  History,
  Info,
  Play,
  Quote,
  TrendingUp,
  Undo2,
} from 'lucide-react-native'
import type { ExerciseType, OptimisticLogPayload, ReconciledSessionLog, TypedKeypadMode } from '@eva/workout-engine'
import type { HrZoneRange } from '@eva/cardio'
import { FONT, TYPE } from '../../../lib/typography'
import { useTheme } from '../../../context/ThemeContext'
import { EXERCISE_TYPE_META, exerciseTypeColor } from '../../../lib/exercise-type-meta'
import type { EffectiveTarget } from '../../../lib/workout/progression'
import type { PrevSet, SessionBlock, SessionDraft, SessionExercise } from '../../../lib/workout-session'
import { formatRelativeDate } from '../../../lib/date-utils'
import { SetRow, ActiveSetRow } from './SetRow'
import { TypedBlockTimerButton, TypedTargetGrid } from './TypedTargetGrid'
import { bestPrevOf, overloadChipLabel, overloadDetailText } from './workout-ui'

// Fixed DS hues for lucide icon `color` props (mirrors Button/VideoPlayer literal-color pattern).
// Los iconos web heredan `currentColor` del texto adyacente → acá igualamos el TIER del texto:
// TrendingUp junto a `text-sport-300` usa SPORT_300; ArrowRightLeft del badge `text-ember-200` usa
// EMBER_200 (antes iban a sport-400/ember-300, un tier más brillante/oscuro que el texto).
const SPORT_400 = '#5C9DFF' // --color-sport-400 (92 157 255) — CheckCircle2 (text-sport-400)
const SPORT_300 = '#93BEFF' // --color-sport-300 (147 190 255) — TrendingUp (text-sport-300)
const ON_DARK = '#F4F6F8'
const ON_DARK_MUTED = '#939DAB'
const EMBER_200 = '#FFD6C7' // --color-ember-200 (255 214 199) — ArrowRightLeft (text-ember-200)

// NativeWind v4: el `style` inline pisa la `fontFamily` compilada de la className, así que
// `style={TYPE.mono}` + `className="font-mono-bold"` renderiza el peso REGULAR (bug ola0). Fijamos
// la cara bold por `style` (array) y quitamos la clase de fuente en esos Text para que el bold aplique.
const MONO_BOLD = { fontFamily: FONT.monoBold } as const
const SANS_BOLD = { fontFamily: FONT.uiBold } as const

/**
 * Card de un ejercicio suelto (mobile) — re-skin del `SingleExerciseCard` de web (E2-07): fila
 * tipo·músculo + acciones, dots de progreso de series, chip de sobrecarga, "Última vez" tap-autofill
 * (E2-17), cue de técnica y disclosure de Detalles. Los bloques TIPADOS (cardio/movilidad/roller,
 * `effType !== 'strength'`) reemplazan la prescripción strength por `TypedTargetGrid` + botón de timer
 * y registran por columnas `actual_*`/`reps_done` (E2-10).
 */
export function SingleExerciseCard({
  block,
  exercise,
  effType,
  eff,
  currentWeek,
  blockLogs,
  prevList,
  focus,
  detailsOpen,
  substitution,
  canSubstitute,
  restoredDraft,
  hrZones,
  onToggleDetails,
  onOpenTechnique,
  onOpenSet,
  onCommitSet,
  onRpeUpdate,
  onDraftChange,
  onOpenSubstitute,
  onUndoSubstitution,
  onToggleCollapse,
}: {
  block: SessionBlock
  exercise: SessionExercise
  effType: ExerciseType
  eff: EffectiveTarget | null
  currentWeek: number | null
  blockLogs: ReconciledSessionLog[]
  prevList: PrevSet[]
  focus: 'active' | 'upcoming' | 'done'
  detailsOpen: boolean
  substitution: { name: string; prescribedName: string } | null
  canSubstitute: boolean
  /** Draft restaurado del set en curso (resiliencia E2-03) — pre-llena la fila activa al reabrir. */
  restoredDraft: SessionDraft | null
  /** Rangos bpm por zona del alumno (E2-11, cardio gated); null si el módulo cardio está OFF. */
  hrZones?: HrZoneRange[] | null
  onToggleDetails: () => void
  onOpenTechnique: () => void
  /** Tap en una serie ya logueada / proxima (no la activa): abre el teclado de edicion (KeypadHost). */
  onOpenSet: (setNumber: number) => void
  /** Confirma la serie activa (arma el payload la propia fila): logSet intacto. */
  onCommitSet: (payload: OptimisticLogPayload) => void
  /** Registro de RPE post-log en series tipadas (re-submitea el log sin re-disparar el descanso). */
  onRpeUpdate?: (payload: OptimisticLogPayload) => void
  /** Reporta el draft del set en curso (resiliencia). */
  onDraftChange: (blockId: string, setNumber: number, values: Record<string, string>, fieldIndex: number) => void
  onOpenSubstitute: () => void
  onUndoSubstitution: () => void
  /**
   * Colapsa el ejercicio COMPLETADO a su recap (paridad web `toggleExpandDone`, SingleExerciseCard
   * web:249-259). El padre decide si muestra la card completa o la barra recap; el CheckCircle2 solo
   * dispara el toggle. Opcional: en modo Pasos la card no colapsa (siempre editable, como web).
   */
  onToggleCollapse?: () => void
}) {
  const { theme } = useTheme()
  // Autollenado "= usar ultima vez": siembra las cajas KG/REPS de la fila activa (nonce dispara).
  const [autofill, setAutofill] = useState<{ weight: number | null; reps: number | null; nonce: number } | null>(null)
  const isStrength = effType === 'strength'
  const typeMeta = EXERCISE_TYPE_META[effType]
  const TypeIcon = typeMeta.Icon
  const typeColor = exerciseTypeColor(effType, theme.primary)
  const typedMode: TypedKeypadMode | null = isStrength ? null : (effType as TypedKeypadMode)
  const loggedSetNumbers = new Set(
    blockLogs.filter((l) => l.set_number >= 1 && l.set_number <= block.sets).map((l) => l.set_number),
  )
  const doneCount = loggedSetNumbers.size
  const complete = doneCount >= block.sets
  let firstUnlogged: number | null = null
  for (let i = 1; i <= block.sets; i += 1) {
    if (!loggedSetNumbers.has(i)) { firstUnlogged = i; break }
  }

  const suggestedWeightKg = eff?.weightKg ?? block.target_weight_kg
  const overloadLabel = overloadChipLabel(block, eff, currentWeek)
  const overloadDetail = overloadDetailText(block, eff, currentWeek)
  const bestPrev = bestPrevOf(prevList)
  const beatIt =
    bestPrev?.weight_kg != null && bestPrev.weight_kg > 0 && suggestedWeightKg != null && suggestedWeightKg >= bestPrev.weight_kg
  const cueLine = isStrength ? exercise.instructions?.[0]?.replace(/^Step:\d+\s*/i, '') ?? null : null
  const hasDetails =
    (isStrength ? (exercise.instructions?.length ?? 0) > 0 : !!block.instructions) ||
    (isStrength && !!overloadDetail) ||
    !!block.notes ||
    prevList.length > 0
  const hasTechnique = !!(exercise.gif_url || exercise.video_url)

  // border-inverse es blanco puro en el theme mobile (global.css:110 "apply /10"); web usa el token a
  // 10% (globals.css --border-inverse rgba(255,255,255,.10)). /50 salía 5x más brillante → /10.
  const borderClass =
    focus === 'active' ? 'border-sport-500/50' : focus === 'done' ? 'border-sport-500/30' : 'border-inverse/10'

  return (
    <View className={`relative gap-3 rounded-card border bg-white/[0.03] p-4 ${borderClass}`}>
      {/* Fila silenciosa: músculo + acciones (Detalles / Cambiar / Técnica) */}
      <View className="flex-row items-center justify-between gap-2">
        <View className="min-w-0 flex-1 flex-row items-center gap-1.5">
          <TypeIcon size={14} color={typeColor} />
          <Text style={{ fontFamily: FONT.uiBold, fontSize: 11, color: typeColor }} numberOfLines={1}>
            {typeMeta.label}
          </Text>
          {exercise.muscle_group && (
            <>
              <Text style={{ fontSize: 11 }} className="text-on-dark-muted/40">·</Text>
              <Text
                style={{ fontFamily: FONT.uiSemibold, fontSize: 11 }}
                className="min-w-0 shrink text-on-dark-muted"
                numberOfLines={1}
              >
                {exercise.muscle_group}
              </Text>
            </>
          )}
        </View>
        <View className="flex-row shrink-0 items-center gap-1">
          {hasDetails && (
            <Pressable
              testID="btn-details"
              onPress={onToggleDetails}
              className="h-8 flex-row items-center gap-1 rounded-control px-2 active:opacity-70"
              accessibilityRole="button"
              accessibilityLabel="Ver detalles del ejercicio"
              accessibilityState={{ expanded: detailsOpen }}
            >
              <Info size={14} color={ON_DARK_MUTED} />
              <Text style={[TYPE.caption, { fontFamily: FONT.uiSemibold }]} className="text-[11px] text-on-dark-muted">Detalles</Text>
              <ChevronDown size={12} color={ON_DARK_MUTED} style={{ transform: [{ rotate: detailsOpen ? '180deg' : '0deg' }] }} />
            </Pressable>
          )}
          {isStrength && canSubstitute && !substitution && (
            <Pressable
              testID="btn-substitute"
              onPress={onOpenSubstitute}
              className="h-8 flex-row items-center gap-1 rounded-control px-2 active:opacity-70"
              accessibilityRole="button"
              accessibilityLabel={`Cambiar ${exercise.name} — máquina ocupada`}
            >
              <ArrowRightLeft size={14} color={ON_DARK_MUTED} />
              <Text style={[TYPE.caption, { fontFamily: FONT.uiSemibold }]} className="text-[11px] text-on-dark-muted">Cambiar</Text>
            </Pressable>
          )}
          {hasTechnique && (
            <Pressable
              testID="btn-technique"
              onPress={onOpenTechnique}
              className="h-8 flex-row items-center gap-1 rounded-control bg-white/[0.06] px-2.5 active:bg-white/[0.12]"
              accessibilityRole="button"
              accessibilityLabel={`Ver técnica de ${exercise.name}`}
            >
              <Play size={12} color={ON_DARK} fill={ON_DARK} />
              <Text style={[TYPE.caption, SANS_BOLD]} className="text-[11px] text-on-dark">Técnica</Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* Sustitución activa (Fase L · C): badge + deshacer mientras no haya sets */}
      {substitution && (
        <View className="flex-row flex-wrap items-center gap-2">
          <View className="flex-row items-center gap-1.5 rounded-full border border-ember-500/30 bg-ember-500/[0.12] px-2.5 py-1">
            <ArrowRightLeft size={12} color={EMBER_200} />
            <Text style={[TYPE.caption, SANS_BOLD]} className="text-[11px] text-ember-200">Sustituido · máquina ocupada</Text>
          </View>
          <Text style={TYPE.caption} className="text-[11px] text-on-dark-muted">
            en vez de <Text style={SANS_BOLD} className="text-on-dark">{substitution.prescribedName}</Text>
          </Text>
          {canSubstitute && (
            <Pressable testID="btn-undo-substitute" onPress={onUndoSubstitution} className="ml-auto h-8 flex-row items-center gap-1 rounded-control px-2 active:opacity-70" accessibilityRole="button" accessibilityLabel="Deshacer la sustitución">
              <Undo2 size={14} color={ON_DARK_MUTED} />
              <Text style={[TYPE.caption, { fontFamily: FONT.uiSemibold }]} className="text-[11px] text-on-dark-muted">Deshacer</Text>
            </Pressable>
          )}
        </View>
      )}

      {/* Nombre + dots de progreso (o check al completar) */}
      <View className="flex-row items-start justify-between gap-3">
        <Text
          style={{ letterSpacing: -0.44 }}
          className="min-w-0 flex-1 font-display-black text-[22px] leading-[24px] text-on-dark"
        >
          {exercise.name}
        </Text>
        {complete ? (
          <Pressable
            testID="btn-collapse-done"
            onPress={onToggleCollapse}
            disabled={!onToggleCollapse}
            className="shrink-0 active:opacity-70"
            accessibilityRole="button"
            accessibilityLabel="Colapsar ejercicio completado"
          >
            <MotiView from={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 25 }}>
              <CheckCircle2 size={28} color={SPORT_400} />
            </MotiView>
          </Pressable>
        ) : (
          <View className="flex-row shrink-0 items-center gap-1 pt-2">
            {Array.from({ length: block.sets }).map((_, i) => (
              <View key={i} className={`h-1.5 w-1.5 rounded-full ${i < doneCount ? 'bg-sport-400' : 'bg-white/15'}`} />
            ))}
            <Text style={TYPE.mono} className="ml-1 text-[11px] text-on-dark-muted">{doneCount}/{block.sets}</Text>
          </View>
        )}
      </View>

      {/* Bloques tipados (cardio/movilidad/roller): grilla de objetivos + botón de timer (E2-10) */}
      {!isStrength && (
        <View className="gap-2">
          <TypedTargetGrid block={block} kind={effType} hrZones={hrZones} />
          <TypedBlockTimerButton block={block} kind={effType} />
        </View>
      )}

      {/* Línea de prescripción + chip de sobrecarga (strength) */}
      {isStrength && (
        <View className="flex-row flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
          {/* Segmentos separados por `·` atenuado (web usa <Sep/> = text-on-dark-muted/40, no el color
              del segmento). Wrapper con gap-y-0.5 como web (:274). */}
          <View className="flex-row flex-wrap items-center gap-x-2 gap-y-0.5">
            <Text style={[TYPE.mono, MONO_BOLD]} className="text-[13px] text-on-dark">{block.sets} × {block.reps}</Text>
            {block.target_weight_kg != null && (
              <>
                <Sep />
                <Text style={[TYPE.mono, MONO_BOLD]} className="text-[13px] text-on-dark">{suggestedWeightKg ?? block.target_weight_kg} kg</Text>
              </>
            )}
            {block.rest_time && (
              <>
                <Sep />
                <Text style={TYPE.mono} className="text-[13px] text-on-dark-muted">desc {block.rest_time}</Text>
              </>
            )}
            {block.tempo && (
              <>
                <Sep />
                <Text style={TYPE.mono} className="text-[13px] text-on-dark-muted">tempo {block.tempo}</Text>
              </>
            )}
            {block.rir && (
              <>
                <Sep />
                <Text style={TYPE.mono} className="text-[13px] text-on-dark-muted">RIR {block.rir}</Text>
              </>
            )}
          </View>
          {overloadLabel && (
            <View className="flex-row items-center gap-1 rounded-full border border-sport-500/30 bg-sport-500/[0.10] px-2 py-0.5">
              <TrendingUp size={12} color={SPORT_300} />
              <Text style={[TYPE.caption, SANS_BOLD]} className="text-[11px] text-sport-300">{overloadLabel}</Text>
            </View>
          )}
        </View>
      )}

      {/* "Última vez" tap-autofill (E2-17) + "Supera tu marca" (strength) */}
      {isStrength && bestPrev && (
        <Pressable
          testID="btn-autofill-last"
          disabled={firstUnlogged == null}
          onPress={() => { if (firstUnlogged != null) setAutofill({ weight: bestPrev.weight_kg, reps: bestPrev.reps_done, nonce: Date.now() }) }}
          className="min-h-[40px] w-full flex-row flex-wrap items-center gap-x-2 gap-y-0.5 rounded-control py-1 active:bg-white/[0.05]"
          accessibilityRole="button"
          accessibilityLabel={firstUnlogged != null && bestPrev.weight_kg ? `Autollenar la serie activa con ${bestPrev.weight_kg} kg por ${bestPrev.reps_done ?? '-'} reps` : undefined}
        >
          <History size={14} color={ON_DARK_MUTED} />
          <Text style={[TYPE.caption, { fontFamily: FONT.uiSemibold }]} className="text-[11px] text-on-dark-muted">Última vez:</Text>
          <Text style={[TYPE.mono, MONO_BOLD]} className="text-[11px] text-on-dark">
            {bestPrev.weight_kg ? `${bestPrev.weight_kg}kg` : '-'} × {bestPrev.reps_done || '-'}
          </Text>
          {beatIt && (
            <View className="flex-row items-center gap-1">
              <TrendingUp size={12} color={SPORT_300} />
              <Text style={[TYPE.caption, SANS_BOLD]} className="text-[11px] text-sport-300">Supera tu marca</Text>
            </View>
          )}
          {firstUnlogged != null && (
            <Text style={[TYPE.caption, SANS_BOLD]} className="ml-auto text-[11px] text-sport-300">= usar</Text>
          )}
        </Pressable>
      )}

      {/* Cue de técnica inline */}
      {cueLine && (
        <Text style={TYPE.caption} className="text-[12px] text-on-dark-muted" numberOfLines={1}>{cueLine}</Text>
      )}

      {/* Detalles (disclosure) */}
      {detailsOpen && (
        <MotiView
          from={{ opacity: 0, translateY: -4 }}
          animate={{ opacity: 1, translateY: 0 }}
          className="gap-3 rounded-card border border-inverse/10 bg-white/[0.02] p-3"
        >
          {isStrength && exercise.instructions && exercise.instructions.length > 0 && (
            <View>
              <Text style={TYPE.eyebrow} className="mb-1 text-on-dark-muted">Técnica</Text>
              <View className="gap-1">
                {exercise.instructions.map((step, i) => (
                  <View key={i} className="flex-row gap-2">
                    <Text style={TYPE.mono} className="text-[12px] text-on-dark-muted">{i + 1}.</Text>
                    <Text style={TYPE.caption} className="flex-1 text-[12px] text-on-dark/90">{step.replace(/^Step:\d+\s*/i, '')}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
          {!isStrength && block.instructions && (
            <View>
              <Text style={TYPE.eyebrow} className="mb-1 text-on-dark-muted">Instrucciones</Text>
              <Text style={TYPE.caption} className="text-[12px] text-on-dark/90">{block.instructions}</Text>
            </View>
          )}
          {block.notes && (
            <View>
              <Text style={TYPE.eyebrow} className="mb-1 text-on-dark-muted">Nota del coach</Text>
              <View className="flex-row gap-2">
                <Quote size={14} color={ON_DARK_MUTED} style={{ marginTop: 2 }} />
                <Text style={TYPE.caption} className="flex-1 text-[12px] text-on-dark/90">{block.notes}</Text>
              </View>
            </View>
          )}
          {isStrength && overloadDetail && (
            <View>
              <Text style={TYPE.eyebrow} className="mb-1 text-on-dark-muted">Sobrecarga progresiva</Text>
              <Text style={TYPE.caption} className="text-[12px] text-on-dark/90">{overloadDetail}</Text>
            </View>
          )}
          {prevList.length > 0 && (
            <View>
              <Text style={TYPE.eyebrow} className="mb-1 text-on-dark-muted">Historial</Text>
              <View className="gap-0.5">
                {prevList.slice(0, 5).map((s, i) => (
                  <View key={i} className="flex-row justify-between">
                    <Text style={TYPE.mono} className="text-[11px] text-on-dark-muted">{formatRelativeDate(s.date)}</Text>
                    <Text style={TYPE.mono} className="text-[11px] text-on-dark">{s.weight_kg ? `${s.weight_kg}kg` : '-'} × {s.reps_done || '-'}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </MotiView>
      )}

      {/* Series: la ACTIVA es la fila de registro expandida (paridad web); las demas son chips/prompts */}
      <View className="gap-1.5">
        {Array.from({ length: block.sets }).map((_, i) => {
          const setNumber = i + 1
          const log = blockLogs.find((l) => l.set_number === setNumber)
          if (!log && setNumber === firstUnlogged) {
            const seed =
              restoredDraft && restoredDraft.blockId === block.id && restoredDraft.setNumber === setNumber
                ? restoredDraft.values
                : null
            return (
              <ActiveSetRow
                key={setNumber}
                blockId={block.id}
                setNumber={setNumber}
                typedMode={typedMode}
                suggestedWeight={suggestedWeightKg ?? null}
                seedValues={seed}
                autofill={autofill}
                onDraftChange={(values, fieldIndex) => onDraftChange(block.id, setNumber, values, fieldIndex)}
                onCommit={onCommitSet}
              />
            )
          }
          return (
            <SetRow
              key={setNumber}
              setNumber={setNumber}
              log={log}
              isActive={setNumber === firstUnlogged}
              typedMode={typedMode}
              onPress={() => onOpenSet(setNumber)}
              onRpeUpdate={onRpeUpdate}
            />
          )
        })}
      </View>
    </View>
  )
}

/** Separador `·` atenuado entre segmentos de la línea de prescripción (espeja `Sep` de web,
 *  WorkoutExecutionClient.tsx:562 = `<span className="text-on-dark-muted/40">·</span>`). */
function Sep() {
  return <Text style={TYPE.mono} className="text-[13px] text-on-dark-muted/40">·</Text>
}
