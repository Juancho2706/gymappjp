import { describe, expect, it } from 'vitest'
import {
    buildAddonActivationReceiptEmail,
    buildAddonCancellationReceiptEmail,
} from './addon-receipt-templates'
import { getAddonPaymentRulesForCycle } from '@/lib/constants'

// Estos tests son de RENDER puro (sin red): verifican que el recibo arma el desglose, las
// reglas aceptadas, y respeta la decisión D5 (CERO mención de IVA). Resend se mockea en los
// tests de endpoint; acá solo se prueba el HTML producido por la plantilla.

describe('buildAddonActivationReceiptEmail', () => {
    const baseCtx = {
        coachName: 'Juan',
        addonLabel: 'Cardio',
        cycleLabel: 'Mensual',
        baseClp: 29990,
        addonLines: [{ label: 'Cardio', cycleAmountClp: 9990 }],
        totalClp: 39980,
        oneShotClp: null as number | null,
        nextChargeDate: '1 de julio de 2026',
        acceptedRules: getAddonPaymentRulesForCycle('monthly').rules,
        termsVersion: 'v1-2026-06',
        subscriptionUrl: 'https://eva-app.cl/coach/subscription',
    }

    it('arma el desglose base + add-on + total (formato es-CL)', () => {
        const { subject, html } = buildAddonActivationReceiptEmail(baseCtx)
        expect(subject).toContain('Cardio')
        expect(html).toContain('Plan base')
        expect(html).toContain('$29.990') // base
        expect(html).toContain('$9.990') // add-on
        expect(html).toContain('$39.980') // total
        expect(html).toContain('1 de julio de 2026')
    })

    it('incluye el texto íntegro de las 5 reglas aceptadas + la versión', () => {
        const { html } = buildAddonActivationReceiptEmail(baseCtx)
        expect(html).toContain('v1-2026-06')
        for (const rule of baseCtx.acceptedRules) {
            expect(html).toContain(rule.title)
        }
        // 5 reglas → 5 ítems de lista
        expect(baseCtx.acceptedRules).toHaveLength(5)
    })

    it('CERO mención de IVA en el copy (decisión D5)', () => {
        const { subject, html } = buildAddonActivationReceiptEmail(baseCtx)
        // Palabra completa "iva" (impuesto), no el substring de "activa"/"activar"/etc.
        expect(`${subject} ${html}`.toLowerCase()).not.toMatch(/\biva\b/)
    })

    it('muestra el bloque del one-shot solo cuando hay prorrateo (trim/anual)', () => {
        const withoutOneShot = buildAddonActivationReceiptEmail(baseCtx).html
        expect(withoutOneShot).not.toContain('Cobro inmediato')

        const withOneShot = buildAddonActivationReceiptEmail({
            ...baseCtx,
            cycleLabel: 'Trimestral',
            oneShotClp: 13487,
        }).html
        expect(withOneShot).toContain('Cobro inmediato')
        expect(withOneShot).toContain('$13.487')
    })
})

describe('buildAddonCancellationReceiptEmail', () => {
    it('con fecha efectiva (regla 4) muestra el fin de período y "sin reembolso"', () => {
        const { subject, html } = buildAddonCancellationReceiptEmail({
            coachName: 'Juan',
            addonLabel: 'Cardio',
            effectiveDate: '1 de julio de 2026',
            subscriptionUrl: 'https://eva-app.cl/coach/subscription',
        })
        expect(subject).toContain('Cardio')
        expect(html).toContain('1 de julio de 2026')
        expect(html.toLowerCase()).toContain('reembolso')
    })

    it('sin fecha efectiva (compromiso mínimo mensual) explica el próximo cobro', () => {
        const { html } = buildAddonCancellationReceiptEmail({
            coachName: 'Juan',
            addonLabel: 'Cardio',
            effectiveDate: null,
            subscriptionUrl: 'https://eva-app.cl/coach/subscription',
        })
        expect(html.toLowerCase()).toContain('compromiso mínimo')
        expect(html.toLowerCase()).toContain('próximo cobro')
    })

    it('CERO mención de IVA (decisión D5)', () => {
        const { subject, html } = buildAddonCancellationReceiptEmail({
            coachName: 'Juan',
            addonLabel: 'Cardio',
            effectiveDate: '1 de julio de 2026',
            subscriptionUrl: 'https://eva-app.cl/coach/subscription',
        })
        // Palabra completa "iva" (impuesto), no el substring de "activar"/etc.
        expect(`${subject} ${html}`.toLowerCase()).not.toMatch(/\biva\b/)
    })
})
