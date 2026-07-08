import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { ChevronLeft } from 'lucide-react-native'
import { useRouter } from 'expo-router'
import { useTheme } from '../context/ThemeContext'

interface TopBarProps {
  /** Show "EVA" brand mark on the left. */
  showBrand?: boolean
  /** Custom title rendered centered. Use either this OR `showBrand`, not both. */
  title?: string
  /** When true, show back chevron + "Volver" label instead of brand. */
  back?: boolean
  /** Override default back-handler (router.back). */
  onBack?: () => void
}

export function TopBar({ showBrand, title, back, onBack }: TopBarProps) {
  const { theme } = useTheme()
  const router = useRouter()

  function handleBack() {
    if (onBack) onBack()
    else router.back()
  }

  return (
    <View style={[styles.wrap, title ? { borderBottomColor: theme.border, borderBottomWidth: StyleSheet.hairlineWidth } : null]}>
      <View style={styles.side}>
        {back ? (
          <TouchableOpacity
            testID="topbar-back"
            accessibilityRole="button"
            onPress={handleBack}
            hitSlop={12}
            style={styles.backBtn}
            activeOpacity={0.7}
          >
            <ChevronLeft size={18} color={theme.primary} />
            {/* DS: Hanken Grotesk (UI sans), NO Montserrat. Color = brand accent (white-label). */}
            <Text className="font-sans-semibold" style={[styles.backLabel, { color: theme.primary }]}>
              Volver
            </Text>
          </TouchableOpacity>
        ) : showBrand ? (
          // DS: Archivo display black (marca EVA), NO Montserrat.
          <Text className="font-display-black" style={[styles.brand, { color: theme.foreground }]}>
            EVA
          </Text>
        ) : null}
      </View>
      {title ? (
        <Text
          className="font-display-bold"
          style={[styles.title, { color: theme.foreground }]}
          numberOfLines={1}
        >
          {title}
        </Text>
      ) : null}
      <View style={styles.side} />
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  side: { width: 80 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  backLabel: { fontSize: 13, letterSpacing: 0.3 },
  brand: { fontSize: 24, letterSpacing: -0.8 },
  title: { flex: 1, textAlign: 'center', fontSize: 15, letterSpacing: -0.2 },
})
