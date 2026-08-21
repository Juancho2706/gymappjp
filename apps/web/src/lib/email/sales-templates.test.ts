import { describe, expect, it } from 'vitest'
import {
    buildClientLimitReachedEmail,
    buildPlanExpiredEmail,
    buildPlanExpiringSoonEmail,
    formatSalesEmailDate,
} from './sales-templates'

/**
 * Tests de RENDER puro (sin red, sin DB) de los correos de VENTA que reemplazan a los CTA de pago
 * purgados de la app móvil por compliance de tiendas.
 *
 * Pinnean las tres reglas de contenido que NO pueden erosionarse:
 *   1. CERO listas de precios (un correo con precios stale es peor que ninguno).
 *   2. UN solo CTA, siempre a /coach/subscription.
 *   3. Español con tildes y el dato concreto del evento (cupo, tier, fecha).
 */

const SUBSCRIPTION_URL = 'https://www.eva-app.cl/coach/subscription'

/** Cuenta los <a> del HTML: el contrato es exactamente un CTA por correo. */
function countLinks(html: string): number {
    return (html.match(/<a\s/g) ?? []).length
}

/** Ningún correo de venta puede llevar precios embebidos (formato CLP $19.990 / 19990). */
function assertNoPrices(html: string) {
    expect(html).not.toMatch(/\$\s?\d/)
    expect(html).not.toMatch(/\b\d{2}\.\d{3}\b/)
    expect(html.toLowerCase()).not.toContain('/mes')
}

describe('formatSalesEmailDate', () => {
    it('formatea es-CL día + mes + año (espejo del dunning)', () => {
        expect(formatSalesEmailDate('2026-08-03T12:00:00.000Z')).toContain('2026')
        expect(formatSalesEmailDate('2026-08-03T12:00:00.000Z')).toContain('agosto')
    })
})

describe('buildClientLimitReachedEmail', () => {
    const ctx = {
        coachName: 'Josefa',
        tierLabel: 'Gratis',
        currentLimit: 3,
        subscriptionUrl: SUBSCRIPTION_URL,
    }

    it('subject nombra el cupo y el tier', () => {
        const { subject } = buildClientLimitReachedEmail(ctx)
        expect(subject).toBe('Alcanzaste el límite de 3 alumnos de tu plan Gratis')
    })

    // Pricing v3: el cupo free pasa a 1 ⇒ el copy no puede decir "1 alumnos".
    it('cupo 1 (free v3) singulariza subject y cuerpo', () => {
        const { subject, html } = buildClientLimitReachedEmail({ ...ctx, currentLimit: 1 })
        expect(subject).toBe('Alcanzaste el límite de 1 alumno de tu plan Gratis')
        expect(html).toContain('1 alumno activo')
        expect(html).not.toContain('1 alumnos')
    })

    it('el cuerpo lleva el nombre del coach, el cupo y el tier', () => {
        const { html } = buildClientLimitReachedEmail(ctx)
        expect(html).toContain('Josefa')
        expect(html).toContain('3 alumnos activos')
        expect(html).toContain('Gratis')
    })

    it('un solo CTA, a /coach/subscription, sin listas de precios', () => {
        const { html } = buildClientLimitReachedEmail(ctx)
        expect(countLinks(html)).toBe(1)
        expect(html).toContain(`href="${SUBSCRIPTION_URL}"`)
        assertNoPrices(html)
    })

    it('escapa el nombre del coach (input controlado por el usuario)', () => {
        const { html } = buildClientLimitReachedEmail({ ...ctx, coachName: '<script>x</script>' })
        expect(html).not.toContain('<script>')
        expect(html).toContain('&lt;script&gt;')
    })

    // Pricing v2 (D3): el upsell apunta a Pro — jamás a Starter (fuera de venta).
    it('con tier recomendado, el copy y el CTA apuntan a ese plan (Pro) y nunca a Starter', () => {
        const { html } = buildClientLimitReachedEmail({ ...ctx, recommendedTierLabel: 'Pro' })
        expect(html).toContain('Con el plan <strong style="color:#111827;">Pro</strong>')
        expect(html).toContain('Pasar a Pro')
        expect(html).not.toContain('Starter')
        // Sigue siendo UN solo CTA a /coach/subscription, sin precios.
        expect(countLinks(html)).toBe(1)
        expect(html).toContain(`href="${SUBSCRIPTION_URL}"`)
        assertNoPrices(html)
    })

    it('sin tier recomendado (elite/legacy) conserva el copy genérico', () => {
        const { html } = buildClientLimitReachedEmail({ ...ctx, recommendedTierLabel: null })
        expect(html).toContain('Con un plan más grande')
        expect(html).toContain('Ampliar mi plan')
    })
})

describe('buildPlanExpiringSoonEmail', () => {
    const ctx = {
        coachName: 'Diego',
        tierLabel: 'Pro',
        expiresOn: '3 de agosto de 2026',
        daysLeft: 3,
        subscriptionUrl: SUBSCRIPTION_URL,
    }

    it('subject nombra el tier y la fecha exacta', () => {
        const { subject } = buildPlanExpiringSoonEmail(ctx)
        expect(subject).toBe('Tu plan Pro vence el 3 de agosto de 2026')
    })

    it('pluraliza los días restantes', () => {
        expect(buildPlanExpiringSoonEmail(ctx).html).toContain('quedan 3 días')
        expect(buildPlanExpiringSoonEmail({ ...ctx, daysLeft: 1 }).html).toContain('queda 1 día')
    })

    it('un solo CTA de renovación, sin listas de precios', () => {
        const { html } = buildPlanExpiringSoonEmail(ctx)
        expect(countLinks(html)).toBe(1)
        expect(html).toContain(`href="${SUBSCRIPTION_URL}"`)
        expect(html).toContain('Renovar mi plan')
        assertNoPrices(html)
    })
})

describe('buildPlanExpiredEmail', () => {
    const ctx = { coachName: 'Ani', tierLabel: 'Starter', subscriptionUrl: SUBSCRIPTION_URL }

    it('subject tranquiliza: los datos siguen guardados', () => {
        const { subject } = buildPlanExpiredEmail(ctx)
        expect(subject).toBe('Tu plan venció — tus alumnos y datos siguen guardados')
    })

    it('el cuerpo promete explícitamente que no se borró nada', () => {
        const { html } = buildPlanExpiredEmail(ctx)
        expect(html).toContain('no borramos nada')
        expect(html).toContain('Ani')
        expect(html).toContain('Starter')
    })

    it('un solo CTA de reactivación, sin listas de precios', () => {
        const { html } = buildPlanExpiredEmail(ctx)
        expect(countLinks(html)).toBe(1)
        expect(html).toContain(`href="${SUBSCRIPTION_URL}"`)
        expect(html).toContain('Reactivar mi plan')
        assertNoPrices(html)
    })
})
