import { useEffect } from 'react'
import { Text, TouchableOpacity, View } from 'react-native'
import { ChevronRight, ClipboardCheck } from 'lucide-react-native'
import { cssInterop } from 'nativewind'
import { MotiView } from 'moti'
import { useTheme } from '../../../context/ThemeContext'
import { useEvaMotion } from '../../../lib/motion'
import { FONT } from '../../../lib/typography'
import { setAppBadge } from '../../../lib/badge'

// className→color del glyph ChevronRight: sin este registro por-icono,
// lucide-react-native ignora `fgClass` (text-danger-700 / text-ember-700, ambos
// dark-aware) y cae a currentColor≈negro. Espejo del web, que colorea el chevron
// con `accentText`. ClipboardCheck no lo necesita: usa prop `color`. (Patron DS
// del repo: WeightWidget/RecentWorkouts registran cssInterop por-icono.)
cssInterop(ChevronRight, { className: { target: 'style', nativeStyleToProp: { color: true } } })

export type CheckInVariant = 'first' | 'warning' | 'overdue'

/**
 * §4 CheckInBanner (web `checkin/CheckInBanner.tsx` + `CheckInBannerFrame.tsx`).
 * Variant-aware: `first` (sin check-in, card neutra sunken), `warning` (3-7d,
 * ember), `overdue` (>7d, danger + pulso suave). `<3d` → el shell lo oculta.
 *
 * Color: fondo/borde/textos por clases-token danger/ember que FLIPEAN en dark
 * (ola0 P1: constantes DANGER/EMBER fijas daban texto sin contraste y fondo mal tinteado).
 * ember-500/danger-500 (chip) NO flipean (mismo valor que el web) → clase solida.
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

  // §4 badge del icono: espejo del web, que monta `<AppBadgeSync count={1}/>` DENTRO
  // del banner solo en las variantes warning/overdue (web CheckInBanner.tsx:61 →
  // AppBadgeSync.tsx:14-18 `if (count>0) setAppBadge(count)`). `first` no lleva badge
  // (el web no monta AppBadgeSync en esa rama). Best-effort: badge.ts se traga errores.
  // Se limpia al abrir /check-in (lib/badge.ts:12-14), igual que el web — no en unmount.
  useEffect(() => {
    if (variant === 'warning' || variant === 'overdue') setAppBadge(1)
  }, [variant])

  // Mount-anim del shell condicionada a reduce (paridad idiomatica; web sin entrada).
  const mountFrom = motion.reduced ? { opacity: 1, translateY: 0 } : { opacity: 0, translateY: 12 }

  if (variant === 'first') {
    return (
      <MotiView from={mountFrom} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 400 }}>
        <TouchableOpacity
          testID="home-checkin-banner"
          accessibilityRole="button"
          accessibilityLabel="Registra tu primer check-in. Peso y energía en segundos"
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
  const boxClass = overdue
    ? 'bg-danger-100 dark:bg-danger-100/[0.18] border-danger-100 dark:border-danger-100/[0.18]'
    : 'bg-ember-100 dark:bg-ember-100/20 border-ember-200'
  const fgClass = overdue ? 'text-danger-700' : 'text-ember-700'
  const chipClass = overdue ? 'bg-danger-500' : 'bg-ember-500'
  const title =
    overdue ? '¡Check-in pendiente!' : daysSince === 3 ? 'Check-in próximo' : `Check-in próximo — hace ${daysSince} días`
  const sub = lastRelative ? `Último: ${lastRelative}` : 'Peso y energía en segundos'

  return (
    <MotiView from={mountFrom} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 400 }}>
      {/* Pulso overdue: web es un anillo exterior que se expande (CheckInBannerFrame);
          RN fade suave del banner (adaptacion idiomatica, ola0 P2). Reduce respetado. */}
      <MotiView
        from={{ opacity: 1 }}
        animate={overdue && !motion.reduced ? { opacity: [1, 0.72, 1] } : { opacity: 1 }}
        transition={overdue && !motion.reduced ? { type: 'timing', duration: 2200, loop: true } : undefined}
      >
        <TouchableOpacity
          testID="home-checkin-banner"
          accessibilityRole="button"
          accessibilityLabel={`${title}. ${sub}`}
          onPress={onPress}
          activeOpacity={0.82}
          className={`rounded-card border ${boxClass}`}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 12 }}
        >
          <View className={`rounded-control ${chipClass}`} style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}>
            <ClipboardCheck size={18} color="#fff" strokeWidth={2.25} />
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text className={fgClass} style={{ fontFamily: FONT.uiBold, fontSize: 14 }}>{title}</Text>
            <Text className={fgClass} style={{ fontFamily: FONT.ui, fontSize: 12, opacity: 0.9 }}>{sub}</Text>
          </View>
          <ChevronRight className={fgClass} size={18} />
        </TouchableOpacity>
      </MotiView>
    </MotiView>
  )
}
