/**
 * Marca por TENANT para los PDFs de nutrición (fix transversal de white-label, SPEC AC4).
 * Resolución SIEMPRE server-side; estas funciones son puras y testeables.
 */

import { isBrandingAllowed, showsEvaBadge, EVA_BADGE_LABEL, type SubscriptionTier } from '@eva/tiers'
import type { PdfBrand } from '@/domain/nutrition/exchange.types'
import { decodeBrandHeaderValue } from '@/lib/brand-header-codec'
import {
    effectiveBrandColorInputFromHeaders,
    resolveEffectiveBrandColorOrNull,
    type BrandHeaderSource,
} from '@/lib/branding/public-branding'

export type Rgb = [number, number, number]

/** Paleta EVA EXACTA del PDF legacy (`nutrition-day-pdf.ts` pre-refactor) — baseline T0.1. */
export const EVA_PDF_ACCENT: Rgb = [16, 185, 129] // emerald-500
export const EVA_PDF_HEADER_BG: Rgb = [15, 23, 42] // slate-900

export const EVA_PDF_BRAND: PdfBrand = {
    brandName: 'EVA FITNESS',
    primaryColor: '#10B981',
    logoDataUrl: null,
    poweredByEva: true,
    // Fallback EVA ⇒ el PDF es de EVA: el sello va (fail-open, igual que `showsEvaBadge(tier)`).
    showsEvaBadge: true,
}

/** Texto del sello dentro del PDF: label canónico + dominio (el PDF viaja fuera del navegador). */
export const EVA_PDF_BADGE_LABEL = `${EVA_BADGE_LABEL} · eva-app.cl`

