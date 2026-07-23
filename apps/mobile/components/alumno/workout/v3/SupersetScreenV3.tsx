import { useEffect, useMemo, useState } from 'react'
import { Pressable, Text, useWindowDimensions, View } from 'react-native'
import { MotiView } from 'moti'
import Animated, {
  Easing,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import { Image } from 'expo-image'
import { ArrowRightLeft, Check, Clock, Dumbbell, Pencil, Undo2 } from 'lucide-react-native'
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
import { EXERCISE_TYPE_META, exerciseTypeColor } from '../../../../lib/exercise-type-meta'
import { parseRestTime } from '../timers'
import {
  resolveExercise,
  type PrevSet,
  type SessionBlock,
  type SessionDraft,
  type SessionExercise,
} from '../../../../lib/workout-session'
import type { EffectiveTarget } from '../../../../lib/workout/progression'
import { Sheet } from '../../../Sheet'
import { SetRow, ActiveSetRow } from '../SetRow'
import { bestPrevOf } from '../workout-ui'
import { ExecMediaV3 } from './ExecMediaV3'
import type { ExecTheme } from './exec-theme'
import { activeRound, memberLetter, nextMemberIdInRound, roundDotStates, totalRounds } from './superset-screen-model'

// Reflow del layout (paridad ExerciseScreenV3 CARD_LAYOUT): anima el reordenamiento / contrae-expande al
// cambiar de miembro/ronda. Sólo sin reduced-motion.
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
 * Pantalla "Superserie" del ejecutor V3 (E3.5 + QA1) — traducción RN de la pantalla Superserie del mockup
 * concepto-a-v3-tipos con el rediseño del CEO (2026-07-22): el miembro ACTIVO se muestra IGUAL que un
 * ejercicio solo (media grande 150px vía `ExecMediaV3` + chips glass + prescripción + fila "Anterior" +
 * captura HERO `ActiveSetRow heroMode`, sólo la serie de la RONDA actual), y los NO activos quedan
 * colapsados a una tarjeta compacta (mini-media 60px + badge de letra + estado hecho/pendiente). Al
 * completar la serie del activo cuando queda otro miembro en la MISMA ronda, `CARD_LAYOUT` anima la
 * contracción/expansión de las tarjetas y sale un aviso efímero "¡Sigue sin detenerte!" (auto-dismiss
 * ~1,4 s, no interactivo). El aviso NO aparece al cerrar la ronda (ahí manda el descanso).
 *
 * MOTOR INTOCABLE: consume `superset-rounds` (vía `superset-screen-model`) para derivar ronda activa /
 * siguiente miembro / estado de dots; NO reimplementa el intercalado ni el cierre de ronda. El descanso
 * de grupo (sólo al cerrar la ronda) lo dispara el orquestador en `onCommitSet`, igual que hoy — esta
 * pantalla sólo pinta. La captura y su lógica de guardado/draft/cola son las de `ActiveSetRow`/`SetRow`.
 * `handleCommit` sólo envuelve `onCommitSet` para disparar el aviso (payload byte-idéntico).
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

  // Aviso "¡Sigue sin detenerte!" (overlay efímero) + prefill "= última vez" del miembro activo. Ambos
  // son estado LOCAL de UI: no rozan el motor de guardado/cola.
  const [cue, setCue] = useState<{ name: string; nonce: number } | null>(null)
  const [autofill, setAutofill] = useState<{ weight: number | null; reps: number | null; nonce: number } | null>(null)
  // Miembro YA HECHO cuya edición está abierta (QA2 #3): tap en su tarjeta colapsada abre el sheet oscuro
  // "Editar {nombre}" con las filas clásicas del motor (SetRow). Estado LOCAL de UI: no roza guardado/cola.
  const [editBlockId, setEditBlockId] = useState<string | null>(null)

  useEffect(() => {
    if (!cue) return
    // 1650ms > timeline de la barra (~1,6s): ya salió de pantalla cuando se desmonta.
    const t = setTimeout(() => setCue(null), 1650)
    return () => clearTimeout(t)
  }, [cue?.nonce])

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

  // El prefill "= última vez" es POR miembro activo: al cambiar de miembro se descarta para no arrastrar
  // el autollenado al siguiente ejercicio.
  const activeBlockId = active?.blockId ?? null
  useEffect(() => {
    setAutofill(null)
  }, [activeBlockId])

  if (memberVMs.length < 2) return null

  // Miembros de la ronda ACTIVA (los que tienen serie en esa ronda), en orden.
  const roundMembers = memberVMs.filter((m) => m.block.sets >= round)

  // Miembro cuya edición está abierta (sheet QA2 #3) + sus filas YA registradas (motor clásico, SetRow).
  const editVM = editBlockId ? memberVMs.find((m) => m.block.id === editBlockId) : null
  const editRows = editVM
    ? Array.from({ length: editVM.block.sets })
        .map((_, i) => {
          const setNumber = i + 1
          const log = editVM.blockLogs.find((l) => l.set_number === setNumber)
          if (!log) return null
          const isRecent = recentSet?.blockId === editVM.block.id && recentSet?.setNumber === setNumber
          return (
            <SetRow
              key={setNumber}
              setNumber={setNumber}
              log={log}
              isActive={false}
              typedMode={editVM.typedMode}
              onPress={() => onOpenSet(editVM.block.id, setNumber)}
              onRpeUpdate={onRpeUpdate}
              settle={isRecent}
              pr={isRecent && !!recentSet?.pr}
              prColor={exec.pr}
              prIntense
              syncError={syncErrors?.[`${editVM.block.id}:${setNumber}`] ?? null}
              onRetry={() => onRetrySet?.(editVM.block.id, setNumber)}
              showEffort={showEffort}
            />
          )
        })
        .filter(Boolean)
    : []

  // Envoltura de `onCommitSet`: dispara el aviso "¡Sigue sin detenerte!" SOLO cuando lo que se confirma es
  // LA serie de la ronda actual del miembro activo (QA3: editar una serie pasada — tarjeta hecha / keypad —
  // reusa el mismo motor y NO debe avisar). Si queda otro miembro en la MISMA ronda, muestra su nombre.
  // Payload intacto → motor sin tocar.
  const handleCommit = (payload: OptimisticLogPayload) => {
    const esSerieActiva = payload.blockId === activeBlockId && payload.setNumber === round
    if (esSerieActiva && nextMemberId != null) {
      const nextVM = memberVMs.find((m) => m.block.id === nextMemberId)
      if (nextVM) setCue({ name: nextVM.exercise.name, nonce: Date.now() })
    }
    onCommitSet(payload)
  }

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

      {/* Tarjetas de la ronda activa: el ACTIVO como ejercicio solo, los demás colapsados. */}
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

          // ── MIEMBRO ACTIVO — presentación de ejercicio solo (media 150px + rx + Anterior + hero). ──
          if (isActive) {
            const canSubstitute = m.effType === 'strength' && m.doneCount === 0
            const typeColor = exerciseTypeColor(m.effType, exec.accent)
            const typeLabel = EXERCISE_TYPE_META[m.effType]?.label ?? ''
            const repsHint = (() => {
              const n = parseInt(String(m.block.reps), 10)
              return Number.isFinite(n) ? String(n) : null
            })()
            const seed =
              restoredDraft && restoredDraft.blockId === m.block.id && restoredDraft.setNumber === round
                ? restoredDraft.values
                : null

            return (
              <MotiView
                key={m.block.id}
                layout={reducedMotion ? undefined : CARD_LAYOUT}
                style={{
                  gap: 12,
                  borderRadius: 18,
                  padding: 12,
                  borderWidth: 2,
                  backgroundColor: hexToRgba(exec.accent, 0.1),
                  borderColor: hexToRgba(exec.accent, 0.55),
                  ...(reducedMotion
                    ? null
                    : { shadowColor: exec.accent, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.28, shadowRadius: 10, elevation: 6 }),
                }}
              >
                {/* Badge de letra + AHORA. */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <LetterBadge letter={m.letter} active exec={exec} />
                  <StatePill kind="now" exec={exec} />
                </View>

                {/* Nombre grande + chip tipo·músculo (+ sustitución / técnica). */}
                <View style={{ gap: 8 }}>
                  <Text style={{ fontFamily: FONT.displayBlack, fontSize: 24, letterSpacing: -0.5, lineHeight: 27, color: s.text }}>
                    {m.exercise.name}
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 999, borderWidth: 1.5, paddingHorizontal: 11, paddingVertical: 5, backgroundColor: hexToRgba(typeColor, 0.16), borderColor: hexToRgba(typeColor, 0.34) }}>
                      <Text style={{ fontFamily: FONT.uiBold, fontSize: 12, color: hexToRgba(typeColor, 0.95) }} numberOfLines={1}>
                        {typeLabel}
                        {m.exercise.muscle_group ? ` · ${m.exercise.muscle_group}` : ''}
                      </Text>
                    </View>
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
                    ) : canSubstitute ? (
                      <Pressable testID={`btn-substitute-ss-${m.block.id}`} onPress={() => onOpenSubstitute(m.block.id)} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, borderWidth: 1.5, paddingHorizontal: 9, paddingVertical: 4, borderColor: s.borderStrong }} accessibilityRole="button" accessibilityLabel={`Cambiar ${m.exercise.name} — máquina ocupada`}>
                        <ArrowRightLeft size={12} color={s.textMuted} />
                        <Text style={{ fontFamily: FONT.uiSemibold, fontSize: 11, color: s.textMuted }}>Cambiar</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>

                {/* Media grande + chips glass (compartida con el ejercicio solo). */}
                <ExecMediaV3
                  exercise={m.exercise}
                  coachNote={m.block.notes?.trim() ? m.block.notes.trim() : null}
                  exec={exec}
                  reducedMotion={reducedMotion}
                  onOpenTechnique={() => onOpenTechnique(m.exercise)}
                />

                {/* Prescripción compacta. */}
                <Text style={{ fontFamily: FONT.monoSemibold, fontSize: 13, letterSpacing: 0.1, color: hexToRgba(s.text, 0.82), textAlign: 'center', fontVariant: ['tabular-nums'] }}>
                  {rx}
                </Text>

                {/* Fila "Anterior — toca para usar" (1-tap prefill de la serie activa). */}
                {m.bestPrev && (m.bestPrev.weight_kg != null || m.bestPrev.reps_done != null) && (
                  <Pressable
                    testID={`btn-prev-autofill-ss-${m.block.id}`}
                    onPress={() => setAutofill({ weight: m.bestPrev!.weight_kg, reps: m.bestPrev!.reps_done, nonce: Date.now() })}
                    style={({ pressed }) => ({
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                      paddingHorizontal: 15,
                      paddingVertical: 11,
                      borderRadius: 14,
                      borderWidth: 2,
                      borderStyle: 'dashed',
                      borderColor: s.borderStrong,
                      backgroundColor: pressed ? hexToRgba(exec.accent, 0.08) : s.surfaceRaised,
                    })}
                    accessibilityRole="button"
                    accessibilityLabel={m.bestPrev.weight_kg ? `Usar la última vez: ${m.bestPrev.weight_kg} kg por ${m.bestPrev.reps_done ?? '-'} reps` : undefined}
                  >
                    <Text style={{ fontFamily: FONT.uiSemibold, fontSize: 12, color: s.textMuted }}>Anterior</Text>
                    <Text style={{ fontFamily: FONT.monoBold, fontSize: 14, color: s.text, fontVariant: ['tabular-nums'] }}>
                      {m.bestPrev.weight_kg ? `${m.bestPrev.weight_kg} kg` : '-'} × {m.bestPrev.reps_done || '-'}
                    </Text>
                    <Text style={{ fontFamily: FONT.uiExtra, fontSize: 11, color: exec.accent }}>1 tap ↻</Text>
                  </Pressable>
                )}

                {/* Captura HERO REUSADA del miembro activo (ActiveSetRow heroMode) — motor intocable. */}
                <ActiveSetRow
                  key={`hero-${m.block.id}-${round}`}
                  blockId={m.block.id}
                  setNumber={round}
                  typedMode={m.typedMode}
                  isActive
                  heroMode
                  exec={exec}
                  repsHint={repsHint}
                  suggestedWeight={m.suggested ?? null}
                  seedValues={seed}
                  autofill={autofill}
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
                  onCommit={handleCommit}
                />
              </MotiView>
            )
          }

          // ── MIEMBROS NO ACTIVOS — tarjeta compacta (mini-media 60px + estado). ──
          const isRecent = recentSet?.blockId === m.block.id && recentSet?.setNumber === round
          const syncError = syncErrors?.[`${m.block.id}:${round}`] ?? null
          return (
            <MotiView
              key={m.block.id}
              layout={reducedMotion ? undefined : CARD_LAYOUT}
              style={{ gap: 8, borderRadius: 18, padding: 12, borderWidth: 2, backgroundColor: '#17171f', borderColor: s.border, opacity: isDoneInRound ? 0.9 : 0.62 }}
            >
              <Pressable
                onPress={isDoneInRound ? () => setEditBlockId(m.block.id) : undefined}
                disabled={!isDoneInRound}
                accessibilityRole={isDoneInRound ? 'button' : undefined}
                accessibilityLabel={isDoneInRound ? `Editar ${m.exercise.name}` : undefined}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}
              >
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
                    <Dumbbell size={24} color={hexToRgba(s.textMuted, 0.55)} strokeWidth={1.8} />
                  )}
                </View>

                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <LetterBadge letter={m.letter} active={false} exec={exec} />
                    <Text style={{ flex: 1, fontFamily: FONT.displayBold, fontSize: 15, letterSpacing: -0.2, color: hexToRgba(s.text, 0.82) }} numberOfLines={1}>
                      {m.exercise.name}
                    </Text>
                    {isDoneInRound ? (
                      // Lápiz chico + check: afordancia de edición (QA2 #3) para que se descubra.
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Pencil size={15} color={hexToRgba(s.textMuted, 0.9)} />
                        <Check size={18} color={exec.accent} strokeWidth={3} />
                      </View>
                    ) : (
                      <StatePill kind={isNext ? 'after' : 'todo'} exec={exec} />
                    )}
                  </View>
                  <Text style={{ fontFamily: FONT.monoSemibold, fontSize: 13, color: s.textMuted, marginTop: 5, fontVariant: ['tabular-nums'] }} numberOfLines={1}>
                    {rx}
                  </Text>
                </View>
              </Pressable>

              {/* Error de sync de la serie ya registrada (retry) — se conserva la superficie de resiliencia. */}
              {isDoneInRound && syncError && (
                <SetRow
                  setNumber={round}
                  log={log!}
                  isActive={false}
                  typedMode={m.typedMode}
                  onPress={() => onOpenSet(m.block.id, round)}
                  onRpeUpdate={onRpeUpdate}
                  settle={isRecent}
                  pr={isRecent && !!recentSet?.pr}
                  prColor={exec.pr}
                  prIntense
                  syncError={syncError}
                  onRetry={() => onRetrySet?.(m.block.id, round)}
                  showEffort={showEffort}
                />
              )}
            </MotiView>
          )
        })}
      </View>

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

      {/* Aviso efímero "¡Sigue sin detenerte!" (QA3, diseño CEO): sin scrim de pantalla completa — una BARRA
          NEGRA horizontal a media pantalla que ENTRA desde la derecha, sostiene y SALE entera a la izquierda.
          Letras en color de marca con glow (sin contorno duro) + micro-parallax. No interactivo. `key` por
          nonce reinicia la animación si se encadena otro aviso; el padre lo desmonta a los 1650ms. */}
      {cue && <CueBar key={cue.nonce} name={cue.name} exec={exec} reducedMotion={reducedMotion} />}

      {/* Sheet oscuro "Editar {nombre}" (QA2 #3): monta las filas CLÁSICAS del motor (SetRow) del miembro ya
          hecho para corregir sus series registradas — mismo motor de edición del lápiz del ejercicio solo,
          sólo envuelto en el sheet V3. La edición real la resuelve `onOpenSet` (orquestador), intacto. */}
      <Sheet
        open={editBlockId != null}
        onClose={() => setEditBlockId(null)}
        title={editVM ? `Editar ${editVM.exercise.name}` : 'Editar'}
        nativeModal
        forceDark
        snapPoints={['60%']}
      >
        <View style={{ gap: 6, paddingVertical: 4 }}>
          {editRows.length > 0 ? (
            editRows
          ) : (
            <Text style={{ fontFamily: FONT.ui, fontSize: 13, color: s.textMuted, textAlign: 'center', paddingVertical: 12 }}>
              Todavía no registras ninguna serie de este ejercicio.
            </Text>
          )}
        </View>
      </Sheet>
    </MotiView>
  )
}

