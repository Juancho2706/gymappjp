import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native'
import { useRouter } from 'expo-router'

export default function RoleSelector() {
  const router = useRouter()

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.brand}>EVA</Text>
        <Text style={styles.subtitle}>Entrenamiento personalizado</Text>
      </View>

      <View style={styles.buttons}>
        <TouchableOpacity
          style={[styles.btn, styles.btnCoach]}
          onPress={() => router.push('/(auth)/login?role=coach')}
          activeOpacity={0.85}
        >
          <Text style={styles.btnIcon}>🏋️</Text>
          <Text style={styles.btnTitle}>SOY COACH</Text>
          <Text style={styles.btnDesc}>Gestiona tus alumnos y programas</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.btn, styles.btnAlumno]}
          onPress={() => router.push('/alumno/codigo')}
          activeOpacity={0.85}
        >
          <Text style={styles.btnIcon}>💪</Text>
          <Text style={styles.btnTitle}>SOY ALUMNO</Text>
          <Text style={styles.btnDesc}>Accede a tu entrenamiento</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.footer}>eva-app.cl</Text>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
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
    color: '#fff',
    letterSpacing: -2,
  },
  subtitle: {
    fontSize: 14,
    color: '#8E8E93',
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
  btnCoach: {
    backgroundColor: '#007AFF',
  },
  btnAlumno: {
    backgroundColor: '#1C1C1E',
    borderWidth: 1,
    borderColor: '#38383A',
  },
  btnIcon: {
    fontSize: 36,
    marginBottom: 4,
  },
  btnTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 1,
  },
  btnDesc: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
  },
  footer: {
    textAlign: 'center',
    color: '#3A3A3C',
    fontSize: 12,
  },
})
