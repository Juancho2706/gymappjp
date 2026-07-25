/**
 * Preferencia device-local del opt-in de Salud (E6.3). El alumno decide UNA VEZ conectar HealthKit /
 * Health Connect para autocompletar pasos/sueño; la preferencia vive en el dispositivo (AsyncStorage),
 * es revocable, y NO viaja al servidor — los datos de salud se leen on-device y se guardan como
 * hábitos por el flujo manual existente. Sin opt-in no se lee nada del agregador.
 */
import AsyncStorage from '@react-native-async-storage/async-storage'

const HEALTH_OPTIN_KEY = 'eva.health.optin'

export async function getHealthOptIn(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(HEALTH_OPTIN_KEY)) === 'true'
  } catch {
    return false
  }
}

export async function setHealthOptIn(on: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(HEALTH_OPTIN_KEY, on ? 'true' : 'false')
  } catch {
    /* preferencia best-effort */
  }
}
