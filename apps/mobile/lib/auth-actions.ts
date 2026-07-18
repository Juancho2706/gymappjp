import AsyncStorage from '@react-native-async-storage/async-storage'
import { router } from 'expo-router'
import { supabase } from './supabase'
import { revokePushToken } from './push'
import { sessionFlags } from './session-flags'
import { clearNutritionV2CacheForUser } from './nutrition-v2-cache'
import { clearNutritionV2QueueForUser } from './nutrition-v2-offline'

/**
 * Cierre de sesión central (Ola 0): revoca el push token de ESTE dispositivo
 * (para no recibir push de la cuenta anterior), borra la nutrición V2 del usuario
 * SALIENTE (lecturas cacheadas + cola de mutaciones offline) y limpia flags de sesión,
 * luego signOut. Usar en TODOS los puntos de logout en vez de supabase.auth.signOut() suelto.
 */
/**
 * Cobertura de cierres INVOLUNTARIOS de sesión (token expirado/revocado → SIGNED_OUT sin pasar
 * por signOutAndCleanup): recuerda el último userId visto y, cuando la sesión muere sola,
 * borra la nutrición V2 de ese usuario. Idempotente con la limpieza del logout explícito.
 * Llamar UNA vez al montar la app.
 */
let lastSeenUserId: string | null = null
let janitorRegistered = false
export function registerSessionCacheJanitor(): void {
  if (janitorRegistered) return
  janitorRegistered = true
  supabase.auth.onAuthStateChange((event, session) => {
    if (session?.user?.id) {
      lastSeenUserId = session.user.id
      return
    }
    if (event === 'SIGNED_OUT' && lastSeenUserId) {
      const outgoing = lastSeenUserId
      lastSeenUserId = null
      void Promise.allSettled([
        clearNutritionV2CacheForUser(outgoing),
        clearNutritionV2QueueForUser(outgoing),
      ])
    }
  })
}

export async function signOutAndCleanup(): Promise<void> {
  // Resolvemos el id del usuario SALIENTE ANTES de cerrar la sesión: después se pierde y ya no
  // podríamos revocar el push ni borrar su cache por-usuario. Aislado para que un fallo aquí no
  // impida la limpieza posterior.
  let outgoingUserId: string | null = null
  try {
    const { data: { user } } = await supabase.auth.getUser()
    outgoingUserId = user?.id ?? null
  } catch {
    // no-op: sin id no hay limpieza por-usuario; el signOut de abajo igual corre.
  }

  if (outgoingUserId) {
    // Revoca el push token y borra la nutrición V2 del usuario saliente para que sus datos no
    // queden en el dispositivo para el próximo usuario. Best effort e independiente entre sí:
    // un fallo en cualquiera NO bloquea el cierre de sesión ni a las demás limpiezas.
    await Promise.allSettled([
      revokePushToken(outgoingUserId, supabase),
      clearNutritionV2CacheForUser(outgoingUserId),
      clearNutritionV2QueueForUser(outgoingUserId),
    ])
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
