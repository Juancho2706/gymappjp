import { StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { AlertCircle } from 'lucide-react-native'
import { useRouter } from 'expo-router'
import { useTheme } from '../../context/ThemeContext'
import { Button } from '../../components'
import { supabase } from '../../lib/supabase'

export default function SuspendedScreen() {
  const { theme } = useTheme()
  const router = useRouter()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.replace('/alumno/codigo')
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]}>
      <View style={styles.content}>
        <View style={[styles.iconWrap, { backgroundColor: '#F59E0B18', borderRadius: 40 }]}>
          <AlertCircle size={40} color="#F59E0B" />
        </View>
        <Text style={[styles.title, { color: theme.foreground, fontFamily: 'Montserrat_800ExtraBold' }]}>
          Acceso pausado
        </Text>
        <Text style={[styles.body, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
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
  iconWrap: { width: 80, height: 80, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  title: { fontSize: 22, textAlign: 'center' },
  body: { fontSize: 15, lineHeight: 23, textAlign: 'center' },
  footer: { padding: 24, paddingBottom: 32 },
})
