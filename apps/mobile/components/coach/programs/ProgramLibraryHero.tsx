import { Pressable, Text, View } from 'react-native'
import { Dumbbell, Layers3, ListChecks, Plus, Sparkles, Users } from 'lucide-react-native'
import { useTheme } from '../../../context/ThemeContext'
import { SHADOWS } from '../../../lib/shadows'
import { FONT, TYPE, textStyle } from '../../../lib/typography'
import { AmbientBrandGlow } from '../../AmbientBrandGlow'
import { themedIcon, type ThemedIcon } from './themed-icon'
import type { LibraryStats } from './program-model'

const IconSparkles = themedIcon(Sparkles)
const IconPlus = themedIcon(Plus)
const IconDumbbell = themedIcon(Dumbbell)

const T_TITLE = textStyle('2xl', FONT.displayBlack, { lh: 'tight', ls: 'tighter' })
const T_SUB = textStyle('xs', FONT.ui, { lh: 'normal' })
const T_EX = textStyle('xs', FONT.uiSemibold)
const T_STAT_VALUE = textStyle('lg', FONT.displayBold, { ls: 'tight' })
const T_STAT_LABEL = textStyle('3xs', FONT.uiMedium)

// Tonos de las 4 stat-tiles → clases DS estáticas (brand + light/dark aware).
type StatTone = 'sport' | 'success' | 'warning' | 'aqua'
const STAT_TONE: Record<StatTone, { tile: string; icon: string }> = {
  sport: { tile: 'bg-sport-100 dark:bg-sport-100/20 border-sport-500/25', icon: 'text-sport-600' },
  success: { tile: 'bg-success-100 dark:bg-success-100/20 border-success-600/25', icon: 'text-success-600' },
  warning: { tile: 'bg-warning-100 dark:bg-warning-100/20 border-warning-600/25', icon: 'text-warning-600' },
  aqua: { tile: 'bg-aqua-100 dark:bg-aqua-100/20 border-aqua-500/25', icon: 'text-aqua-600' },
}

/** Hero de la biblioteca: eyebrow + título + accesos (nueva plantilla · ejercicios) + 4 stats. */
export function ProgramLibraryHero({
  stats,
  onNewTemplate,
  onExercises,
}: {
  stats: LibraryStats
  onNewTemplate: () => void
  onExercises: () => void
}) {
  const { resolvedScheme } = useTheme()
  return (
    <View
      className="overflow-hidden rounded-card border border-subtle bg-surface-card"
      style={SHADOWS[resolvedScheme].sm}
    >
      <AmbientBrandGlow />
      <View className="gap-space-4 p-space-5">
        <View className="flex-row items-start gap-space-4">
          <View className="min-w-0 flex-1">
            <View className="flex-row items-center gap-space-2">
              <IconSparkles size={14} className="text-primary" />
              <Text style={TYPE.eyebrow} className="text-primary">
                BIBLIOTECA
              </Text>
            </View>
            <Text style={[T_TITLE, { marginTop: 3 }]} className="text-strong">
              Programas reutilizables
            </Text>
            <Text style={[T_SUB, { marginTop: 4 }]} className="text-muted">
              Revisa plantillas, alumnos con plan activo y estructura del programa antes de entrar al builder.
            </Text>
          </View>
          <Pressable
            testID="hero-new-template"
            accessibilityRole="button"
            accessibilityLabel="Nueva plantilla"
            onPress={onNewTemplate}
            className="h-11 w-11 items-center justify-center rounded-control bg-sport-500 active:opacity-85"
            style={SHADOWS[resolvedScheme].sm}
          >
            <IconPlus size={18} className="text-on-sport" />
          </Pressable>
        </View>

        {/* Movida 2: entrada contextual a la lista de ejercicios (ya no vive en la nav). */}
        <Pressable
          testID="hero-exercises"
          accessibilityRole="button"
          accessibilityLabel="Lista de ejercicios"
          onPress={onExercises}
          className="flex-row items-center justify-center gap-space-3 rounded-control border border-success-600/40 bg-success-100 py-space-4 active:opacity-80 dark:bg-success-100/20"
        >
          <IconDumbbell size={16} className="text-success-600" />
          <Text style={T_EX} className="text-success-600">
            Lista de ejercicios
          </Text>
        </Pressable>

        <View className="flex-row gap-space-3">
          <HeroStat icon={themedIcon(Layers3)} label="Plantillas" value={stats.templates} tone="sport" />
          <HeroStat icon={themedIcon(ListChecks)} label="Activos" value={stats.active} tone="success" />
          <HeroStat icon={themedIcon(Users)} label="Sin plan" value={stats.noProgram} tone="warning" />
          <HeroStat icon={themedIcon(Dumbbell)} label="Total" value={stats.total} tone="aqua" />
        </View>
      </View>
    </View>
  )
}

function HeroStat({ icon: Icon, label, value, tone }: { icon: ThemedIcon; label: string; value: number; tone: StatTone }) {
  const t = STAT_TONE[tone]
  return (
    <View className={`flex-1 gap-[3px] rounded-control border p-space-3 ${t.tile}`}>
      <Icon size={15} className={t.icon} />
      <Text style={T_STAT_VALUE} className="text-strong">
        {value}
      </Text>
      <Text style={T_STAT_LABEL} className="uppercase text-muted" numberOfLines={1}>
        {label}
      </Text>
    </View>
  )
}
