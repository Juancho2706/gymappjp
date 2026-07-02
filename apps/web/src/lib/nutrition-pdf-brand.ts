/**
 * Marca por TENANT para los PDFs de nutrición (fix transversal de white-label, SPEC AC4).
 * Resolución SIEMPRE server-side; estas funciones son puras y testeables.
 */

import type { PdfBrand } from '@/domain/nutrition/exchange.types'

export type Rgb = [number, number, number]

/** Paleta EVA EXACTA del PDF legacy (`nutrition-day-pdf.ts` pre-refactor) — baseline T0.1. */
export const EVA_PDF_ACCENT: Rgb = [16, 185, 129] // emerald-500
export const EVA_PDF_HEADER_BG: Rgb = [15, 23, 42] // slate-900

export const EVA_PDF_BRAND: PdfBrand = {
    brandName: 'EVA FITNESS',
    primaryColor: '#10B981',
    logoDataUrl: null,
    poweredByEva: true,
}

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
 * Rama `poweredByEva` (free tier / fallback) reproduce la paleta EVA EXACTA (AC1):
 * accent emerald-500 + header slate-900 + footer "Generado con EVA Fitness".
 */
export function derivePdfPalette(brand: PdfBrand): PdfBrandPalette {
    if (brand.poweredByEva) {
        return {
            accent: EVA_PDF_ACCENT,
            headerBg: EVA_PDF_HEADER_BG,
            headerText: [255, 255, 255],
            generatedWithLabel: 'Generado con EVA Fitness',
            brandName: EVA_PDF_BRAND.brandName,
            logoDataUrl: null,
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
    }
}

export type TenantBrandSource = {
    /** Nombre visible del tenant (team.name / coach.brand_name / org.name). */
    brandName: string | null | undefined
    primaryColor: string | null | undefined
    logoUrl?: string | null
    /** Tier del coach standalone; free fuerza marca EVA (misma regla del layout del alumno). */
    subscriptionTier?: string | null
}

/**
 * Marca del PDF a partir del tenant resuelto server-side.
 * - free tier ⇒ EVA (poweredByEva)
 * - sin color/nombre utilizables ⇒ EVA (fallback seguro, nunca un PDF "a medias")
 */
export function resolvePdfBrand(source: TenantBrandSource | null | undefined): PdfBrand {
    if (!source) return EVA_PDF_BRAND
    if ((source.subscriptionTier ?? '') === 'free') return EVA_PDF_BRAND
    const name = source.brandName?.trim()
    const color = source.primaryColor && hexToRgb(source.primaryColor) ? source.primaryColor : null
    if (!name) return EVA_PDF_BRAND
    return {
        brandName: name,
        primaryColor: color ?? EVA_PDF_BRAND.primaryColor,
        logoDataUrl: null, // el dataURL se resuelve SERVER-side (resolveBrandLogoDataUrlServer)
        poweredByEva: false,
    }
}

/**
 * Headers del proxy (`/c`, `/t`, `/e`) → marca del PDF del ALUMNO.
 * Misma regla del layout: free tier fuerza EVA (`app/c/[coach_slug]/layout.tsx`).
 */
export function pdfBrandFromProxyHeaders(h: {
    get(name: string): string | null
}): PdfBrand {
    return resolvePdfBrand({
        brandName: h.get('x-coach-brand-name'),
        primaryColor: h.get('x-coach-primary-color'),
        logoUrl: h.get('x-coach-logo-url'),
        subscriptionTier: h.get('x-coach-subscription-tier') ?? 'starter',
    })
}
