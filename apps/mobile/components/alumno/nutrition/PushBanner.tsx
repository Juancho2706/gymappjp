import { useEffect, useState } from 'react'
import { Text, TouchableOpacity, View } from 'react-native'
import { Bell, X } from 'lucide-react-native'
import * as Notifications from 'expo-notifications'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '../../../lib/supabase'
import { syncPushToken } from '../../../lib/push'
import { FONT } from '../../../lib/typography'
import { EMBER_500, EMBER_700 } from './types'

const DISMISSED_KEY = 'eva:nutrition-push-dismissed'

/**
 * PushBanner (E4-17, gap 2.17) — recordatorios de nutrición in-screen, espejo del
 * web `PushNotificationBanner`. En RN el push es nativo (expo-notifications): el
 * banner solo aparece si el permiso NO está concedido y no fue descartado. El
 * botón dispara `syncPushToken` (pide permiso + registra el token). Descarte
 * persistente en AsyncStorage. Degrada a null si no hay `userId`.
 */
export function PushBanner({ userId }: { userId: string | null }) {
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const [{ status }, dismissed] = await Promise.all([
          Notifications.getPermissionsAsync(),
          AsyncStorage.getItem(DISMISSED_KEY),
        ])
        if (!mounted) return
        setShow(status !== 'granted' && dismissed !== 'true')
      } catch {
        /* sin permisos legibles → no mostrar */
      }
    })()
    return () => {
      mounted = false
    }
  }, [])

  if (!userId || !show) return null

  async function handleActivate() {
    if (loading || !userId) return
    setLoading(true)
    try {
      await syncPushToken(userId, supabase)
      const { status } = await Notifications.getPermissionsAsync()
      if (status === 'granted') setShow(false)
    } catch {
      /* best-effort */
    } finally {
      setLoading(false)
    }
  }

  async function handleDismiss() {
    setShow(false)
    try {
      await AsyncStorage.setItem(DISMISSED_KEY, 'true')
    } catch {
      /* best-effort */
    }
  }

  return (
    <View
      testID="nutrition-push-banner"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderWidth: 1,
        borderColor: EMBER_500 + '38',
        backgroundColor: EMBER_500 + '14',
        borderRadius: 16,
        paddingVertical: 12,
        paddingHorizontal: 14,
      }}
    >
      <View style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: EMBER_500 + '26' }}>
        <Bell size={17} color={EMBER_700} strokeWidth={2.25} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text className="text-strong" style={{ fontFamily: FONT.uiBold, fontSize: 13 }}>
          Recordatorios de comidas
        </Text>
        <Text className="text-muted" style={{ fontFamily: FONT.ui, fontSize: 11, marginTop: 1 }} numberOfLines={2}>
          Activa notificaciones para no saltarte tus comidas del plan.
        </Text>
      </View>
      <TouchableOpacity
        testID="nutrition-push-activate"
        onPress={handleActivate}
        disabled={loading}
        activeOpacity={0.85}
        style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: EMBER_500 }}
      >
        <Text style={{ fontFamily: FONT.uiBold, fontSize: 12, color: '#FFFFFF' }}>{loading ? '…' : 'Activar'}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={handleDismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} activeOpacity={0.7}>
        <X size={16} color={EMBER_700} strokeWidth={2} />
      </TouchableOpacity>
    </View>
  )
}
