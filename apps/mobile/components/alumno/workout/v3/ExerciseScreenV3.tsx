import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { AnimatePresence, MotiView } from 'moti'
import { LinearTransition } from 'react-native-reanimated'
import { Image } from 'expo-image'
import { ArrowRightLeft, Dumbbell, Hand, History, ListChecks, MessageSquareText, Play, TrendingUp, Undo2, X } from 'lucide-react-native'
import {
  formatWeightEsCl,
  type OptimisticLogPayload,
  type ReconciledSessionLog,
} from '@eva/workout-engine'
import { FONT, textStyle } from '../../../../lib/typography'
import { hexToRgba } from '../../../../lib/theme'
import { haptics } from '../../../../lib/haptics'
import { extractYoutubeVideoId } from '../../../../lib/youtube'
import { EXERCISE_TYPE_META, exerciseTypeColor } from '../../../../lib/exercise-type-meta'
import type { EffectiveTarget } from '../../../../lib/workout/progression'
import type { PrevSet, SessionBlock, SessionDraft, SessionExercise } from '../../../../lib/workout-session'
import { VideoPlayer } from '../../../VideoPlayer'
import { Sheet } from '../../../Sheet'
import { SetRow, ActiveSetRow } from '../SetRow'
import { bestPrevOf, overloadChipLabel } from '../workout-ui'
import { DualWheelPicker } from './DualWheelPicker'
import { dismissWheelHint, useWheelHintDismissed } from './wheel-hint'
import type { ExecTheme } from './exec-theme'

// Reflow del layout (paridad SingleExerciseCard CARD_LAYOUT): anima el cambio de tamaño al
// completar series. Sólo sin reduced-motion.
const CARD_LAYOUT = LinearTransition.springify().damping(25).stiffness(200)

// Alto fijo del medio inline del ejercicio activo (preview compacto; el modal de técnica muestra el
// medio completo). Cuota: sólo el ejercicio ACTIVO monta media animada — garantizado porque el stepper
// V3 pinta un paso a la vez.
const MEDIA_HEIGHT = 176

// Colapso de los chips glass a solo-icono, tras entrar la serie (contrato: ~1,2s).
const CHIP_COLLAPSE_MS = 1200

/**
 * Pantalla "Fuerza" del ejecutor V3 (E2.3) — traducción RN del `.a3a-body` (Fuerza) del mockup
 * concepto-a-v3-core. REEMPLAZA el cuerpo del paso strength dentro del `ExecutorV3` (los demás tipos
 * siguen con `SingleExerciseCard` hasta la Ola 3). Layout del mockup:
 *  · nombre grande + chip tipo·músculo;
 *  · MEDIA siempre visible al centro (misma resolución que TechniqueSheet/SingleExerciseCard, regla de
 *    media del CTX: gif/imagen → imagen; mp4/webm → video autoplay-mute-loop; YouTube → placeholder +
 *    chip que abre el modal de técnica) con chips glass "Instrucciones"/"Nota del coach" que entran
 *    extendidos y colapsan a solo-icono ~1,2s (reduced-motion ⇒ quedan extendidos; badge dot si hay nota);
 *  · prescripción compacta + chip de sobrecarga;
 *  · fila "Anterior: X kg × Y — toca para usar" (1-tap → prellena la serie activa con el mecanismo de
 *    autofill EXISTENTE de `ActiveSetRow`);
 *  · las series como `SetRow`/`ActiveSetRow` REUSADAS (contenedor V3, su lógica de guardado/draft/cola
 *    intacta). El CTA de completar y las pills RPE/RIR son los de `ActiveSetRow` — NO se duplican.
 *
 * MOTOR INTOCABLE: este componente sólo RECOMPONE visualmente. El mapeo activa/logueada es el mismo que
 * `SingleExerciseCard` (misma fuente de verdad de qué fila es protagonista).
 */
