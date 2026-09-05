import { describe, expect, it } from 'vitest'
import {
    buildClientLimitReachedEmail,
    buildPlanExpiredEmail,
    buildPlanExpiringSoonEmail,
    formatSalesEmailDate,
} from './sales-templates'
import { assertNoPrices, countLinks } from './__tests__/no-prices'

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

// `countLinks` y `assertNoPrices` viven en `./__tests__/no-prices` desde W2.3 del embudo Free→Pro:
// el mismo contrato lo comparten el drip y los transaccionales.

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

    // El default es el gatillo por evento: alguien SÍ intentó agregar y el server lo rechazó.
    it('sin trigger (default attempt) mantiene el copy del rechazo real', () => {
        const { html } = buildClientLimitReachedEmail(ctx)
        expect(html).toContain('Por eso no pudimos sumar al alumno que intentaste agregar.')
        expect(html).toContain('Tu plan Gratis llegó a 3 alumnos activos.')
        expect(buildClientLimitReachedEmail({ ...ctx, trigger: 'attempt' }).html).toBe(html)
    })

    // El correo por rechazo lo pide el propio coach al intentar el alta: no es comunicación no
    // solicitada, así que NO lleva el pie de baja (ley 19.496 art. 28 B) y su render no cambia.
    it('el gatillo attempt no lleva el pie de baja de envíos', () => {
        const { html } = buildClientLimitReachedEmail(ctx)
        expect(html).not.toContain('dejamos de enviarlos')
        expect(buildClientLimitReachedEmail({ ...ctx, trigger: 'attempt' }).html).not.toContain(
            'dejamos de enviarlos'
        )
    })
})

/**
 * Variante `sweep`: la manda el cron `cap-nudge` a coaches que YA están en cupo sin haber intentado
 * agregar a nadie (con Free = 1 son mayoría). Regla dura de la SPEC embudo-free-pro: jamás decirle
 * «intentaste agregar» a quien no intentó.
 */
describe('buildClientLimitReachedEmail — variante sweep (cron cap-nudge)', () => {
    const ctx = {
        coachName: 'Josefa',
        tierLabel: 'Gratis',
        currentLimit: 3,
        subscriptionUrl: SUBSCRIPTION_URL,
        trigger: 'sweep' as const,
    }

    it('nunca acusa un intento que no existió', () => {
        const { html } = buildClientLimitReachedEmail(ctx)
        expect(html).not.toContain('intentaste')
        expect(html).toContain(
            'El próximo alumno que quieras sumar no va a entrar hasta que liberes un cupo o amplíes tu plan.'
        )
    })

    it('el preview habla del cupo ocupado, no de un rechazo', () => {
        const { html } = buildClientLimitReachedEmail(ctx)
        expect(html).toContain('Tu plan Gratis ya usa su cupo de 3 alumnos.')
        expect(html).not.toContain('llegó a 3 alumnos activos')
    })

    // Pricing v3: el barrido apunta sobre todo a los Free con 1/1 ⇒ jamás «1 alumnos».
    it('cupo 1 singulariza subject, cuerpo y preview', () => {
        const { subject, html } = buildClientLimitReachedEmail({ ...ctx, currentLimit: 1 })
        expect(subject).toBe('Alcanzaste el límite de 1 alumno de tu plan Gratis')
        expect(html).toContain('1 alumno activo')
        expect(html).toContain('Tu plan Gratis ya usa su cupo de 1 alumno.')
        expect(html).not.toContain('1 alumnos')
    })

    it('sigue siendo UN solo CTA a /coach/subscription, sin precios', () => {
        const { html } = buildClientLimitReachedEmail({ ...ctx, recommendedTierLabel: 'Pro' })
        expect(countLinks(html)).toBe(1)
        expect(html).toContain(`href="${SUBSCRIPTION_URL}"`)
        expect(html).toContain('Pasar a Pro')
        assertNoPrices(html)
    })

    /**
     * Ley 19.496 art. 28 B: el barrido lo inicia EVA sin acción del coach ⇒ comunicación
     * promocional no solicitada, y el pie tiene que dar una dirección válida para pedir la baja.
     * El aviso va en TEXTO PLANO: sumar un `<a>` rompería el contrato de UN solo link.
     */
    it('lleva el pie de baja de envíos con dirección válida, en texto plano', () => {
        const { html } = buildClientLimitReachedEmail(ctx)
        expect(html).toContain('contacto@eva-app.cl')
        expect(html).toContain('dejamos de enviarlos')
        expect(countLinks(html)).toBe(1)
        assertNoPrices(html)
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
    const ctx = { coachName: 'Ani', tierLabel: 'Pro', subscriptionUrl: SUBSCRIPTION_URL }

    it('subject tranquiliza: los datos siguen guardados', () => {
        const { subject } = buildPlanExpiredEmail(ctx)
        expect(subject).toBe('Tu plan venció — tus alumnos y datos siguen guardados')
    })

    it('el cuerpo promete explícitamente que no se borró nada', () => {
        const { html } = buildPlanExpiredEmail(ctx)
        expect(html).toContain('no borramos nada')
        expect(html).toContain('Ani')
        expect(html).toContain('Pro')
    })

    it('un solo CTA de reactivación, sin listas de precios', () => {
        const { html } = buildPlanExpiredEmail(ctx)
        expect(countLinks(html)).toBe(1)
        expect(html).toContain(`href="${SUBSCRIPTION_URL}"`)
        expect(html).toContain('Reactivar mi plan')
        assertNoPrices(html)
    })
})
