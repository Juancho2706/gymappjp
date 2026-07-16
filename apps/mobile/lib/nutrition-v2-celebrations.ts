/**
 * Nutrición V2 · celebraciones NO tóxicas (Tanda 10 MVP).
 *
 * LÓGICA PURA y testeable: decide QUÉ badge mostrar y SI corresponde celebrar.
 * Sin imports de React/RN/AsyncStorage (los claims persistentes viven en el
 * sibling `nutrition-v2-celebrations.storage.ts`, que sí toca AsyncStorage).
 *
 * Principios de diseño (investigación previa — recovery framing):
 *  - Se celebra el HÁBITO (registrar, cerrar el día), JAMÁS un déficit calórico
 *    ni "quemar" calorías. `dia-cerrado` = completaste tu registro, no "comiste poco".
 *  - CERO mensajes de culpa: si no corresponde celebrar, se devuelve `null` y la
 *    UI no muestra nada. Nunca "perdiste tu racha" ni contadores punitivos.
 *  - Anti-spam: micro-pops de registro solo la PRIMERA vez del día; el pop de
 *    escaneo, solo la PRIMERA vez absoluta. El resto del día/uso: silencio.
 */

/** Los tres badges que la celebración MVP puede mostrar. Espejo de los assets
 * en `apps/mobile/assets/badges/<badge>.webp`. */
export type CelebrationBadge = 'primer-registro' | 'dia-cerrado' | 'primer-escaneo'

/** Los tres momentos que disparan una posible celebración. */
export type CelebrationMoment = 'meal-logged' | 'day-closed' | 'scanner-hit'

/** `full` = celebración completa (cierre del día): confeti + spring largo.
 * `micro` = micro-pop breve (registro / escaneo): badge con spring corto. */
export type CelebrationVariant = 'full' | 'micro'

export interface CelebrationDecision {
  badge: CelebrationBadge
  variant: CelebrationVariant
}

// ---------------------------------------------------------------------------
// Decisiones puras. Reciben el estado "¿ya se celebró?" (leído del storage por
// el caller) y devuelven la celebración o `null`. Nunca lanzan.
// ---------------------------------------------------------------------------

/**
 * Registro de comida exitoso → micro-pop `primer-registro`, SOLO la primera vez
 * del día. Si ya se celebró hoy, silencio (no spamear cada registro).
 */
export function decideMealLoggedCelebration(alreadyCelebratedToday: boolean): CelebrationDecision | null {
  if (alreadyCelebratedToday) return null
  return { badge: 'primer-registro', variant: 'micro' }
}

/**
 * Cierre del día → celebración completa `dia-cerrado`, SOLO si el día está
 * completo (hábito cumplido) y no se celebró ya hoy. Se celebra completar el
 * registro, nunca un número de calorías.
 */
export function decideDayCloseCelebration(
  dayComplete: boolean,
  alreadyCelebratedToday: boolean,
): CelebrationDecision | null {
  if (!dayComplete || alreadyCelebratedToday) return null
  return { badge: 'dia-cerrado', variant: 'full' }
}

/**
 * Scanner hit (GTIN encontrado) → pop corto `primer-escaneo`, SOLO la primera
 * vez ABSOLUTA (marca persistente que no depende de la fecha).
 */
export function decideScannerHitCelebration(alreadyCelebratedEver: boolean): CelebrationDecision | null {
  if (alreadyCelebratedEver) return null
  return { badge: 'primer-escaneo', variant: 'micro' }
}

// ---------------------------------------------------------------------------
// "Día completo" — definición de HÁBITO (no calórica). El día se considera
// cerrado cuando existe al menos una franja prescrita y TODAS las franjas
// prescritas tienen al menos un consumo registrado. Sin prescripción no hay
// "cierre" automático (plan flexible → no forzamos una meta).
// ---------------------------------------------------------------------------

export interface DaySlotCompletion {
  /** La franja tiene alimentos prescritos por el coach. */
  hasPrescription: boolean
  /** La franja tiene al menos un consumo registrado (no anulado). */
  hasConsumption: boolean
}

export function isNutritionDayComplete(slots: readonly DaySlotCompletion[]): boolean {
  const prescribed = slots.filter((slot) => slot.hasPrescription)
  if (prescribed.length === 0) return false
  return prescribed.every((slot) => slot.hasConsumption)
}

// ---------------------------------------------------------------------------
// Claves de persistencia — scoped por usuario (+ fecha para las diarias). El
// storage sibling y los tests comparten estos generadores (una sola verdad).
// ---------------------------------------------------------------------------

const KEY_PREFIX = 'nutriCeleb'

/** Marca diaria del micro-pop de registro: `nutriCeleb:meal:<userId>:<YYYY-MM-DD>`. */
export function mealLoggedDailyKey(userId: string, localDate: string): string {
  return `${KEY_PREFIX}:meal:${userId}:${localDate}`
}

/** Marca diaria del cierre del día: `nutriCeleb:dayclose:<userId>:<YYYY-MM-DD>`. */
export function dayClosedDailyKey(userId: string, localDate: string): string {
  return `${KEY_PREFIX}:dayclose:${userId}:${localDate}`
}

/** Marca persistente (una sola vez absoluta) del primer escaneo: `nutriCeleb:scan:<userId>`. */
export function scannerHitKey(userId: string): string {
  return `${KEY_PREFIX}:scan:${userId}`
}

// ---------------------------------------------------------------------------
// Plan de animación — puro. La variante estática (reduced-motion) NUNCA lleva
// partículas: solo un fade del badge. El háptico suave se mantiene (reduced
// motion es una preferencia VISUAL, no háptica).
// ---------------------------------------------------------------------------

export type CelebrationEntrance = 'spring' | 'fade'
export type CelebrationDurationToken = 'base' | 'slower'

export interface CelebrationAnimationPlan {
  /** ¿Renderizar el burst de confeti? Siempre false con reduced-motion. */
  confetti: boolean
  /** Cantidad de partículas (8-12 en full/micro; 0 con reduced-motion). */
  particleCount: number
  /** Entrada del badge: spring (pop) o fade (reduced-motion / estática). */
  entrance: CelebrationEntrance
  /** Token de duración de la entrada del badge. */
  durationToken: CelebrationDurationToken
  /** Milisegundos que el overlay permanece visible antes del auto-dismiss. */
  visibleMs: number
  /** Háptico suave acoplado al pop (se mantiene incluso con reduced-motion). */
  haptic: boolean
}

export function celebrationAnimationPlan(
  variant: CelebrationVariant,
  reduced: boolean,
): CelebrationAnimationPlan {
  if (reduced) {
    // Variante ESTÁTICA: solo fade del badge, sin partículas ni movimiento.
    return {
      confetti: false,
      particleCount: 0,
      entrance: 'fade',
      durationToken: 'base',
      visibleMs: variant === 'full' ? 1400 : 1100,
      haptic: true,
    }
  }
  if (variant === 'full') {
    return {
      confetti: true,
      particleCount: 12,
      entrance: 'spring',
      durationToken: 'slower',
      visibleMs: 1800,
      haptic: true,
    }
  }
  return {
    confetti: true,
    particleCount: 8,
    entrance: 'spring',
    durationToken: 'base',
    visibleMs: 1200,
    haptic: true,
  }
}
