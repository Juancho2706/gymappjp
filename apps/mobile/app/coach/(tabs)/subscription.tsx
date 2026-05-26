import { StyleSheet, Text, View } from 'react-native'
import { CreditCard } from 'lucide-react-native'
import { CoachMainWrapper } from '../../../components/coach/CoachMainWrapper'
import { useTheme } from '../../../context/ThemeContext'

export default function SubscriptionScreen() {
  const { theme } = useTheme()
  return (
    <CoachMainWrapper>
      <View style={styles.center}>
        <CreditCard size={40} color={theme.mutedForeground} strokeWidth={1.5} />
        <Text style={[styles.title, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
          Suscripción
        </Text>
        <Text style={[styles.sub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
          Gestión de plan y facturación próximamente.
        </Text>
      </View>
    </CoachMainWrapper>
  )
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 32,
  },
  title: {
    fontSize: 22,
    lineHeight: 28,
  },
  sub: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
})
