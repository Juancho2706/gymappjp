import { Pressable, Text, View } from 'react-native'
import { ArrowLeft, GalleryHorizontal, List, Settings } from 'lucide-react-native'
import { ProgressBar } from '../../ProgressBar'
import { FONT, TYPE } from '../../../lib/typography'

const SPORT_500 = '#2680FF'
const W10 = 'rgba(255,255,255,0.10)'
const ON_DARK = '#F4F6F8'
const ON_DARK_MUTED = '#939DAB'

export type WorkoutViewMode = 'list' | 'steps'

/**
 * Header de ejecución (E2-08) — back + título + badge de semana + sublínea de programa, toggle
 * segmentado "Lista / Pasos" (E2-04), barra de progreso DS y la línea "Ejercicio X de Y · N/M series ·
 * volumen · tiempo · %". Espeja el header sticky de `WorkoutExecutionClient` de web.
 */
export function SessionHeader({
  planTitle,
  weekBadge,
  subline,
  currentExerciseNum,
  totalExercises,
  completedSetCount,
  requiredSets,
  completionPct,
  volumeLabel,
  elapsedLabel,
  capped,
  viewMode,
  onToggleMode,
  onBack,
  onOpenSettings,
}: {
  planTitle: string
  /** Texto de la píldora de variante ("Semana A/B"), o null si el plan no tiene variantes. */
  weekBadge: string | null
  subline: string | null
  currentExerciseNum: number
  totalExercises: number
  completedSetCount: number
  requiredSets: number
  completionPct: number
  volumeLabel: string | null
  elapsedLabel: string
  capped: boolean
  viewMode: WorkoutViewMode
  onToggleMode: (mode: WorkoutViewMode) => void
  onBack: () => void
  onOpenSettings: () => void
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
          <ArrowLeft size={20} color={ON_DARK} />
        </Pressable>
        <View className="min-w-0 flex-1 items-center px-2">
          <View className="flex-row flex-wrap items-center justify-center gap-2">
            <Text className="font-display text-[18px] text-on-dark" numberOfLines={1}>{planTitle || 'Workout'}</Text>
            {weekBadge && (
              <View className="shrink-0 rounded-full border border-white/20 px-2 py-0.5">
                <Text
                  style={{ fontFamily: FONT.uiExtra, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' }}
                  className="text-on-dark-muted"
                >
                  {weekBadge}
                </Text>
              </View>
            )}
          </View>
          {subline && (
            <Text
              style={{ fontFamily: FONT.uiBold, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' }}
              className="text-on-dark-muted"
              numberOfLines={1}
            >
              {subline}
            </Text>
          )}
        </View>
        {/* Toggle segmentado Lista / Pasos (E2-04) */}
        <View className="flex-row items-center gap-0.5 rounded-control border border-inverse/50 bg-white/[0.04] p-0.5">
          <Pressable
            testID="toggle-view-list"
            onPress={() => onToggleMode('list')}
            hitSlop={4}
            className={`h-8 w-8 items-center justify-center rounded-control ${viewMode === 'list' ? 'bg-sport-500' : ''}`}
            accessibilityRole="button"
            accessibilityLabel="Ver como lista"
            accessibilityState={{ selected: viewMode === 'list' }}
          >
            <List size={16} color={viewMode === 'list' ? ON_DARK : ON_DARK_MUTED} />
          </Pressable>
          <Pressable
            testID="toggle-view-steps"
            onPress={() => onToggleMode('steps')}
            hitSlop={4}
            className={`h-8 w-8 items-center justify-center rounded-control ${viewMode === 'steps' ? 'bg-sport-500' : ''}`}
            accessibilityRole="button"
            accessibilityLabel="Ver paso a paso"
            accessibilityState={{ selected: viewMode === 'steps' }}
          >
            <GalleryHorizontal size={16} color={viewMode === 'steps' ? ON_DARK : ON_DARK_MUTED} />
          </Pressable>
        </View>
        {/* Ajustes: cronómetro automático + alarma de descanso (WAVE-B-SEAM). */}
        <Pressable
          testID="btn-workout-settings"
          onPress={onOpenSettings}
          hitSlop={8}
          className="h-10 w-10 items-center justify-center rounded-control bg-white/[0.08]"
          accessibilityRole="button"
          accessibilityLabel="Ajustes del entrenamiento"
        >
          <Settings size={18} color={ON_DARK} />
        </Pressable>
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
