import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { MotiView } from 'moti'
import { CheckCircle2, ChevronDown, History, Info, Quote, TrendingUp } from 'lucide-react-native'
import { effectiveExerciseType, type OptimisticLogPayload, type ReconciledSessionLog, type TypedKeypadMode } from '@eva/workout-engine'
import type { HrZoneRange } from '@eva/cardio'
import { FONT, TYPE } from '../../../lib/typography'
import { useTheme } from '../../../context/ThemeContext'
import { EXERCISE_TYPE_META, exerciseTypeColor } from '../../../lib/exercise-type-meta'
import type { EffectiveTarget } from '../../../lib/workout/progression'
import { resolveExercise, type PrevSet, type SessionBlock, type SessionDraft } from '../../../lib/workout-session'
import { formatRelativeDate } from '../../../lib/date-utils'
import { SetRow, ActiveSetRow } from './SetRow'
import { TypedBlockTimerButton, TypedTargetGrid } from './TypedTargetGrid'
import { bestPrevOf, overloadChipLabel } from './workout-ui'

const SPORT_400 = '#5C9DFF' // --color-sport-400 — CheckCircle2 (text-sport-400)
const SPORT_300 = '#93BEFF' // --color-sport-300 — TrendingUp junto a text-sport-300 (hereda currentColor en web)
const ON_DARK_MUTED = '#939DAB'
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
// NativeWind v4: `style={TYPE.mono}` pisa la fontFamily de `font-mono-bold` → el bold no aplica. Se fija
// la cara bold por style (array) en los valores mono destacados (bug ola0).
const MONO_BOLD = { fontFamily: FONT.monoBold } as const

/**
 * Card de superserie (mobile) — grupo visual sport-bordered con sus miembros (A/B/C), prescripción en
 * pills, técnica, historial "Sesión anterior" y las series de cada uno. Espeja `SupersetGroupCard` de
 * web; el orden intercalado por rondas (A1→B1→A2…) con auto-cue queda como seam de pulido (Wave B).
 */
