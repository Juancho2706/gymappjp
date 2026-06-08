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
