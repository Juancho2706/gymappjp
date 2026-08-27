/**
 * Lógica pura del teclado numérico custom de la exec (Fase L · workstream B).
 *
 * Extraído a `@eva/workout-engine` en la ola de paridad RN (specs/rn-mobile-parity-redesign) para
 * que web (`WorkoutKeypadProvider`/`NumericKeypadSheet`) y mobile (`TypedKeypad`) compartan la
 * MISMA manipulación de texto sin drift: append de dígitos, coma decimal es-CL, backspace e
 * incrementos son funciones puras → testeables sin DOM y reusables por ambas superficies. El
 * teclado escribe `es-CL` (coma decimal); el submit normaliza `,`→`.` antes de leer, así que el
 * pipeline de submit/offline queda intacto.
 *
 * Regla de negocio (DB-4, ampliada por CEO 2026-07-04): el paso de los chips de incremento es
 * CONFIGURABLE (presets 0.25/0.5/1/1.25/2.5/5 kg) persistido por-dispositivo. El tipeo libre de
 * cualquier decimal queda SIEMPRE disponible — los chips son atajos, no restricción.
 *
 * Persistencia por plataforma: `readKeypadStep`/`writeKeypadStep` usan `localStorage` (web, síncrono
 * — carril `omni_keypad_step`, mismo que `omni_autotimer`). Mobile NO los usa: persiste el mismo
 * `omni_keypad_step` vía AsyncStorage (ver `apps/mobile/.../keypad-step-preference.ts`) reutilizando
 * los presets/paso default de acá. Ambos helpers son no-op fuera del browser (guard `window`).
 */

/** localStorage: paso configurable de los chips de incremento (kg). Espejo de `omni_autotimer`. */
export const KEYPAD_STEP_KEY = 'omni_keypad_step'

/** Presets del paso (kg) — cubre discos de 0.25/1 kg además del 2.5 default. */
export const KEYPAD_STEP_PRESETS = [0.25, 0.5, 1, 1.25, 2.5, 5] as const

/** Paso por defecto (kg) → chips -2.5 / +2.5 / +5. */
export const DEFAULT_KEYPAD_STEP = 2.5

/** Máximo de decimales aceptados al tipear peso (cubre 0.25 kg). Reps = entero (0 decimales). */
export const KEYPAD_MAX_DECIMALS = 2

/** Máximo de dígitos significativos (sin coma) — evita valores absurdos por tap repetido. */
const KEYPAD_MAX_DIGITS = 6

/**
 * Tope de dígitos ENTEROS para peso y reps (999 kg / 999 reps) — incidente 2026-08-27: un alumno
 * registró 4060 kg ("40" pre-cargado + "60" tipeado encima). Sólo aplica a los campos de FUERZA;
 * los tipados (distancia en metros, segundos…) conservan el tope general de 6 dígitos.
 */
export const KEYPAD_MAX_INT_DIGITS = 3

/** Techo de peso alcanzable con los chips de incremento (los chips sólo existen en el campo peso). */
export const KEYPAD_MAX_WEIGHT_KG = 999

/**
 * Chips de incremento derivados del paso: `[-step, +step, +2·step]`.
 * step 2.5 → [-2.5, +2.5, +5] (default); step 0.5 → [-0.5, +0.5, +1]; step 5 → [-5, +5, +10].
 */
export function incrementChipsForStep(step: number): number[] {
  return [-step, step, step * 2]
}

