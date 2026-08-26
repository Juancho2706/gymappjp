import * as LocalAuthentication from 'expo-local-authentication'
import * as SecureStore from 'expo-secure-store'

const PREF_KEY = 'eva_biometric_lock'

/**
 * Estados del ciclo de vida de la app. Espejo EXACTO de `AppStateStatus` de react-native
 * (RN 0.81), declarado acá para que este módulo no importe react-native: es lógica pura y
 * así se puede testear con el runner del repo.
 */
export type AppLifecycleState = 'inactive' | 'background' | 'active' | 'extension' | 'unknown'

/**
 * 🔴 CAUSA RAÍZ del loop de Face ID (reporte de alumna, iPhone, 26-08): el prompt biométrico
 * ES una transición de ciclo de vida. En iOS la app pasa a `inactive` mientras el prompt está
 * arriba y vuelve a `active` al cerrarse; en varios OEM Android el prompt directamente manda la
 * app a `background`. Si el bloqueo se re-arma en CADA `active`, el cierre del propio prompt
 * re-arma el bloqueo, que vuelve a abrir el prompt: loop infinito, app inutilizable.
 *
 * Dos capas para cortarlo, porque ninguna alcanza sola:
 *   1. LATCH `sawBackground`: solo re-armamos si vimos un background REAL desde la última vez
 *      que estuvimos al frente. No sirve mirar el estado previo: iOS entrega
 *      `background → inactive → active` al volver, así que el previo es `inactive` tanto en la
 *      vuelta real como en el cierre del prompt.
 *   2. ESCUDO de prompt: mientras hay un prompt en vuelo —y un rato después de cerrarse— se
 *      ignora todo cambio de AppState. Cubre a Android, donde el prompt sí manda a background.
 */
let promptInFlight = false
let promptSettledAt = 0
let sawBackground = false

/**
 * Ventana de gracia tras cerrar el prompt. El evento de resume puede llegar unos ms después de
 * que `authenticateAsync` resolvió (sobre todo en Android), así que el escudo sobrevive al
 * prompt. Costo: si el usuario manda la app a background dentro de este lapso justo después de
 * desbloquear, esa salida no re-arma el bloqueo.
 */
export const PROMPT_APPSTATE_GRACE_MS = 1500

/** ¿Estamos dentro del ruido de AppState que genera el propio prompt? */
export function isPromptShieldingAppState(now: number = Date.now()): boolean {
  return promptInFlight || now - promptSettledAt < PROMPT_APPSTATE_GRACE_MS
}

/**
 * Máquina de re-armado. Se le pasa CADA cambio de AppState; devuelve `true` solo cuando la app
 * vuelve de un background real y toca volver a pedir verificación.
 */
export function observeAppStateForRelock(next: AppLifecycleState, now: number = Date.now()): boolean {
  if (next === 'background') {
    // Un background causado por el propio prompt no es una salida de la app.
    if (!isPromptShieldingAppState(now)) sawBackground = true
    return false
  }
  if (next !== 'active') return false
  const relock = sawBackground && !isPromptShieldingAppState(now)
  sawBackground = false
  return relock
}

/** Solo para tests: limpia el estado de módulo (escudo + latch). */
export function __resetBiometricLifecycleForTests(): void {
  promptInFlight = false
  promptSettledAt = 0
  sawBackground = false
}

/** ¿El device tiene hardware biométrico Y el usuario lo tiene enrolado? */
export async function isBiometricAvailable(): Promise<boolean> {
  try {
    const [hasHw, enrolled] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
    ])
    return hasHw && enrolled
  } catch {
    return false
  }
}

/**
 * ¿El device puede SATISFACER el bloqueo hoy? Biometría enrolada o, en su defecto, el passcode
 * del sistema (`authenticateAsync` cae solo a passcode cuando no hay biometría). Si no hay
 * ninguna de las dos, el prompt nunca puede terminar en éxito: armar el bloqueo dejaría a la
 * persona encerrada con «Usar contraseña» (cerrar sesión) como única salida.
 */
export async function canDeviceSatisfyLock(): Promise<boolean> {
  try {
    return (await LocalAuthentication.getEnrolledLevelAsync()) !== LocalAuthentication.SecurityLevel.NONE
  } catch {
    return false
  }
}

/**
 * ¿Corresponde armar el bloqueo ahora? Pref opt-in activa Y device capaz de satisfacerlo.
 * Único camino para pasar `locked` a true: si el device perdió la biometría (y no tiene
 * passcode), degradamos a NO bloquear en vez de encerrar a nadie.
 */
export async function shouldArmBiometricLock(): Promise<boolean> {
  if (!(await isBiometricLockEnabled())) return false
  return canDeviceSatisfyLock()
}

/**
 * Prompt biométrico. Devuelve true si autenticó. Degrada elegante (false) si falla, se cancela
 * o el device no puede.
 *
 * IDEMPOTENTE: jamás dos prompts en vuelo. Una segunda llamada mientras el primero está abierto
 * devuelve false sin abrir nada — quien la hizo simplemente no desbloquea, y el prompt que ya
 * está arriba sigue siendo el que manda.
 */
export async function authenticate(reason = 'Desbloquea EVA'): Promise<boolean> {
  if (promptInFlight) return false
  promptInFlight = true
  try {
    const res = await LocalAuthentication.authenticateAsync({
      promptMessage: reason,
      fallbackLabel: 'Usar código del teléfono',
      cancelLabel: 'Cancelar',
    })
    return res.success
  } catch {
    return false
  } finally {
    promptInFlight = false
    promptSettledAt = Date.now()
  }
}

/** Preferencia opt-in del usuario (guardada en Keychain/Keystore — valor chico, sin riesgo de tamaño). */
export async function isBiometricLockEnabled(): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(PREF_KEY)) === '1'
  } catch {
    return false
  }
}

export async function setBiometricLockEnabled(on: boolean): Promise<void> {
  try {
    if (on) await SecureStore.setItemAsync(PREF_KEY, '1')
    else await SecureStore.deleteItemAsync(PREF_KEY)
  } catch {
    // no-op
  }
}
