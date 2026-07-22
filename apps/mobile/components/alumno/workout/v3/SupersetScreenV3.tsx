import { useMemo } from 'react'
import { Pressable, Text, View } from 'react-native'
import { MotiView } from 'moti'
import { LinearTransition } from 'react-native-reanimated'
import { Image } from 'expo-image'
import { ArrowRightLeft, Check, Clock, Dumbbell, Undo2 } from 'lucide-react-native'
import {
  effectiveExerciseType,
  firstIncompleteInRounds,
  formatTypedObjective,
  formatWeightEsCl,
  type OptimisticLogPayload,
  type ReconciledSessionLog,
  type TypedKeypadMode,
} from '@eva/workout-engine'
import { FONT } from '../../../../lib/typography'
import { hexToRgba } from '../../../../lib/theme'
import { parseRestTime } from '../timers'
import {
  resolveExercise,
  type PrevSet,
  type SessionBlock,
  type SessionDraft,
  type SessionExercise,
} from '../../../../lib/workout-session'
import type { EffectiveTarget } from '../../../../lib/workout/progression'
import { SetRow, ActiveSetRow } from '../SetRow'
import { bestPrevOf } from '../workout-ui'
import type { ExecTheme } from './exec-theme'
import { activeRound, memberLetter, nextMemberIdInRound, roundDotStates, totalRounds } from './superset-screen-model'

// Reflow del layout (paridad ExerciseScreenV3 CARD_LAYOUT): anima el reordenamiento al cambiar de
// miembro/ronda. Sólo sin reduced-motion.
const CARD_LAYOUT = LinearTransition.springify().damping(25).stiffness(200)

/** Sustitución activa de un miembro (mirror del `ActiveSub` del orquestador ExecutorV3). */
export interface SupersetMemberSub {
  exerciseId: string | null
  name: string
  prescribedName: string
  gif_url: string | null
  video_url: string | null
  video_start_time: number | null
  video_end_time: number | null
  instructions: string[] | null
}

/**
 * Pantalla "Superserie" del ejecutor V3 (E3.5) — traducción RN de la pantalla Superserie del mockup
 * concepto-a-v3-tipos: header del paso ("Superserie {letra}" + dots de ronda + "Ronda N de M"), tarjetas
 * de los miembros APILADAS (el ACTIVO destacado con borde acento, "AHORA", su mini-media y la MISMA fila
 * de captura `ActiveSetRow` que ya usan las cards actuales; los demás atenuados con su estado), una pill
 * "Sin descanso — sigue con {siguiente}" mientras la ronda está abierta y la nota "Descanso {n}s al
 * cerrar la ronda".
 *
 * MOTOR INTOCABLE: consume `superset-rounds` (vía `superset-screen-model`) para derivar ronda activa /
 * siguiente miembro / estado de dots; NO reimplementa el intercalado ni el cierre de ronda. El descanso
 * de grupo (sólo al cerrar la ronda) lo dispara el orquestador en `onCommitSet`, igual que hoy — esta
 * pantalla sólo pinta. La captura y su lógica de guardado/draft/cola son las de `ActiveSetRow`/`SetRow`.
 */
