'use client'

import { useCallback, useEffect, useState } from 'react'
import type { NotifPermissionState } from '@eva/workout-engine'
import { BRAND_APP_ICON } from '@/lib/brand-assets'

/**
 * Permiso de notificaciones del navegador para el aviso de fin de descanso (hallazgo D, 2026-09-02).
 *
 * La alerta final ya existe y funciona (`RestTimer.tsx` → `registration.showNotification('¡Descanso
 * listo!'…)`, montado en V3 vía `WorkoutTimerProvider`), pero está gateada por
 * `Notification.permission === 'granted'` y NUNCA promptea en medio del entreno — deliberado. El
 * único botón que pedía el permiso vivía en `WorkoutTimerSettingsPanel`, cuyo disparador está en el
 * header legacy que V3 oculta ⇒ un alumno que entra directo al ejecutor V3 no tenía forma de
 * concederlo. Este hook es la pieza reusable que consume la fila del sheet V3.
 *
 * `permission` arranca en `null` = cargando (evita el flash de "Sin permiso" antes de leer el estado
 * real). Se relee al volver a la pestaña Y cada vez que `active` pasa a `true`.
 *
 * `active` = «la fila se está mirando ahora» (el sheet abierto). Hace falta porque el sheet se monta
 * con TODA la sesión V3 (`WorkoutExecutionClient` lo monta condicionado a `execV3Active`, no a
 * `open`): leer sólo al montar dejaba la fila congelada en «Bloqueado en el navegador» cuando el
 * alumno destrababa el permiso desde el candado de Chrome desktop sin cambiar de pestaña —
 * `visibilitychange` no dispara en ese caso. Por omisión es `true` (call sites que sí montan/
 * desmontan con la vista).
 */
export function useNotificationPermission(active: boolean = true): {
  permission: NotifPermissionState | null
  request: () => Promise<void>
} {
  const [permission, setPermission] = useState<NotifPermissionState | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!active) return
    if (!('Notification' in window)) {
      setPermission('unsupported')
      return
    }
    const read = () => setPermission(Notification.permission)
    read()
    const onVisible = () => {
      if (document.visibilityState === 'visible') read()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
    // `active` en las deps: al abrir el sheet se vuelve a leer `Notification.permission`.
  }, [active])

  const request = useCallback(async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return
    // requestPermission siempre resuelve con el estado final (incluso 'denied' si ya estaba bloqueado).
    const result = await Notification.requestPermission()
    setPermission(result)
    if (result !== 'granted') return
    // PWA/Android: las notificaciones de página sólo van vía el service worker (`new Notification()`
    // lanza "Illegal constructor"). Confirmación en try/catch silencioso: si el SW no está listo el
    // permiso quedó igual concedido.
    try {
      const reg = await navigator.serviceWorker?.getRegistration()
      await reg?.showNotification('¡Notificaciones activadas!', {
        body: 'El cronómetro te avisará cuando termine el descanso.',
        icon: BRAND_APP_ICON,
      })
    } catch {
      // sin service worker o showNotification no disponible.
    }
  }, [])

  return { permission, request }
}
