import { z } from 'zod'

// SERVER-ONLY (web). Schemas de cupones / códigos de descuento (specs/discount-codes, F5).
// MODULE_KEYS inline (estable) — el package de schemas no importa de apps/web/services.
export const COUPON_MODULE_KEYS = [
    'cardio',
    'body_composition',
    'movement_assessment',
    'nutrition_exchanges',
] as const

export const COUPON_TIERS = ['starter', 'pro', 'elite'] as const

/** R3.8: tope de % de descuento sin override. Arriba de esto el CEO debe tildar highDiscountOverride. */
export const MAX_PERCENT_WITHOUT_OVERRIDE = 21

/**
 * Alta de cupón por el CEO (/admin/codigos). Espeja las CHECKs de F1: discount_type percent|fixed_clp,
 * XOR de valor, duration con cycles biconditional, rechazo de 100%-forever (va por admin_grant). El
 * código (`codeDisplay`) es opcional: ausente → el server autogenera uno random (formato = ambos).
 * `z.guid()` (no z.uuid) para ids que pueden referenciar filas seed (memoria UUIDs no-RFC).
 */
export const CreateCouponAdminSchema = z
    .object({
        discountType: z.enum(['percent', 'fixed_clp']),
        percentValue: z.number().int().min(1).max(100).optional(),
        amountOffClp: z.number().int().min(0).optional(),
        fixedClpTarget: z.enum(['base', 'module', 'total']).default('base'),
        scopeTiers: z.array(z.enum(COUPON_TIERS)).optional(),
        scopeModuleKeys: z.array(z.enum(COUPON_MODULE_KEYS)).optional(),
        duration: z.enum(['once', 'repeating', 'forever']),
        durationInCycles: z.number().int().min(1).optional(),
        maxRedemptions: z.number().int().min(0).optional(),
        redeemBy: z.string().datetime().optional(),
        /** Vanity (ej PARTNER50). Ausente → server autogenera random. Validado normalizado-único en el server. */
        codeDisplay: z.string().min(3).max(40).optional(),
        perAccountLimit: z.number().int().min(1).default(1),
        firstTimeOnly: z.boolean().default(false),
        /** Código de partner atado a 1 coach (anti-leak). */
        restrictedToCoachId: z.guid().optional(),
        /** Margin floor congelado (O8); el neto nunca baja de acá. */
        floorClp: z.number().int().min(0).optional(),
        /** Allowlist de correos (REGISTER-CODE R1.0): si viene, SOLO esos correos canjean. El server los normaliza. */
        allowedEmails: z.array(z.string().min(3).max(120)).max(2000).optional(),
        /** Override del CEO para descuentos altos (>21%): el check explícito de "este % está bien" (R3.8). */
        highDiscountOverride: z.boolean().optional(),
    })
    .refine(
        (d) =>
            d.discountType === 'percent'
                ? d.percentValue != null && d.amountOffClp == null
                : d.amountOffClp != null && d.percentValue == null,
        { message: 'percent exige percentValue; fixed_clp exige amountOffClp (exactamente uno).' }
    )
    .refine((d) => (d.duration === 'repeating') === (d.durationInCycles != null), {
        message: 'duration=repeating exige durationInCycles; once/forever lo prohíben.',
    })
    .refine((d) => !(d.discountType === 'percent' && d.percentValue === 100 && d.duration === 'forever'), {
        message: 'Un 100% de por vida va por cortesía (admin_grant), no por código.',
    })
    // R3.8 Guardrail de negocio: tope de descuento 21%; >21% exige el check explícito del CEO.
    .refine((d) => !(d.discountType === 'percent' && (d.percentValue ?? 0) > MAX_PERCENT_WITHOUT_OVERRIDE && !d.highDiscountOverride), {
        message: `Un descuento mayor a ${MAX_PERCENT_WITHOUT_OVERRIDE}% requiere confirmar explícitamente el check de descuento alto.`,
    })

export type CreateCouponAdminInput = z.infer<typeof CreateCouponAdminSchema>

/** Canje de un código por el coach (/coach/subscription) o en el registro. */
export const RedeemCouponSchema = z.object({
    code: z.string().min(1).max(60),
    /** false = solo preview (disclosure SERNAC); true/omitido = commit (escribe la redención). */
    commit: z.boolean().optional(),
})
export type RedeemCouponInput = z.infer<typeof RedeemCouponSchema>

/** Revocación future-only de una redención (CEO). NUNCA sube el precio mid-term. */
export const RevokeRedemptionSchema = z.object({
    redemptionId: z.guid(),
})
export type RevokeRedemptionInput = z.infer<typeof RevokeRedemptionSchema>