/** Parsea texto es-CL (coma decimal) a número, o `null` si no es un número válido. */
export function parseWeightEsCl(raw: string | null | undefined): number | null {
  if (raw == null) return null
  const s = String(raw).trim().replace(',', '.')
  if (s === '' || s === '.' || s === '-' || s === '-.') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/** Formatea número → texto es-CL (coma decimal), sin ceros de cola ni ruido de punto flotante. */
export function formatWeightEsCl(n: number): string {
  if (!Number.isFinite(n)) return ''
  // Limpia ruido FP (0.1 + 0.2, etc.) redondeando a milésimas y dejando que String() recorte ceros.
  const rounded = Math.round(n * 1000) / 1000
  return String(rounded).replace('.', ',')
}

/**
 * Aplica un incremento (kg) al valor actual. Clampa a 0 (nunca peso negativo) y limpia el
 * ruido de punto flotante. Base 0 si el valor actual está vacío.
 */
export function applyKeypadIncrement(current: string, deltaKg: number): string {
  const base = parseWeightEsCl(current) ?? 0
  let next = base + deltaKg
  if (next < 0) next = 0
  // Techo 999 kg: los chips sólo viven en el campo de peso (las 3 superficies gatean por modo),
  // así que el clamp acá no toca reps ni campos tipados.
  if (next > KEYPAD_MAX_WEIGHT_KG) next = KEYPAD_MAX_WEIGHT_KG
  next = Math.round(next * 1000) / 1000
  return formatWeightEsCl(next)
}

/**
 * Agrega un dígito (`0`-`9`) al valor. Respeta: sin ceros a la izquierda, límite de decimales
 * (cuando `allowDecimal`), y un tope de dígitos. `allowDecimal=false` (reps) solo cambia el
 * límite de decimales (los dígitos se agregan igual).
 *
 * `replace`: el valor actual vino PRE-CARGADO (última serie, autofill, prefill sugerido) y el
 * alumno todavía no lo tocó ⇒ el dígito lo REEMPLAZA entero en vez de appendearse (semántica de
 * calculadora). Sin esto, "40" pre-cargado + tipear "60" producía "4060" — y así se registró un
 * hip thrust de 4060 kg en producción (2026-08-27). El flag lo arma cada superficie al abrir el
 * teclado o cambiar de campo, y lo baja en el primer gesto de edición.
 *
 * `maxIntDigits`: tope de dígitos de la parte ENTERA (peso/reps usan `KEYPAD_MAX_INT_DIGITS`);
 * sin la opción rige sólo el tope general de 6 dígitos significativos.
 */
export function appendKeypadDigit(
  current: string,
  digit: string,
  opts: { allowDecimal: boolean; maxDecimals?: number; maxIntDigits?: number; replace?: boolean },
): string {
  if (!/^[0-9]$/.test(digit)) return current
  const cur = opts.replace ? '' : current ?? ''
  const maxDecimals = opts.allowDecimal ? (opts.maxDecimals ?? KEYPAD_MAX_DECIMALS) : 0
  // Límite de decimales: no dejar tipear más allá del paso mínimo soportado.
  if (cur.includes(',')) {
    const dec = cur.split(',')[1] ?? ''
    if (dec.length >= maxDecimals) return cur
  }
  // Sin ceros a la izquierda: "0" + "5" → "5" (pero "0," + "5" → "0,5" pasa por la rama de abajo).
  if (cur === '0') return digit
  // Tope de dígitos significativos.
  if (cur.replace(',', '').length >= KEYPAD_MAX_DIGITS) return cur
  // Tope de la parte entera (sólo si el dígito va ANTES de la coma).
  if (opts.maxIntDigits != null && !cur.includes(',')) {
    if (cur.length >= opts.maxIntDigits) return cur
  }
  return cur + digit
}

/**
 * Agrega la coma decimal es-CL. Una sola coma; si el valor está vacío arranca "0,".
 * (El teclado sólo ofrece la coma cuando `allowDecimal` — reps la tiene bloqueada.)
 * `replace`: mismo contrato que en `appendKeypadDigit` — valor pre-cargado sin tocar ⇒ "0,".
 */
export function appendKeypadDecimal(current: string, opts?: { replace?: boolean }): string {
  const cur = opts?.replace ? '' : current ?? ''
  if (cur.includes(',')) return cur
  if (cur === '') return '0,'
  return cur + ','
}

/** Borra el último caracter. */
export function keypadBackspace(current: string): string {
  return (current ?? '').slice(0, -1)
}

// Persistencia del paso: por plataforma, fuera del package (sin APIs de browser acá).
// Web: apps/web/src/lib/client/keypad-step.ts (localStorage).
// Mobile: apps/mobile/components/alumno/workout/keypad-step-preference.ts (AsyncStorage).
