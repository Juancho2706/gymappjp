'use client'

import { useEffect, useState } from 'react'
import { Bell } from 'lucide-react'

/**
 * Pedido de permiso de push del alumno (PWA).
 *
 * Vivia dentro de la ruta V1 (`c/[coach_slug]/nutrition/_components/`), asi que la superficie
 * V2 —hoy el estandar del producto— jamas pedia permiso: el alumno tenia el recordatorio de
 * comidas apagado sin saberlo. Se movio aca (componente neutro, sin datos de dominio) para
 * montarlo en AMBAS rutas sin romper el gate de fronteras V2, que prohibe importar
 * `nutrition/_components/` desde V2 (`scripts/check-nutrition-v2-boundaries.mjs`).
 *
 * La persistencia se conserva tal cual: misma clave de descarte, asi que quien ya lo descarto
 * o ya dio permiso no lo vuelve a ver al cambiar de superficie.
 */

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
    <div className="flex items-center gap-3 rounded-control border border-warning-500/25 bg-warning-100 p-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-warning-500/20">
        <Bell className="h-4 w-4 text-warning-600" />
      </div>
      <p className="flex-1 text-xs font-medium leading-snug text-warning-700">
        Activa recordatorios de comidas
      </p>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={handleDismiss}
          className="text-[11px] text-muted transition-colors hover:text-strong"
          aria-label="Descartar"
        >
          No, gracias
        </button>
        <button
          type="button"
          onClick={handleActivate}
          disabled={loading}
          className="rounded-lg bg-warning-500 px-3 py-1.5 text-[11px] font-semibold text-[var(--text-on-warning)] transition-colors hover:bg-warning-600 disabled:opacity-50"
        >
          {loading ? 'Activando…' : 'Activar'}
        </button>
      </div>
    </div>
  )
}
