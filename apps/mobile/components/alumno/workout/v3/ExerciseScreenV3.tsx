import { useMemo, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { MotiView } from 'moti'
import { LinearTransition } from 'react-native-reanimated'
import { ArrowRightLeft, ArrowUp, Hand, Keyboard, Pencil, TrendingUp, Undo2, X } from 'lucide-react-native'
import {
  formatWeightEsCl,
  type OptimisticLogPayload,
  type ReconciledSessionLog,
} from '@eva/workout-engine'
import { FONT } from '../../../../lib/typography'
import { hexToRgba } from '../../../../lib/theme'
import { haptics } from '../../../../lib/haptics'
import { EXERCISE_TYPE_META, exerciseTypeColor } from '../../../../lib/exercise-type-meta'
import type { EffectiveTarget } from '../../../../lib/workout/progression'
import type { PrevSet, SessionBlock, SessionDraft, SessionExercise } from '../../../../lib/workout-session'
import { Sheet } from '../../../Sheet'
import { SetRow, ActiveSetRow } from '../SetRow'
import { bestPrevOf, overloadChipLabel } from '../workout-ui'
import { DualWheelPicker } from './DualWheelPicker'
import { dismissWheelHint, useWheelHintDismissed } from './wheel-hint'
import { ExecMediaV3 } from './ExecMediaV3'
import type { ExecTheme } from './exec-theme'

// Reflow del layout (paridad SingleExerciseCard CARD_LAYOUT): anima el cambio de tamaño al
// completar series. Sólo sin reduced-motion.
const CARD_LAYOUT = LinearTransition.springify().damping(25).stiffness(200)

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
  showEffort = true,
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
  /** Mostrar las pills/escala de esfuerzo RPE/RIR (E3.7 — la tuerca). Default true. */
  showEffort?: boolean
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

  // PR en vivo (E4.2): cuando la serie recién cerrada de ESTE bloque fue récord, la fila "Anterior" tacha
  // la marca previa y muestra una flecha arriba dorada con el peso que la superó (mockup "PR en vivo").
  const prRecent = recentSet?.blockId === block.id && !!recentSet?.pr
  const prNewWeightKg = prRecent
    ? blockLogs.find((l) => l.set_number === recentSet?.setNumber)?.weight_kg ?? null
    : null

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

  const coachNote = block.notes?.trim() ? block.notes.trim() : null

  // Reps objetivo (prescripción) → placeholder tenue del tile REPS del hero cuando aún no se capturó.
  const repsHint = useMemo(() => {
    const n = parseInt(String(block.reps), 10)
    return Number.isFinite(n) ? String(n) : null
  }, [block.reps])

  // Pie del hero (mockup `.a3a-foot`): botón teclado (nonce → abre el teclado en el tile activo) y botón
  // lápiz (abre el sheet oscuro con las filas clásicas del motor para corregir series ya guardadas).
  const [kbNonce, setKbNonce] = useState(0)
  const [editPrevOpen, setEditPrevOpen] = useState(false)
  const doneCount = loggedSetNumbers.size

  // HERO de la serie activa (primera sin registrar). Reusa `ActiveSetRow` con `heroMode` — su lógica de
  // guardado/draft/cola/keypad es intocable; sólo cambia la piel a los tiles + esfuerzo + CTA del mockup.
  const activeHero = firstUnlogged != null ? (() => {
    const setNumber = firstUnlogged
    const seed =
      restoredDraft && restoredDraft.blockId === block.id && restoredDraft.setNumber === setNumber
        ? restoredDraft.values
        : null
    return (
      <ActiveSetRow
        key={`hero-${setNumber}`}
        blockId={block.id}
        setNumber={setNumber}
        typedMode={null}
        isActive
        heroMode
        exec={exec}
        repsHint={repsHint}
        openKeypadNonce={kbNonce}
        suggestedWeight={suggestedWeightKg ?? null}
        seedValues={seed}
        autofill={autofill}
        header={{
          exerciseName: exercise.name,
          objectiveLine: `${block.sets}×${block.reps}${suggestedWeightKg != null ? ` · ${formatWeightEsCl(suggestedWeightKg)} kg` : ''}`,
          last: bestPrev ? { weightKg: bestPrev.weight_kg ?? null, reps: bestPrev.reps_done ?? null } : null,
        }}
        onDraftChange={(values, fieldIndex) => onDraftChange(block.id, setNumber, values, fieldIndex)}
        onCommit={onCommitSet}
        onLongPressValue={openWheel}
        allowZeroRir
        showEffort={showEffort}
      />
    )
  })() : null

  // Filas LOGUEADAS (motor clásico) — sólo dentro del sheet "editar series anteriores" (botón lápiz).
  const loggedRows = Array.from({ length: block.sets }).map((_, i) => {
    const setNumber = i + 1
    const log = blockLogs.find((l) => l.set_number === setNumber)
    if (!log) return null
    const isRecent = recentSet?.blockId === block.id && recentSet?.setNumber === setNumber
    return (
      <SetRow
        key={setNumber}
        setNumber={setNumber}
        log={log}
        isActive={false}
        typedMode={null}
        onPress={() => onOpenSet(setNumber)}
        onRpeUpdate={onRpeUpdate}
        settle={isRecent}
        pr={isRecent && !!recentSet?.pr}
        prColor={exec.pr}
        prIntense
        syncError={syncErrors?.[`${block.id}:${setNumber}`] ?? null}
        onRetry={() => onRetrySet?.(block.id, setNumber)}
        showEffort={showEffort}
      />
    )
  }).filter(Boolean)

  // Peso de la prescripción (resaltado en blanco/bold, mockup `<b>60 kg</b>`). El resto de la línea va en
  // gris. Se muestra sólo si el bloque prescribe peso.
  const rxWeight = block.target_weight_kg != null ? (suggestedWeightKg ?? block.target_weight_kg) : null

  return (
    <MotiView layout={reducedMotion ? undefined : CARD_LAYOUT} style={{ gap: 12 }}>
      {/* Nombre + chip tipo·músculo (+ sustitución) */}
      <View style={{ gap: 8 }}>
        <Text style={{ fontFamily: FONT.displayBlack, fontSize: 26, letterSpacing: -0.5, lineHeight: 28, color: s.text }}>
          {exercise.name}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, borderWidth: 1.5, paddingHorizontal: 11, paddingVertical: 5, backgroundColor: hexToRgba(typeColor, 0.16), borderColor: hexToRgba(typeColor, 0.34) }}>
            {/* Sin ícono: el mockup y la web pintan el chip tipo·músculo sólo con texto (QA1 §03). */}
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

      {/* MEDIA + chips glass — componente compartido con la superserie (extracción pura, sin motor). */}
      <ExecMediaV3
        exercise={exercise}
        coachNote={coachNote}
        exec={exec}
        reducedMotion={reducedMotion}
        onOpenTechnique={onOpenTechnique}
      />

      {/* Prescripción compacta + chip de sobrecarga */}
      <View style={{ gap: 8 }}>
        <Text style={{ fontFamily: FONT.monoSemibold, fontSize: 13, letterSpacing: 0.1, color: hexToRgba(s.text, 0.82), textAlign: 'center', fontVariant: ['tabular-nums'] }}>
          {block.sets} × {block.reps}
          {rxWeight != null && (
            <>
              {' · '}
              <Text style={{ fontFamily: FONT.monoBold, color: s.text }}>{rxWeight} kg</Text>
            </>
          )}
          {block.rir ? ` · RIR ${block.rir}` : ''}
          {block.tempo ? ` · tempo ${block.tempo}` : ''}
          {block.rest_time ? ` · desc ${block.rest_time}` : ''}
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
          {/* Mockup `.a3a-prev .l`: sólo el rótulo "Anterior" (sin ícono extra). */}
          <Text style={{ fontFamily: FONT.uiSemibold, fontSize: 12, color: prRecent ? exec.pr : s.textMuted }}>Anterior</Text>
          {/* Marca previa: tachada cuando la serie recién cerrada la superó (PR en vivo). */}
          <Text
            style={{
              fontFamily: FONT.monoBold,
              fontSize: 14,
              color: prRecent ? s.textMuted : s.text,
              fontVariant: ['tabular-nums'],
              textDecorationLine: prRecent ? 'line-through' : 'none',
            }}
          >
            {bestPrev.weight_kg ? `${bestPrev.weight_kg} kg` : '-'} × {bestPrev.reps_done || '-'}
          </Text>
          {prRecent ? (
            // Flecha arriba dorada + peso que superó la marca (mockup "PR en vivo").
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <ArrowUp size={14} color={exec.pr} strokeWidth={3} />
              {prNewWeightKg != null && (
                <Text style={{ fontFamily: FONT.monoBold, fontSize: 14, color: exec.pr, fontVariant: ['tabular-nums'] }}>
                  {prNewWeightKg} kg
                </Text>
              )}
            </View>
          ) : firstUnlogged != null ? (
            <Text style={{ fontFamily: FONT.uiExtra, fontSize: 11, color: exec.accent }}>1 tap ↻</Text>
          ) : null}
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

      {/* HERO de la serie activa (tiles + esfuerzo + CTA "Aplastar serie"). Una serie a la vez (mockup). */}
      {activeHero}

      {/* Pie (mockup `.a3a-foot`): cuadraditos de progreso + "N de M series" · herramientas teclado/lápiz. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {Array.from({ length: block.sets }).map((_, i) => {
            const on = loggedSetNumbers.has(i + 1)
            return (
              <View
                key={i}
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 8,
                  borderWidth: 2,
                  backgroundColor: on ? exec.accent : '#26262f',
                  borderColor: on ? hexToRgba(exec.accent, 0.55) : '#34343f',
                }}
              />
            )
          })}
          <Text style={{ fontFamily: FONT.uiExtra, fontSize: 12, color: s.textMuted, marginLeft: 4, fontVariant: ['tabular-nums'] }}>
            {doneCount} de {block.sets} series
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable
            testID="btn-foot-keyboard-v3"
            onPress={() => { if (firstUnlogged != null) { haptics.tap(); setKbNonce((n) => n + 1) } }}
            disabled={firstUnlogged == null}
            style={{ width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: s.surfaceRaised, borderWidth: 2, borderColor: s.borderStrong, opacity: firstUnlogged == null ? 0.5 : 1 }}
            accessibilityRole="button"
            accessibilityLabel="Abrir el teclado para la serie activa"
          >
            <Keyboard size={18} color="#b7b7c2" />
          </Pressable>
          <Pressable
            testID="btn-foot-edit-previous-v3"
            onPress={() => { if (doneCount > 0) { haptics.tap(); setEditPrevOpen(true) } }}
            disabled={doneCount === 0}
            style={{ width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: s.surfaceRaised, borderWidth: 2, borderColor: s.borderStrong, opacity: doneCount === 0 ? 0.5 : 1 }}
            accessibilityRole="button"
            accessibilityLabel="Editar las series ya registradas"
          >
            <Pencil size={16} color="#b7b7c2" />
          </Pressable>
        </View>
      </View>

      {/* Sheet oscuro "Editar series anteriores" (botón lápiz): monta las filas CLÁSICAS del motor (SetRow)
          para corregir series ya guardadas — motor de edición existente, sólo envuelto en el sheet V3. */}
      <Sheet open={editPrevOpen} onClose={() => setEditPrevOpen(false)} title="Editar series anteriores" nativeModal forceDark snapPoints={['60%']}>
        <View style={{ gap: 6, paddingVertical: 4 }}>
          {loggedRows.length > 0 ? (
            loggedRows
          ) : (
            <Text style={{ fontFamily: FONT.ui, fontSize: 13, color: s.textMuted, textAlign: 'center', paddingVertical: 12 }}>
              Todavía no registras ninguna serie de este ejercicio.
            </Text>
          )}
        </View>
      </Sheet>

      {/* Rueda dual kg | reps (E2.5) — produce (peso, reps) y los entrega por el autofill de la serie
          activa. El guardado sigue siendo el CTA normal de la fila (motor intocable). */}
      <DualWheelPicker
        open={wheelOpen}
        onClose={() => setWheelOpen(false)}
        setNumber={firstUnlogged ?? 1}
        exerciseName={exercise.name}
        totalSets={block.sets}
        kgAnchor={wheelAnchors.kg}
        repsAnchor={wheelAnchors.reps}
        exec={exec}
        reducedMotion={reducedMotion}
        onDone={handleWheelDone}
      />
    </MotiView>
  )
}