export function hexToRgb(hex: string): Rgb | null {
    const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim())
    if (!m) return null
    const n = parseInt(m[1], 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export type PdfBrandPalette = {
    accent: Rgb
    headerBg: Rgb
    headerText: Rgb
    /** Texto del footer "Generado con {marca}". */
    generatedWithLabel: string
    brandName: string
    logoDataUrl: string | null
    /**
     * Pricing v3 (D3=A): línea extra del footer con el sello «Hecho con EVA · eva-app.cl».
     * `null` ⇒ Pro/Elite (sin sello) — el footer solo lleva el disclaimer y "Generado con …".
     */
    evaBadgeLabel: string | null
}

/** Luminancia relativa aproximada (suficiente para elegir texto claro/oscuro del header). */
function luminance([r, g, b]: Rgb): number {
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
}

/** Mezcla manual hacia oscuro (estilo `macroChip`: sin opacidad, compatible PDF). */
function darken(rgb: Rgb, factor: number): Rgb {
    return [Math.round(rgb[0] * factor), Math.round(rgb[1] * factor), Math.round(rgb[2] * factor)]
}

/**
 * Deriva la paleta del PDF desde la marca del tenant.
 * Rama `poweredByEva` (fallback / tier inválido) reproduce la paleta EVA EXACTA (AC1):
 * accent emerald-500 + header slate-900 + footer "Generado con EVA Fitness".
 * `evaBadgeLabel` es ortogonal al color: un coach Free lleva SU paleta y ADEMÁS el sello.
 */
export function derivePdfPalette(brand: PdfBrand): PdfBrandPalette {
    const evaBadgeLabel = brand.showsEvaBadge ? EVA_PDF_BADGE_LABEL : null
    if (brand.poweredByEva) {
        return {
            accent: EVA_PDF_ACCENT,
            headerBg: EVA_PDF_HEADER_BG,
            headerText: [255, 255, 255],
            generatedWithLabel: 'Generado con EVA Fitness',
            brandName: EVA_PDF_BRAND.brandName,
            logoDataUrl: null,
            evaBadgeLabel,
        }
    }
    const accent = hexToRgb(brand.primaryColor) ?? EVA_PDF_ACCENT
    // Header oscuro derivado del color de marca (legible con texto blanco); si la marca ya es
    // muy oscura se usa tal cual.
    const headerBg = luminance(accent) > 0.35 ? darken(accent, 0.28) : accent
    return {
        accent,
        headerBg,
        headerText: [255, 255, 255],
        generatedWithLabel: `Generado con ${brand.brandName}`,
        brandName: brand.brandName,
        logoDataUrl: brand.logoDataUrl ?? null,
        evaBadgeLabel,
    }
}

export type TenantBrandSource = {
    /** Nombre visible del tenant (team.name / coach.brand_name / org.name). */
    brandName: string | null | undefined
    primaryColor: string | null | undefined
    logoUrl?: string | null
    /** Tier del coach standalone. Desde Pricing v3 el white-label es de todos los planes, así que
     * `isBrandingAllowed` solo actúa de red fail-closed (tier inválido/stale ⇒ marca EVA). El tier
     * SÍ decide el sello. Ausente (team/org) ⇒ ni gate ni sello. */
    subscriptionTier?: string | null
}

/**
 * Marca del PDF a partir del tenant resuelto server-side.
 * - tier válido (free incluido, Pricing v3) ⇒ marca propia; el sello lo decide `showsEvaBadge`
 * - tier inválido/stale ⇒ EVA (poweredByEva) por el fail-closed de `isBrandingAllowed`
 * - sin color/nombre utilizables ⇒ EVA (fallback seguro, nunca un PDF "a medias")
 */
export function resolvePdfBrand(source: TenantBrandSource | null | undefined): PdfBrand {
    if (!source) return EVA_PDF_BRAND
    const tier = source.subscriptionTier
    const hasTier = tier != null && tier !== ''
    if (hasTier && !isBrandingAllowed(tier as SubscriptionTier)) {
        return EVA_PDF_BRAND
    }
    const name = source.brandName?.trim()
    const color = source.primaryColor && hexToRgb(source.primaryColor) ? source.primaryColor : null
    if (!name) return EVA_PDF_BRAND
    return {
        brandName: name,
        primaryColor: color ?? EVA_PDF_BRAND.primaryColor,
        logoDataUrl: null, // el dataURL se resuelve SERVER-side (resolveBrandLogoDataUrlServer)
        poweredByEva: false,
        // Sin tier (team/org) el PDF es del team/org: la atribución de EVA no corresponde ahí.
        showsEvaBadge: hasTier ? showsEvaBadge(tier as SubscriptionTier) : false,
    }
}

/**
 * Headers del proxy (`/c`, `/t`, `/e`) → marca del PDF del ALUMNO.
 * Misma regla del layout (`app/c/[coach_slug]/layout.tsx`): marca propia en todos los planes,
 * sello «Hecho con EVA» en free y color EFECTIVO (W1a).
 *
 * El color NO sale del header crudo: `x-coach-primary-color` lleva la columna libre LEGACY
 * `coaches.primary_color`, así que un coach con tema preset se llevaba el PDF en su color viejo
 * mientras la app ya estaba en el del preset (bug del owner 2026-09-02). `effectiveBrandColorInputFromHeaders`
 * aporta la MISMA semántica de `managed` que el layout (org/orphan ⇒ la marca gestionada gana sobre
 * el preset personal). Se usa la variante `…OrNull` para no imponer el azul de sistema cuando no hay
 * color: sin él, `resolvePdfBrand` sigue cayendo al emerald de `EVA_PDF_BRAND`, como hasta hoy.
 */
export function pdfBrandFromProxyHeaders(h: BrandHeaderSource): PdfBrand {
    return resolvePdfBrand({
        brandName: decodeBrandHeaderValue(h.get('x-coach-brand-name')),
        primaryColor: resolveEffectiveBrandColorOrNull(effectiveBrandColorInputFromHeaders(h)),
        logoUrl: h.get('x-coach-logo-url'),
        subscriptionTier: h.get('x-coach-subscription-tier') ?? 'free',
    })
}
