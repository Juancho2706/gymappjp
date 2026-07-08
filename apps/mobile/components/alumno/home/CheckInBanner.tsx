import { Text, TouchableOpacity, View } from 'react-native'
import { ChevronRight, ClipboardCheck } from 'lucide-react-native'
import { MotiView } from 'moti'
import { useTheme } from '../../../context/ThemeContext'
import { useEvaMotion } from '../../../lib/motion'
import { FONT } from '../../../lib/typography'
import { DANGER_500, DANGER_600, EMBER_500, EMBER_700 } from './types'

export type CheckInVariant = 'first' | 'warning' | 'overdue'

/**
 * §4 CheckInBanner (web `checkin/CheckInBanner.tsx` + `CheckInBannerFrame.tsx`).
 * Variant-aware: `first` (sin check-in, card neutra sunken), `warning` (3-7d,
 * ember), `overdue` (>7d, danger + pulso suave). `<3d` → el shell lo oculta.
 */
export function CheckInBanner({
  variant,
  daysSince,
  lastRelative,
  onPress,
}: {
  variant: CheckInVariant
  daysSince: number | null
  lastRelative: string | null
  onPress: () => void
}) {
  const { theme } = useTheme()
  const motion = useEvaMotion()

  if (variant === 'first') {
    return (
      <MotiView from={{ opacity: 0, translateY: 12 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 400 }}>
        <TouchableOpacity
          testID="home-checkin-banner"
          onPress={onPress}
          activeOpacity={0.82}
          className="rounded-card bg-surface-sunken border border-subtle"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 }}
        >
          <View className="rounded-control bg-surface-card" style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}>
            <ClipboardCheck size={18} color={theme.mutedForeground} strokeWidth={2.25} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text className="text-strong font-sans-bold" style={{ fontSize: 14 }}>Registra tu primer check-in</Text>
            <Text className="text-muted font-sans" style={{ fontSize: 12 }}>Peso y energía en segundos</Text>
          </View>
          <ChevronRight size={18} color={theme.mutedForeground} />
        </TouchableOpacity>
      </MotiView>
    )
  }

  const overdue = variant === 'overdue'
  const accent = overdue ? DANGER_500 : EMBER_500
  const fg = overdue ? DANGER_600 : EMBER_700
  const title =
    overdue ? '¡Check-in pendiente!' : daysSince === 3 ? 'Check-in próximo' : `Check-in próximo — hace ${daysSince} días`
  const sub = lastRelative ? `Último: ${lastRelative}` : 'Peso y energía en segundos'

  return (
    <MotiView from={{ opacity: 0, translateY: 12 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 400 }}>
      <MotiView
        from={{ opacity: 1 }}
        animate={overdue && !motion.reduced ? { opacity: [1, 0.72, 1] } : { opacity: 1 }}
        transition={overdue && !motion.reduced ? { type: 'timing', duration: 2200, loop: true } : undefined}
        style={{ borderRadius: 20, borderWidth: 1, borderColor: accent + '38', backgroundColor: accent + '1A' }}
      >
        <TouchableOpacity
          testID="home-checkin-banner"
          onPress={onPress}
          activeOpacity={0.82}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 12, paddingVertical: 12 }}
        >
          <View style={{ width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: accent }}>
            <ClipboardCheck size={18} color="#fff" strokeWidth={2.25} />
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text style={{ fontFamily: FONT.uiBold, fontSize: 13.5, color: fg }} numberOfLines={1}>{title}</Text>
            <Text style={{ fontFamily: FONT.ui, fontSize: 12, color: fg }} numberOfLines={1}>{sub}</Text>
          </View>
          <ChevronRight size={18} color={fg} />
        </TouchableOpacity>
      </MotiView>
    </MotiView>
  )
}
