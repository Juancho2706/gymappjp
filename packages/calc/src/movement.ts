/**
 * Screening de Movimiento de Ingreso — calculo puro (protocolo clean-room v1).
 *
 * Basado en literatura abierta de tamizaje de movimiento (Cook & Burton, IJSPT 2014):
 * 7 patrones con puntaje ordinal 0-3, compuesto /21 y banda de prioridad de trabajo
 * correctivo. La semantica visible es SIEMPRE "prioridad de trabajo correctivo"
 * (nunca "riesgo de lesion") — specs/movida-screening AC5.
 *
 * Reglas (AC2):
 *   final = (clearing_positive || pain) ? 0 : (is_per_side ? min(L,R) : single)
 *   composite = suma de finales (exige los 7 patrones presentes)
 *   has_asymmetry = existe item por-lado con |L - R| >= 1 (sobre puntajes crudos)
 *   band: high si pain || composite <= 14; moderate si 15-16 || asimetria;
 *         low si >= 17 sin asimetria ni dolor.
 *
 * Sin imports de IO/Next/Supabase. `protocol_version = 'v1'` en DB deja la puerta
 * abierta a futuros protocolos (umbrales custom = v2).
 */

export const MOVEMENT_PROTOCOL_VERSION = 'v1' as const

export const MOVEMENT_PATTERN_SLUGS = [
    'deep_squat',
    'hurdle_step',
    'inline_lunge',
    'shoulder_mobility',
    'active_straight_leg_raise',
    'trunk_stability_pushup',
    'rotary_stability',
] as const

export type MovementPatternSlug = (typeof MOVEMENT_PATTERN_SLUGS)[number]

export type MovementPatternDef = {
    slug: MovementPatternSlug
    /** true => se puntua por lado (L/R); false => puntaje unico. */
    isPerSide: boolean
    /** true => el patron tiene prueba de descarte de dolor (clearing). */
    hasClearing: boolean
}

/**
 * Catalogo v1 hardcodeado (YAGNI tabla catalogo). 5 patrones por-lado y 2 de puntaje
 * unico; clearing en hombro / tronco / rotatoria.
 */
export const MOVEMENT_PATTERNS_V1: readonly MovementPatternDef[] = [
    { slug: 'deep_squat', isPerSide: false, hasClearing: false },
    { slug: 'hurdle_step', isPerSide: true, hasClearing: false },
    { slug: 'inline_lunge', isPerSide: true, hasClearing: false },
    { slug: 'shoulder_mobility', isPerSide: true, hasClearing: true },
    { slug: 'active_straight_leg_raise', isPerSide: true, hasClearing: false },
    { slug: 'trunk_stability_pushup', isPerSide: false, hasClearing: true },
    { slug: 'rotary_stability', isPerSide: true, hasClearing: true },
] as const

export function movementPatternDef(slug: MovementPatternSlug): MovementPatternDef {
    const def = MOVEMENT_PATTERNS_V1.find((p) => p.slug === slug)
    if (!def) throw new Error(`Patron desconocido: ${slug}`)
    return def
}

export type PriorityBand = 'low' | 'moderate' | 'high'

/** Input crudo de un item del screening (como lo captura el wizard / como vive en DB). */
export type MovementItemInput = {
    pattern: MovementPatternSlug
    isPerSide: boolean
    scoreLeft?: number | null
    scoreRight?: number | null
    scoreSingle?: number | null
    pain: boolean
    /** null/undefined = el patron no tiene prueba de descarte. */
    clearingPositive?: boolean | null
}

export type MovementSummary = {
    composite: number
    hasPain: boolean
    hasAsymmetry: boolean
    band: PriorityBand
}

function assertScore(value: number, label: string): void {
    if (!Number.isInteger(value) || value < 0 || value > 3) {
        throw new Error(`Puntaje invalido en ${label}: ${value} (esperado entero 0-3)`)
    }
}

/**
 * Puntaje final de un item: dolor o descarte positivo fuerzan 0; por-lado toma el
 * minimo L/R; puntaje unico pasa directo. Lanza si faltan los puntajes crudos del
 * tipo de patron o estan fuera de rango.
 */
export function finalItemScore(item: MovementItemInput): number {
    if (item.isPerSide) {
        if (item.scoreLeft == null || item.scoreRight == null) {
            throw new Error(`Item incompleto: ${item.pattern} requiere puntaje izquierdo y derecho`)
        }
        assertScore(item.scoreLeft, `${item.pattern}.scoreLeft`)
        assertScore(item.scoreRight, `${item.pattern}.scoreRight`)
    } else {
        if (item.scoreSingle == null) {
            throw new Error(`Item incompleto: ${item.pattern} requiere puntaje unico`)
        }
        assertScore(item.scoreSingle, `${item.pattern}.scoreSingle`)
    }

    if (item.clearingPositive === true || item.pain) return 0
    if (item.isPerSide) return Math.min(item.scoreLeft as number, item.scoreRight as number)
    return item.scoreSingle as number
}

function assertCompleteProtocol(items: readonly MovementItemInput[]): void {
    const seen = new Set(items.map((i) => i.pattern))
    const missing = MOVEMENT_PATTERN_SLUGS.filter((slug) => !seen.has(slug))
    if (missing.length > 0) {
        throw new Error(`Protocolo incompleto: faltan patrones (${missing.join(', ')})`)
    }
    if (items.length !== MOVEMENT_PATTERN_SLUGS.length) {
        throw new Error('Protocolo invalido: se esperan exactamente 7 patrones sin duplicados')
    }
}

/** Compuesto /21. Exige los 7 patrones presentes (lanza si faltan o sobran). */
export function compositeScore(items: readonly MovementItemInput[]): number {
    assertCompleteProtocol(items)
    return items.reduce((sum, item) => sum + finalItemScore(item), 0)
}

/**
 * Asimetria: existe item por-lado con |L - R| >= 1, evaluada sobre los puntajes
 * CRUDOS (sin forzar a 0 por dolor/descarte).
 */
export function hasAsymmetry(items: readonly MovementItemInput[]): boolean {
    return items.some(
        (item) =>
            item.isPerSide &&
            item.scoreLeft != null &&
            item.scoreRight != null &&
            Math.abs(item.scoreLeft - item.scoreRight) >= 1
    )
}

export function hasPain(items: readonly MovementItemInput[]): boolean {
    return items.some((item) => item.pain || item.clearingPositive === true)
}

/**
 * Banda de prioridad de trabajo correctivo (cortes de literatura, v1):
 * high: dolor || compuesto <= 14 · moderate: 15-16 || asimetria · low: >= 17 limpio.
 */
export function priorityBand(composite: number, pain: boolean, asymmetry: boolean): PriorityBand {
    if (pain || composite <= 14) return 'high'
    if (composite <= 16 || asymmetry) return 'moderate'
    return 'low'
}

/** Orquesta el resumen completo de una evaluacion (lo que el server persiste al finalizar). */
export function summarizeAssessment(items: readonly MovementItemInput[]): MovementSummary {
    const composite = compositeScore(items)
    const pain = hasPain(items)
    const asymmetry = hasAsymmetry(items)
    return { composite, hasPain: pain, hasAsymmetry: asymmetry, band: priorityBand(composite, pain, asymmetry) }
}
