import { useCallback, useEffect, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'

/**
 * Memoria de la Guía Viva en RN (SPEC `nutrition-onboarding-tour`, D4) — «por coach, por tour,
 * versionada, sin backend». Espejo de `apps/web/src/components/nutrition-v2/tour/tour-flags.ts`.
 *
 * **La clave es IDÉNTICA a la de web** (`eva.tour.<tourId>.v1.<coachId>`) por decisión de la SPEC,
 * no por comodidad: el guion es el mismo y la versión vive EN la clave, así que subir a `v2` cuando
 * el guion cambie de verdad re-arranca el tour una sola vez en las cuatro superficies con UN solo
 * cambio de literal. Nótese que NO sigue el prefijo `eva:` con dos puntos de los respaldos del
 * quick-edit (`nutrition-coach-draft-store.ts`): esos son borradores de RN y solo de RN; esto es un
 * contrato compartido con la web y se escribe como la web lo escribe.
 *
 * Divergencia de PLATAFORMA (la única): `localStorage` es SÍNCRONO y `AsyncStorage` es
 * `Promise`-based, así que las lecturas/escrituras son `async`. Misma degradación best-effort que
 * el store de borradores: si el storage falla, no se rompe ninguna pantalla.
 *
 * Backend cero: esto no viaja a Supabase ni a ninguna API. El costo asumido está en la SPEC — un
 * coach que reinstala la app vuelve a ver la guía una vez.
 */

/** Versión del guion. Subirla re-arranca los tours una vez para todos (D4). */
export const TOUR_FLAG_VERSION = 'v1'

const TOUR_FLAG_PREFIX = 'eva.tour'

/** Valor escrito. Solo importa que exista y sea este literal; el `1` deja lugar a futuros estados. */
const TOUR_FLAG_VALUE = '1'

/**
 * Sin coach identificado (branding a medio hidratar) la memoria cae en un cajón propio en vez de
 * escribir `…v1.null` y mezclar a todos en la misma clave. Las superficies NO deberían auto-arrancar
 * antes de resolver la identidad (ver `useTourController`), así que este cajón es la red, no el
 * camino normal.
 */
const ANONYMOUS_COACH = 'anon'

export function tourFlagKey(tourId: string, coachId: string | null | undefined): string {
  const coach = coachId && coachId.trim() !== '' ? coachId : ANONYMOUS_COACH
  return `${TOUR_FLAG_PREFIX}.${tourId}.${TOUR_FLAG_VERSION}.${coach}`
}

/**
 * ¿Este coach ya vio este tour?
 *
 * Devuelve `true` cuando NO se puede saber (storage caído). Es fail-closed a propósito, igual que
 * en web: si la memoria no funciona, la alternativa sería auto-arrancar el tour en CADA entrada al
 * editor, que es exactamente la insistencia que D4 prohíbe («Saltar» y «Listo» marcan igual, no se
 * insiste). Un coach que nunca ve el auto-arranque todavía tiene el «?» a mano; uno al que el tour
 * le salta encima cada vez, no tiene escapatoria.
 */
export async function hasSeenTour(
  tourId: string,
  coachId: string | null | undefined,
): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(tourFlagKey(tourId, coachId))) === TOUR_FLAG_VALUE
  } catch {
    return true
  }
}

/** Marca el tour como visto. Lo llaman TANTO «Listo» como «Saltar» (D4). */
export async function markTourSeen(
  tourId: string,
  coachId: string | null | undefined,
): Promise<void> {
  try {
    await AsyncStorage.setItem(tourFlagKey(tourId, coachId), TOUR_FLAG_VALUE)
  } catch {
    // Escritura bloqueada: el tour ya se mostró y se cerró, no hay nada que rescatar acá.
  }
  emitTourFlagChange()
}

/**
 * Borra la memoria de un tour. NO es una afordancia de producto: existe para el QA en dispositivo,
 * que necesita repetir el auto-arranque sin desinstalar la app.
 */
export async function clearTourSeen(
  tourId: string,
  coachId: string | null | undefined,
): Promise<void> {
  try {
    await AsyncStorage.removeItem(tourFlagKey(tourId, coachId))
  } catch {
    // idem `markTourSeen`.
  }
  emitTourFlagChange()
}

/* ------------------------------------------------------------------------------------------------
 * Suscripción para React
 *
 * `AsyncStorage` no notifica cambios: la única forma de que el pulso del «?» se apague en el mismo
 * instante en que el tour termina es un set de listeners propio. (En web hay además el evento
 * `storage` entre pestañas; en un teléfono no hay segunda pestaña que sincronizar.)
 * ---------------------------------------------------------------------------------------------- */

const listeners = new Set<() => void>()

function emitTourFlagChange(): void {
  for (const listener of listeners) listener()
}

/**
 * Hook del flag para el «?» (D2: «pulso suave solo hasta el primer uso del tour de esa superficie»).
 *
 * Arranca en `true` — o sea, SIN pulso — porque la lectura es asíncrona: asumir «no visto» pintaría
 * un pulso de un frame a todo coach que ya hizo el tour, que es justo la insistencia que D4 evita.
 * Mismo criterio que el snapshot de servidor del hook web.
 */
export function useHasSeenTour(tourId: string, coachId: string | null | undefined): boolean {
  const [seen, setSeen] = useState(true)

  const read = useCallback(
    (apply: (value: boolean) => void) => {
      void hasSeenTour(tourId, coachId).then(apply)
    },
    [tourId, coachId],
  )

  useEffect(() => {
    let active = true
    const refresh = () => read((value) => { if (active) setSeen(value) })
    refresh()
    listeners.add(refresh)
    return () => {
      active = false
      listeners.delete(refresh)
    }
  }, [read])

  return seen
}
