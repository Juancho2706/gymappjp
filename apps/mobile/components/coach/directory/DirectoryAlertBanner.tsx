import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Swipeable } from 'react-native-gesture-handler'
import { ChevronRight, EyeOff } from 'lucide-react-native'
import { useTheme } from '../../../context/ThemeContext'
import { FONT } from '../../../lib/typography'

/**
 * DirectoryAlertBanner — banner de triage (urgente / vencido / sync / nutrición).
 * Swipe (izq/der) → ocultar hasta el día siguiente o hasta que cambie el conteo.
 * Fondo OPACO (theme.card) + acento de color a la izquierda → legible sobre cualquier fondo.
 */
export function DirectoryAlertBanner({
  message,
  color,
  onPress,
  onDismiss,
  testID,
}: {
  message: string
  color: string
  onPress: () => void
  onDismiss: () => void
  testID?: string
}) {
  const { theme } = useTheme()
  const hideAction = (side: 'left' | 'right') => (
    <View style={[styles.dismiss, { backgroundColor: color + '22' }, side === 'left' ? { marginLeft: 16, marginRight: 0 } : null]}>
      <EyeOff size={15} color={color} />
      <Text style={[styles.dismissText, { color }]}>Ocultar</Text>
    </View>
  )
  return (
    <Swipeable
      renderRightActions={() => hideAction('right')}
      renderLeftActions={() => hideAction('left')}
      onSwipeableOpen={onDismiss}
      overshootRight={false}
      overshootLeft={false}
      friction={1.6}
    >
      <TouchableOpacity
        testID={testID}
        style={[styles.wrap, { backgroundColor: theme.card, borderColor: theme.border, borderLeftWidth: 3, borderLeftColor: color }]}
        onPress={onPress}
        activeOpacity={0.8}
      >
        <Text style={[styles.text, { color: theme.foreground, flex: 1 }]} numberOfLines={2}>{message}</Text>
        <View style={styles.cta}>
          <Text style={[styles.ctaText, { color }]}>Ver</Text>
          <ChevronRight size={14} color={color} />
        </View>
      </TouchableOpacity>
    </Swipeable>
  )
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 11,
    gap: 8,
  },
  text: { fontSize: 13, fontFamily: FONT.uiSemibold },
  cta: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  ctaText: { fontSize: 11, fontFamily: FONT.uiExtra, textTransform: 'uppercase', letterSpacing: 0.5 },
  dismiss: { width: 96, marginRight: 16, marginBottom: 8, borderRadius: 14, alignItems: 'center', justifyContent: 'center', gap: 3 },
  dismissText: { fontSize: 11, fontFamily: FONT.uiExtra, textTransform: 'uppercase', letterSpacing: 0.4 },
})
