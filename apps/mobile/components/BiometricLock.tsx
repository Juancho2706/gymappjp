import { useEffect, useRef, useState } from 'react'
import { Text, TouchableOpacity, View } from 'react-native'
import { useRouter } from 'expo-router'
import { Fingerprint } from 'lucide-react-native'
import { authenticate, canDeviceSatisfyLock } from '../lib/biometric'
import { signOutAndCleanup } from '../lib/auth-actions'
import { FONT, TYPE, textStyle } from '../lib/typography'

/**
 * Pantalla de bloqueo biométrico (opt-in). Cubre la app cuando hay sesión y
 * el usuario activó el bloqueo. SIEMPRE hay escape ("Usar contraseña" → signOut) para
 * que no pueda quedar atrapado si la biometría falla. Verificar en device real (Face ID
 * no funciona en simulador/Expo Go).
 *
 * 🔴 REGLA (bug alumna 26-08: «se quedó spameando que verificara la cara»): el prompt se dispara
 * UNA sola vez por montaje —y esta pantalla se monta solo al iniciar la app o al volver de un
 * background real, ver `observeAppStateForRelock` en lib/biometric— y NUNCA se re-dispara solo.
 * Cancelar o fallar deja la pantalla quieta con «Volver a intentar»: el reintento es un gesto de
 * la persona, jamás del código.
 *
 * EVA DS re-skin (patron A): surfaces/text via token utilities (className) →
 * light/dark en runtime, sin `theme`. La huella usa la brand fill (bg-sport-500)
 * espejando el CTA original; el glyph lucide toma el hex DS de sport-500.
 */
const SPORT_500 = '#2680FF' // DS --color-sport-500 / --color-brand (rgb 38 128 255)

export function BiometricLock({ onUnlock }: { onUnlock: () => void }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  // El device puede haber perdido la biometría (y el passcode) mientras la app estaba abierta:
  // ahí el prompt no puede terminar bien nunca, así que ni lo abrimos y dejamos a la vista el
  // único camino real. `null` = todavía no sabemos; no dibujamos un estado de error prematuro.
  const [canPrompt, setCanPrompt] = useState<boolean | null>(null)
  // Idempotencia local: el auto-prompt corre UNA vez por montaje (el guard de vuelo real vive
  // en lib/biometric, este ref solo evita el segundo disparo de un re-render/StrictMode).
  const autoStarted = useRef(false)

  async function tryUnlock() {
    if (busy) return
    setBusy(true)
    const ok = await authenticate('Desbloquea EVA')
    setBusy(false)
    if (ok) onUnlock()
    else setFailed(true)
  }

  useEffect(() => {
    if (autoStarted.current) return
    autoStarted.current = true
    let alive = true
    canDeviceSatisfyLock().then((ok) => {
      if (!alive) return
      setCanPrompt(ok)
      if (ok) tryUnlock()
    }).catch(() => {
      if (alive) setCanPrompt(false)
    })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function usePassword() {
    await signOutAndCleanup()
    onUnlock()
    router.replace('/')
  }

  const unavailable = canPrompt === false
  const subtitle = unavailable
    ? 'Tu teléfono ya no tiene rostro, huella ni código configurados. Entra con tu contraseña.'
    : failed
      ? 'No pudimos verificarte. Toca «Volver a intentar» cuando quieras.'
      : 'Usa tu rostro o huella para entrar.'

  return (
    <View className="absolute inset-0 z-[100] items-center justify-center gap-3 bg-surface-app px-9">
      <View className="mb-1 h-[72px] w-[72px] items-center justify-center rounded-2xl border border-sport-500/30 bg-sport-500/10">
        <Fingerprint size={32} color={SPORT_500} />
      </View>
      <Text className="text-strong" style={TYPE.title}>EVA bloqueada</Text>
      <Text className="text-center text-muted" style={textStyle('sm', FONT.ui)}>{subtitle}</Text>
      {unavailable ? null : (
        <TouchableOpacity
          onPress={tryUnlock}
          activeOpacity={0.85}
          disabled={busy}
          className="mt-2.5 rounded-control bg-sport-500 px-7 py-3.5"
          style={{ opacity: busy ? 0.6 : 1 }}
        >
          <Text className="text-on-sport" style={TYPE.label}>{failed ? 'Volver a intentar' : 'Desbloquear'}</Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity onPress={usePassword} hitSlop={8} className="mt-1.5 p-2">
        <Text className="text-muted" style={textStyle('xs', FONT.uiSemibold)}>Usar contraseña</Text>
      </TouchableOpacity>
    </View>
  )
}
