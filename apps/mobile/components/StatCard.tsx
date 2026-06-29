import { StyleSheet, Text, View } from 'react-native'
import type { ViewProps, ViewStyle } from 'react-native'
import type { LucideIcon } from 'lucide-react-native'
import { useTheme } from '../context/ThemeContext'

type Accent = 'sport' | 'ember' | 'aqua' | 'neutral'

interface StatCardProps extends ViewProps {
  /** Uppercase eyebrow label (e.g. "Volumen semanal"). */
  label: string
  /** Big tabular metric value. */
  value: string | number
  /** Optional unit suffix (e.g. "kg", "%"). */
  unit?: string
  /** Signed delta, e.g. "+8%" / "-3%". Sign drives color (green up / red down). */
  delta?: string | null
  /** Accent for the icon (sport follows the white-label brand). */
  accent?: Accent
  /** Lucide icon component rendered top-right, tinted with the accent. */
  icon?: LucideIcon
  /** Dark inverse surface for dark dashboards. */
  inverse?: boolean
  style?: ViewStyle
}

// Fixed accents (ink-400 / ember-500 / aqua-500 are constant; sport follows brand).
const INK_400 = '#818C9A'
const EMBER_500 = '#FF6A3D'
// Inverse surface (token-contract: light = ink-950, dark = surface-inverse navy).
const SURFACE_INVERSE_LIGHT = '#0B0E13'
const SURFACE_INVERSE_DARK = '#16273C'
const TEXT_ON_DARK = '#F4F6F8' // ink-50
const TEXT_ON_DARK_MUTED = '#939DAB'
const BORDER_INVERSE = 'rgba(255,255,255,0.10)'

/** True when the supplied hex reads as a dark surface (perceived luminance). */
function isDarkHex(hex: string): boolean {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16) || 0
  const g = parseInt(h.slice(2, 4), 16) || 0
  const b = parseInt(h.slice(4, 6), 16) || 0
  return (r * 299 + g * 587 + b * 114) / 1000 < 128
}

/**
 * EVA StatCard — metric tile: uppercase label, big tabular value, optional
 * signed delta and accented icon. RN port of the web/DS StatCard (1:1 API).
 */
export function StatCard({
  label,
  value,
  unit,
  delta,
  accent = 'sport',
  icon: Icon,
  inverse = false,
  style,
  ...rest
}: StatCardProps) {
  const { theme } = useTheme()
  const isDark = isDarkHex(theme.background)

  const accentColor =
    accent === 'ember'
      ? EMBER_500
      : accent === 'aqua'
      ? theme.cyan
      : accent === 'neutral'
      ? INK_400
      : theme.primary // sport → white-label brand

  const deltaUp = typeof delta === 'string' && delta.trim().startsWith('+')
  const hasDelta = delta != null && delta !== ''
  const deltaColor = deltaUp ? theme.success : theme.destructive

  const fg = inverse ? TEXT_ON_DARK : theme.foreground
  const muted = inverse ? TEXT_ON_DARK_MUTED : theme.mutedForeground

  return (
    <View
      {...rest}
      style={[
        styles.card,
        {
          backgroundColor: inverse
            ? isDark
              ? SURFACE_INVERSE_DARK
              : SURFACE_INVERSE_LIGHT
            : theme.card,
          borderColor: inverse ? BORDER_INVERSE : theme.border,
        },
        inverse ? styles.shadowMd : styles.shadowSm,
        style,
      ]}
    >
      <View style={styles.header}>
        <Text
          style={[styles.label, { color: muted }]}
          numberOfLines={1}
          allowFontScaling
        >
          {label}
        </Text>
        {Icon ? <Icon size={18} color={accentColor} strokeWidth={2} /> : null}
      </View>

      <View style={styles.valueRow}>
        <Text style={[styles.value, { color: fg }]} numberOfLines={1}>
          {value}
        </Text>
        {unit ? <Text style={[styles.unit, { color: muted }]}>{unit}</Text> : null}
      </View>

      {hasDelta ? (
        <View style={styles.deltaRow}>
          <Text style={[styles.deltaGlyph, { color: deltaColor }]}>
            {deltaUp ? '▲' : '▼'}
          </Text>
          <Text style={[styles.delta, { color: deltaColor }]}>{delta}</Text>
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'column',
    gap: 8,
    padding: 16,
    borderWidth: 1,
    borderRadius: 20, // --radius-card
  },
  shadowSm: {
    shadowColor: '#0D121C',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  shadowMd: {
    shadowColor: '#0D121C',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 10,
    elevation: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  label: {
    flexShrink: 1,
    fontSize: 11,
    fontFamily: 'HankenGrotesk_700Bold',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  value: {
    fontFamily: 'Archivo_900Black',
    fontSize: 32,
    lineHeight: 32,
    letterSpacing: -1,
    fontVariant: ['tabular-nums'],
  },
  unit: {
    fontSize: 14,
    fontFamily: 'HankenGrotesk_600SemiBold',
  },
  deltaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  deltaGlyph: {
    fontSize: 11,
    lineHeight: 14,
  },
  delta: {
    fontSize: 12,
    fontFamily: 'HankenGrotesk_700Bold',
  },
})
