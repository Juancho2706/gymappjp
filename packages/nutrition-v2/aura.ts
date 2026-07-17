/**
 * Lógica pura compartida del héroe "AURA" del Hoy del alumno (web + RN).
 *
 * Framework-neutral (sin React/DOM/RN): saludo por hora, fracción de progreso de
 * energía, alpha del aura/glow y detección del cruce de la meta. Una sola verdad
 * para garantizar paridad exacta entre la PWA y la app nativa.
 */

/** Cotas del alpha del aura: en claro no ensucia, en dark brilla sutil. */
export const AURA_GLOW_ALPHA_MIN = 0.08
export const AURA_GLOW_ALPHA_MAX = 0.35

/**
 * Saludo por franja horaria (hora local 0-23). Con nombre => "¡Buenos días, Ana!";
 * sin nombre => "¡Buenos días!". Franjas: 05-11 días · 12-19 tardes · resto noches.
 */
export function greetingForHour(hour: number, name?: string | null): string {
  const h = Number.isFinite(hour) ? ((Math.floor(hour) % 24) + 24) % 24 : 12
  const base = h >= 5 && h < 12 ? 'Buenos días' : h >= 12 && h < 20 ? 'Buenas tardes' : 'Buenas noches'
  const trimmed = name?.trim()
  return trimmed ? `¡${base}, ${trimmed}!` : `¡${base}!`
}

/** Primer token del nombre completo (calidez). Vacío/espacios => null. */
export function firstNameFromFullName(fullName?: string | null): string | null {
  const trimmed = fullName?.trim()
  if (!trimmed) return null
  const first = trimmed.split(/\s+/)[0]
  return first && first.length > 0 ? first : null
}

/** Fracción 0..1 del progreso de energía/macro (clamp). Sin meta => 0, sin dividir por cero. */
export function energyProgressRatio(consumed: number, target: number | null | undefined): number {
  if (target == null || !Number.isFinite(target) || target <= 0) return 0
  if (!Number.isFinite(consumed) || consumed <= 0) return 0
  return Math.max(0, Math.min(consumed / target, 1))
}

/**
 * Alpha del aura/glow: crece con el % de energía consumida (MIN→MAX). Sin meta
 * devuelve el mínimo — el anillo muestra solo lo consumido. Redondeado a 3 decimales.
 */
export function auraGlowAlpha(consumed: number, target: number | null | undefined): number {
  const ratio = energyProgressRatio(consumed, target)
  const alpha = AURA_GLOW_ALPHA_MIN + ratio * (AURA_GLOW_ALPHA_MAX - AURA_GLOW_ALPHA_MIN)
  return Math.round(alpha * 1000) / 1000
}

/** True cuando se alcanzó/cruzó la meta de energía. Sin meta => false (nunca celebra sin objetivo). */
export function energyGoalReached(consumed: number, target: number | null | undefined): boolean {
  if (target == null || !Number.isFinite(target) || target <= 0) return false
  return Number.isFinite(consumed) && consumed >= target
}
