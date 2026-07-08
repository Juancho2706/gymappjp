import { useEffect, useState } from 'react'
import { Text, TouchableOpacity, View } from 'react-native'
import { useRouter } from 'expo-router'
import { Fingerprint } from 'lucide-react-native'
import { authenticate } from '../lib/biometric'
import { signOutAndCleanup } from '../lib/auth-actions'
import { FONT, TYPE, textStyle } from '../lib/typography'

/**
 * Pantalla de bloqueo biométrico (opt-in). Cubre la app cuando hay sesión y
 * el usuario activó el bloqueo. SIEMPRE hay escape ("Usar contraseña" → signOut) para
 * que no pueda quedar atrapado si la biometría falla. Verificar en device real (Face ID
 * no funciona en simulador/Expo Go).
 *
 * EVA DS re-skin (patron A): surfaces/text via token utilities (className) →
 * light/dark en runtime, sin `theme`. La huella usa la brand fill (bg-sport-500)
 * espejando el CTA original; el glyph lucide toma el hex DS de sport-500.
 */
const SPORT_500 = '#2680FF' // DS --color-sport-500 / --color-brand (rgb 38 128 255)

export function BiometricLock({ onUnlock }: { onUnlock: () => void }) {
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
    <View className="absolute inset-0 z-[100] items-center justify-center gap-3 bg-surface-app px-9">
      <View className="mb-1 h-[72px] w-[72px] items-center justify-center rounded-2xl border border-sport-500/30 bg-sport-500/10">
        <Fingerprint size={32} color={SPORT_500} />
      </View>
      <Text className="text-strong" style={TYPE.title}>EVA bloqueada</Text>
      <Text className="text-center text-muted" style={textStyle('sm', FONT.ui)}>Usá tu rostro o huella para entrar.</Text>
      <TouchableOpacity
        onPress={tryUnlock}
        activeOpacity={0.85}
        disabled={busy}
        className="mt-2.5 rounded-control bg-sport-500 px-7 py-3.5"
        style={{ opacity: busy ? 0.6 : 1 }}
      >
        <Text className="text-on-sport" style={TYPE.label}>Desbloquear</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={usePassword} hitSlop={8} className="mt-1.5 p-2">
        <Text className="text-muted" style={textStyle('xs', FONT.uiSemibold)}>Usar contraseña</Text>
      </TouchableOpacity>
    </View>
  )
}
