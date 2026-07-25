/**
 * Modelo PURO de las pantallas tipadas del ejecutor V3 (E3.2 movilidad · E3.3 roller · E3.4 cardio).
 *
 * Aísla la lógica de presentación (formato de reloj, selección de color de zona/fase, derivación del
 * modo de timer cardio, secuencia de lados de movilidad y el prefill de captura) de los componentes RN
 * para poder testearla sin renderizar (los componentes cargan moti/svg/expo, no montables en jsdom).
 *
 * MOTOR INTOCABLE: nada de esto guarda ni cuenta — solo decide QUÉ muestra la pantalla. El guardado
 * sigue por `buildTypedPayload` (engine) y el conteo por los hooks de `timing.ts` (misma disciplina que
 * los timers existentes). Las columnas de captura son las del engine (`typedKeypadFields`).
 */
import {
  compactDistance,
  compactDuration,
  isTimeableInterval,
  type IntervalConfig,
  type IntervalPhaseKind,
} from '@eva/workout-engine'
import type { HrZoneRange } from '@eva/cardio'

/**
 * Hex FIJOS de las zonas FC (Z1..Z5) — espejo 1:1 de `ZONE_COLORS` (apps/mobile/lib/theme.ts) y de
 * `--zone-z1..z5` de web. Se inlinean acá (en vez de importar `theme.ts`) para que este módulo quede
 * 100% puro y testeable sin arrastrar la cadena React Native de `theme` (brand-kit/typography). Jamás
 * re-teñidos por marca ni scheme — el color ES la zona.
 */
const ZONE_HEX: Record<'z1' | 'z2' | 'z3' | 'z4' | 'z5', string> = {
  z1: '#38bdf8',
  z2: '#4ade80',
  z3: '#facc15',
  z4: '#fb923c',
  z5: '#f87171',
}

/** Formatea segundos a "M:SS" (o "H:MM:SS" si supera la hora). Cifras tabulares en el consumidor. */
export function formatClock(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  return `${m}:${String(sec).padStart(2, '0')}`
}

/**
 * Color del anillo de cardio: color FIJO de la zona objetivo (`ZONE_COLORS`, jamás re-teñido por marca)
 * si el bloque tiene `hr_zone` válida (1-5); si no, el acento del ejecutor (fallback). El rango bpm
 * concreto lo resuelve `@eva/cardio` aparte — acá solo se elige el matiz del anillo.
 */
export function zoneRingColor(hrZone: number | null | undefined, fallbackAccent: string): string {
  if (hrZone != null && hrZone >= 1 && hrZone <= 5) {
    return ZONE_HEX[`z${hrZone}` as keyof typeof ZONE_HEX]
  }
  return fallbackAccent
}

/**
 * Colores FIJOS de las fases de intervalo (contrato concepto-a-v32-momentos): trabajo = ámbar cálido,
 * recuperación = verde frío, warmup/cooldown = neutro. Jamás re-teñidos: el color ES la fase.
 */
export const PHASE_COLORS: Record<IntervalPhaseKind, string> = {
  work: '#fb923c', // ámbar — esfuerzo (== --z4)
  recovery: '#4ade80', // verde — recuperación (== --z2)
  warmup: '#8f8f9c', // neutro
  cooldown: '#8f8f9c', // neutro
}

/** Objetivo cardio en el shape de `computeCardioProgress` (tiempo XOR distancia; distancia → metros). */
export function cardioObjective(block: {
  duration_sec?: number | null
  distance_value?: number | null
  distance_unit?: string | null
}): { duration_sec: number | null; distance_m: number | null } {
  const distanceM =
    block.distance_value != null && block.distance_value > 0
      ? (block.distance_unit === 'km' ? block.distance_value * 1000 : block.distance_value)
      : null
  return { duration_sec: block.duration_sec ?? null, distance_m: distanceM }
}

export type CardioTimerMode = 'interval' | 'countdown' | 'stopwatch'

/**
 * Modo del timer cardio según la prescripción:
 *  · `interval`  — hay `interval_config` cronometrable (work por tiempo) → runner de fases.
 *  · `countdown` — hay `duration_sec` > 0 → cuenta regresiva con anillo de zona.
 *  · `stopwatch` — ni intervalos ni duración (típicamente por distancia) → cronómetro count-up.
 */
