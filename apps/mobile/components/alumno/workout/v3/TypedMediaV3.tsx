import { Pressable, Text, View } from 'react-native'
import { Image } from 'expo-image'
import { Play } from 'lucide-react-native'
import { hexToRgba } from '../../../../lib/theme'
import { FONT } from '../../../../lib/typography'
import { extractYoutubeVideoId } from '../../../../lib/youtube'
import type { SessionExercise } from '../../../../lib/workout-session'
import { VideoPlayer } from '../../../VideoPlayer'
import type { ExecTheme } from './exec-theme'

/**
 * Media inline de las pantallas tipadas V3 (movilidad/roller/cardio) — MISMA prioridad estricta que
 * `ExerciseScreenV3`/`TechniqueSheet` (regla de media del CTX): gif → imagen; mp4/webm/Storage → video
 * autoplay-mute-loop; YouTube → placeholder + Play que abre el modal de técnica; sin medio → silueta.
 *
 * `IconFallback` es el ícono de la silueta neutra por tipo (Move/GitCommit/HeartPulse). `accent` tiñe
 * la silueta y el badge Play. `height` deja al consumidor elegir el alto (mobility/roller grande, cardio
 * mini). El contenido de estado ("Mantén"/"En loop") lo pinta el consumidor por fuera.
 */
export function TypedMediaV3({
  exercise,
  exec,
  accent,
  IconFallback,
  onOpenTechnique,
}: {
  exercise: SessionExercise
  exec: ExecTheme
  accent: string
  IconFallback: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>
  onOpenTechnique: () => void
}) {
  const s = exec.surface
  const videoUrl = exercise.video_url
  const isYouTube = !!videoUrl && (videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be'))
  const ytId = videoUrl ? extractYoutubeVideoId(videoUrl) : null

  if (exercise.gif_url) {
    return <Image source={{ uri: exercise.gif_url }} alt={exercise.name} style={{ flex: 1, width: '100%' }} contentFit="contain" />
  }

  if (videoUrl && !isYouTube) {
    const u = videoUrl.toLowerCase()
    const isMp4 =
      u.includes('.mp4') || u.includes('.mov') || u.includes('.webm') ||
      (u.includes('supabase.co/storage') && !u.includes('.gif') && !u.includes('.jpg') && !u.includes('.png'))
    if (isMp4) {
      return <VideoPlayer url={videoUrl} autoPlay frameless letterbox={s.surfaceRaised} style={{ flex: 1 }} title={exercise.name} />
    }
    return <Image source={{ uri: videoUrl }} alt={exercise.name} style={{ flex: 1, width: '100%' }} contentFit="contain" />
  }

  return (
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