export function ExerciseScreenV3({
  block,
  exercise,
  eff,
  currentWeek,
  blockLogs,
  prevList,
  restoredDraft,
  reducedMotion = false,
  exec,
  substitution,
  canSubstitute,
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
  block: SessionBlock
  exercise: SessionExercise
  eff: EffectiveTarget | null
  currentWeek: number | null
  blockLogs: ReconciledSessionLog[]
  prevList: PrevSet[]
  restoredDraft: SessionDraft | null
  reducedMotion?: boolean
  exec: ExecTheme
  substitution: { name: string; prescribedName: string } | null
  canSubstitute: boolean
  onOpenTechnique: () => void
  onOpenSet: (setNumber: number) => void
  onCommitSet: (payload: OptimisticLogPayload) => void
  onRpeUpdate?: (payload: OptimisticLogPayload) => void
  onDraftChange: (blockId: string, setNumber: number, values: Record<string, string>, fieldIndex: number) => void
  onOpenSubstitute: () => void
  onUndoSubstitution: () => void
  recentSet?: { blockId: string; setNumber: number; pr: boolean } | null
  syncErrors?: Record<string, string>
  onRetrySet?: (blockId: string, setNumber: number) => void
}) {
  const s = exec.surface
  const [autofill, setAutofill] = useState<{ weight: number | null; reps: number | null; nonce: number } | null>(null)
  const [noteOpen, setNoteOpen] = useState(false)
  // Rueda dual (E2.5) — se abre por long-press sobre kg/reps de la serie activa; entrega ambos valores
  // por el MISMO autofill de la fila "Anterior". El hint "una vez" se apaga al usarla o cerrarlo.
  const [wheelOpen, setWheelOpen] = useState(false)
  const hintDismissed = useWheelHintDismissed()

  const typeColor = exerciseTypeColor('strength', exec.accent)
  const typeLabel = EXERCISE_TYPE_META.strength.label

  const loggedSetNumbers = useMemo(
    () => new Set(blockLogs.filter((l) => l.set_number >= 1 && l.set_number <= block.sets).map((l) => l.set_number)),
    [blockLogs, block.sets],
  )
  let firstUnlogged: number | null = null
  for (let i = 1; i <= block.sets; i += 1) {
    if (!loggedSetNumbers.has(i)) { firstUnlogged = i; break }
  }

  const suggestedWeightKg = eff?.weightKg ?? block.target_weight_kg
  const overloadLabel = overloadChipLabel(block, eff, currentWeek)
  const bestPrev = bestPrevOf(prevList)

  // Anclas de la rueda: centro en el valor ANTERIOR de la serie (mejor set previo) o, si no hay,
  // en el OBJETIVO (peso sugerido / reps prescritas). `block.reps` puede ser "8-10" ⇒ toma el primer
  // entero. La rueda redondea internamente al grid del paso.
  const wheelAnchors = useMemo(() => {
    const repsParsed = parseInt(String(block.reps), 10)
    return {
      kg: bestPrev?.weight_kg ?? suggestedWeightKg ?? 0,
      reps: bestPrev?.reps_done ?? (Number.isFinite(repsParsed) ? repsParsed : 0),
    }
  }, [bestPrev, suggestedWeightKg, block.reps])

  const openWheel = () => {
    if (firstUnlogged == null) return
    haptics.tap()
    setWheelOpen(true)
  }
  const handleWheelDone = (weightKg: number, reps: number) => {
    if (firstUnlogged != null) setAutofill({ weight: weightKg, reps, nonce: Date.now() })
    if (!hintDismissed) dismissWheelHint()
    setWheelOpen(false)
  }
  const showWheelHint = !hintDismissed && firstUnlogged != null

  const hasTechnique = !!(exercise.gif_url || exercise.video_url)
  const hasInstructions = (exercise.instructions?.length ?? 0) > 0
  const showInstrChip = hasTechnique || hasInstructions
  const coachNote = block.notes?.trim() ? block.notes.trim() : null

  // Colapso de los chips glass: extendidos al ENTRAR la serie (nueva serie = cambia firstUnlogged),
  // se contraen a solo-icono ~1,2s después. reduced-motion ⇒ quedan siempre extendidos.
  const [chipsExpanded, setChipsExpanded] = useState(true)
  useEffect(() => {
    if (reducedMotion) { setChipsExpanded(true); return }
    setChipsExpanded(true)
    const t = setTimeout(() => setChipsExpanded(false), CHIP_COLLAPSE_MS)
    return () => clearTimeout(t)
  }, [firstUnlogged, reducedMotion])

  // Filas de registro — MISMO mapeo activa/logueada que SingleExerciseCard (rama strength). Reusa
  // `ActiveSetRow` (sin registrar) y `SetRow` (logueada); su lógica de guardado/draft/cola es intocable.
  const setRows = Array.from({ length: block.sets }).map((_, i) => {
    const setNumber = i + 1
    const log = blockLogs.find((l) => l.set_number === setNumber)
    if (!log) {
      const isActiveSet = setNumber === firstUnlogged
      const seed =
        restoredDraft && restoredDraft.blockId === block.id && restoredDraft.setNumber === setNumber
          ? restoredDraft.values
          : null
      return (
        <ActiveSetRow
          key={setNumber}
          blockId={block.id}
          setNumber={setNumber}
          typedMode={null}
          isActive={isActiveSet}
          suggestedWeight={suggestedWeightKg ?? null}
          seedValues={seed}
          autofill={isActiveSet ? autofill : null}
          header={{
            exerciseName: exercise.name,
            objectiveLine: `${block.sets}×${block.reps}${suggestedWeightKg != null ? ` · ${formatWeightEsCl(suggestedWeightKg)} kg` : ''}`,
            last: bestPrev ? { weightKg: bestPrev.weight_kg ?? null, reps: bestPrev.reps_done ?? null } : null,
          }}
          onDraftChange={(values, fieldIndex) => onDraftChange(block.id, setNumber, values, fieldIndex)}
          onCommit={onCommitSet}
          // Rueda dual (E2.5): SOLO la serie activa la abre por long-press (el autofill alimenta esa fila).
          onLongPressValue={isActiveSet ? openWheel : undefined}
          // RIR con 0 habilitado (decision CEO 8) en TODA fila de fuerza V3 (activa y recesivas).
          allowZeroRir
        />
      )
    }
    const isRecent = recentSet?.blockId === block.id && recentSet?.setNumber === setNumber
    return (
      <SetRow
        key={setNumber}
        setNumber={setNumber}
        log={log}
        isActive={setNumber === firstUnlogged}
        typedMode={null}
        onPress={() => onOpenSet(setNumber)}
        onRpeUpdate={onRpeUpdate}
        settle={isRecent}
        pr={isRecent && !!recentSet?.pr}
        syncError={syncErrors?.[`${block.id}:${setNumber}`] ?? null}
        onRetry={() => onRetrySet?.(block.id, setNumber)}
      />
    )
  })

  const prescription = useMemo(() => {
    const parts: string[] = [`${block.sets} × ${block.reps}`]
    if (block.target_weight_kg != null) parts.push(`${suggestedWeightKg ?? block.target_weight_kg} kg`)
    if (block.rir) parts.push(`RIR ${block.rir}`)
    if (block.tempo) parts.push(`tempo ${block.tempo}`)
    if (block.rest_time) parts.push(`desc ${block.rest_time}`)
    return parts.join('  ·  ')
  }, [block.sets, block.reps, block.target_weight_kg, block.rir, block.tempo, block.rest_time, suggestedWeightKg])

  return (
    <MotiView layout={reducedMotion ? undefined : CARD_LAYOUT} style={{ gap: 12 }}>
      {/* Nombre + chip tipo·músculo (+ sustitución) */}
      <View style={{ gap: 8 }}>
        <Text style={{ fontFamily: FONT.displayBlack, fontSize: 26, letterSpacing: -0.5, lineHeight: 28, color: s.text }}>
          {exercise.name}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, borderWidth: 1.5, paddingHorizontal: 11, paddingVertical: 5, backgroundColor: hexToRgba(typeColor, 0.16), borderColor: hexToRgba(typeColor, 0.34) }}>
            <Dumbbell size={13} color={typeColor} />
            <Text style={{ fontFamily: FONT.uiBold, fontSize: 12, color: hexToRgba(typeColor, 0.95) }} numberOfLines={1}>
              {typeLabel}
              {exercise.muscle_group ? ` · ${exercise.muscle_group}` : ''}
            </Text>
          </View>
          {substitution ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, borderWidth: 1.5, paddingHorizontal: 9, paddingVertical: 4, backgroundColor: hexToRgba(exec.celebration, 0.14), borderColor: hexToRgba(exec.celebration, 0.34) }}>
                <ArrowRightLeft size={11} color={exec.celebration} />
                <Text style={{ fontFamily: FONT.uiBold, fontSize: 11, color: exec.celebration }} numberOfLines={1}>Sustituido</Text>
              </View>
              {canSubstitute && (
                <Pressable testID="btn-undo-substitute-v3" onPress={onUndoSubstitution} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }} accessibilityRole="button" accessibilityLabel="Deshacer la sustitución">
                  <Undo2 size={13} color={s.textMuted} />
                  <Text style={{ fontFamily: FONT.uiSemibold, fontSize: 11, color: s.textMuted }}>Deshacer</Text>
                </Pressable>
              )}
            </View>
          ) : canSubstitute ? (
            <Pressable testID="btn-substitute-v3" onPress={onOpenSubstitute} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, borderWidth: 1.5, paddingHorizontal: 9, paddingVertical: 4, borderColor: s.borderStrong }} accessibilityRole="button" accessibilityLabel={`Cambiar ${exercise.name} — máquina ocupada`}>
              <ArrowRightLeft size={12} color={s.textMuted} />
              <Text style={{ fontFamily: FONT.uiSemibold, fontSize: 11, color: s.textMuted }}>Cambiar</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* MEDIA + chips glass */}
      <View style={{ position: 'relative', height: MEDIA_HEIGHT, borderRadius: 22, overflow: 'hidden', borderWidth: 2, borderColor: s.borderStrong, backgroundColor: s.surfaceRaised }}>
        <ExerciseMediaV3 exercise={exercise} exec={exec} onOpenTechnique={onOpenTechnique} />
        <View style={{ position: 'absolute', top: 10, left: 10, right: 10, flexDirection: 'row', gap: 7 }}>
          {showInstrChip && (
            <GlassChip
              testID="chip-instructions-v3"
              icon={<ListChecks size={14} color="#eaeaf0" />}
              label="Instrucciones"
              expanded={chipsExpanded}
              reducedMotion={reducedMotion}
              onPress={onOpenTechnique}
              accessibilityLabel={`Ver instrucciones de ${exercise.name}`}
            />
          )}
          {coachNote && (
            <GlassChip
              testID="chip-coach-note-v3"
              icon={<MessageSquareText size={14} color="#eaeaf0" />}
              label="Nota del coach"
              expanded={chipsExpanded}
              reducedMotion={reducedMotion}
              badgeColor={exec.accent}
              onPress={() => setNoteOpen(true)}
              accessibilityLabel="Ver la nota del coach"
            />
          )}
        </View>
      </View>

      {/* Prescripción compacta + chip de sobrecarga */}
      <View style={{ gap: 8 }}>
        <Text style={{ fontFamily: FONT.monoSemibold, fontSize: 13, letterSpacing: 0.1, color: hexToRgba(s.text, 0.82), textAlign: 'center', fontVariant: ['tabular-nums'] }}>
          {prescription}
        </Text>
        {overloadLabel && (
          <View style={{ alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, borderWidth: 1.5, paddingHorizontal: 10, paddingVertical: 3, backgroundColor: hexToRgba(exec.accent, 0.1), borderColor: hexToRgba(exec.accent, 0.3) }}>
            <TrendingUp size={12} color={exec.accent} />
            <Text style={{ fontFamily: FONT.uiBold, fontSize: 11, color: exec.accent }}>{overloadLabel}</Text>
          </View>
        )}
      </View>

      {/* Fila "Anterior — toca para usar" (1-tap prefill de la serie activa). */}
      {bestPrev && (
        <Pressable
          testID="btn-prev-autofill-v3"
          disabled={firstUnlogged == null}
          onPress={() => { if (firstUnlogged != null) setAutofill({ weight: bestPrev.weight_kg, reps: bestPrev.reps_done, nonce: Date.now() }) }}
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
            backgroundColor: pressed && firstUnlogged != null ? hexToRgba(exec.accent, 0.08) : s.surfaceRaised,
            opacity: firstUnlogged == null ? 0.55 : 1,
          })}
          accessibilityRole="button"
          accessibilityLabel={firstUnlogged != null && bestPrev.weight_kg ? `Usar la última vez: ${bestPrev.weight_kg} kg por ${bestPrev.reps_done ?? '-'} reps` : undefined}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <History size={14} color={s.textMuted} />
            <Text style={{ fontFamily: FONT.uiSemibold, fontSize: 12, color: s.textMuted }}>Anterior</Text>
          </View>
          <Text style={{ fontFamily: FONT.monoBold, fontSize: 14, color: s.text, fontVariant: ['tabular-nums'] }}>
            {bestPrev.weight_kg ? `${bestPrev.weight_kg} kg` : '-'} × {bestPrev.reps_done || '-'}
          </Text>
          {firstUnlogged != null && (
            <Text style={{ fontFamily: FONT.uiExtra, fontSize: 11, color: exec.accent }}>1 tap ↻</Text>
          )}
        </Pressable>
      )}

      {/* Hint "una sola vez" de la captura dual (E2.5): pill sobre la fila de captura. Se apaga al usar
          la rueda (handleWheelDone) o al cerrar la pill. Persistido en AsyncStorage (eva:wheel-hint-v1). */}
      {showWheelHint && (
        <View
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, borderWidth: 1.5, paddingLeft: 12, paddingRight: 6, paddingVertical: 8, backgroundColor: hexToRgba(exec.accent, 0.1), borderColor: hexToRgba(exec.accent, 0.3) }}
        >
          <Hand size={14} color={exec.accent} />
          <Text style={{ flex: 1, fontFamily: FONT.uiSemibold, fontSize: 12, color: s.text }} numberOfLines={2}>
            Tap = teclado · Mantén presionado = rueda
          </Text>
          <Pressable
            testID="btn-dismiss-wheel-hint-v3"
            onPress={() => dismissWheelHint()}
            hitSlop={8}
            style={{ height: 28, width: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 999 }}
            accessibilityRole="button"
            accessibilityLabel="Entendido, ocultar la ayuda"
          >
            <X size={15} color={s.textMuted} />
          </Pressable>
        </View>
      )}

      {/* Series REUSADAS (ActiveSetRow / SetRow) — CTA de completar + RPE/RIR viven aquí. */}
      <View style={{ gap: 6 }}>{setRows}</View>

      {/* Sheet de nota del coach (nuevo, simple). */}
      {coachNote && (
        <Sheet open={noteOpen} onClose={() => setNoteOpen(false)} title="Nota del coach" nativeModal snapPoints={['35%']}>
          <View style={{ paddingVertical: 8 }}>
            <Text style={textStyle('md', FONT.ui, { lh: 'relaxed' })} className="text-body">
              {coachNote}
            </Text>
          </View>
        </Sheet>
      )}

      {/* Rueda dual kg | reps (E2.5) — produce (peso, reps) y los entrega por el autofill de la serie
          activa. El guardado sigue siendo el CTA normal de la fila (motor intocable). */}
      <DualWheelPicker
        open={wheelOpen}
        onClose={() => setWheelOpen(false)}
        setNumber={firstUnlogged ?? 1}
        kgAnchor={wheelAnchors.kg}
        repsAnchor={wheelAnchors.reps}
        exec={exec}
        reducedMotion={reducedMotion}
        onDone={handleWheelDone}
      />
    </MotiView>
  )
}

