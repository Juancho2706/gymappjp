/**
 * Nutrición V2 · claims persistentes de celebración (AsyncStorage).
 *
 * Sidecar impuro de `nutrition-v2-celebrations.ts` (que es puro/testeable). Aquí
 * viven los "claim" atómicos: leer la marca, y si no existe, escribirla y
 * devolver `true` (esta invocación GANA el derecho a celebrar). Idempotentes.
 *
 * Fail-CLOSED intencional: si el storage falla NO celebramos (devolvemos
 * `false`). Sin persistir la marca no podemos garantizar el "solo una vez", y
 * preferimos silencio antes que spamear la celebración en cada intento.
 */
import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  dayClosedDailyKey,
  mealLoggedDailyKey,
  scannerHitKey,
} from './nutrition-v2-celebrations'

const MARK = '1'

/**
 * Reclama una marca por su clave: si aún no está seteada, la persiste y devuelve
 * `true` (primer claim → corresponde celebrar). Si ya estaba o el storage falla,
 * devuelve `false`. Nunca lanza.
 */
async function claim(key: string): Promise<boolean> {
  try {
    const existing = await AsyncStorage.getItem(key)
    if (existing != null) return false
    await AsyncStorage.setItem(key, MARK)
    return true
  } catch {
    return false
  }
}

/** Primer registro exitoso del día (por usuario+fecha). */
export function claimMealLoggedCelebration(userId: string, localDate: string): Promise<boolean> {
  return claim(mealLoggedDailyKey(userId, localDate))
}

/** Cierre del día (por usuario+fecha). */
export function claimDayCloseCelebration(userId: string, localDate: string): Promise<boolean> {
  return claim(dayClosedDailyKey(userId, localDate))
}

/** Primer escaneo con hit — una sola vez absoluta (por usuario). */
export function claimScannerHitCelebration(userId: string): Promise<boolean> {
  return claim(scannerHitKey(userId))
}
