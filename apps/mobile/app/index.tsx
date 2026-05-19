import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native'
import { useRouter } from 'expo-router'
import { useTheme } from '../context/ThemeContext'

export default function RoleSelector() {
  const router = useRouter()
  const { theme } = useTheme()

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <Text style={[styles.brand, { color: theme.foreground, fontFamily: theme.fontDisplay }]}>
          EVA
        </Text>
        <Text style={[styles.subtitle, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
          Entrenamiento personalizado
        </Text>
      </View>

      <View style={styles.buttons}>
        <TouchableOpacity
          style={[styles.btn, { backgroundColor: theme.primary }, theme.shadowGlowBlue]}
          onPress={() => router.push('/(auth)/login?role=coach')}
          activeOpacity={0.85}
        >
          <Text style={styles.btnIcon}>🏋️</Text>
          <Text style={[styles.btnTitle, { fontFamily: 'Montserrat_700Bold' }]}>SOY COACH</Text>
          <Text style={[styles.btnDesc, { fontFamily: theme.fontSans }]}>
            Gestiona tus alumnos y programas
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.btn, { backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border }]}
          onPress={() => router.push('/alumno/codigo')}
          activeOpacity={0.85}
        >
          <Text style={styles.btnIcon}>💪</Text>
          <Text style={[styles.btnTitle, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
            SOY ALUMNO
          </Text>
          <Text style={[styles.btnDesc, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
            Accede a tu entrenamiento
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={[styles.footer, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
        eva-app.cl
      </Text>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'space-between',
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  header: {
    alignItems: 'center',
    paddingTop: 32,
  },
  brand: {
    fontSize: 56,
    fontWeight: '800',
    letterSpacing: -2,
  },
  subtitle: {
    fontSize: 14,
    marginTop: 4,
    letterSpacing: 0.5,
  },
  buttons: {
    gap: 16,
  },
  btn: {
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    gap: 6,
  },
  btnIcon: {
    fontSize: 36,
    marginBottom: 4,
  },
  btnTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  btnDesc: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.75)',
  },
  footer: {
    textAlign: 'center',
    fontSize: 12,
  },
})
