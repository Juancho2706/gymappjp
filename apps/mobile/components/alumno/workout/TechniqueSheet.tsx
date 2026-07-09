import { Text, View } from 'react-native'
import { Image } from 'expo-image'
import { Sheet } from '../../Sheet'
import { VideoPlayer } from '../../VideoPlayer'
import { TYPE } from '../../../lib/typography'
import type { SessionExercise } from '../../../lib/workout-session'

/**
 * Modal de técnica (mobile). Video INLINE via `VideoPlayer` (YouTube/mp4) o gif como imagen, +
 * instrucciones numeradas. Espeja el modal de técnica de web (`WorkoutExecutionClient`) sin salir de
 * la app (reemplaza el `Linking.openURL` del legacy).
 */
export function TechniqueSheet({
  exercise,
  onClose,
}: {
  exercise: SessionExercise | null
  onClose: () => void
}) {
  const open = !!exercise
  const videoUrl = exercise?.video_url ?? null
  const gifUrl = exercise?.gif_url ?? null
  const steps = exercise?.instructions ?? null

  return (
    <Sheet open={open} onClose={onClose} title={exercise?.name ?? 'Tecnica'} snapPoints={['55%', '90%']}>
      {videoUrl ? (
        <VideoPlayer
          url={videoUrl}
          start={exercise?.video_start_time}
          end={exercise?.video_end_time}
          autoPlay
          title={exercise?.name}
        />
      ) : gifUrl ? (
        <View className="bg-surface-sunken border border-subtle rounded-2xl overflow-hidden" style={{ width: '100%', aspectRatio: 16 / 9 }}>
          <Image source={{ uri: gifUrl }} style={{ flex: 1 }} contentFit="contain" />
        </View>
      ) : null}

      {steps && steps.length > 0 ? (
        <View className="gap-2.5">
          {steps.map((step, i) => (
            <View key={`${i}-${step}`} className="flex-row items-start gap-2.5">
              <View className="h-6 w-6 items-center justify-center rounded-md bg-sport-500/15">
                <Text style={TYPE.mono} className="text-[12px] text-sport-300">
                  {i + 1}
                </Text>
              </View>
              <Text style={TYPE.body} className="flex-1 text-[13px] text-muted">
                {step.replace(/^Step:\d+\s*/i, '')}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={TYPE.body} className="text-center text-muted">
          No hay instrucciones detalladas disponibles.
        </Text>
      )}
    </Sheet>
  )
}
