import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { Image } from 'expo-image'
import { AlignLeft, Play } from 'lucide-react-native'
import { hexToRgba } from '../../../../lib/theme'
import { FONT } from '../../../../lib/typography'
import { extractYoutubeVideoId } from '../../../../lib/youtube'
import type { SessionExercise } from '../../../../lib/workout-session'
import { VideoPlayer } from '../../../VideoPlayer'
import { AudioGlassButton, GlassChip, useChipCollapse } from './ExecMediaV3'
import type { ExecTheme } from './exec-theme'

/**
 * Media inline de las pantallas tipadas V3 (movilidad/roller/cardio) — MISMO tratamiento que fuerza
 * (`ExecMediaV3`): media por la MISMA prioridad estricta que `TechniqueSheet` (regla de media del CTX):
 * gif → imagen; mp4/webm/Storage → video autoplay-mute-loop (+ botón de audio glass); YouTube → placeholder
 * + Play que abre el modal de técnica; sin medio → silueta. Encima, el chip glass "Instrucciones" SIEMPRE
 * presente (entra extendido y colapsa a icono ~1,5s, one-shot por ejercicio) que abre la técnica.
 *
 * `IconFallback` es el ícono de la silueta neutra por tipo (Move/GitCommit/HeartPulse). `accent` tiñe la
 * silueta y el badge Play. El contenido de estado ("Mantén"/"En loop") lo pinta el consumidor por fuera.
 */
export function TypedMediaV3({
  exercise,
  exec,
  accent,
  IconFallback,
  onOpenTechnique,
  reducedMotion = false,
}: {
  exercise: SessionExercise
  exec: ExecTheme
  accent: string
  IconFallback: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>
  onOpenTechnique: () => void
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
  } else {
    mediaEl = (
      <Pressable
        onPress={isYouTube && ytId ? onOpenTechnique : undefined}
        disabled={!(isYouTube && ytId)}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 }}
        accessibilityRole={isYouTube && ytId ? 'button' : undefined}
        accessibilityLabel={isYouTube && ytId ? `Ver técnica de ${exercise.name}` : undefined}
      >
        <IconFallback size={36} color={hexToRgba(accent, 0.4)} strokeWidth={1.6} />
        {isYouTube && ytId && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: 'rgba(8,8,12,0.6)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.16)' }}>
            <Play size={12} color="#eaeaf0" fill="#eaeaf0" />
            <Text style={{ fontFamily: FONT.uiExtra, fontSize: 11, color: '#eaeaf0' }}>Ver técnica</Text>
          </View>
        )}
      </Pressable>
    )
  }

  return (
    <View style={{ flex: 1 }}>
      {mediaEl}

      {/* Chip "Instrucciones" (siempre) — arriba a la derecha (la etiqueta live "Mantén"/"En loop" va a la izquierda). */}
      {hasTechnique && (
        <View style={{ position: 'absolute', top: 10, right: 10, flexDirection: 'row', gap: 7 }}>
          <GlassChip
            testID="chip-instructions-typed-v3"
            icon={<AlignLeft size={14} color="#cfcfd8" />}
            label="Instrucciones"
            expanded={chipsExpanded}
            reducedMotion={reducedMotion}
            onPress={onOpenTechnique}
            accessibilityLabel={`Ver instrucciones de ${exercise.name}`}
          />
        </View>
      )}

      {isDirectVideo && <AudioGlassButton muted={muted} onToggle={() => setMuted((m) => !m)} />}
    </View>
  )
}
