import { useState } from 'react'
import { View } from 'react-native'
import { Image } from 'expo-image'
import { AlignLeft, MessageSquare } from 'lucide-react-native'
import { hexToRgba } from '../../../../lib/theme'
import { extractYoutubeVideoId } from '../../../../lib/youtube'
import type { SessionExercise } from '../../../../lib/workout-session'
import { VideoPlayer } from '../../../VideoPlayer'
import { AudioGlassButton, GlassChip, useChipCollapse } from './ExecMediaV3'
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
  const chipsExpanded = useChipCollapse(exercise.id, reducedMotion)
  // El chip "Instrucciones" abre la técnica: se muestra siempre que haya ALGO (media de cualquier tipo o
  // instrucciones), no sólo videos reales (decisión CEO).
  const hasTechnique = !!(exercise.gif_url || exercise.video_url) || (exercise.instructions?.length ?? 0) > 0

  // ── Media por precedencia (misma que TechniqueSheet). `isDirectVideo` habilita el botón de audio. ──
  let mediaEl: React.ReactNode
  let isDirectVideo = false
  if (exercise.gif_url) {
    mediaEl = <Image source={{ uri: exercise.gif_url }} alt={exercise.name} style={{ flex: 1, width: '100%' }} contentFit="contain" />
  } else if (videoUrl && !isYouTube) {
    const u = videoUrl.toLowerCase()
    const isMp4 =
      u.includes('.mp4') || u.includes('.mov') || u.includes('.webm') ||
      (u.includes('supabase.co/storage') && !u.includes('.gif') && !u.includes('.jpg') && !u.includes('.png'))
    if (isMp4) {
      isDirectVideo = true
      mediaEl = <VideoPlayer url={videoUrl} autoPlay muted={muted} frameless letterbox={s.surfaceRaised} style={{ flex: 1 }} title={exercise.name} />
    } else {
      mediaEl = <Image source={{ uri: videoUrl }} alt={exercise.name} style={{ flex: 1, width: '100%' }} contentFit="contain" />
    }
  } else if (isYouTube && ytId && videoUrl) {
    // YouTube AUTOREPRODUCIDO inline MUTED (QA4): reusa el VideoPlayer de la técnica. Sin botón de audio
    // (alternar el mute recargaría el WebView); el chip "Instrucciones" abre la técnica completa.
    mediaEl = (
      <VideoPlayer
        url={videoUrl}
        start={exercise.video_start_time}
        end={exercise.video_end_time}
        autoPlay
        muted
        frameless
        letterbox={s.surfaceRaised}
        style={{ flex: 1 }}
        title={exercise.name}
      />
    )
  } else {
    mediaEl = (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <IconFallback size={36} color={hexToRgba(accent, 0.4)} strokeWidth={1.6} />
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

      {isDirectVideo && <AudioGlassButton muted={muted} onToggle={() => setMuted((m) => !m)} />}
    </View>
  )
}
