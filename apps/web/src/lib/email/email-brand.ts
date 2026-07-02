import { isBrandingAllowed, type SubscriptionTier } from '@eva/tiers'

/**
 * Branding para emails AL ALUMNO (white-label de borde, W2). Devuelve el logo/color del
 * coach SOLO cuando corresponde mostrarlos en el header/CTA del email:
 *
 *  - `isStandalone`: el alumno pertenece al coach DIRECTO (no a un pool team ni a una org).
 *    Así el email coincide con la marca que el alumno ve dentro de la app. En team/org la
 *    marca es del team/org (no threadeada por acá) ⇒ fallback EVA, jamás la marca equivocada.
 *  - Pro+ (`isBrandingAllowed`): free/starter ven skin EVA completo (decisión CEO white-label v2).
 *
 * El NOMBRE del coach viaja SIEMPRE en el texto del template (identidad, no gateada). Esto
 * gatea únicamente el VISUAL (logo + color) del header/CTA. Sin elegibilidad → `{null,null}`
 * ⇒ el template arma un header EVA (comportamiento actual).
 */
export function resolveStudentEmailBranding(input: {
    isStandalone: boolean
    tier: string | null | undefined
    logoUrl?: string | null
    primaryColor?: string | null
}): { logoUrl: string | null; primaryColor: string | null } {
    const eligible =
        input.isStandalone && isBrandingAllowed((input.tier ?? 'starter') as SubscriptionTier)
    return eligible
        ? { logoUrl: input.logoUrl ?? null, primaryColor: input.primaryColor ?? null }
        : { logoUrl: null, primaryColor: null }
}
