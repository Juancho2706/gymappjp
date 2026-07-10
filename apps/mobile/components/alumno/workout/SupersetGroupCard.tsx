import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { AnimatePresence, MotiView } from 'moti'
import { LinearTransition } from 'react-native-reanimated'
import { CheckCircle2, ChevronDown, History, Info, Quote, TrendingUp } from 'lucide-react-native'
import {
  effectiveExerciseType,
  firstIncompleteInRounds,
  formatWeightEsCl,
  type OptimisticLogPayload,
  type ReconciledSessionLog,
  type TypedKeypadMode,
} from '@eva/workout-engine'
import type { HrZoneRange } from '@eva/cardio'
import { FONT, TYPE, textStyle } from '../../../lib/typography'
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
// Pills de prescripción de la leyenda (sets×reps · kg · Descanso): web WEC:775,779,784 las pinta
// `font-mono font-semibold` (600), no bold (700). Igualamos a JetBrainsMono_600SemiBold para no salir un
// tier más pesado que el web (typography.ts:43 monoSemibold SÍ existe).
const MONO_SEMIBOLD = { fontFamily: FONT.monoSemibold } as const
// Reflow de la card (paridad web `layout={!reducedMotion}` + `springs.smooth` {stiffness:200,damping:25},
// SingleExerciseCard web:159-160/165): anima el cambio de tamaño/orden (p. ej. al cerrar una ronda).
// `undefined` cuando hay reduced-motion. LinearTransition = layout transition de reanimated.
const CARD_LAYOUT = LinearTransition.springify().damping(25).stiffness(200)

/**
 * Card de superserie (mobile) — grupo visual sport-bordered con dos zonas, espejo de `SupersetGroupCard`
 * de web (WorkoutExecutionClient.tsx:632-910): (1) LEYENDA por miembro (A/B/C) con prescripción en pills,
 * técnica, sobrecarga, notas e historial "Sesión anterior"; (2) RONDAS INTERCALADAS (A1 → B1 → A2 → B2…)
 * con divisores "Ronda N" y una única fila de registro activa que lleva la señal "Sigue". El descanso NO
 * corre entre miembros: el timer del grupo sólo arranca al CERRAR la ronda (lo maneja el orquestador en
 * `onCommitSet`, con `groupRestSeconds` = max de los miembros).
 */
