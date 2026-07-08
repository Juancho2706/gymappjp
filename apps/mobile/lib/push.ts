import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'
import * as Crypto from 'expo-crypto'
import Constants from 'expo-constants'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Platform } from 'react-native'
import type { SupabaseClient } from '@supabase/supabase-js'

const DEVICE_ID_KEY = 'eva_device_id'

/** ID de dispositivo ESTABLE (persistido). Antes se usaba Date.now() de fallback →
 * no determinista → imposible revocar el token. */
async function getStableDeviceId(): Promise<string> {
  let id = await AsyncStorage.getItem(DEVICE_ID_KEY)
  if (!id) {
    id = `${Platform.OS}-${Crypto.randomUUID()}`
    await AsyncStorage.setItem(DEVICE_ID_KEY, id)
  }
  return id
}

/** Resuelve el EAS projectId desde la config (no de una env var inexistente). */
function getProjectId(): string | undefined {
  return (
    (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ??
    (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId ??
    process.env.EXPO_PUBLIC_EAS_PROJECT_ID
  )
}

export async function setupAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return
  await Notifications.setNotificationChannelAsync('default', {
    name: 'EVA',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    // EVA DS brand accent (sport-500 = rgb 38 128 255). Mirrors --color-brand /
    // --color-sport-500; replaces the legacy system blue #007AFF.
    lightColor: '#2680FF',
  })
}

export async function syncPushToken(userId: string, supabase: SupabaseClient): Promise<void> {
  if (!Device.isDevice) return // simulators don't support push tokens

  const { status: existing } = await Notifications.getPermissionsAsync()
  let status = existing
  if (existing !== 'granted') {
    const { status: requested } = await Notifications.requestPermissionsAsync()
    status = requested
  }
  if (status !== 'granted') return

  const projectId = getProjectId()
  if (!projectId) return // sin projectId getExpoPushTokenAsync lanza → bail limpio

  try {
    const token = await Notifications.getExpoPushTokenAsync({ projectId })
    const deviceId = await getStableDeviceId()
    await supabase.from('push_tokens').upsert(
      {
        user_id: userId,
        device_id: deviceId,
        token: token.data,
        platform: Platform.OS,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,device_id' }
    )
  } catch {
    // no romper el arranque si falla el registro del token
  }
}

/** Revoca el token de ESTE dispositivo (logout / opt-out). Sin esto el device seguía
 * recibiendo push de la cuenta anterior (fuga de datos + ignora la oposición del usuario). */
export async function revokePushToken(userId: string, supabase: SupabaseClient): Promise<void> {
  try {
    const deviceId = await getStableDeviceId()
    await supabase.from('push_tokens').delete().eq('user_id', userId).eq('device_id', deviceId)
  } catch {
    // no-op
  }
}

export function configurePushHandler() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  })
}
