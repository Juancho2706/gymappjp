import { useCallback, useSyncExternalStore, type ReactNode } from 'react'
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native'

/**
 * Hide-on-scroll store para la cápsula flotante del coach.
 *
 * Puerto 1:1 del patrón external-store del alumno (`lib/alumno-chrome-scroll.ts`):
 * el estado vive a nivel de MÓDULO (no en un Provider con `useState`), así que
 * las pantallas ALIMENTAN su offset vía `onScroll` (identidad estable → NUNCA
 * re-renderizan al minimizar) y SÓLO la cápsula se suscribe a `minimized`
 * (`useSyncExternalStore`) para alimentar un shared value de Reanimated. Antes el
 * Provider guardaba `minimized` en `useState` → cada toggle re-renderizaba TODAS
 * las pantallas coach y reiniciaba el spring del indicador contra un blanco móvil
 * (el rebote irregular reportado). Semántica idéntica al alumno: delta > 6px para
 * reaccionar, minimiza sólo bajando y > 80px, revela cerca del tope; sólo emite
 * en cambios reales.
 *
 * La API pública que consumen las pantallas (`useCoachTabbarScroll().onScroll`) y
 * el Provider (montado en `coach/(tabs)/_layout.tsx`) se conservan; el Provider
 * pasa a ser un passthrough porque el store ya no necesita contexto.
 */

let minimized = false
let lastY = 0
const listeners = new Set<() => void>()

function emit(): void {
  for (const l of listeners) l()
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

function getSnapshot(): boolean {
  return minimized
}

/**
 * Alimenta un offset vertical (px) desde una pantalla. Misma lógica de umbral que
 * la cápsula del alumno (delta > 6px para reaccionar; minimiza sólo bajando y >
 * 80px; siempre revela cerca del tope).
 */
export function reportCoachTabbarScroll(y: number): void {
  const dy = y - lastY
  if (Math.abs(dy) <= 6) {
    // Deltas mínimos: aún así revela al llegar al tope.
    if (y <= 4 && minimized) {
      minimized = false
      lastY = y
      emit()
    }
    return
  }
  const next = dy > 0 && y > 80
  lastY = y
  if (next !== minimized) {
    minimized = next
    emit()
  }
}

/** Vuelve a "revelado" — llamar al cambiar de tab/ruta para que la nueva pantalla arranque abierta. */
export function resetCoachTabbarScroll(): void {
  lastY = 0
  if (minimized) {
    minimized = false
    emit()
  }
}

/** Sólo la cápsula (CoachMobileTabBar) se suscribe al estado minimizado. */
export function useCoachTabbarMinimized(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

type CoachTabbarScrollValue = {
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void
  reportScrollY: (y: number) => void
  reset: () => void
}

/**
 * API estable que consumen las pantallas coach: NO se suscribe a `minimized`
 * (identidad estable de `onScroll`), por lo que las pantallas nunca re-renderizan
 * al minimizar. La cápsula lee el estado con `useCoachTabbarMinimized()`.
 */
export function useCoachTabbarScroll(): CoachTabbarScrollValue {
  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    reportCoachTabbarScroll(event.nativeEvent.contentOffset.y)
  }, [])
  const reportScrollY = useCallback((y: number) => {
    reportCoachTabbarScroll(y)
  }, [])
  const reset = useCallback(() => {
    resetCoachTabbarScroll()
  }, [])
  return { onScroll, reportScrollY, reset }
}

/**
 * Passthrough: el store es a nivel de módulo, ya no necesita contexto. Se conserva
 * para no tocar `coach/(tabs)/_layout.tsx` ni la API pública del Provider.
 */
export function CoachTabbarScrollProvider({ children }: { children: ReactNode }) {
  return <>{children}</>
}
