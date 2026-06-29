import { StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { AlertCircle } from 'lucide-react-native'
import { useRouter } from 'expo-router'
import { useTheme } from '../../context/ThemeContext'
import { Button } from '../../components'
import { signOutAndCleanup } from '../../lib/auth-actions'

// DS warning-500 (fixed status token, not brand/white-label).
const WARNING_500 = '#F5A524'

export default function SuspendedScreen() {
  const { theme } = useTheme()
  const router = useRouter()

  async function handleLogout() {
    await signOutAndCleanup()
    router.replace('/alumno/codigo')
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]}>
      <View style={styles.content}>
        <View className="bg-warning-100" style={styles.iconWrap}>
          <AlertCircle size={40} color={WARNING_500} />
        </View>
        <Text className="text-strong font-display-black" style={styles.title}>
          Acceso pausado
        </Text>
        <Text className="text-muted font-sans" style={styles.body}>
          Tu coach ha pausado temporalmente el acceso a la app. Contacta a tu coach para más información y para restablecer el acceso.
        </Text>
      </View>
      <View style={styles.footer}>
        <Button label="Cerrar sesión" variant="secondary" onPress={handleLogout} full />
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 16,
  },
  iconWrap: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  title: { fontSize: 22, textAlign: 'center' },
  body: { fontSize: 15, lineHeight: 23, textAlign: 'center' },
  footer: { padding: 24, paddingBottom: 32 },
})
