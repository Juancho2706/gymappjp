/**
 * Paso configurable de los chips de incremento del teclado de peso (RN) — espejo de la web
 * `readKeypadStep`/`writeKeypadStep` (`@eva/workout-engine`).
 *
 * Diferencia de plataforma (igual que `rest-timer-preferences`): web `localStorage` es SÍNCRONO;
 * RN `AsyncStorage` es asíncrono. El teclado necesita el paso en el render (síncrono), así que
 * mantenemos un cache EN MEMORIA hidratado una sola vez y expuesto por un hook con
 * `useSyncExternalStore`. La escritura actualiza el cache al instante y persiste en background.
 *
 * Carril de storage `omni_keypad_step` (mismo nombre que la key de web) y presets/paso default
 * reutilizados de `@eva/workout-engine` → cero drift con la escala de la web.
 */
import { useSyncExternalStore } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { DEFAULT_KEYPAD_STEP, KEYPAD_STEP_KEY, KEYPAD_STEP_PRESETS } from '@eva/workout-engine'

let cache = DEFAULT_KEYPAD_STEP
let hydrated = false
const listeners = new Set<() => void>()

function emit() {
  listeners.forEach((l) => l())
}

function isPreset(n: number): boolean {
  return (KEYPAD_STEP_PRESETS as readonly number[]).includes(n)
}

/**
 * Hidrata el cache desde AsyncStorage. Idempotente y a prueba de fallos: si falla, queda el
 * default (`DEFAULT_KEYPAD_STEP`). Se dispara solo al usar el hook (no bloquea el arranque — el
 * default es usable de inmediato).
 */
function hydrate(): void {
  if (hydrated) return
  hydrated = true
  AsyncStorage.getItem(KEYPAD_STEP_KEY)
    .then((raw) => {
      const n = raw == null ? NaN : Number(raw)
      if (isPreset(n)) {
        cache = n
        emit()
      }
    })
    .catch(() => {
      // Sin persistencia → default. Nunca lanza.
    })
}

function getKeypadStep(): number {
  return cache
}

/** Persiste el paso (kg) si es un preset válido. No-op con valor inválido. */
function setKeypadStep(step: number): void {
  if (!isPreset(step)) return
  cache = step
  emit()
  void AsyncStorage.setItem(KEYPAD_STEP_KEY, String(step)).catch(() => {})
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** Hook: `[paso, setPaso]`. Hidrata al montar y re-renderiza al cambiar el paso en otra instancia. */
export function useKeypadStep(): [number, (step: number) => void] {
  hydrate()
  const step = useSyncExternalStore(subscribe, getKeypadStep, getKeypadStep)
  return [step, setKeypadStep]
}
