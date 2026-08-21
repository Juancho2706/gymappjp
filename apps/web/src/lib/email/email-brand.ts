import { isBrandingAllowed, showsEvaBadge, type SubscriptionTier } from '@eva/tiers'

/**
 * Branding para emails AL ALUMNO (white-label de borde, W2). Devuelve el logo/color del
 * coach SOLO cuando corresponde mostrarlos en el header/CTA del email, más el flag del sello
 * «Hecho con EVA» del footer (Pricing v3, D3=A — owner 2026-08-21):
 *
 *  - `isStandalone`: el alumno pertenece al coach DIRECTO (no a un pool team ni a una org).
 *    Así el email coincide con la marca que el alumno ve dentro de la app. En team/org la
 *    marca es del team/org (no threadeada por acá) ⇒ fallback EVA y SIN sello (el sello sería
 *    mentira: esa marca no es del coach y el plan del team no la paga).
 *  - `isBrandingAllowed` queda como red FAIL-CLOSED: desde Pricing v3 el white-label es de
 *    todos los planes, así que solo cae fuera un tier inválido/stale.
 *  - `showsEvaBadge`: true en free/starter (fail-open ante tier corrupto), false en Pro+.
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
}): { logoUrl: string | null; primaryColor: string | null; showsEvaBadge: boolean } {
    const tier = (input.tier ?? 'free') as SubscriptionTier
    const eligible = input.isStandalone && isBrandingAllowed(tier)
    return {
        logoUrl: eligible ? (input.logoUrl ?? null) : null,
        primaryColor: eligible ? (input.primaryColor ?? null) : null,
        showsEvaBadge: input.isStandalone && showsEvaBadge(tier),
    }
}
