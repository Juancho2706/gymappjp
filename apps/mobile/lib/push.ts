import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'
import { Platform } from 'react-native'
import type { SupabaseClient } from '@supabase/supabase-js'

export async function setupAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return
  await Notifications.setNotificationChannelAsync('default', {
    name: 'EVA',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#007AFF',
  })
}

export async function syncPushToken(userId: string, supabase: SupabaseClient): Promise<void> {
  // Current iOS provisioning profile does not include Push Notifications entitlement.
  if (Platform.OS === 'ios') return
  if (!Device.isDevice) return // simulators don't support push tokens

  const { status: existing } = await Notifications.getPermissionsAsync()
  let status = existing
  if (existing !== 'granted') {
    const { status: requested } = await Notifications.requestPermissionsAsync()
    status = requested
  }
  if (status !== 'granted') return

  const token = await Notifications.getExpoPushTokenAsync({
    projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID,
  })

  await supabase.from('push_tokens').upsert(
    {
      user_id: userId,
      device_id: Device.deviceName ?? `${Platform.OS}-${Date.now()}`,
      token: token.data,
      platform: Platform.OS,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,device_id' }
  )
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
