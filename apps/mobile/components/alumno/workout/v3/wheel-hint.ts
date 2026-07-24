/**
 * Hint "una sola vez" de la captura dual del ejecutor V3 (E2.5) — la pill
 * "Tap = teclado · Manten presionado = rueda" se muestra hasta que el alumno
 * usa la rueda o cierra la pill; a partir de ahi queda descartada para siempre.
 *
 * Mismo patron que `keypad-step-preference`: `AsyncStorage` es asincrono pero la
 * UI necesita saber en el render si mostrar la pill, asi que se mantiene un cache
 * en memoria hidratado una sola vez y expuesto por `useSyncExternalStore`. La
 * escritura marca el cache al instante y persiste en background (best-effort).
 *
 * Carril de storage `eva:wheel-hint-v1` (decision CEO). Fail-safe: si la lectura
 * falla, la pill sigue visible (el hint es informativo, no bloquea nada).
 */
import { useSyncExternalStore } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'

const WHEEL_HINT_KEY = 'eva:wheel-hint-v1'

let dismissed = false
let hydrated = false
const listeners = new Set<() => void>()

function emit() {
  listeners.forEach((l) => l())
}

/** Hidrata el cache una sola vez desde AsyncStorage. Idempotente; nunca lanza. */
function hydrate(): void {
  if (hydrated) return
  hydrated = true
  AsyncStorage.getItem(WHEEL_HINT_KEY)
    .then((raw) => {
      if (raw != null) {
        dismissed = true
        emit()
      }
    })
    .catch(() => {
      // Sin persistencia → la pill sigue visible (informativa). Nunca lanza.
    })
}

function getSnapshot(): boolean {
  return dismissed
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** Descarta el hint para siempre (usar la rueda o cerrar la pill). Idempotente. */
export function dismissWheelHint(): void {
  if (dismissed) return
  dismissed = true
  emit()
  void AsyncStorage.setItem(WHEEL_HINT_KEY, '1').catch(() => {})
}

/** Hook: `true` si el hint ya fue descartado. Hidrata al montar y re-renderiza al cambiar. */
export function useWheelHintDismissed(): boolean {
  hydrate()
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
