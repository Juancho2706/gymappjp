import { Pressable, Text, View } from 'react-native'
import { ChevronLeft } from 'lucide-react-native'
import { ProgressBar } from '../../ProgressBar'
import { TYPE } from '../../../lib/typography'

const SPORT_500 = '#2680FF'
const W10 = 'rgba(255,255,255,0.10)'
const ON_DARK = '#F4F6F8'

/**
 * Header de ejecución (E2-08) — back + título + badge de semana + sublínea de programa, barra de
 * progreso DS y la línea "Ejercicio X de Y · N/M series · volumen · tiempo · %". Espeja el header
 * sticky de `WorkoutExecutionClient` de web.
 *
 * WAVE-B-SEAM: el toggle segmentado "Lista / Pasos" y la tuerca de ajustes de descanso van acá cuando
 * lleguen StepperExecution y WorkoutTimerSettingsPanel.
 */
export function SessionHeader({
  planTitle,
  eyebrow,
  subline,
  currentExerciseNum,
  totalExercises,
  completedSetCount,
  requiredSets,
  completionPct,
  volumeLabel,
  elapsedLabel,
  capped,
  onBack,
}: {
  planTitle: string
  eyebrow: string | null
  subline: string | null
  currentExerciseNum: number
  totalExercises: number
  completedSetCount: number
  requiredSets: number
  completionPct: number
  volumeLabel: string | null
  elapsedLabel: string
  capped: boolean
  onBack: () => void
}) {
  return (
    <View className="border-b border-white/10 px-4 pb-3 pt-1">
      <View className="mb-3 flex-row items-center gap-2.5">
        <Pressable
          testID="btn-exit-workout"
          onPress={onBack}
          hitSlop={8}
          className="-ml-1 h-10 w-10 items-center justify-center rounded-control bg-white/[0.08]"
          accessibilityRole="button"
          accessibilityLabel="Salir del entrenamiento"
        >
          <ChevronLeft size={20} color={ON_DARK} />
        </Pressable>
        <View className="min-w-0 flex-1">
          {eyebrow && (
            <Text style={TYPE.eyebrow} className="text-on-dark-muted" numberOfLines={1}>{eyebrow}</Text>
          )}
          <Text className="font-display-bold text-[18px] text-on-dark" numberOfLines={1}>{planTitle || 'Workout'}</Text>
          {subline && (
            <Text style={TYPE.eyebrow} className="text-on-dark-muted" numberOfLines={1}>{subline}</Text>
          )}
        </View>
      </View>

      <ProgressBar value={requiredSets === 0 ? 0 : completedSetCount / requiredSets} color={SPORT_500} track={W10} height={6} />

      <View className="mt-1.5 flex-row items-start justify-between gap-2">
        <Text style={TYPE.mono} className="text-[11px] text-on-dark-muted">
          <Text className="text-on-dark font-mono-bold">Ejercicio {currentExerciseNum}</Text> de {totalExercises}
        </Text>
        <View className="flex-row flex-wrap items-center justify-end gap-x-1.5">
          <Text style={TYPE.mono} className="text-[11px] text-on-dark-muted">{completedSetCount}/{requiredSets} series</Text>
          {volumeLabel && <Text style={TYPE.mono} className="text-[11px] text-on-dark-muted">· {volumeLabel}</Text>}
          <Text style={TYPE.mono} className="text-[11px] text-on-dark-muted">· {elapsedLabel}{capped ? ' (máx)' : ''}</Text>
          <Text style={TYPE.mono} className="text-[11px] text-sport-400 font-mono-bold">· {completionPct}%</Text>
        </View>
      </View>
    </View>
  )
}