/**
 * Chip "glass" sobre la media (Instrucciones / Nota del coach). Entra extendido (icono + label) y colapsa
 * a solo-icono: el label se monta/desmonta con AnimatePresence (fade + slide) y el pill re-fluye a su
 * ancho de icono. reduced-motion ⇒ el label queda montado siempre (sin colapso). `badgeColor` pinta el
 * puntito de aviso (nota presente).
 */
function GlassChip({
  icon,
  label,
  expanded,
  reducedMotion,
  badgeColor,
  onPress,
  testID,
  accessibilityLabel,
}: {
  icon: ReactNode
  label: string
  expanded: boolean
  reducedMotion: boolean
  badgeColor?: string
  onPress: () => void
  testID?: string
  accessibilityLabel?: string
}) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        minHeight: 30,
        paddingHorizontal: 11,
        borderRadius: 999,
        borderWidth: 1.5,
        borderColor: 'rgba(255,255,255,0.16)',
        backgroundColor: 'rgba(8,8,12,0.6)',
      }}
    >
      {icon}
      <AnimatePresence>
        {expanded && (
          <MotiView
            key="label"
            from={{ opacity: reducedMotion ? 1 : 0, translateX: reducedMotion ? 0 : -6 }}
            animate={{ opacity: 1, translateX: 0 }}
            exit={{ opacity: 0, translateX: -6 }}
            transition={{ type: 'timing', duration: reducedMotion ? 0 : 260 }}
          >
            <Text style={{ fontFamily: FONT.uiExtra, fontSize: 11, color: '#eaeaf0' }} numberOfLines={1}>
              {label}
            </Text>
          </MotiView>
        )}
      </AnimatePresence>
      {badgeColor && (
        <View style={{ position: 'absolute', top: -3, right: -3, width: 10, height: 10, borderRadius: 5, backgroundColor: badgeColor, borderWidth: 2, borderColor: '#16161d' }} />
      )}
    </Pressable>
  )
}