export function SupersetGroupCard({
  members,
  sessionLogs,
  effByBlock,
  previousHistory,
  currentWeek,
  restoredDraft,
  hrZones,
  reducedMotion = false,
  onOpenTechnique,
  onOpenSet,
  onCommitSet,
  onRpeUpdate,
  onDraftChange,
  recentSet,
  syncErrors,
  onRetrySet,
  registerSetRowRef,
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
  /** Reduce-motion (viene del padre): apaga la entrada del disclosure "Cómo hacerla". */
  reducedMotion?: boolean
  onOpenTechnique: (block: SessionBlock) => void
  /** Tap en una serie ya logueada / proxima: abre el teclado de edicion (KeypadHost). */
  onOpenSet: (blockId: string, setNumber: number) => void
  /** Confirma la serie activa (payload armado por la fila): logSet intacto. */
  onCommitSet: (payload: OptimisticLogPayload) => void
  /** Registro de RPE post-log en series tipadas (re-submitea el log sin re-disparar el descanso). */
  onRpeUpdate?: (payload: OptimisticLogPayload) => void
  /** Reporta el draft del set en curso (resiliencia). */
  onDraftChange: (blockId: string, setNumber: number, values: Record<string, string>, fieldIndex: number) => void
  /** Serie recién confirmada (señal one-shot): settle elástico del check + pulso dorado si `pr`. */
  recentSet?: { blockId: string; setNumber: number; pr: boolean } | null
  /** Errores de sync por serie (`${blockId}:${setNumber}`): chip rojo + Reintentar (mirror web 'error'). */
  syncErrors?: Record<string, string>
  /** Reintenta el guardado de una serie fallida (re-dispara el commit con el payload guardado). */
  onRetrySet?: (blockId: string, setNumber: number) => void
  /** Registra el nodo de cada fila de ronda (`${blockId}:${set}`) para el auto-scroll del orquestador
   *  (paridad web `setRowRefs`, WEC:992): destino del scroll 'center' a la siguiente serie. */
  registerSetRowRef?: (key: string, node: View | null) => void
}) {
  const { theme } = useTheme()
  const [howToOpen, setHowToOpen] = useState(false)
  const maxSets = members.reduce((mx, m) => Math.max(mx, m.sets), 0)
  const firstLabel = `${LETTERS[0]}1`
  const secondLabel = `${LETTERS[1] ?? '?'}1`

  // VMs de los miembros (una pasada): alimentan la LEYENDA (referencia por ejercicio) Y las RONDAS
  // intercaladas. Mirror de `memberVMs` de web (WEC:653-688).
  const memberVMs = members
    .map((block, idx) => {
      const exercise = resolveExercise(block)
      if (!exercise) return null
      const eff = effByBlock.get(block.id) ?? null
      const suggested = eff?.weightKg ?? block.target_weight_kg
      const blockLogs = sessionLogs.filter((l) => l.block_id === block.id)
      const doneCount = new Set(
        blockLogs.filter((l) => l.set_number >= 1 && l.set_number <= block.sets).map((l) => l.set_number),
      ).size
      const effType = effectiveExerciseType(block, exercise)
      const prevList = previousHistory[exercise.id] ?? []
      const bestPrev = bestPrevOf(prevList)
      return {
        block,
        exercise,
        letter: LETTERS[idx] ?? '?',
        eff,
        suggested,
        blockLogs,
        doneCount,
        complete: doneCount >= block.sets,
        overload: overloadChipLabel(block, eff, currentWeek),
        hasTechnique: !!(exercise.gif_url || exercise.video_url),
        effType,
        typedMode: (effType === 'strength' ? null : (effType as TypedKeypadMode)) as TypedKeypadMode | null,
        MemberIcon: EXERCISE_TYPE_META[effType].Icon,
        memberColor: exerciseTypeColor(effType, theme.primary),
        prevList,
        bestPrev,
        beatIt: bestPrev?.weight_kg != null && bestPrev.weight_kg > 0 && suggested != null && suggested >= bestPrev.weight_kg,
      }
    })
    .filter((m): m is NonNullable<typeof m> => m != null)

  // Guard de <2 miembros RESUELTOS (contrato §10 / web WEC:690 `if (memberVMs.length < 2) return null`):
  // una superserie exige ≥2; con 1 (o 1 que resuelve) no se pinta la card 'Superserie'. El motor de
  // agrupación ya degrada un tramo de 1 bloque a single, pero esta defensa espeja la del web y evita
  // renderizar '1 ejercicios' si un miembro no resuelve su ejercicio (`resolveExercise` null).
  if (memberVMs.length < 2) return null

  // Serie ACTIVA del grupo en orden intercalado (A1 → B1 → A2…): la primera incompleta. Es la única que
  // se pinta como fila de registro (ActiveSetRow) y lleva la señal "Sigue" — mirror web `nextCue`/isActive.
  const activePos = firstIncompleteInRounds(
    memberVMs.map((m) => ({ id: m.block.id, sets: m.block.sets })),
    sessionLogs,
  )

  return (
    <MotiView
      layout={reducedMotion ? undefined : CARD_LAYOUT}
      className="gap-3 rounded-card border border-sport-500/30 bg-sport-500/[0.05] p-4"
    >
      <View className="gap-2">
        <View className="flex-row flex-wrap items-center justify-between gap-2">
          <View className="flex-row items-center gap-2">
            <Text className="font-display text-sm text-on-dark">Superserie</Text>
            <Text style={TYPE.caption} className="text-[11px] text-on-dark-muted">
              {/* Conteo sobre los miembros RESUELTOS (mirror web WEC:702 `{memberVMs.length}`), no el
                  crudo `members.length` que contaría un miembro con `resolveExercise` null. */}
              {memberVMs.length} ejercicios · {maxSets} ronda{maxSets === 1 ? '' : 's'}
            </Text>
          </View>
          <Pressable
            testID="btn-superset-howto"
            onPress={() => setHowToOpen((o) => !o)}
            className="h-8 flex-row items-center gap-1 rounded-control px-2"
            accessibilityRole="button"
            accessibilityLabel="Cómo hacer la superserie"
            accessibilityState={{ expanded: howToOpen }}
          >
            <Text style={TYPE.caption} className="text-[11px] text-on-dark-muted">Cómo hacerla</Text>
            <ChevronDown size={12} color={ON_DARK_MUTED} style={{ transform: [{ rotate: howToOpen ? '180deg' : '0deg' }] }} />
          </Pressable>
        </View>
        <Text style={TYPE.caption} className="text-[12px] text-on-dark-muted">
          Rondas: <Text className="text-on-dark font-sans-bold">{firstLabel}</Text> → <Text className="text-on-dark font-sans-bold">{secondLabel}</Text> sin descanso, descansa al cerrar la ronda.
        </Text>
        {/* Disclosure "Cómo hacerla" — AnimatePresence + `exit` para que el COLAPSO anime en vez de
            desmontar de golpe (paridad web WEC:718-733: AnimatePresence con `exit`, transition
            {duration:0.25}). El eje es opacity/translateY (idiomático RN) en lugar de height. */}
        <AnimatePresence>
          {howToOpen && (
            <MotiView
              key="howto"
              from={reducedMotion ? { opacity: 1, translateY: 0 } : { opacity: 0, translateY: -4 }}
              animate={{ opacity: 1, translateY: 0 }}
              exit={reducedMotion ? { opacity: 0, translateY: 0 } : { opacity: 0, translateY: -4 }}
              transition={reducedMotion ? { type: 'timing', duration: 0 } : { type: 'timing', duration: 250 }}
            >
              <Text style={TYPE.caption} className="rounded-sm border border-inverse/10 bg-white/[0.03] p-3 text-[12px] text-on-dark/90">
                Trabaja por rondas: haz <Text className="font-sans-bold">{firstLabel}</Text>, sigue con <Text className="font-sans-bold">{secondLabel}</Text> sin descanso, y descansa al <Text className="font-sans-bold">cerrar la ronda</Text>. Repite hasta completar todas las series.
              </Text>
            </MotiView>
          )}
        </AnimatePresence>
      </View>

      {/* LEYENDA: referencia rápida de cada ejercicio (objetivo, técnica, notas, historial). Las series
          NO se registran acá — se registran en las rondas intercaladas de abajo (paridad web 737-843). */}
      <View className="gap-2">
        {memberVMs.map((m) => (
          <View key={m.block.id} className="gap-2 rounded-card border border-inverse/10 bg-white/[0.03] p-3">
            <View className="flex-row items-start justify-between gap-2">
              <View className="min-w-0 flex-1 flex-row items-start gap-2">
                <View className="h-6 w-6 items-center justify-center rounded-full bg-sport-500/15">
                  <Text className="font-display-black text-[12px] text-sport-300">{m.letter}</Text>
                </View>
                <View className="min-w-0 flex-1">
                  {/* SIN numberOfLines: el nombre envuelve completo, sin recorte (paridad web
                      WorkoutExecutionClient.tsx:749-751, `<h3>` sin line-clamp). El clamp a 2 líneas
                      cortaba con elipsis texto que el web sí muestra. */}
                  <Text
                    style={{ letterSpacing: -0.34 }}
                    className="font-display-black text-[17px] leading-[20px] text-on-dark"
                  >
                    {m.exercise.name}
                  </Text>
                  <View className="mt-1 flex-row flex-wrap items-center gap-1.5">
                    {/* Pill tipo+músculo SIEMPRE presente (paridad web WEC:753-756: el `span` con
                        `<TypeGlyph/>` + `muscle_group` se pinta sin condición → el icono de tipo se ve aun
                        con `muscle_group` vacío; antes el gate `muscle_group &&` lo ocultaba entero). */}
                    <View className="flex-row items-center gap-1.5 rounded-full bg-white/[0.06] px-2 py-0.5">
                      <m.MemberIcon size={12} color={m.memberColor} />
                      <Text style={{ fontFamily: FONT.uiBold, fontSize: 10.5 }} className="text-on-dark">{m.exercise.muscle_group}</Text>
                    </View>
                    {m.hasTechnique && (
                      <Pressable testID={`btn-technique-${m.block.id}`} onPress={() => onOpenTechnique(m.block)} className="flex-row items-center gap-1">
                        {/* Icono 14 y texto 11px semibold (600) = web WEC:757-764 `Info w-3.5 h-3.5` +
                            `text-[11px] font-semibold text-on-dark-muted` (no uiMedium/500). */}
                        <Info size={14} color={ON_DARK_MUTED} />
                        <Text style={textStyle('3xs', FONT.uiSemibold)} className="text-on-dark-muted">Ver técnica</Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              </View>
              {m.complete && <CheckCircle2 size={24} color={SPORT_400} />}
            </View>

            {/* Prescripción: strength → pills sets×reps·kg·Descanso; tipado → grilla de objetivos +
                botón de timer (paridad web WorkoutExecutionClient.tsx:773-796). */}
            {m.effType === 'strength' ? (
              <View className="flex-row flex-wrap gap-1.5">
                <View className="rounded-full bg-white/[0.06] px-2 py-0.5">
                  <Text style={[TYPE.mono, MONO_SEMIBOLD]} className="text-[11px] text-on-dark">{m.block.sets} × {m.block.reps}</Text>
                </View>
                {m.block.target_weight_kg != null && (
                  <View className="rounded-full bg-white/[0.06] px-2 py-0.5">
                    <Text style={[TYPE.mono, MONO_SEMIBOLD]} className="text-[11px] text-on-dark">{m.suggested ?? m.block.target_weight_kg}kg</Text>
                  </View>
                )}
                {m.block.rest_time && (
                  <View className="rounded-full bg-white/[0.06] px-2 py-0.5">
                    <Text style={[TYPE.mono, MONO_SEMIBOLD]} className="text-[11px] text-on-dark-muted">Descanso {m.block.rest_time}</Text>
                  </View>
                )}
              </View>
            ) : (
              <View className="gap-2">
                <TypedTargetGrid block={m.block} kind={m.effType} hrZones={hrZones} />
                <TypedBlockTimerButton block={m.block} kind={m.effType} />
              </View>
            )}

            {/* Chip de sobrecarga (strength) */}
            {m.effType === 'strength' && m.overload && (
              <View className="flex-row items-center gap-1 self-start rounded-full border border-sport-500/30 bg-sport-500/[0.10] px-2 py-0.5">
                <TrendingUp size={12} color={SPORT_300} />
                <Text style={{ fontFamily: FONT.uiBold, fontSize: 10.5 }} className="text-sport-300">{m.overload}</Text>
              </View>
            )}

            {/* Instrucciones del bloque tipado (web 805-810) */}
            {m.effType !== 'strength' && m.block.instructions && (
              <View className="flex-row gap-2 rounded-sm border border-inverse/10 bg-white/[0.03] px-2.5 py-1.5">
                <Info size={14} color={ON_DARK_MUTED} style={{ marginTop: 2 }} />
                <Text style={TYPE.caption} className="flex-1 text-[11px] text-on-dark/90">{m.block.instructions}</Text>
              </View>
            )}

            {/* Nota del coach del bloque (web 812-817) */}
            {m.block.notes && (
              <View className="flex-row gap-2 rounded-sm border border-inverse/10 bg-white/[0.03] px-2.5 py-1.5">
                <Quote size={14} color={ON_DARK_MUTED} style={{ marginTop: 2 }} />
                <Text style={TYPE.caption} className="flex-1 text-[11px] text-on-dark/90">{m.block.notes}</Text>
              </View>
            )}

            {/* Historial "Sesión anterior" — solo strength con marca previa (web gatea a strength, :819) */}
            {m.effType === 'strength' && m.bestPrev && (
              <View className="flex-row flex-wrap items-center gap-x-2 gap-y-1 rounded-sm bg-white/[0.04] px-2.5 py-1.5">
                <History size={13} color={ON_DARK_MUTED} />
                <Text style={{ fontFamily: FONT.uiSemibold, fontSize: 10.5 }} className="text-on-dark-muted">
                  Sesión anterior · {formatRelativeDate(m.prevList[0].date)}:
                </Text>
                <Text style={[TYPE.mono, MONO_BOLD]} className="text-[11px] text-on-dark">
                  {m.bestPrev.weight_kg ? `${m.bestPrev.weight_kg}kg` : '-'} × {m.bestPrev.reps_done || '-'}
                </Text>
                {m.beatIt && (
                  <View className="flex-row items-center gap-1">
                    <TrendingUp size={12} color={SPORT_300} />
                    <Text style={{ fontFamily: FONT.uiBold, fontSize: 10 }} className="text-sport-300">Supera tu marca</Text>
                  </View>
                )}
              </View>
            )}
          </View>
        ))}
      </View>

      {/* RONDAS INTERCALADAS (A1 → B1 → A2 → B2…): divisor "Ronda N" + una fila por miembro con serie en
          esa ronda. La fila ACTIVA (primera incompleta en el orden intercalado) es la única de registro y
          lleva "Sigue" (paridad web WorkoutExecutionClient.tsx:846-907). */}
      <View className="gap-3 rounded-card border border-inverse/10 bg-white/[0.02] p-2">
        {Array.from({ length: maxSets }).map((_, ri) => {
          const round = ri + 1
          const roundMembers = memberVMs.filter((m) => m.block.sets >= round)
          return (
            <View key={round} className="gap-1.5">
              <View className="flex-row items-center justify-center gap-2 pt-1">
                <View className="h-px flex-1 bg-white/10" style={{ maxWidth: 72 }} />
                <Text
                  style={{ fontFamily: FONT.uiBold, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' }}
                  className="text-on-dark-muted"
                >
                  Ronda {round}
                </Text>
                <View className="h-px flex-1 bg-white/10" style={{ maxWidth: 72 }} />
              </View>
              {roundMembers.map((m) => {
                const label = `${m.letter}${round}`
                const log = m.blockLogs.find((l) => l.set_number === round)
                const isNext = !log && activePos?.blockId === m.block.id && activePos?.set === round
                const isRecent = recentSet?.blockId === m.block.id && recentSet?.setNumber === round
                const seed =
                  restoredDraft && restoredDraft.blockId === m.block.id && restoredDraft.setNumber === round
                    ? restoredDraft.values
                    : null
                return (
                  <View
                    key={m.block.id}
                    collapsable={false}
                    ref={(node) => registerSetRowRef?.(`${m.block.id}:${round}`, node)}
                    className="gap-1"
                  >
                    <View className="flex-row items-center gap-2 px-1.5">
                      <View className="rounded-full bg-sport-500/15 px-1.5 py-0.5">
                        <Text style={[TYPE.mono, MONO_BOLD]} className="text-[10px] text-sport-300">{label}</Text>
                      </View>
                      <Text className="min-w-0 flex-1 font-sans-bold text-[11px] text-on-dark" numberOfLines={1}>
                        {m.exercise.name}
                      </Text>
                      {isNext && (
                        <Text
                          style={{ fontFamily: FONT.uiBold, fontSize: 9, letterSpacing: 0.6, textTransform: 'uppercase' }}
                          className="text-sport-300"
                        >
                          Sigue
                        </Text>
                      )}
                    </View>
                    {isNext ? (
                      <ActiveSetRow
                        blockId={m.block.id}
                        setNumber={round}
                        typedMode={m.typedMode}
                        suggestedWeight={m.suggested ?? null}
                        seedValues={seed}
                        // Header de objetivo repetido en el teclado (DB-5, mirror web NumericKeypadSheet:204-228).
                        header={{
                          exerciseName: m.exercise.name,
                          objectiveLine:
                            m.effType === 'strength'
                              ? `${m.block.sets}×${m.block.reps}${m.suggested != null ? ` · ${formatWeightEsCl(m.suggested)} kg` : ''}`
                              : undefined,
                          last:
                            m.effType === 'strength' && m.bestPrev
                              ? { weightKg: m.bestPrev.weight_kg ?? null, reps: m.bestPrev.reps_done ?? null }
                              : null,
                        }}
                        onDraftChange={(values, fieldIndex) => onDraftChange(m.block.id, round, values, fieldIndex)}
                        onCommit={onCommitSet}
                      />
                    ) : (
                      <SetRow
                        setNumber={round}
                        log={log}
                        isActive={false}
                        typedMode={m.typedMode}
                        onPress={() => onOpenSet(m.block.id, round)}
                        onRpeUpdate={onRpeUpdate}
                        settle={isRecent}
                        pr={isRecent && !!recentSet?.pr}
                        syncError={syncErrors?.[`${m.block.id}:${round}`] ?? null}
                        onRetry={() => onRetrySet?.(m.block.id, round)}
                      />
                    )}
                  </View>
                )
              })}
            </View>
          )
        })}
      </View>
    </MotiView>
  )
}