export function SupersetScreenV3({
  groupLetter,
  members,
  sessionLogs,
  effByBlock,
  previousHistory,
  restoredDraft,
  reducedMotion = false,
  exec,
  showEffort = true,
  getMemberSub,
  onOpenTechnique,
  onOpenSet,
  onCommitSet,
  onRpeUpdate,
  onDraftChange,
  onOpenSubstitute,
  onUndoSubstitution,
  recentSet,
  syncErrors,
  onRetrySet,
}: {
  /** Letra del grupo superserie (A, B…) para el título del paso. */
  groupLetter: string
  members: SessionBlock[]
  sessionLogs: ReconciledSessionLog[]
  effByBlock: Map<string, EffectiveTarget | null>
  previousHistory: Record<string, PrevSet[]>
  restoredDraft: SessionDraft | null
  reducedMotion?: boolean
  exec: ExecTheme
  /** Mostrar las pills/escala de esfuerzo RPE/RIR (E3.7 — la tuerca). */
  showEffort?: boolean
  /** Sustitución activa de un miembro (máquina ocupada), o null. */
  getMemberSub: (block: SessionBlock) => SupersetMemberSub | null
  onOpenTechnique: (exercise: SessionExercise) => void
  onOpenSet: (blockId: string, setNumber: number) => void
  onCommitSet: (payload: OptimisticLogPayload) => void
  onRpeUpdate?: (payload: OptimisticLogPayload) => void
  onDraftChange: (blockId: string, setNumber: number, values: Record<string, string>, fieldIndex: number) => void
  /** Abre el sheet "máquina ocupada" para un miembro strength. */
  onOpenSubstitute: (blockId: string) => void
  /** Deshace la sustitución de un miembro. */
  onUndoSubstitution: (blockId: string) => void
  recentSet?: { blockId: string; setNumber: number; pr: boolean } | null
  syncErrors?: Record<string, string>
  onRetrySet?: (blockId: string, setNumber: number) => void
}) {
  const s = exec.surface

  // Miembros del grupo (con sustitución aplicada) — una pasada. Alimenta las tarjetas apiladas.
  const memberVMs = useMemo(
    () =>
      members
        .map((block, idx) => {
          const prescribed = resolveExercise(block)
          if (!prescribed) return null
          const effType = effectiveExerciseType(block, prescribed)
          const sub = effType === 'strength' ? getMemberSub(block) : null
          const exercise: SessionExercise = sub
            ? {
                ...prescribed,
                id: sub.exerciseId ?? prescribed.id,
                name: sub.name,
                gif_url: sub.gif_url,
                video_url: sub.video_url,
                video_start_time: sub.video_start_time,
                video_end_time: sub.video_end_time,
                instructions: sub.instructions,
              }
            : prescribed
          const eff = effByBlock.get(block.id) ?? null
          const suggested = eff?.weightKg ?? block.target_weight_kg
          const blockLogs = sessionLogs.filter((l) => l.block_id === block.id)
          const doneCount = new Set(
            blockLogs.filter((l) => l.set_number >= 1 && l.set_number <= block.sets).map((l) => l.set_number),
          ).size
          const prevList = sub ? [] : previousHistory[exercise.id] ?? []
          const bestPrev = bestPrevOf(prevList)
          return {
            block,
            exercise,
            letter: memberLetter(idx),
            effType,
            typedMode: (effType === 'strength' ? null : (effType as TypedKeypadMode)) as TypedKeypadMode | null,
            eff,
            suggested,
            blockLogs,
            doneCount,
            bestPrev,
            hasSub: sub != null,
            prescribedName: sub?.prescribedName ?? prescribed.name,
            hasTechnique: !!(exercise.gif_url || exercise.video_url),
          }
        })
        .filter((m): m is NonNullable<typeof m> => m != null),
    [members, sessionLogs, effByBlock, previousHistory, getMemberSub],
  )

  // Guard <2 miembros resueltos (paridad SupersetGroupCard / contrato §10): sin 2 no es superserie.
  const roundBlocks = useMemo(() => memberVMs.map((m) => ({ id: m.block.id, sets: m.block.sets })), [memberVMs])
  const active = firstIncompleteInRounds(roundBlocks, sessionLogs)
  const total = totalRounds(roundBlocks)
  const round = activeRound(roundBlocks, sessionLogs)
  const dots = roundDotStates(roundBlocks, sessionLogs)
  const nextMemberId = nextMemberIdInRound(roundBlocks, sessionLogs)
  const groupRestSec = useMemo(
    () => memberVMs.reduce((mx, m) => Math.max(mx, parseRestTime(m.block.rest_time)), 0),
    [memberVMs],
  )

  if (memberVMs.length < 2) return null

  // Miembros de la ronda ACTIVA (los que tienen serie en esa ronda), en orden.
  const roundMembers = memberVMs.filter((m) => m.block.sets >= round)

  return (
    <MotiView layout={reducedMotion ? undefined : CARD_LAYOUT} style={{ gap: 12 }}>
      {/* Header del paso: "Superserie {letra}" + chip de ronda (N de M + dots). */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 9 }}>
        <Text style={{ fontFamily: FONT.displayBlack, fontSize: 26, letterSpacing: -0.5, color: s.text }}>
          Superserie {groupLetter}
        </Text>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            paddingLeft: 12,
            paddingRight: 11,
            paddingVertical: 5,
            borderRadius: 999,
            backgroundColor: hexToRgba(exec.accent, 0.15),
            borderWidth: 1.5,
            borderColor: hexToRgba(exec.accent, 0.34),
          }}
        >
          <Text style={{ fontFamily: FONT.uiExtra, fontSize: 12, color: hexToRgba(exec.accent, 0.95) }}>
            Ronda {round} de {total}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            {dots.map((state, i) => (
              <RoundDot key={i} state={state} accent={exec.accent} track={s.dotTrack} reducedMotion={reducedMotion} />
            ))}
          </View>
        </View>
      </View>

      {/* Tarjetas de los miembros de la ronda activa, apiladas: activo destacado + siguientes atenuados. */}
      <View style={{ gap: 10 }}>
        {roundMembers.map((m) => {
          const log = m.blockLogs.find((l) => l.set_number === round)
          const isActive = active?.blockId === m.block.id && active?.set === round
          const isDoneInRound = !!log
          const isNext = !log && !isActive && nextMemberId === m.block.id
          const rx =
            m.effType === 'strength'
              ? `${m.block.reps} reps${m.suggested != null ? ` · ${formatWeightEsCl(m.suggested)} kg` : ''}`
              : formatTypedObjective(m.block, m.typedMode as TypedKeypadMode)
          const canSubstitute = m.effType === 'strength' && m.doneCount === 0
          const isRecent = recentSet?.blockId === m.block.id && recentSet?.setNumber === round
          const seed =
            restoredDraft && restoredDraft.blockId === m.block.id && restoredDraft.setNumber === round
              ? restoredDraft.values
              : null

          return (
            <MotiView
              key={m.block.id}
              layout={reducedMotion ? undefined : CARD_LAYOUT}
              style={{
                gap: 10,
                borderRadius: 18,
                padding: 12,
                borderWidth: 2,
                backgroundColor: isActive ? hexToRgba(exec.accent, 0.1) : s.surface,
                borderColor: isActive ? hexToRgba(exec.accent, 0.55) : s.border,
                opacity: isActive ? 1 : isDoneInRound ? 0.8 : 0.62,
                ...(isActive && !reducedMotion
                  ? { shadowColor: exec.accent, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.28, shadowRadius: 10, elevation: 6 }
                  : null),
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                {/* Mini-media estática del miembro. */}
                <View
                  style={{
                    width: 60,
                    height: 60,
                    borderRadius: 13,
                    overflow: 'hidden',
                    borderWidth: 1.5,
                    borderColor: s.borderStrong,
                    backgroundColor: s.surfaceRaised,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {m.exercise.gif_url ? (
                    <Image source={{ uri: m.exercise.gif_url }} alt={m.exercise.name} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                  ) : (
                    <Dumbbell size={24} color={hexToRgba(isActive ? exec.accent : s.textMuted, 0.55)} strokeWidth={1.8} />
                  )}
                </View>

                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    {/* Badge de letra. */}
                    <View
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 9,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: isActive ? exec.accent : s.surfaceRaised,
                        borderWidth: isActive ? 0 : 1.5,
                        borderColor: s.borderStrong,
                      }}
                    >
                      <Text style={{ fontFamily: FONT.displayBlack, fontSize: 13, color: isActive ? exec.accentText : s.textMuted }}>
                        {m.letter}
                      </Text>
                    </View>
                    <Text style={{ flex: 1, fontFamily: FONT.displayBold, fontSize: 15, letterSpacing: -0.2, color: isActive ? s.text : hexToRgba(s.text, 0.82) }} numberOfLines={1}>
                      {m.exercise.name}
                    </Text>
                    {isDoneInRound ? (
                      <Check size={18} color={exec.accent} strokeWidth={3} />
                    ) : (
                      <StatePill kind={isActive ? 'now' : isNext ? 'after' : 'todo'} exec={exec} />
                    )}
                  </View>
                  <Text style={{ fontFamily: FONT.monoSemibold, fontSize: 13, color: isActive ? hexToRgba(s.text, 0.9) : s.textMuted, marginTop: 5, fontVariant: ['tabular-nums'] }} numberOfLines={1}>
                    {rx}
                  </Text>
                </View>
              </View>

              {/* Chip "Cambiar" / "Sustituido" — sólo en el miembro strength ACTIVO antes de su primer set. */}
              {isActive && (m.hasSub || canSubstitute) && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {m.hasSub ? (
                    <>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, borderWidth: 1.5, paddingHorizontal: 9, paddingVertical: 4, backgroundColor: hexToRgba(exec.celebration, 0.14), borderColor: hexToRgba(exec.celebration, 0.34) }}>
                        <ArrowRightLeft size={11} color={exec.celebration} />
                        <Text style={{ fontFamily: FONT.uiBold, fontSize: 11, color: exec.celebration }} numberOfLines={1}>Sustituido</Text>
                      </View>
                      {canSubstitute && (
                        <Pressable testID={`btn-undo-substitute-ss-${m.block.id}`} onPress={() => onUndoSubstitution(m.block.id)} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }} accessibilityRole="button" accessibilityLabel="Deshacer la sustitución">
                          <Undo2 size={13} color={s.textMuted} />
                          <Text style={{ fontFamily: FONT.uiSemibold, fontSize: 11, color: s.textMuted }}>Deshacer</Text>
                        </Pressable>
                      )}
                    </>
                  ) : (
                    <Pressable testID={`btn-substitute-ss-${m.block.id}`} onPress={() => onOpenSubstitute(m.block.id)} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, borderWidth: 1.5, paddingHorizontal: 9, paddingVertical: 4, borderColor: s.borderStrong }} accessibilityRole="button" accessibilityLabel={`Cambiar ${m.exercise.name} — máquina ocupada`}>
                      <ArrowRightLeft size={12} color={s.textMuted} />
                      <Text style={{ fontFamily: FONT.uiSemibold, fontSize: 11, color: s.textMuted }}>Cambiar</Text>
                    </Pressable>
                  )}
                  {m.hasTechnique && (
                    <Pressable testID={`btn-technique-ss-${m.block.id}`} onPress={() => onOpenTechnique(m.exercise)} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }} accessibilityRole="button" accessibilityLabel={`Ver técnica de ${m.exercise.name}`}>
                      <Text style={{ fontFamily: FONT.uiSemibold, fontSize: 11, color: s.textMuted }}>Ver técnica</Text>
                    </Pressable>
                  )}
                </View>
              )}

              {/* Captura REUSADA del miembro activo (ActiveSetRow) — su CTA/RPE/draft/cola es intocable. */}
              {isActive && (
                <ActiveSetRow
                  blockId={m.block.id}
                  setNumber={round}
                  typedMode={m.typedMode}
                  isActive
                  suggestedWeight={m.suggested ?? null}
                  seedValues={seed}
                  allowZeroRir
                  showEffort={showEffort}
                  header={{
                    exerciseName: m.exercise.name,
                    objectiveLine:
                      m.effType === 'strength'
                        ? `${m.block.sets}×${m.block.reps}${m.suggested != null ? ` · ${formatWeightEsCl(m.suggested)} kg` : ''}`
                        : formatTypedObjective(m.block, m.typedMode as TypedKeypadMode),
                    last:
                      m.effType === 'strength' && m.bestPrev
                        ? { weightKg: m.bestPrev.weight_kg ?? null, reps: m.bestPrev.reps_done ?? null }
                        : null,
                  }}
                  onDraftChange={(values, fieldIndex) => onDraftChange(m.block.id, round, values, fieldIndex)}
                  onCommit={onCommitSet}
                />
              )}

              {/* Serie ya registrada de la ronda: fila compacta editable (tap → teclado). */}
              {isDoneInRound && log && (
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
                  showEffort={showEffort}
                />
              )}
            </MotiView>
          )
        })}
      </View>

      {/* Pill "Sin descanso — sigue con {letra}" mientras la ronda esté abierta (hay un miembro tras el
          activo por registrar). */}
      {nextMemberId != null && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            borderRadius: 999,
            paddingHorizontal: 14,
            paddingVertical: 9,
            backgroundColor: hexToRgba(exec.accent, 0.12),
            borderWidth: 1.5,
            borderColor: hexToRgba(exec.accent, 0.3),
          }}
        >
          <Text style={{ fontFamily: FONT.uiBold, fontSize: 13, color: hexToRgba(exec.accent, 0.95) }}>
            Sin descanso — sigue con {memberVMs.find((m) => m.block.id === nextMemberId)?.letter ?? ''}
          </Text>
          <SlideArrow accent={exec.accent} reducedMotion={reducedMotion} />
        </View>
      )}

      {/* Nota de descanso de grupo (sólo al cerrar la ronda). */}
      {groupRestSec > 0 && active != null && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            borderRadius: 12,
            paddingHorizontal: 12,
            paddingVertical: 9,
            backgroundColor: s.surfaceSunken,
            borderWidth: 1.5,
            borderColor: s.borderSubtle,
          }}
        >
          <Clock size={14} color={s.textDim} />
          <Text style={{ fontFamily: FONT.uiBold, fontSize: 12, color: s.textMuted }}>
            Descanso <Text style={{ fontFamily: FONT.monoBold, color: hexToRgba(s.text, 0.85) }}>{groupRestSec}s</Text> al cerrar la ronda
          </Text>
        </View>
      )}
    </MotiView>
  )
}