export function SupersetGroupCard({
  members,
  sessionLogs,
  effByBlock,
  previousHistory,
  currentWeek,
  restoredDraft,
  hrZones,
  onOpenTechnique,
  onOpenSet,
  onCommitSet,
  onRpeUpdate,
  onDraftChange,
}: {
  members: SessionBlock[]
  sessionLogs: ReconciledSessionLog[]
  effByBlock: Map<string, EffectiveTarget | null>
  previousHistory: Record<string, PrevSet[]>
  currentWeek: number | null
  /** Draft restaurado del set en curso (resiliencia E2-03). */
  restoredDraft: SessionDraft | null
  /** Rangos bpm por zona del alumno (E2-11) para miembros cardio con hr_zone; null si el módulo está OFF. */
  hrZones?: HrZoneRange[] | null
  onOpenTechnique: (block: SessionBlock) => void
  /** Tap en una serie ya logueada / proxima: abre el teclado de edicion (KeypadHost). */
  onOpenSet: (blockId: string, setNumber: number) => void
  /** Confirma la serie activa (payload armado por la fila): logSet intacto. */
  onCommitSet: (payload: OptimisticLogPayload) => void
  /** Registro de RPE post-log en series tipadas (re-submitea el log sin re-disparar el descanso). */
  onRpeUpdate?: (payload: OptimisticLogPayload) => void
  /** Reporta el draft del set en curso (resiliencia). */
  onDraftChange: (blockId: string, setNumber: number, values: Record<string, string>, fieldIndex: number) => void
}) {
  const { theme } = useTheme()
  const [howToOpen, setHowToOpen] = useState(false)
  const maxSets = members.reduce((mx, m) => Math.max(mx, m.sets), 0)
  const firstLabel = `${LETTERS[0]}1`
  const secondLabel = `${LETTERS[1] ?? '?'}1`

  return (
    <View className="gap-3 rounded-card border border-sport-500/30 bg-sport-500/[0.05] p-4">
      <View className="gap-2">
        <View className="flex-row flex-wrap items-center justify-between gap-2">
          <View className="flex-row items-center gap-2">
            <Text className="font-display text-sm text-on-dark">Superserie</Text>
            <Text style={TYPE.caption} className="text-[11px] text-on-dark-muted">
              {members.length} ejercicios · {maxSets} ronda{maxSets === 1 ? '' : 's'}
            </Text>
          </View>
          <Pressable
            testID="btn-superset-howto"
            onPress={() => setHowToOpen((o) => !o)}
            className="h-8 flex-row items-center gap-1 rounded-control px-2"
            accessibilityRole="button"
            accessibilityLabel="Cómo hacer la superserie"
          >
            <Text style={TYPE.caption} className="text-[11px] text-on-dark-muted">Cómo hacerla</Text>
            <ChevronDown size={12} color={ON_DARK_MUTED} style={{ transform: [{ rotate: howToOpen ? '180deg' : '0deg' }] }} />
          </Pressable>
        </View>
        <Text style={TYPE.caption} className="text-[12px] text-on-dark-muted">
          Rondas: <Text className="text-on-dark font-sans-bold">{firstLabel}</Text> → <Text className="text-on-dark font-sans-bold">{secondLabel}</Text> sin descanso, descansa al cerrar la ronda.
        </Text>
        {howToOpen && (
          <MotiView from={{ opacity: 0, translateY: -4 }} animate={{ opacity: 1, translateY: 0 }}>
            <Text style={TYPE.caption} className="rounded-sm border border-inverse/10 bg-white/[0.03] p-3 text-[12px] text-on-dark/90">
              Trabaja por rondas: haz <Text className="font-sans-bold">{firstLabel}</Text>, sigue con <Text className="font-sans-bold">{secondLabel}</Text> sin descanso, y descansa al <Text className="font-sans-bold">cerrar la ronda</Text>. Repite hasta completar todas las series.
            </Text>
          </MotiView>
        )}
      </View>

      {members.map((block, idx) => {
        const exercise = resolveExercise(block)
        if (!exercise) return null
        const letter = LETTERS[idx] ?? '?'
        const eff = effByBlock.get(block.id) ?? null
        const suggested = eff?.weightKg ?? block.target_weight_kg
        const blockLogs = sessionLogs.filter((l) => l.block_id === block.id)
        const doneCount = new Set(
          blockLogs.filter((l) => l.set_number >= 1 && l.set_number <= block.sets).map((l) => l.set_number),
        ).size
        const complete = doneCount >= block.sets
        let firstUnlogged: number | null = null
        for (let i = 1; i <= block.sets; i += 1) {
          if (!blockLogs.some((l) => l.set_number === i)) { firstUnlogged = i; break }
        }
        const overload = overloadChipLabel(block, eff, currentWeek)
        const hasTechnique = !!(exercise.gif_url || exercise.video_url)
        const effType = effectiveExerciseType(block, exercise)
        const typedMode: TypedKeypadMode | null = effType === 'strength' ? null : (effType as TypedKeypadMode)
        const MemberIcon = EXERCISE_TYPE_META[effType].Icon
        const memberColor = exerciseTypeColor(effType, theme.primary)
        const prevList = previousHistory[exercise.id] ?? []
        const bestPrev = bestPrevOf(prevList)
        const beatIt = bestPrev?.weight_kg != null && bestPrev.weight_kg > 0 && suggested != null && suggested >= bestPrev.weight_kg

        return (
          <View key={block.id} className="gap-2 rounded-card border border-inverse/10 bg-white/[0.03] p-3">
            <View className="flex-row items-start justify-between gap-2">
              <View className="min-w-0 flex-1 flex-row items-start gap-2">
                <View className="h-6 w-6 items-center justify-center rounded-full bg-sport-500/15">
                  <Text className="font-display-black text-[12px] text-sport-300">{letter}</Text>
                </View>
                <View className="min-w-0 flex-1">
                  <Text
                    style={{ letterSpacing: -0.34 }}
                    className="font-display-black text-[17px] leading-[20px] text-on-dark"
                    numberOfLines={2}
                  >
                    {exercise.name}
                  </Text>
                  <View className="mt-1 flex-row flex-wrap items-center gap-1.5">
                    {exercise.muscle_group && (
                      <View className="flex-row items-center gap-1.5 rounded-full bg-white/[0.06] px-2 py-0.5">
                        <MemberIcon size={12} color={memberColor} />
                        <Text style={{ fontFamily: FONT.uiBold, fontSize: 10.5 }} className="text-on-dark">{exercise.muscle_group}</Text>
                      </View>
                    )}
                    {hasTechnique && (
                      <Pressable testID={`btn-technique-${block.id}`} onPress={() => onOpenTechnique(block)} className="flex-row items-center gap-1">
                        <Info size={13} color={ON_DARK_MUTED} />
                        <Text style={TYPE.caption} className="text-[11px] text-on-dark-muted">Ver técnica</Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              </View>
              {complete && <CheckCircle2 size={24} color={SPORT_400} />}
            </View>

            {/* Prescripción: strength → pills sets×reps·kg·Descanso; tipado → grilla de objetivos +
                botón de timer (paridad web WorkoutExecutionClient.tsx:773-796). */}
            {effType === 'strength' ? (
              <View className="flex-row flex-wrap gap-1.5">
                <View className="rounded-full bg-white/[0.06] px-2 py-0.5">
                  <Text style={[TYPE.mono, MONO_BOLD]} className="text-[11px] text-on-dark">{block.sets} × {block.reps}</Text>
                </View>
                {block.target_weight_kg != null && (
                  <View className="rounded-full bg-white/[0.06] px-2 py-0.5">
                    <Text style={[TYPE.mono, MONO_BOLD]} className="text-[11px] text-on-dark">{suggested ?? block.target_weight_kg}kg</Text>
                  </View>
                )}
                {block.rest_time && (
                  <View className="rounded-full bg-white/[0.06] px-2 py-0.5">
                    <Text style={[TYPE.mono, MONO_BOLD]} className="text-[11px] text-on-dark-muted">Descanso {block.rest_time}</Text>
                  </View>
                )}
              </View>
            ) : (
              <View className="gap-2">
                <TypedTargetGrid block={block} kind={effType} hrZones={hrZones} />
                <TypedBlockTimerButton block={block} kind={effType} />
              </View>
            )}

            {/* Chip de sobrecarga (strength) */}
            {effType === 'strength' && overload && (
              <View className="flex-row items-center gap-1 self-start rounded-full border border-sport-500/30 bg-sport-500/[0.10] px-2 py-0.5">
                <TrendingUp size={12} color={SPORT_300} />
                <Text style={{ fontFamily: FONT.uiBold, fontSize: 10.5 }} className="text-sport-300">{overload}</Text>
              </View>
            )}

            {/* Instrucciones del bloque tipado (web 805-810) */}
            {effType !== 'strength' && block.instructions && (
              <View className="flex-row gap-2 rounded-sm border border-inverse/10 bg-white/[0.03] px-2.5 py-1.5">
                <Info size={14} color={ON_DARK_MUTED} style={{ marginTop: 2 }} />
                <Text style={TYPE.caption} className="flex-1 text-[11px] text-on-dark/90">{block.instructions}</Text>
              </View>
            )}

            {/* Nota del coach del bloque (web 812-817) */}
            {block.notes && (
              <View className="flex-row gap-2 rounded-sm border border-inverse/10 bg-white/[0.03] px-2.5 py-1.5">
                <Quote size={14} color={ON_DARK_MUTED} style={{ marginTop: 2 }} />
                <Text style={TYPE.caption} className="flex-1 text-[11px] text-on-dark/90">{block.notes}</Text>
              </View>
            )}

            {/* Historial "Sesión anterior" — solo strength con marca previa (web gatea a strength, :819) */}
            {effType === 'strength' && bestPrev && (
              <View className="flex-row flex-wrap items-center gap-x-2 gap-y-1 rounded-sm bg-white/[0.04] px-2.5 py-1.5">
                <History size={13} color={ON_DARK_MUTED} />
                <Text style={{ fontFamily: FONT.uiSemibold, fontSize: 10.5 }} className="text-on-dark-muted">
                  Sesión anterior · {formatRelativeDate(prevList[0].date)}:
                </Text>
                <Text style={[TYPE.mono, MONO_BOLD]} className="text-[11px] text-on-dark">
                  {bestPrev.weight_kg ? `${bestPrev.weight_kg}kg` : '-'} × {bestPrev.reps_done || '-'}
                </Text>
                {beatIt && (
                  <View className="flex-row items-center gap-1">
                    <TrendingUp size={12} color={SPORT_300} />
                    <Text style={{ fontFamily: FONT.uiBold, fontSize: 10 }} className="text-sport-300">Supera tu marca</Text>
                  </View>
                )}
              </View>
            )}

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
                      suggestedWeight={suggested ?? null}
                      seedValues={seed}
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
                    onPress={() => onOpenSet(block.id, setNumber)}
                    onRpeUpdate={onRpeUpdate}
                  />
                )
              })}
            </View>
          </View>
        )
      })}
    </View>
  )
}
