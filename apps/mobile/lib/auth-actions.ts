import AsyncStorage from '@react-native-async-storage/async-storage'
import { router } from 'expo-router'
import { supabase } from './supabase'
import { revokePushToken } from './push'
import { sessionFlags } from './session-flags'

/**
 * Cierre de sesión central (Ola 0): revoca el push token de ESTE dispositivo
 * (para no recibir push de la cuenta anterior) y limpia flags de sesión, luego
 * signOut. Usar en TODOS los puntos de logout en vez de supabase.auth.signOut() suelto.
 */
export async function signOutAndCleanup(): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) await revokePushToken(user.id, supabase)
  } catch {
    // no-op
  }
  sessionFlags.pwChanged = false
  await supabase.auth.signOut().catch(() => {})
}

/**
 * Logout completo + redirección al inicio. Reúne los tres pasos que TODO punto de
 * logout debe hacer (revocar push + signOut vía signOutAndCleanup, limpiar el rol
 * cacheado y volver a la raíz) para no duplicarlos en cada pantalla. Usa el router
 * imperativo de expo-router para poder vivir fuera de un componente.
 */
export async function signOutAndRedirectHome(): Promise<void> {
  await signOutAndCleanup()
  await AsyncStorage.removeItem('eva_user_role')
  router.replace('/')
}
