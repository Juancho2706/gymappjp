import { useCallback, useSyncExternalStore } from 'react'
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native'

/**
 * Hide-on-scroll store for the alumno floating chrome (E1-01).
 *
 * Mirror of the web `ClientNav` hide-on-scroll behaviour: scrolling DOWN past
 * ~80px minimizes the floating capsule (icon-only, narrowed); scrolling UP or
 * returning near the top reveals it. On web the listener lives on `window`; RN
 * has no ambient scroll, so screens must FEED their scroll offset in.
 *
 * This is an external store (same pattern as `lib/entitlements`) so it needs no
 * Provider and works app-wide: the chrome (rendered once as the Tabs `tabBar`)
 * subscribes via `useChromeMinimized()`, and each alumno screen spreads the
 * handler from `useAlumnoScrollHandler()` onto its ScrollView/FlatList
 * `onScroll` (with `scrollEventThrottle={16}`). The API is ready now; screens
 * adopt it as they get re-skinned — until then the capsule simply never
 * minimizes (graceful: it just stays expanded).
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
 * Feed a vertical scroll offset (px) from a screen. Applies the same
 * threshold logic as the web capsule (delta > 6px to react; minimize only
 * when scrolling down past 80px; always reveal near the very top).
 */
export function reportChromeScroll(y: number): void {
  const dy = y - lastY
  if (Math.abs(dy) <= 6) {
    // Tiny deltas: still snap back to revealed once we are at the very top.
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

/** Reset to revealed — call on tab/route change so a new screen starts open. */
export function resetChromeScroll(): void {
  lastY = 0
  if (minimized) {
    minimized = false
    emit()
  }
}

/** Chrome subscribes to the minimized state. */
export function useChromeMinimized(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/**
 * Screens spread the returned handler onto a scrollable's `onScroll` to drive
 * the capsule hide-on-scroll. Stable identity (safe as a prop / dep).
 */
export function useAlumnoScrollHandler(): (e: NativeSyntheticEvent<NativeScrollEvent>) => void {
  return useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    reportChromeScroll(e.nativeEvent.contentOffset.y)
  }, [])
}
