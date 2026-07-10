import { Pressable, Text, View } from 'react-native'
import { MotiView } from 'moti'
import { ArrowLeft, GalleryHorizontal, List, Settings } from 'lucide-react-native'
import { ProgressBar } from '../../ProgressBar'
import { useTheme } from '../../../context/ThemeContext'
import { FONT, TYPE } from '../../../lib/typography'

const W10 = 'rgba(255,255,255,0.10)'
const ON_DARK = '#F4F6F8'
const ON_DARK_MUTED = '#939DAB'
const ON_SPORT = '#FFFFFF' // --color-text-on-sport — rótulo/icono del segmento activo (web usa text-white)

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
  reducedMotion = false,
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
  /** Reduce-motion global: apaga el pulso de escala del % (paridad web WEC:1885 reducedMotion). */
  reducedMotion?: boolean
  viewMode: WorkoutViewMode
  onToggleMode: (mode: WorkoutViewMode) => void
  onBack: () => void
  onOpenSettings: () => void
}) {
  // Fill de la barra de progreso = acento sport recoloreado por white-label (paridad web `var(--sport-500)`,
  // WEC:1862). `theme.primary` sigue la rampa SPORT del coach; el shadowColor/color de libs nativas debe
  // salir del objeto Theme (no de un hex literal) para que la marca resuelva en vivo (theme.ts).
  const { theme } = useTheme()
  return (
    <MotiView
      from={{ opacity: 0, translateY: -20 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'timing', duration: 250 }}
      className="border-b border-white/10 px-4 pb-3 pt-1"
    >
      {/* Columna interna acotada a 1024px y centrada = paridad web: el inner del header es
          `max-w-5xl mx-auto` (WEC:1797). En tablet mantiene la fila de controles y la barra de
          progreso alineadas con el body de la lista y la barra Finalizar (ambos max-w-5xl), en vez
          de estirarse de borde a borde. */}
      <View className="w-full self-center" style={{ maxWidth: 1024 }}>
      <View className="mb-3 flex-row items-center gap-2">
        <Pressable
          testID="btn-exit-workout"
          onPress={onBack}
          hitSlop={8}
          className="-ml-2 h-10 w-10 items-center justify-center rounded-control bg-white/[0.08]"
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
        {/* Grupo de controles derecho — toggle + ajustes juntos (paridad web WEC:1820: gap-1.5 shrink-0). */}
        <View className="shrink-0 flex-row items-center gap-1.5">
        {/* Toggle segmentado Lista / Pasos (E2-04) — icono + rótulo, como el web (1823-1846). */}
        <View
          className="flex-row items-center rounded-control bg-white/[0.06] p-0.5"
          accessibilityRole="radiogroup"
          accessibilityLabel="Modo de ejecución"
        >
          <Pressable
            testID="toggle-view-list"
            onPress={() => onToggleMode('list')}
            hitSlop={4}
            className={`h-9 flex-row items-center gap-1 rounded-[10px] px-2 ${viewMode === 'list' ? 'bg-sport-500' : ''}`}
            accessibilityRole="button"
            accessibilityLabel="Ver como lista"
            accessibilityState={{ selected: viewMode === 'list' }}
          >
            <List size={14} color={viewMode === 'list' ? ON_SPORT : ON_DARK_MUTED} />
            <Text
              style={{ fontFamily: FONT.uiBold, fontSize: 11 }}
              className={viewMode === 'list' ? 'text-on-sport' : 'text-on-dark-muted'}
            >
              Lista
            </Text>
          </Pressable>
          <Pressable
            testID="toggle-view-steps"
            onPress={() => onToggleMode('steps')}
            hitSlop={4}
            className={`h-9 flex-row items-center gap-1 rounded-[10px] px-2 ${viewMode === 'steps' ? 'bg-sport-500' : ''}`}
            accessibilityRole="button"
            accessibilityLabel="Ver paso a paso"
            accessibilityState={{ selected: viewMode === 'steps' }}
          >
            <GalleryHorizontal size={14} color={viewMode === 'steps' ? ON_SPORT : ON_DARK_MUTED} />
            <Text
              style={{ fontFamily: FONT.uiBold, fontSize: 11 }}
              className={viewMode === 'steps' ? 'text-on-sport' : 'text-on-dark-muted'}
            >
              Pasos
            </Text>
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
          {/* Icono a 20px = web `Settings w-5 h-5` (WEC:1854), igualando el back arrow (w-5 h-5, WEC:1800)
              dentro del mismo control h-10 w-10. */}
          <Settings size={20} color={ON_DARK} />
        </Pressable>
        </View>
      </View>

      <ProgressBar value={requiredSets === 0 ? 0 : completedSetCount / requiredSets} color={theme.primary} track={W10} height={6} />

      <View className="mt-1.5 flex-row items-start justify-between gap-2">
        <Text style={TYPE.mono} className="text-[11px] text-on-dark-muted">
          <Text className="text-on-dark font-mono-bold">Ejercicio {currentExerciseNum}</Text> de {totalExercises}
        </Text>
        <View className="flex-row flex-wrap items-center justify-end gap-x-1.5">
          <Text style={TYPE.mono} className="text-[11px] text-on-dark-muted">{completedSetCount}/{requiredSets} series</Text>
          {volumeLabel && <Text style={TYPE.mono} className="text-[11px] text-on-dark-muted">· {volumeLabel}</Text>}
          {/* El tope de 4h se aplica en silencio (paridad web WEC:1881: sin marcador de tope). */}
          <Text style={TYPE.mono} className="text-[11px] text-on-dark-muted">· {elapsedLabel}</Text>
          <Text style={TYPE.mono} className="text-[11px] text-on-dark-muted">·</Text>
          {/* Pulso de escala del % cada vez que cambia completedSetCount (paridad web WEC:1883-1892:
              `motion.span key={completedSetCount}` scale 1.18→1, springs.snappy). `key` fuerza el
              re-montaje que reejecuta el from→animate; reduced-motion lo colapsa a instantáneo. */}
          <MotiView
            key={completedSetCount}
            from={reducedMotion ? { scale: 1 } : { scale: 1.18 }}
            animate={{ scale: 1 }}
            transition={reducedMotion ? { type: 'timing', duration: 0 } : { type: 'spring', stiffness: 400, damping: 30 }}
          >
            <Text style={TYPE.mono} className="text-[11px] text-sport-400 font-mono-bold">{completionPct}%</Text>
          </MotiView>
        </View>
      </View>
      </View>
    </MotiView>
  )
}
