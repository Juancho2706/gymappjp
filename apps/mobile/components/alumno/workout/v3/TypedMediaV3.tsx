import { useState } from 'react'
import { View } from 'react-native'
import { Image } from 'expo-image'
import { AlignLeft, MessageSquare } from 'lucide-react-native'
import { hexToRgba } from '../../../../lib/theme'
import { extractYoutubeVideoId } from '../../../../lib/youtube'
import type { SessionExercise } from '../../../../lib/workout-session'
import { VideoPlayer } from '../../../VideoPlayer'
import { GlassChip, MediaControlsRow, execMediaKind, hasExecMedia, useChipCollapse } from './ExecMediaV3'
import type { ExecTheme } from './exec-theme'

/**
 * Media inline de las pantallas tipadas V3 (movilidad/roller/cardio) — MISMO tratamiento que fuerza
 * (`ExecMediaV3`): media por la MISMA prioridad estricta que `TechniqueSheet` (regla de media del CTX):
 * gif → imagen; mp4/webm/Storage → video autoplay-mute-loop (+ botón de audio glass); YouTube → AUTOREPRODUCIDO
 * inline MUTED (reusa el `VideoPlayer` de la técnica); sin medio → silueta. Encima, los DOS chips glass en el
 * overlay superior-IZQUIERDO (QA4 · decisión CEO): "Instrucciones" (siempre que haya algo que mostrar) +
 * "Nota del coach" (condicional, con badge de aviso), que entran extendidos y colapsan a icono ~1,5s
 * (one-shot por ejercicio) — abren la técnica y la nota respectivamente.
 *
 * `IconFallback` es el ícono de la silueta neutra por tipo (Move/GitCommit/HeartPulse). `accent` tiñe la
 * silueta y el badge de la nota.
 */
export function TypedMediaV3({
  exercise,
  exec,
  accent,
  coachNote,
  IconFallback,
  onOpenTechnique,
  onOpenNote,
  reducedMotion = false,
}: {
  exercise: SessionExercise
  exec: ExecTheme
  accent: string
  /** Nota del coach del BLOQUE (ya recortada), o null → sin chip de nota. */
  coachNote: string | null
  IconFallback: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>
  onOpenTechnique: () => void
  /** Abre el sheet de la nota del coach (lo posee la pantalla tipada). */
  onOpenNote: () => void
  reducedMotion?: boolean
}) {
  const s = exec.surface
  const videoUrl = exercise.video_url
  const isYouTube = !!videoUrl && (videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be'))
  const ytId = videoUrl ? extractYoutubeVideoId(videoUrl) : null
  const [muted, setMuted] = useState(true)
  // Pausa/reanudar + reinicio (controles glass QA5).
  const [paused, setPaused] = useState(false)
  const [restartNonce, setRestartNonce] = useState(0)
  const chipsExpanded = useChipCollapse(exercise.id, reducedMotion)
  // El chip "Instrucciones" abre la técnica: se muestra siempre que haya ALGO (media de cualquier tipo o
  // instrucciones), no sólo videos reales (decisión CEO).
  const hasTechnique = !!(exercise.gif_url || exercise.video_url) || (exercise.instructions?.length ?? 0) > 0

  // ── Media por precedencia (misma que TechniqueSheet). `isDirectVideo` habilita el botón de audio;
  //    `isYouTubeInline` habilita pausa/reinicio (sin audio) en youtube. ──
  const kind = execMediaKind(exercise)
  let mediaEl: React.ReactNode
  const isDirectVideo = kind === 'video'
  const isYouTubeInline = kind === 'youtube'
  const hasControls = isDirectVideo || isYouTubeInline
  if (exercise.gif_url) {
    mediaEl = <Image source={{ uri: exercise.gif_url }} alt={exercise.name} style={{ flex: 1, width: '100%' }} contentFit="contain" />
  } else if (isDirectVideo && videoUrl) {
    mediaEl = <VideoPlayer url={videoUrl} autoPlay muted={muted} paused={paused} restartSignal={restartNonce} frameless letterbox={s.surfaceRaised} style={{ flex: 1 }} title={exercise.name} />
  } else if (videoUrl && !isYouTube) {
    mediaEl = <Image source={{ uri: videoUrl }} alt={exercise.name} style={{ flex: 1, width: '100%' }} contentFit="contain" />
  } else if (isYouTubeInline && videoUrl) {
    // YouTube AUTOREPRODUCIDO inline MUTED (QA4): reusa el VideoPlayer de la técnica. QA5: pausa/reinicio
    // vía la IFrame API (injectJavaScript, sin recargar); audio diferido (recargaría el WebView).
    mediaEl = (
      <VideoPlayer
        url={videoUrl}
        start={exercise.video_start_time}
        end={exercise.video_end_time}
        autoPlay
        muted
        paused={paused}
        restartSignal={restartNonce}
        frameless
        letterbox={s.surfaceRaised}
        style={{ flex: 1 }}
        title={exercise.name}
      />
    )
  } else {
    // kind 'none' (sin gif/video): NO silueta grande. Chip suelto "Instrucciones" (+ nota) centrado —
    // interino cuando la pantalla aún renderiza la card 150px. El fix pleno (sin card) lo hace la pantalla
    // gateando el wrapper con `hasExecMedia` y montando `<TypedInstructionsChip>` junto al nombre (QA5).
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 12 }}>
        <TypedInstructionsChip
          exercise={exercise}
          accent={accent}
          coachNote={coachNote}
          onOpenTechnique={onOpenTechnique}
          onOpenNote={onOpenNote}
          reducedMotion={reducedMotion}
        />
      </View>
    )
  }

  return (
    <View style={{ flex: 1 }}>
      {mediaEl}

      {/* Chips glass en el overlay superior-IZQUIERDO — mismo lenguaje que fuerza (Instrucciones + Nota). */}
      <View style={{ position: 'absolute', top: 10, left: 10, right: 10, flexDirection: 'row', gap: 7 }}>
        {hasTechnique && (
          <GlassChip
            testID="chip-instructions-typed-v3"
            icon={<AlignLeft size={14} color="#cfcfd8" />}
            label="Instrucciones"
            expanded={chipsExpanded}
            reducedMotion={reducedMotion}
            onPress={onOpenTechnique}
            accessibilityLabel={`Ver instrucciones de ${exercise.name}`}
          />
        )}
        {coachNote && (
          <GlassChip
            testID="chip-coach-note-typed-v3"
            icon={<MessageSquare size={14} color="#cfcfd8" />}
            label="Nota del coach"
            expanded={chipsExpanded}
            reducedMotion={reducedMotion}
            badgeColor={accent}
            onPress={onOpenNote}
            accessibilityLabel="Ver la nota del coach"
          />
        )}
      </View>

      {/* Fila de controles glass de video (QA5): audio (sólo video directo) + pausa/reanudar + reiniciar. */}
      {hasControls && (
        <MediaControlsRow
          hasAudio={isDirectVideo}
          muted={muted}
          onToggleMuted={() => setMuted((m) => !m)}
          paused={paused}
          onTogglePause={() => setPaused((p) => !p)}
          onRestart={() => {
            setPaused(false)
            setRestartNonce((n) => n + 1)
          }}
        />
      )}
    </View>
  )
}

