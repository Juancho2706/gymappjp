import { useEffect, useState } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useRouter } from 'expo-router'
import { Fingerprint } from 'lucide-react-native'
import { useTheme } from '../context/ThemeContext'
import { authenticate } from '../lib/biometric'
import { signOutAndCleanup } from '../lib/auth-actions'

/**
 * Pantalla de bloqueo biométrico (Ola 0, opt-in). Cubre la app cuando hay sesión y
 * el usuario activó el bloqueo. SIEMPRE hay escape ("Usar contraseña" → signOut) para
 * que no pueda quedar atrapado si la biometría falla. Verificar en device real (Face ID
 * no funciona en simulador/Expo Go).
 */
export function BiometricLock({ onUnlock }: { onUnlock: () => void }) {
  const { theme } = useTheme()
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function tryUnlock() {
    if (busy) return
    setBusy(true)
    const ok = await authenticate('Desbloqueá EVA')
    setBusy(false)
    if (ok) onUnlock()
  }

  useEffect(() => { tryUnlock() }, [])

  async function usePassword() {
    await signOutAndCleanup()
    onUnlock()
    router.replace('/')
  }

  return (
    <View style={[StyleSheet.absoluteFill, styles.root, { backgroundColor: theme.background }]}>
      <View style={[styles.iconWrap, { backgroundColor: theme.primary + '1A', borderColor: theme.primary + '33', borderRadius: theme.radius['2xl'] }]}>
        <Fingerprint size={32} color={theme.primary} />
      </View>
      <Text style={[styles.title, { color: theme.foreground, fontFamily: 'Montserrat_800ExtraBold' }]}>EVA bloqueada</Text>
      <Text style={[styles.sub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Usá tu rostro o huella para entrar.</Text>
      <TouchableOpacity onPress={tryUnlock} activeOpacity={0.85} disabled={busy} style={[styles.btn, { backgroundColor: theme.primary, opacity: busy ? 0.6 : 1 }]}>
        <Text style={[styles.btnTxt, { color: theme.primaryForeground }]}>Desbloquear</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={usePassword} hitSlop={8} style={styles.link}>
        <Text style={[styles.linkTxt, { color: theme.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>Usar contraseña</Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 36, zIndex: 100 },
  iconWrap: { width: 72, height: 72, alignItems: 'center', justifyContent: 'center', borderWidth: 1, marginBottom: 4 },
  title: { fontSize: 20, letterSpacing: -0.3 },
  sub: { fontSize: 13.5, textAlign: 'center' },
  btn: { paddingHorizontal: 28, paddingVertical: 13, borderRadius: 12, marginTop: 10 },
  btnTxt: { fontSize: 14.5, fontFamily: 'Inter_700Bold' },
  link: { marginTop: 6, padding: 8 },
  linkTxt: { fontSize: 13 },
})
