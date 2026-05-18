import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'
import { Platform } from 'react-native'
import type { SupabaseClient } from '@supabase/supabase-js'

// Requires push_tokens table — migration pending (6B Sem 1)
// CREATE TABLE push_tokens (
//   id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
//   user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
//   device_id text NOT NULL,
//   token text NOT NULL,
//   platform text NOT NULL CHECK (platform IN ('ios', 'android')),
//   created_at timestamptz DEFAULT now(),
//   updated_at timestamptz DEFAULT now(),
//   UNIQUE (user_id, device_id)
// );

export async function syncPushToken(userId: string, supabase: SupabaseClient): Promise<void> {
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
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
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