/**
 * Ejecutor V3 (QA5) — chip glass suelto "Instrucciones" (+ "Nota del coach" si hay) para las pantallas
 * TIPADAS sin media (kind 'none': elíptica, cinta, movilidad/roller sin gif/video). Reemplaza la card
 * grande vacía con una silueta: va JUNTO al nombre/identidad del ejercicio (lo monta la pantalla cuando
 * `hasExecMedia(exercise) === false`). Mismo lenguaje glass que los chips de la media. Si no hay ni técnica
 * ni nota, no renderiza nada.
 */
export function TypedInstructionsChip({
  exercise,
  accent,
  coachNote,
  onOpenTechnique,
  onOpenNote,
  reducedMotion = false,
}: {
  exercise: SessionExercise
  accent: string
  coachNote: string | null
  onOpenTechnique: () => void
  onOpenNote: () => void
  reducedMotion?: boolean
}) {
  const hasTechnique = !!(exercise.gif_url || exercise.video_url) || (exercise.instructions?.length ?? 0) > 0
  if (!hasTechnique && !coachNote) return null
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
      {hasTechnique && (
        <GlassChip
          testID="chip-instructions-typed-loose-v3"
          icon={<AlignLeft size={14} color="#cfcfd8" />}
          label="Instrucciones"
          expanded
          reducedMotion={reducedMotion}
          onPress={onOpenTechnique}
          accessibilityLabel={`Ver instrucciones de ${exercise.name}`}
        />
      )}
      {coachNote && (
        <GlassChip
          testID="chip-coach-note-typed-loose-v3"
          icon={<MessageSquare size={14} color="#cfcfd8" />}
          label="Nota del coach"
          expanded
          reducedMotion={reducedMotion}
          badgeColor={accent}
          onPress={onOpenNote}
          accessibilityLabel="Ver la nota del coach"
        />
      )}
    </View>
  )
}

// Reexport para las pantallas tipadas (gate del wrapper de media): `hasExecMedia(exercise)`.
export { hasExecMedia }
