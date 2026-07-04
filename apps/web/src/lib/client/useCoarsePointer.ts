'use client'

import { useEffect, useState } from 'react'

/**
 * `true` cuando el puntero primario es grueso (touch/tablet/móvil), leído vía
 * `matchMedia('(pointer: coarse)')`. Gate del teclado numérico custom de la exec (Fase L · DB-2):
 * en puntero fino (desktop con mouse + teclado físico) el input nativo queda EXACTAMENTE como hoy.
 *
 * Hidratación-safe: arranca en `false` (idéntico al render del server, que no ve `matchMedia`) y se
 * resuelve en un efecto POST-montaje (nunca en el initializer), mismo patrón que la lectura de
 * `omni_autotimer`. Suscribe cambios (p.ej. teclado físico conectado a una tablet).
 */
export function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia('(pointer: coarse)')
    setCoarse(mq.matches)
    const handler = (e: MediaQueryListEvent) => setCoarse(e.matches)
    // addEventListener es lo moderno; addListener es el fallback de Safari viejo.
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', handler)
      return () => mq.removeEventListener('change', handler)
    }
    mq.addListener(handler)
    return () => mq.removeListener(handler)
  }, [])

  return coarse
}
