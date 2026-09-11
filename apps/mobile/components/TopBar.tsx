import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { ChevronLeft } from 'lucide-react-native'
import { useRouter } from 'expo-router'
import { useTheme } from '../context/ThemeContext'

interface TopBarProps {
  /** Custom title rendered centered. */
  title?: string
  /** When true, show back chevron + "Volver" label on the left. */
  back?: boolean
  /** Override default back-handler (router.back). */
  onBack?: () => void
  /** Override the destination label beside the back chevron. */
  backLabel?: string
  backColor?: string
}

/**
 * Barra superior chica de las pantallas sueltas (auth, legales).
 *
 * Item 7 del tren «Arreglos chicos pre-OTA»: se borro la rama `showBrand`, que pintaba un «EVA»
 * suelto a la izquierda. Era codigo MUERTO —los dos unicos call sites pasaban `showBrand back` y en
 * el ternario `back` siempre ganaba— y ademas contradecia el white-label: en la app de un coach con
 * marca propia el unico wordmark EVA vive en el pie de Opciones.
 */
export function TopBar({ title, back, onBack, backLabel = 'Volver', backColor }: TopBarProps) {
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
            <ChevronLeft size={18} color={backColor ?? theme.primary} />
            {/* DS: Hanken Grotesk (UI sans), NO Montserrat. Color = brand accent (white-label). */}
            <Text className="font-sans-semibold" style={[styles.backLabel, { color: backColor ?? theme.primary }]}>
              {backLabel}
            </Text>
          </TouchableOpacity>
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
  title: { flex: 1, textAlign: 'center', fontSize: 15, letterSpacing: -0.2 },
})