/** Dot de ronda del header (done/now/todo). El activo late (glow); reduced-motion ⇒ estático. */
function RoundDot({
  state,
  accent,
  track,
  reducedMotion,
}: {
  state: 'done' | 'now' | 'todo'
  accent: string
  track: string
  reducedMotion: boolean
}) {
  const beats = state === 'now' && !reducedMotion
  const bg = state === 'now' ? accent : state === 'done' ? hexToRgba(accent, 0.55) : track
  return (
    <View style={{ width: 8, height: 8, alignItems: 'center', justifyContent: 'center' }}>
      {state === 'now' && (
        <MotiView
          pointerEvents="none"
          style={{ position: 'absolute', width: 8, height: 8, borderRadius: 999, backgroundColor: hexToRgba(accent, 0.28) }}
          from={{ opacity: beats ? 0.5 : 0.3, scale: 1 }}
          animate={{ opacity: beats ? 0.15 : 0.3, scale: beats ? 1.9 : 1 }}
          transition={beats ? { type: 'timing', duration: 1400, loop: true, repeatReverse: true } : { type: 'timing', duration: 0 }}
        />
      )}
      <View
        style={{
          width: 8,
          height: 8,
          borderRadius: 999,
          backgroundColor: bg,
          ...(state === 'todo' ? { borderWidth: 1.5, borderColor: hexToRgba(accent, 0.3) } : null),
        }}
      />
    </View>
  )
}

