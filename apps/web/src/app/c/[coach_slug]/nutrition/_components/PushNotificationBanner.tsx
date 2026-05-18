'use client'

import { useEffect, useState } from 'react'
import { Bell } from 'lucide-react'

const DISMISSED_KEY = 'eva:push-dismissed'

function isPushSupported() {
  return (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  )
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length) as Uint8Array<ArrayBuffer>
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

export function PushNotificationBanner() {
  const [permission, setPermission] = useState<NotificationPermission | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!isPushSupported()) return
    setPermission(Notification.permission)
    try {
      const wasDismissed = localStorage.getItem(DISMISSED_KEY) === 'true'
      setDismissed(wasDismissed)
    } catch {
      // localStorage may be unavailable in some contexts
    }
  }, [])

  // Don't render until we know the permission state
  if (!isPushSupported()) return null
  if (permission === null) return null
  if (permission === 'granted') return null
  if (permission === 'denied') return null
  if (dismissed) return null

  async function handleActivate() {
    if (loading) return
    setLoading(true)
    try {
      const result = await Notification.requestPermission()
      setPermission(result)
      if (result !== 'granted') return

      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      if (!vapidKey) {
        console.warn('[PushNotificationBanner] NEXT_PUBLIC_VAPID_PUBLIC_KEY not set')
        return
      }

      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      })

      const json = subscription.toJSON()
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: {
            p256dh: json.keys?.p256dh ?? '',
            auth: json.keys?.auth ?? '',
          },
        }),
      })
    } catch (err) {
      console.error('[PushNotificationBanner] subscribe error:', err)
    } finally {
      setLoading(false)
    }
  }

  function handleDismiss() {
    try {
      localStorage.setItem(DISMISSED_KEY, 'true')
    } catch {
      // ignore
    }
    setDismissed(true)
  }

  return (
    <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3 flex items-center gap-3">
      <div className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-amber-500/20">
        <Bell className="w-4 h-4 text-amber-500" />
      </div>
      <p className="flex-1 text-xs text-amber-700 dark:text-amber-400 font-medium leading-snug">
        Activa recordatorios de comidas
      </p>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={handleDismiss}
          className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Descartar"
        >
          No, gracias
        </button>
        <button
          type="button"
          onClick={handleActivate}
          disabled={loading}
          className="text-[11px] font-semibold bg-amber-500 text-white rounded-lg px-3 py-1.5 hover:bg-amber-600 transition-colors disabled:opacity-50"
        >
          {loading ? 'Activando…' : 'Activar'}
        </button>
      </div>
    </div>
  )
}