/**
 * Medio inline del ejercicio activo — MISMA prioridad estricta que TechniqueSheet/web (regla de media
 * del CTX):
 *   1. gif_url → imagen `contain`.
 *   2. video_url no-YouTube (mp4/webm/mov/Storage) → VideoPlayer autoplay-mute-loop (modo GIF).
 *   3. video_url YouTube → NO inline: placeholder con silueta + Play que abre el modal de técnica.
 *   4. video_url imagen-ish → imagen.
 *   5. sin medio → placeholder silueta.
 * Cuota: sólo el ejercicio ACTIVO monta media animada (el stepper V3 pinta un paso a la vez).
 */
function ExerciseMediaV3({
  exercise,
  exec,
  onOpenTechnique,
}: {
  exercise: SessionExercise
  exec: ExecTheme
  onOpenTechnique: () => void
}) {
  const s = exec.surface
  const videoUrl = exercise.video_url
  const isYouTube = !!videoUrl && (videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be'))
  const ytId = videoUrl ? extractYoutubeVideoId(videoUrl) : null

  // 1) gif
  if (exercise.gif_url) {
    return <Image source={{ uri: exercise.gif_url }} alt={exercise.name} style={{ flex: 1, width: '100%' }} contentFit="contain" />
  }

  // 2) video no-YouTube → autoplay mute loop (modo GIF)
  if (videoUrl && !isYouTube) {
    const u = videoUrl.toLowerCase()
    const isMp4 =
      u.includes('.mp4') || u.includes('.mov') || u.includes('.webm') ||
      (u.includes('supabase.co/storage') && !u.includes('.gif') && !u.includes('.jpg') && !u.includes('.png'))
    if (isMp4) {
      return <VideoPlayer url={videoUrl} autoPlay frameless letterbox={s.surfaceRaised} style={{ flex: 1 }} title={exercise.name} />
    }
    // 4) imagen-ish
    return <Image source={{ uri: videoUrl }} alt={exercise.name} style={{ flex: 1, width: '100%' }} contentFit="contain" />
  }

  // 3) YouTube → placeholder silueta + Play (abre el modal de técnica), NO inline.
  // 5) sin medio → misma silueta neutra.
  return (
    <Pressable
      onPress={isYouTube && ytId ? onOpenTechnique : undefined}
      disabled={!(isYouTube && ytId)}
      style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 }}
      accessibilityRole={isYouTube && ytId ? 'button' : undefined}
      accessibilityLabel={isYouTube && ytId ? `Ver técnica de ${exercise.name}` : undefined}
    >
      <Dumbbell size={40} color={hexToRgba(exec.accent, 0.4)} strokeWidth={1.6} />
      {isYouTube && ytId && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: 'rgba(8,8,12,0.6)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.16)' }}>
          <Play size={12} color="#eaeaf0" fill="#eaeaf0" />
          <Text style={{ fontFamily: FONT.uiExtra, fontSize: 11, color: '#eaeaf0' }}>Ver técnica</Text>
        </View>
      )}
    </Pressable>
  )
}