export function cardioTimerMode(block: {
  duration_sec?: number | null
  interval_config?: unknown
}): CardioTimerMode {
  const interval = (block.interval_config ?? null) as IntervalConfig | null
  if (interval && isTimeableInterval(interval)) return 'interval'
  if ((block.duration_sec ?? 0) > 0) return 'countdown'
  return 'stopwatch'
}

/** Detalle corto del chip "Cardio · {detalle}" según la prescripción (identidad de la pantalla). */
export function cardioDetailLabel(block: {
  duration_sec?: number | null
  distance_value?: number | null
  interval_config?: unknown
}): string {
  const mode = cardioTimerMode(block)
  if (mode === 'interval') return 'Intervalos'
  if ((block.distance_value ?? 0) > 0 && (block.duration_sec ?? 0) <= 0) return 'Distancia'
  return 'Continuo'
}

/** Lados de una prescripción de movilidad: dos (per_side) o uno (bilateral/alternating). */
export type MobilitySide = 'left' | 'right' | 'single'
export function mobilitySides(sideMode: string | null | undefined): MobilitySide[] {
  return sideMode === 'per_side' ? ['left', 'right'] : ['single']
}

/** Etiqueta es-neutro del lado grande de movilidad. */
export function sideLabel(side: MobilitySide): string {
  if (side === 'left') return 'Lado izquierdo'
  if (side === 'right') return 'Lado derecho'
  return 'Sostén la posición'
}

/**
 * Valores de siembra (`seedValues`) para la fila de captura tipada de movilidad, a partir de los
 * segundos cronometrados por lado. En per_side arma `hold_left_sec` / `hold_right_sec` (los DOS campos
 * que declara `typedKeypadFields('mobility','per_side')`); en un solo lado arma `actual_hold_sec`.
 * Solo incluye una clave si su valor está definido (deja las cajas vacías si no se cronometró).
 */
export function holdSeedValues(
  sideMode: string | null | undefined,
  timed: { left?: number | null; right?: number | null; single?: number | null },
): Record<string, string> {
  const out: Record<string, string> = {}
  if (sideMode === 'per_side') {
    if (timed.left != null) out.hold_left_sec = String(Math.round(timed.left))
    if (timed.right != null) out.hold_right_sec = String(Math.round(timed.right))
  } else if (timed.single != null) {
    out.actual_hold_sec = String(Math.round(timed.single))
  }
  return out
}

/** Objetivo de pasadas del roller (reps_unit='passes') o null si se prescribe por duración. */
export function rollerPassesTarget(block: { reps_unit?: string | null; reps_value?: number | null }): number | null {
  if (block.reps_unit === 'passes' && (block.reps_value ?? 0) > 0) return block.reps_value as number
  return null
}

/** Línea de objetivo del roller ("10-12 pasadas por pierna" o la duración prescrita). */
export function rollerGoalLabel(block: {
  reps?: string | null
  reps_unit?: string | null
  reps_value?: number | null
  duration_sec?: number | null
  side_mode?: string | null
}): string {
  const perSide = block.side_mode === 'per_side' ? ' por lado' : ''
  const passes = rollerPassesTarget(block)
  if (passes != null) {
    const base = block.reps && String(block.reps).trim() ? String(block.reps) : String(passes)
    return `${base} pasadas${perSide}`
  }
  if ((block.duration_sec ?? 0) > 0) return `${compactDuration(block.duration_sec as number)}${perSide}`
  return block.reps && String(block.reps).trim() ? `${block.reps}${perSide}` : 'Rueda la zona'
}

/** Objetivo textual del cardio por distancia (para el modo cronómetro sin barra). */
export function cardioDistanceObjective(block: {
  distance_value?: number | null
  distance_unit?: string | null
}): string | null {
  if ((block.distance_value ?? 0) > 0) return compactDistance(block.distance_value as number, block.distance_unit)
  return null
}

/** Rango bpm concreto de la zona objetivo del alumno, si su perfil FC viajó al ejecutor. */
export function zoneBpmRange(
  hrZone: number | null | undefined,
  hrZones: HrZoneRange[] | null | undefined,
): HrZoneRange | null {
  if (hrZone == null) return null
  return hrZones?.find((z) => z.zone === hrZone) ?? null
}