/** Pastilla de estado del miembro (AHORA / SIGUE / pendiente). */
function StatePill({ kind, exec }: { kind: 'now' | 'after' | 'todo'; exec: ExecTheme }) {
  const s = exec.surface
  if (kind === 'now') {
    return (
      <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, backgroundColor: exec.accent }}>
        <Text style={{ fontFamily: FONT.displayBlack, fontSize: 9, letterSpacing: 1, color: exec.accentText }}>AHORA</Text>
      </View>
    )
  }
  if (kind === 'after') {
    return (
      <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, backgroundColor: s.surfaceRaised, borderWidth: 1.5, borderColor: s.borderStrong }}>
        <Text style={{ fontFamily: FONT.displayBlack, fontSize: 9, letterSpacing: 1, color: s.textMuted }}>SIGUE</Text>
      </View>
    )
  }
  return (
    <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, backgroundColor: s.surfaceRaised, borderWidth: 1.5, borderColor: s.borderSubtle }}>
      <Text style={{ fontFamily: FONT.uiBold, fontSize: 9, letterSpacing: 1, color: s.textDim }}>PENDIENTE</Text>
    </View>
  )
}

/** Flecha ">" que se desliza (paridad mockup a3b-arrow, 1.6s). reduced-motion ⇒ estática. */
function SlideArrow({ accent, reducedMotion }: { accent: string; reducedMotion: boolean }) {
  return (
    <MotiView
      from={{ translateX: 0 }}
      animate={{ translateX: reducedMotion ? 0 : 3 }}
      transition={reducedMotion ? { type: 'timing', duration: 0 } : { type: 'timing', duration: 800, loop: true, repeatReverse: true }}
    >
      <View style={{ width: 18, height: 12, justifyContent: 'center' }}>
        <View style={{ position: 'absolute', left: 0, top: '50%', width: 12, height: 2.5, borderRadius: 2, backgroundColor: accent, transform: [{ translateY: -1.25 }] }} />
        <View style={{ position: 'absolute', right: 1, top: '50%', width: 8, height: 8, borderTopWidth: 2.5, borderRightWidth: 2.5, borderColor: accent, transform: [{ translateY: -4 }, { rotate: '45deg' }] }} />
      </View>
    </MotiView>
  )
}