/**
 * Aviso "¡Sigue sin detenerte!" (QA3, diseño CEO) — barra negra horizontal a media pantalla: ENTRA desde la
 * derecha (translateX ancho→0 al ~13% del timeline), SOSTIENE hasta ~74% y SALE entera a la izquierda;
 * timeline único de ~1,6s con curva cubic-bezier(.4,0,.2,1). Las letras (marca + glow, sin contorno duro)
 * entran con micro-parallax (un pelo después) y se apagan antes de la salida. reduced-motion ⇒ fade puro sin
 * desplazamiento. No interactivo (pointerEvents none). El padre lo monta/desmonta y lo keyea por nonce.
 */
function CueBar({ name, exec, reducedMotion }: { name: string; exec: ExecTheme; reducedMotion: boolean }) {
  const { width } = useWindowDimensions()
  const barX = useSharedValue(reducedMotion ? 0 : width)
  const barOpacity = useSharedValue(reducedMotion ? 0 : 1)
  const txtX = useSharedValue(reducedMotion ? 0 : 46)
  const txtOpacity = useSharedValue(0)

  useEffect(() => {
    const EASE = Easing.bezier(0.4, 0, 0.2, 1)
    if (reducedMotion) {
      barOpacity.value = withSequence(
        withTiming(1, { duration: 192 }),
        withTiming(1, { duration: 1088 }),
        withTiming(0, { duration: 320 }),
      )
      txtOpacity.value = withSequence(
        withTiming(1, { duration: 192 }),
        withTiming(1, { duration: 1088 }),
        withTiming(0, { duration: 320 }),
      )
      return
    }
    // Barra: entra (13% ≈ 208ms) → sostiene (61% ≈ 976ms) → sale entera a la izquierda (26% ≈ 416ms).
    barX.value = withSequence(
      withTiming(0, { duration: 208, easing: EASE }),
      withTiming(0, { duration: 976, easing: EASE }),
      withTiming(-width * 1.12, { duration: 416, easing: EASE }),
    )
    // Letras: micro-parallax (entran un pelo después, se apagan antes de la salida de la barra).
    txtX.value = withSequence(
      withTiming(0, { duration: 272, easing: EASE }),
      withTiming(0, { duration: 880, easing: EASE }),
      withTiming(-36, { duration: 448, easing: EASE }),
    )
    txtOpacity.value = withSequence(
      withTiming(1, { duration: 272, easing: EASE }),
      withTiming(1, { duration: 880, easing: EASE }),
      withTiming(0, { duration: 448, easing: EASE }),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const barStyle = useAnimatedStyle(() => ({ transform: [{ translateX: barX.value }], opacity: barOpacity.value }))
  const txtStyle = useAnimatedStyle(() => ({ transform: [{ translateX: txtX.value }], opacity: txtOpacity.value }))

  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 50, justifyContent: 'center', overflow: 'hidden' }}>
      <Animated.View
        style={[
          {
            paddingVertical: 20,
            paddingHorizontal: 24,
            alignItems: 'center',
            gap: 5,
            backgroundColor: '#050509',
            borderTopWidth: 1,
            borderBottomWidth: 1,
            borderColor: 'rgba(255,255,255,0.06)',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.55,
            shadowRadius: 24,
            elevation: 12,
          },
          barStyle,
        ]}
      >
        {/* Tinta de marca + glow (text-shadow del color de marca, sin contorno oscuro). */}
        <Animated.Text
          style={[
            { fontFamily: FONT.displayBlack, fontSize: 30, letterSpacing: -0.6, textAlign: 'center', color: exec.accent, textShadowColor: hexToRgba(exec.accent, 0.55), textShadowRadius: 22, textShadowOffset: { width: 0, height: 0 } },
            txtStyle,
          ]}
        >
          ¡Sigue sin detenerte!
        </Animated.Text>
        <Animated.Text style={[{ fontFamily: FONT.uiExtra, fontSize: 15, textAlign: 'center', color: '#ffffff' }, txtStyle]} numberOfLines={2}>
          {name}
        </Animated.Text>
      </Animated.View>
    </View>
  )
}

/** Badge de letra del miembro (30×30). El activo va en acento con tinta de marca (accentText). */
function LetterBadge({ letter, active, exec }: { letter: string; active: boolean; exec: ExecTheme }) {
  const s = exec.surface
  return (
    <View
      style={{
        width: 30,
        height: 30,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: active ? exec.accent : s.surfaceRaised,
        borderWidth: active ? 0 : 1.5,
        borderColor: s.borderStrong,
      }}
    >
      <Text style={{ fontFamily: FONT.displayBlack, fontSize: 15, color: active ? exec.accentText : s.textMuted }}>
        {letter}
      </Text>
    </View>
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
