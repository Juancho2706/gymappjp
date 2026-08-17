'use client'

import { useSyncExternalStore } from 'react'

/**
 * Memoria de la Guía Viva (SPEC `nutrition-onboarding-tour`, D4) — «por coach, por tour,
 * versionada, sin backend».
 *
 * Clave: `eva.tour.<tourId>.v1.<coachId>` en `localStorage`. La versión va EN la clave y no adentro
 * del valor para que subir a `v2` (cuando el guion cambie de verdad) re-arranque el tour una sola
 * vez sin migrar nada: la clave vieja simplemente deja de consultarse.
 *
 * Backend cero: esto no viaja a Supabase ni a ninguna API. El costo asumido es conocido y está en
 * la SPEC — un coach que cambia de navegador vuelve a ver la guía una vez.
 */

/** Versión del guion. Subirla re-arranca los tours una vez para todos (D4). */
export const TOUR_FLAG_VERSION = 'v1'

const TOUR_FLAG_PREFIX = 'eva.tour'

/** Valor escrito. Solo importa que exista y sea este literal; el `1` deja lugar a futuros estados. */
const TOUR_FLAG_VALUE = '1'

/**
 * Sin coach identificado (harness, sesión a medio hidratar) la memoria cae en un cajón propio en
 * vez de escribir `…v1.null` y mezclar a todos en la misma clave.
 */
const ANONYMOUS_COACH = 'anon'

export function tourFlagKey(tourId: string, coachId: string | null | undefined): string {
  const coach = coachId && coachId.trim() !== '' ? coachId : ANONYMOUS_COACH
  return `${TOUR_FLAG_PREFIX}.${tourId}.${TOUR_FLAG_VERSION}.${coach}`
}

/**
 * ¿Este coach ya vio este tour?
 *
 * Devuelve `true` cuando NO se puede saber (server render, `localStorage` bloqueado por el modo
 * privado de Safari o por la política de cookies de terceros). Es fail-closed a propósito: si la
 * memoria no funciona, la alternativa sería auto-arrancar el tour en CADA entrada al editor, que es
 * exactamente la clase de insistencia que D4 prohíbe («Saltar» y «Listo» marcan igual, no se
 * insiste). Un coach que nunca ve el auto-arranque todavía tiene el «?» a mano; uno al que el tour
 * le salta encima cada vez, no tiene escapatoria.
 */
export function hasSeenTour(tourId: string, coachId: string | null | undefined): boolean {
  if (typeof window === 'undefined') return true
  try {
    return window.localStorage.getItem(tourFlagKey(tourId, coachId)) === TOUR_FLAG_VALUE
  } catch {
    return true
  }
}

/** Marca el tour como visto. Lo llaman TANTO «Listo» como «Saltar» (D4). */
export function markTourSeen(tourId: string, coachId: string | null | undefined): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(tourFlagKey(tourId, coachId), TOUR_FLAG_VALUE)
  } catch {
    // Escritura bloqueada: el tour ya se mostró y se cerró, no hay nada que rescatar acá.
  }
  emitTourFlagChange()
}

/**
 * Borra la memoria de un tour. NO es una afordancia de producto: existe para el harness y para el
 * QA, que necesitan repetir el auto-arranque sin limpiar el `localStorage` entero a mano.
 */
export function clearTourSeen(tourId: string, coachId: string | null | undefined): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(tourFlagKey(tourId, coachId))
  } catch {
    // idem `markTourSeen`.
  }
  emitTourFlagChange()
}

/* ------------------------------------------------------------------------------------------------
 * Suscripción para React
 *
 * `localStorage` no avisa cambios en la MISMA pestaña (el evento `storage` es solo entre pestañas),
 * así que la notificación local va por un set de listeners propio. Las dos fuentes se unen en
 * `subscribeTourFlags` para que el pulso del «?» se apague en el instante en que el tour termina,
 * y también cuando el coach lo terminó en otra pestaña.
 * ---------------------------------------------------------------------------------------------- */

const listeners = new Set<() => void>()

function emitTourFlagChange(): void {
  for (const listener of listeners) listener()
}

function subscribeTourFlags(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange)
  window.addEventListener('storage', onStoreChange)
  return () => {
    listeners.delete(onStoreChange)
    window.removeEventListener('storage', onStoreChange)
  }
}

/**
 * Snapshot de SERVIDOR: siempre «ya visto».
 *
 * Es la mitad hydration-safe del asunto (familia EVA-NEXTJS-18): el HTML servido nunca puede saber
 * qué hay en el `localStorage` del coach, así que se sirve la versión sin pulso y React re-renderiza
 * después de hidratar con el valor real. El mismo patrón de `@/lib/use-reduced-motion` y del gate de
 * puntero fino de `MacroSparkPopover`.
 */
function getTourSeenServerSnapshot(): boolean {
  return true
}

/**
 * Hook hydration-safe del flag. Lo usa el «?» para decidir el pulso (D2: «pulso suave solo hasta el
 * primer uso del tour de esa superficie»).
 */
export function useHasSeenTour(tourId: string, coachId: string | null | undefined): boolean {
  return useSyncExternalStore(
    subscribeTourFlags,
    () => hasSeenTour(tourId, coachId),
    getTourSeenServerSnapshot,
  )
}
