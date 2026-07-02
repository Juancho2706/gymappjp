'use server'

import { headers } from 'next/headers'
import { pdfBrandFromProxyHeaders } from '@/lib/nutrition-pdf-brand'
import { resolveBrandLogoDataUrlServer } from '@/lib/nutrition-pdf-logo.server'

/**
 * Logo del coach (dataURL) resuelto SERVER-side para el PDF de porciones del alumno.
 *
 * El logo URL sale de los headers del proxy (misma regla free-tier que la page: skin EVA
 * ⇒ sin logo). Lazy: corre sólo al descargar, así no infla el payload de cada carga de la
 * pantalla de nutrición ni depende del CORS del bucket. Fallback `null` ⇒ el generador
 * dibuja el nombre de marca como texto.
 */
export async function resolveClientPdfLogoDataUrl(): Promise<string | null> {
    const h = await headers()
    const brand = pdfBrandFromProxyHeaders(h)
    if (brand.poweredByEva) return null
    return resolveBrandLogoDataUrlServer(h.get('x-coach-logo-url'))
}
