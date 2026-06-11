import { z } from 'zod'

// Screening de Movimiento de Ingreso (modulo movement_assessment).
// Validacion en AMBOS lados (react-hook-form / wizard + server actions).
// Catalogo clean-room v1: 7 patrones, puntaje ordinal 0-3, L/R en los por-lado,
// clearing (prueba de descarte de dolor) solo en hombro/tronco/rotatoria.
// Espejo del catalogo de @eva/calc (MOVEMENT_PATTERNS_V1) — sin importarlo para
// mantener este package independiente (los contracts tests cruzan ambos).

export const MOVEMENT_PATTERN_VALUES = [
    'deep_squat',
    'hurdle_step',
    'inline_lunge',
    'shoulder_mobility',
    'active_straight_leg_raise',
    'trunk_stability_pushup',
    'rotary_stability',
] as const

export const MovementPatternSchema = z.enum(MOVEMENT_PATTERN_VALUES)
export type MovementPatternValue = z.infer<typeof MovementPatternSchema>

const PER_SIDE_PATTERNS: ReadonlySet<MovementPatternValue> = new Set([
    'hurdle_step',
    'inline_lunge',
    'shoulder_mobility',
    'active_straight_leg_raise',
    'rotary_stability',
])

const CLEARING_PATTERNS: ReadonlySet<MovementPatternValue> = new Set([
    'shoulder_mobility',
    'trunk_stability_pushup',
    'rotary_stability',
])

export function isPerSidePattern(pattern: MovementPatternValue): boolean {
    return PER_SIDE_PATTERNS.has(pattern)
}

export function hasClearingPattern(pattern: MovementPatternValue): boolean {
    return CLEARING_PATTERNS.has(pattern)
}

const ScoreSchema = z.number().int().min(0).max(3)

/**
 * Item del wizard (1 patron). Reglas por tipo de patron:
 *  - por-lado: score_left y score_right obligatorios; score_single debe venir null.
 *  - unico: score_single obligatorio; L/R deben venir null.
 *  - clearing_positive solo se acepta (true/false) en patrones con prueba de descarte;
 *    en el resto debe venir null/ausente.
 */
export const MovementItemInputSchema = z
    .object({
        pattern: MovementPatternSchema,
        score_left: ScoreSchema.nullish(),
        score_right: ScoreSchema.nullish(),
        score_single: ScoreSchema.nullish(),
        pain: z.boolean(),
        clearing_positive: z.boolean().nullish(),
        comment: z.string().trim().max(500).nullish(),
    })
    .superRefine((item, ctx) => {
        if (isPerSidePattern(item.pattern)) {
            if (item.score_left == null || item.score_right == null) {
                ctx.addIssue({
                    code: 'custom',
                    message: 'Este patron se puntua por lado: falta izquierdo o derecho.',
                    path: ['score_left'],
                })
            }
            if (item.score_single != null) {
                ctx.addIssue({
                    code: 'custom',
                    message: 'Patron por-lado no acepta puntaje unico.',
                    path: ['score_single'],
                })
            }
        } else {
            if (item.score_single == null) {
                ctx.addIssue({
                    code: 'custom',
                    message: 'Este patron requiere puntaje unico.',
                    path: ['score_single'],
                })
            }
            if (item.score_left != null || item.score_right != null) {
                ctx.addIssue({
                    code: 'custom',
                    message: 'Patron de puntaje unico no acepta lados.',
                    path: ['score_left'],
                })
            }
        }
        if (!hasClearingPattern(item.pattern) && item.clearing_positive != null) {
            ctx.addIssue({
                code: 'custom',
                message: 'Este patron no tiene prueba de descarte.',
                path: ['clearing_positive'],
            })
        }
    })
export type MovementItemInput = z.infer<typeof MovementItemInputSchema>

/** Autosave por paso del wizard: upsert de UN item del borrador del alumno. */
export const MovementDraftUpsertSchema = z.object({
    client_id: z.guid(),
    item: MovementItemInputSchema,
})
export type MovementDraftUpsertInput = z.infer<typeof MovementDraftUpsertSchema>

/**
 * Finalizacion (paso de revision). `consent_attested` es la atestacion explicita del
 * coach en contexto standalone (en team el consentimiento vive en client_consents y
 * se verifica server-side; el flag se ignora). El server recalcula SIEMPRE el
 * compuesto/banda — jamas se aceptan agregados del cliente.
 */
export const MovementFinalizeSchema = z.object({
    client_id: z.guid(),
    assessment_id: z.guid(),
    notes: z.string().trim().max(2000).nullish(),
    consent_attested: z.boolean().default(false),
})
export type MovementFinalizeInput = z.infer<typeof MovementFinalizeSchema>

/** Eliminar una evaluacion (final inmutable => corregir = eliminar + re-evaluar). */
export const MovementDeleteSchema = z.object({
    client_id: z.guid(),
    assessment_id: z.guid(),
})
export type MovementDeleteInput = z.infer<typeof MovementDeleteSchema>
