import { Pressable, Text, View } from 'react-native'
import { MotiView } from 'moti'
import {
  ArrowRightLeft,
  CheckCircle2,
  ChevronDown,
  History,
  Info,
  Play,
  TrendingUp,
  Undo2,
} from 'lucide-react-native'
import type { ExerciseType, ReconciledSessionLog, TypedKeypadMode } from '@eva/workout-engine'
import type { HrZoneRange } from '@eva/cardio'
import { TYPE } from '../../../lib/typography'
import type { EffectiveTarget } from '../../../lib/workout/progression'
import type { PrevSet, SessionBlock, SessionExercise } from '../../../lib/workout-session'
import { formatRelativeDate } from '../../../lib/date-utils'
import { SetRow } from './SetRow'
import { TypedBlockTimerButton, TypedTargetGrid } from './TypedTargetGrid'
import { bestPrevOf, overloadChipLabel, overloadDetailText } from './workout-ui'

// Fixed DS hues for lucide icon `color` props (mirrors Button/VideoPlayer literal-color pattern).
const SPORT_400 = '#5C9DFF'
const ON_DARK = '#F4F6F8'
const ON_DARK_MUTED = '#939DAB'
const EMBER_300 = '#FFB199'

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
  hrZones,
  onToggleDetails,
  onOpenTechnique,
  onOpenSet,
  onAutofillLast,
  onOpenSubstitute,
  onUndoSubstitution,
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
  /** Rangos bpm por zona del alumno (E2-11, cardio gated); null si el módulo cardio está OFF. */
  hrZones?: HrZoneRange[] | null
  onToggleDetails: () => void
  onOpenTechnique: () => void
  onOpenSet: (setNumber: number) => void
  onAutofillLast: (setNumber: number, best: PrevSet) => void
  onOpenSubstitute: () => void
  onUndoSubstitution: () => void
}) {
  const isStrength = effType === 'strength'
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

  const borderClass =
    focus === 'active' ? 'border-sport-500/50' : focus === 'done' ? 'border-sport-500/30' : 'border-inverse/50'

  return (
    <View className={`relative gap-3 rounded-card border bg-white/[0.03] p-4 ${borderClass}`}>
      {/* Fila silenciosa: músculo + acciones (Detalles / Cambiar / Técnica) */}
      <View className="flex-row items-center justify-between gap-2">
        <View className="min-w-0 flex-1 flex-row items-center gap-1.5">
          <Text style={TYPE.eyebrow} className="text-on-dark-muted" numberOfLines={1}>
            {exercise.muscle_group ?? 'Ejercicio'}
          </Text>
        </View>
        <View className="flex-row shrink-0 items-center gap-1">
          {hasDetails && (
            <Pressable
              testID="btn-details"
              onPress={onToggleDetails}
              className="h-8 flex-row items-center gap-1 rounded-control px-2"
              accessibilityRole="button"
              accessibilityLabel="Ver detalles del ejercicio"
            >
              <Info size={14} color={ON_DARK_MUTED} />
              <Text style={TYPE.caption} className="text-[11px] text-on-dark-muted">Detalles</Text>
              <ChevronDown size={12} color={ON_DARK_MUTED} style={{ transform: [{ rotate: detailsOpen ? '180deg' : '0deg' }] }} />
            </Pressable>
          )}
          {canSubstitute && !substitution && (
            <Pressable
              testID="btn-substitute"
              onPress={onOpenSubstitute}
              className="h-8 flex-row items-center gap-1 rounded-control px-2"
              accessibilityRole="button"
              accessibilityLabel={`Cambiar ${exercise.name}, maquina ocupada`}
            >
              <ArrowRightLeft size={14} color={ON_DARK_MUTED} />
              <Text style={TYPE.caption} className="text-[11px] text-on-dark-muted">Cambiar</Text>
            </Pressable>
          )}
          {hasTechnique && (
            <Pressable
              testID="btn-technique"
              onPress={onOpenTechnique}
              className="h-8 flex-row items-center gap-1 rounded-control bg-white/[0.06] px-2.5"
              accessibilityRole="button"
              accessibilityLabel={`Ver tecnica de ${exercise.name}`}
            >
              <Play size={12} color={ON_DARK} fill={ON_DARK} />
              <Text style={TYPE.caption} className="text-[11px] text-on-dark">Tecnica</Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* Sustitución activa (Fase L · C): badge + deshacer mientras no haya sets */}
      {substitution && (
        <View className="flex-row flex-wrap items-center gap-2">
          <View className="flex-row items-center gap-1.5 rounded-full border border-ember-500/30 bg-ember-500/[0.12] px-2.5 py-1">
            <ArrowRightLeft size={12} color={EMBER_300} />
            <Text style={TYPE.caption} className="text-[11px] text-ember-200">Sustituido · maquina ocupada</Text>
          </View>
          <Text style={TYPE.caption} className="text-[11px] text-on-dark-muted">
            en vez de <Text className="text-on-dark font-sans-bold">{substitution.prescribedName}</Text>
          </Text>
          {canSubstitute && (
            <Pressable testID="btn-undo-substitute" onPress={onUndoSubstitution} className="ml-auto h-8 flex-row items-center gap-1 rounded-control px-2">
              <Undo2 size={14} color={ON_DARK_MUTED} />
              <Text style={TYPE.caption} className="text-[11px] text-on-dark-muted">Deshacer</Text>
            </Pressable>
          )}
        </View>
      )}

      {/* Nombre + dots de progreso (o check al completar) */}
      <View className="flex-row items-start justify-between gap-3">
        <Text className="min-w-0 flex-1 font-display-black text-[22px] leading-[24px] text-on-dark" numberOfLines={2}>
          {exercise.name}
        </Text>
        {complete ? (
          <MotiView from={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', damping: 12 }}>
            <CheckCircle2 size={26} color={SPORT_400} />
          </MotiView>
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
          <View className="flex-row flex-wrap items-center gap-x-2">
            <Text style={TYPE.mono} className="text-[13px] text-on-dark font-mono-bold">{block.sets} × {block.reps}</Text>
            {block.target_weight_kg != null && (
              <Text style={TYPE.mono} className="text-[13px] text-on-dark font-mono-bold">· {suggestedWeightKg ?? block.target_weight_kg} kg</Text>
            )}
            {block.rest_time && <Text style={TYPE.mono} className="text-[13px] text-on-dark-muted">· desc {block.rest_time}</Text>}
            {block.tempo && <Text style={TYPE.mono} className="text-[13px] text-on-dark-muted">· tempo {block.tempo}</Text>}
            {block.rir && <Text style={TYPE.mono} className="text-[13px] text-on-dark-muted">· RIR {block.rir}</Text>}
          </View>
          {overloadLabel && (
            <View className="flex-row items-center gap-1 rounded-full border border-sport-500/30 bg-sport-500/[0.10] px-2 py-0.5">
              <TrendingUp size={12} color={SPORT_400} />
              <Text style={TYPE.caption} className="text-[11px] text-sport-300 font-sans-bold">{overloadLabel}</Text>
            </View>
          )}
        </View>
      )}

      {/* "Última vez" tap-autofill (E2-17) + "Supera tu marca" (strength) */}
      {isStrength && bestPrev && (
        <Pressable
          testID="btn-autofill-last"
          disabled={firstUnlogged == null}
          onPress={() => { if (firstUnlogged != null) onAutofillLast(firstUnlogged, bestPrev) }}
          className="min-h-[40px] flex-row flex-wrap items-center gap-x-2 rounded-control py-1"
          accessibilityRole="button"
          accessibilityLabel={firstUnlogged != null && bestPrev.weight_kg ? `Autollenar la serie activa con ${bestPrev.weight_kg} kg por ${bestPrev.reps_done ?? '-'} reps` : undefined}
        >
          <History size={14} color={ON_DARK_MUTED} />
          <Text style={TYPE.caption} className="text-[11px] text-on-dark-muted">Ultima vez:</Text>
          <Text style={TYPE.mono} className="text-[11px] text-on-dark font-mono-bold">
            {bestPrev.weight_kg ? `${bestPrev.weight_kg}kg` : '-'} × {bestPrev.reps_done || '-'}
          </Text>
          {beatIt && (
            <View className="flex-row items-center gap-1">
              <TrendingUp size={12} color={SPORT_400} />
              <Text style={TYPE.caption} className="text-[11px] text-sport-300 font-sans-bold">Supera tu marca</Text>
            </View>
          )}
          {firstUnlogged != null && (
            <Text style={TYPE.caption} className="ml-auto text-[11px] text-sport-300 font-sans-bold">= usar</Text>
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
          className="gap-3 rounded-card border border-inverse/50 bg-white/[0.02] p-3"
        >
          {isStrength && exercise.instructions && exercise.instructions.length > 0 && (
            <View>
              <Text style={TYPE.eyebrow} className="mb-1 text-on-dark-muted">Tecnica</Text>
              {exercise.instructions.map((step, i) => (
                <Text key={i} style={TYPE.caption} className="text-[12px] text-on-dark/90">{i + 1}. {step.replace(/^Step:\d+\s*/i, '')}</Text>
              ))}
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
              <Text style={TYPE.caption} className="text-[12px] text-on-dark/90">{block.notes}</Text>
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
              {prevList.slice(0, 5).map((s, i) => (
                <View key={i} className="flex-row justify-between">
                  <Text style={TYPE.mono} className="text-[11px] text-on-dark-muted">{formatRelativeDate(s.date)}</Text>
                  <Text style={TYPE.mono} className="text-[11px] text-on-dark">{s.weight_kg ? `${s.weight_kg}kg` : '-'} × {s.reps_done || '-'}</Text>
                </View>
              ))}
            </View>
          )}
        </MotiView>
      )}

      {/* Series (tap → TypedKeypad; strength o tipado según effType) */}
      <View className="gap-1.5">
        {Array.from({ length: block.sets }).map((_, i) => {
          const setNumber = i + 1
          const log = blockLogs.find((l) => l.set_number === setNumber)
          return (
            <SetRow
              key={setNumber}
              setNumber={setNumber}
              log={log}
              isActive={setNumber === firstUnlogged}
              typedMode={typedMode}
              onPress={() => onOpenSet(setNumber)}
            />
          )
        })}
      </View>
    </View>
  )
}
