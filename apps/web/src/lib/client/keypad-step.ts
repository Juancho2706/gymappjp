/**
 * Persistencia web (localStorage) del paso configurable de los chips del keypad.
 * La lógica pura y los presets viven en @eva/workout-engine (keypad-logic.ts);
 * este módulo existe porque el package no puede depender de APIs de browser.
 * Mobile persiste el mismo carril `omni_keypad_step` vía AsyncStorage.
 */
import { DEFAULT_KEYPAD_STEP, KEYPAD_STEP_KEY, KEYPAD_STEP_PRESETS } from '@eva/workout-engine'

/** Lee el paso persistido (kg), validado contra los presets; default `DEFAULT_KEYPAD_STEP`. */
export function readKeypadStep(): number {
  if (typeof window === 'undefined') return DEFAULT_KEYPAD_STEP
  const raw = localStorage.getItem(KEYPAD_STEP_KEY)
  const n = raw == null ? NaN : Number(raw)
  return (KEYPAD_STEP_PRESETS as readonly number[]).includes(n) ? n : DEFAULT_KEYPAD_STEP
}

/** Persiste el paso (kg) si es un preset válido. No-op fuera del browser o con valor inválido. */
export function writeKeypadStep(step: number): void {
  if (typeof window === 'undefined') return
  if (!(KEYPAD_STEP_PRESETS as readonly number[]).includes(step)) return
  localStorage.setItem(KEYPAD_STEP_KEY, String(step))
}
