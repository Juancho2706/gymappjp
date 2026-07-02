'use client'

import { useEffect } from 'react'
import { setAppBadge, clearAppBadge } from '@/lib/client/app-badge'

/**
 * Sincroniza el badge del ícono de la PWA con un conteo de "algo te espera"
 * (research P16). Se monta desde un Server Component que ya conoce el dato
 * (ej. check-in pendiente en el CheckInBanner). No renderiza nada.
 *
 * Progressive enhancement: el helper es no-op donde el Badging API no existe,
 * así que este componente es seguro en cualquier navegador.
 */
export function AppBadgeSync({ count }: { count: number }) {
  useEffect(() => {
    if (count > 0) setAppBadge(count)
    else clearAppBadge()
  }, [count])
  return null
}
