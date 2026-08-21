import { describe, expect, it } from 'vitest'
import { buildFreePlanV3NoticeEmail } from './pricing-v3-notice-template'

/**
 * Render puro (sin red, sin DB) del aviso de Pricing v3 a los coaches Free.
 *
 * Pinnea las reglas que NO pueden erosionarse:
 *   1. El asunto es literal (el panel admin lo muestra en el diálogo de confirmación).
 *   2. CERO precios y CERO descuentos: el correo comunica alcance, no comercial.
 *   3. Los dos datos duros del cambio siguen ahí: «1 alumno» y el sello «Hecho con EVA».
 *   4. El CTA primario apunta a la configuración de marca.
 */

const CTX = {
    coachName: 'Camila',
    brandUrl: 'https://www.eva-app.cl/coach/settings/brand',
    pricingUrl: 'https://www.eva-app.cl/pricing',
    appUrl: 'https://www.eva-app.cl',
}

/** Texto visible del HTML (sin etiquetas ni atributos), para contar palabras del cuerpo. */
function visibleText(html: string): string {
    return html
        .replace(/<style[\s\S]*?<\/style>/g, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
}

describe('buildFreePlanV3NoticeEmail', () => {
    it('usa el asunto aprobado', () => {
        expect(buildFreePlanV3NoticeEmail(CTX).subject).toBe('Tu plan Free ahora incluye tu marca')
    })

    it('saluda al coach por su nombre en HTML y en texto plano', () => {
        const { html, text } = buildFreePlanV3NoticeEmail(CTX)
        expect(html).toContain('Camila')
        expect(text).toContain('Hola Camila,')
    })

    it('apunta el CTA primario a la configuración de marca y el secundario a planes', () => {
        const { html, text } = buildFreePlanV3NoticeEmail(CTX)
        expect(html).toContain(`href="${CTX.brandUrl}"`)
        expect(html).toContain('Configurar mi marca')
        expect(html).toContain(`href="${CTX.pricingUrl}"`)
        expect(text).toContain(CTX.brandUrl)
        expect(text).toContain(CTX.pricingUrl)
    })

    it('no lleva precios ni promesas de descuento', () => {
        const { subject, html, text } = buildFreePlanV3NoticeEmail(CTX)
        for (const piece of [subject, html, text]) {
            expect(piece).not.toContain('$')
            expect(piece.toLowerCase()).not.toContain('descuento')
        }
    })

    it('comunica el cupo nuevo y el sello, en HTML y en texto plano', () => {
        const { html, text } = buildFreePlanV3NoticeEmail(CTX)
        for (const piece of [html, text]) {
            expect(piece).toContain('1 alumno')
            expect(piece).toContain('Hecho con EVA')
        }
        // El backfill conserva a los alumnos existentes: la promesa tiene que estar escrita.
        expect(html).toContain('nadie pierde acceso')
    })

    it('mantiene el cuerpo breve (≤ 180 palabras visibles)', () => {
        const { html } = buildFreePlanV3NoticeEmail(CTX)
        const words = visibleText(html).split(' ').filter(Boolean)
        expect(words.length).toBeLessThanOrEqual(180)
    })
})
