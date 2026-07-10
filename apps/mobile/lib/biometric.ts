import * as LocalAuthentication from 'expo-local-authentication'
import * as SecureStore from 'expo-secure-store'

const PREF_KEY = 'eva_biometric_lock'

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

/** Prompt biométrico. Devuelve true si autenticó. Degrada elegante (false) si falla. */
export async function authenticate(reason = 'Desbloquea EVA'): Promise<boolean> {
  try {
    const res = await LocalAuthentication.authenticateAsync({
      promptMessage: reason,
      fallbackLabel: 'Usar código del teléfono',
      cancelLabel: 'Cancelar',
    })
    return res.success
  } catch {
    return false
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
