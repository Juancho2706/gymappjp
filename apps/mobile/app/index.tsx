import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native'
import { useRouter } from 'expo-router'
import { useTheme } from '../context/ThemeContext'

export default function RoleSelector() {
  const router = useRouter()
  const { theme } = useTheme()

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <Text
          style={[styles.brand, { color: theme.foreground, fontFamily: 'Montserrat_800ExtraBold' }]}
        >
          EVA
        </Text>
        <Text
          style={[styles.subtitle, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}
        >
          Entrenamiento personalizado
        </Text>
      </View>

      <View style={styles.buttons}>
        <TouchableOpacity
          style={[
            styles.btn,
            { backgroundColor: theme.primary, borderRadius: theme.radius['2xl'] },
            theme.shadowGlowBlue,
          ]}
          onPress={() => router.push('/(auth)/login?role=coach')}
          activeOpacity={0.85}
        >
          <Text style={styles.btnIcon}>🏋️</Text>
          <Text style={[styles.btnTitle, { fontFamily: 'Montserrat_800ExtraBold' }]}>
            SOY COACH
          </Text>
          <Text style={[styles.btnDesc, { fontFamily: theme.fontSans }]}>
            Gestiona alumnos y programas
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.btn,
            {
              backgroundColor: theme.card,
              borderWidth: 1,
              borderColor: theme.border,
              borderRadius: theme.radius['2xl'],
            },
          ]}
          onPress={() => router.push('/alumno/codigo')}
          activeOpacity={0.85}
        >
          <Text style={styles.btnIcon}>💪</Text>
          <Text
            style={[
              styles.btnTitle,
              { color: theme.foreground, fontFamily: 'Montserrat_800ExtraBold' },
            ]}
          >
            SOY ALUMNO
          </Text>
          <Text
            style={[
              styles.btnDesc,
              { color: theme.mutedForeground, fontFamily: theme.fontSans },
            ]}
          >
            Accede a tu entrenamiento
          </Text>
        </TouchableOpacity>
      </View>

      <Text
        style={[styles.footer, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}
      >
        eva-app.cl
      </Text>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'space-between',
    paddingVertical: 56,
    paddingHorizontal: 24,
  },
  header: {
    alignItems: 'center',
    paddingTop: 40,
  },
  brand: {
    fontSize: 64,
    letterSpacing: -3,
    lineHeight: 64,
  },
  subtitle: {
    fontSize: 14,
    marginTop: 8,
    letterSpacing: 0.4,
  },
  buttons: {
    gap: 16,
  },
  btn: {
    padding: 28,
    alignItems: 'center',
    gap: 6,
  },
  btnIcon: {
    fontSize: 38,
    marginBottom: 4,
  },
  btnTitle: {
    fontSize: 20,
    color: '#FFFFFF',
    letterSpacing: 1.2,
  },
  btnDesc: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.78)',
  },
  footer: {
    textAlign: 'center',
    fontSize: 12,
    letterSpacing: 0.3,
  },
})
