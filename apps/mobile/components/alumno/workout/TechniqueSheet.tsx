import { Text, TouchableOpacity, View } from 'react-native'
import { Image } from 'expo-image'
import { Sheet } from '../../Sheet'
import { VideoPlayer } from '../../VideoPlayer'
import { FONT, textStyle } from '../../../lib/typography'
import { extractYoutubeVideoId } from '../../../lib/youtube'
import type { SessionExercise } from '../../../lib/workout-session'

/**
 * Modal de técnica (mobile). Video INLINE via `VideoPlayer` (YouTube/mp4) o gif/imagen, +
 * instrucciones numeradas + botón "Entendido". Espeja el modal de técnica de web
 * (`WorkoutExecutionClient.tsx:2001-2113`) sin salir de la app (reemplaza el `Linking.openURL`
 * del legacy). Adaptación idiomática: Dialog centrado → BottomSheet (título + X + swipe/backdrop
 * vienen del `Sheet`, cubriendo las 3 vías de cierre de la web + la propia "Entendido").
 *
 * Bloque de medio — MISMA prioridad estricta que la web (`WorkoutExecutionClient.tsx:2007-2074`):
 *   1. YouTube (video_url youtube + id válido) → VideoPlayer (autoplay/mute/loop = GIF; recorta [start,end]).
 *   2. gif_url → imagen contain.
 *   3. video_url no-YouTube → mp4/mov/webm/Storage → VideoPlayer directo (loop completo, sin recorte,
 *      igual que el `<video loop>` de la web); cualquier otro → imagen.
 *   4. sin medio → nada.
 */

/** Marco 16:9 para gif/imagen — mismo chrome DS que el frame de `VideoPlayer` (surface-sunken/subtle). */
function MediaImage({ uri }: { uri: string }) {
  return (
    <View
      className="bg-surface-sunken border border-subtle rounded-2xl overflow-hidden"
      style={{ width: '100%', aspectRatio: 16 / 9 }}
    >
      <Image source={{ uri }} style={{ flex: 1 }} contentFit="contain" />
    </View>
  )
}

/** Decide el medio a renderizar espejando el orden de prioridad de la web (§3). */
function TechniqueMedia({ exercise }: { exercise: SessionExercise }) {
  const videoUrl = exercise.video_url
  // Detección idéntica a la web (WorkoutExecutionClient.tsx:2010-2012): substring + extractor robusto.
  const isYouTube = !!videoUrl && (videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be'))
  const ytId = videoUrl ? extractYoutubeVideoId(videoUrl) : null

  // 1) YouTube — recorta el tramo [start,end] del coach.
  if (isYouTube && ytId && videoUrl) {
    return (
      <VideoPlayer
        url={videoUrl}
        start={exercise.video_start_time}
        end={exercise.video_end_time}
        autoPlay
        title={exercise.name}
      />
    )
  }

  // 2) gif.
  if (exercise.gif_url) {
    return <MediaImage uri={exercise.gif_url} />
  }

  // 3) video_url no-YouTube: mp4/mov/webm/Storage → video directo; resto → imagen.
  if (videoUrl) {
    const u = videoUrl.toLowerCase()
    const isMp4 =
      u.includes('.mp4') ||
      u.includes('.mov') ||
      u.includes('.webm') ||
      (u.includes('supabase.co/storage') && !u.includes('.gif') && !u.includes('.jpg') && !u.includes('.png'))
    // La web reproduce el mp4 con `<video loop>` SIN recorte → no pasamos start/end (loop completo).
    if (isMp4) {
      return <VideoPlayer url={videoUrl} autoPlay title={exercise.name} />
    }
    return <MediaImage uri={videoUrl} />
  }

  // 4) sin medio.
  return null
}

export function TechniqueSheet({
  exercise,
  onClose,
}: {
  exercise: SessionExercise | null
  onClose: () => void
}) {
  const open = !!exercise
  const steps = exercise?.instructions ?? null

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={exercise?.name ?? 'Técnica'}
      // Título a 21px = web `DialogTitle text-xl` (WorkoutExecutionClient.tsx:2079 + dialog.tsx:126-127).
      titleSize="xl"
      snapPoints={['55%', '90%']}
    >
      {exercise ? <TechniqueMedia exercise={exercise} /> : null}

      {steps && steps.length > 0 ? (
        <View className="gap-2.5">
          {steps.map((step, i) => (
            <View key={`${i}-${step}`} className="flex-row items-start gap-2.5">
              {/* Badge numérico — espejo de la web (§5): círculo sport-500 @15%, número sport-500 bold. */}
              <View className="h-6 w-6 items-center justify-center rounded-full bg-sport-500/15">
                <Text style={textStyle('2xs', FONT.uiBold)} className="text-sport-500">
                  {i + 1}
                </Text>
              </View>
              {/* 14px = web `text-sm` + `leading-relaxed` (WorkoutExecutionClient.tsx:2088,2098);
                  color text-muted = web text-muted-foreground. Un solo tamaño (sin mezclar TYPE.body/text-[13px]). */}
              <Text style={textStyle('sm', FONT.ui, { lh: 'relaxed' })} className="flex-1 text-muted">
                {step.replace(/^Step:\d+\s*/i, '')}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={textStyle('sm', FONT.ui)} className="text-center text-muted">
          No hay instrucciones detalladas disponibles para este ejercicio.
        </Text>
      )}

      {/* "Entendido" (§6): cierra el modal. bg-secondary/text-secondary-foreground de la web =
          surface-sunken / text-body (globals.css:222-223). Sin toast/haptic/navegación. */}
      <TouchableOpacity
        onPress={onClose}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Entendido"
        className="mt-space-4 w-full items-center justify-center rounded-control bg-surface-sunken py-3"
      >
        <Text style={textStyle('sm', FONT.uiBold)} className="text-body">
          Entendido
        </Text>
      </TouchableOpacity>
    </Sheet>
  )
}
