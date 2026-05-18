import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useRouter } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '../../../lib/supabase'
import { useTheme } from '../../../context/ThemeContext'

export default function CoachPerfilScreen() {
  const { theme } = useTheme()
  const router = useRouter()

  async function handleLogout() {
    await supabase.auth.signOut()
    await AsyncStorage.removeItem('eva_user_role')
    router.replace('/')
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Text style={[styles.text, { color: theme.text }]}>Perfil coach — próximamente</Text>
      <TouchableOpacity style={[styles.btn, { borderColor: theme.destructive }]} onPress={handleLogout}>
        <Text style={[styles.btnText, { color: theme.destructive }]}>Cerrar sesión</Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 24 },
  text: { fontSize: 18 },
  btn: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12, borderWidth: 1 },
  btnText: { fontSize: 15, fontWeight: '600' },
})
