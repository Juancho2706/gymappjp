import { describe, expect, it } from 'vitest'
import { TIER_CONFIG, studentCountLabel } from '@eva/tiers'
import {
    buildBetaTrialEndedFreeEmail,
    buildClientArchivedEmail,
    buildClientUnarchivedEmail,
    buildClientWelcomeEmail,
    buildCoachEmailConfirmationEmail,
    buildExistingCoachAnnouncementEmail,
    buildFreeCoachWelcomeEmail,
    buildOrgInactiveClientsEmail,
    buildProgramAssignedEmail,
    buildTrialExpiredEmail,
    buildTrialExpiryWarningEmail,
} from './transactional-templates'
import { assertNoPrices, assertOnlyCatalogPrice } from './__tests__/no-prices'

/**
 * Guard anti-precios de los correos TRANSACCIONALES (embudo Free→Pro W2.3).
 *
 * Regla del SPEC (§Reglas de producto 5): el precio vive en la página de checkout, no embebido en
 * un correo que puede leerse meses después. Las DOS excepciones están declaradas abajo y son
 * catálogo-driven (`TIER_CONFIG[tier].monthlyPriceClp`, lo pasa el cron `trial-expiry`), no
 * literales: ésas se pinnean contra el catálogo en vez de prohibirse.
 */

const APP_URL = 'https://www.eva-app.cl'

describe('buildFreeCoachWelcomeEmail — bienvenida del coach Free', () => {
    const ctx = {
        coachName: 'Josefa',
        brandName: 'Studio Fuerza',
        dashboardUrl: `${APP_URL}/coach/dashboard`,
        clientsUrl: `${APP_URL}/coach/clients`,
        subscriptionUrl: `${APP_URL}/coach/subscription`,
    }

    it('no lleva precios', () => {
        assertNoPrices(buildFreeCoachWelcomeEmail(ctx).html)
    })

    // W2.4: `subscriptionUrl` se pasaba desde siempre y el cuerpo NUNCA lo renderizaba.
    it('renderiza subscriptionUrl dentro del bloque «Cómo funciona EVA»', () => {
        const { html } = buildFreeCoachWelcomeEmail(ctx)
        expect(html).toContain('Cómo funciona EVA')
        expect(html).toContain(`href="${ctx.subscriptionUrl}"`)
    })

    it('explica dónde se administra el plan (web) y qué hace la app del teléfono', () => {
        const { html } = buildFreeCoachWelcomeEmail(ctx)
        expect(html).toContain('Tu cuenta, tu plan y tu facturación se administran desde')
        expect(html).toContain('con tu mismo correo y contraseña')
        expect(html).toContain('los cambios de plan')
        expect(html).toContain('se hacen en la web')
    })

    /**
     * I-6: el cupo de Pro estaba escrito a mano («hasta 25 alumnos»). Es el mismo número que Pricing
     * v3 movió una vez y volverá a mover: cableado, el correo de bienvenida de TODOS los coaches
     * nuevos empieza a mentir el día del cambio y nadie se entera. Este test lo pinnea contra el
     * catálogo, así que un cambio de `TIER_CONFIG` que olvide el correo rompe acá.
     */
    it('el cupo de Pro sale del catálogo, no de un literal', () => {
        const { html } = buildFreeCoachWelcomeEmail(ctx)
        expect(html).toContain(studentCountLabel(TIER_CONFIG.pro.maxClients))
        expect(html).not.toContain('1 alumnos')
    })

    // «tarda menos de 2 minutos»: promesa de tiempo que nadie mide y que el checkout con MP no
    // cumple. Fuera.
    it('no promete cuánto tarda el cambio de plan', () => {
        expect(buildFreeCoachWelcomeEmail(ctx).html).not.toContain('2 minutos')
    })

    // M-8bis: el plan gratuito cubre UN alumno desde Pricing v3. El plural contradecía al producto
    // en la primera línea que ve el coach en su bandeja.
    it('la preview habla de UN primer alumno, no de «tus primeros alumnos»', () => {
        const { html } = buildFreeCoachWelcomeEmail(ctx)
        expect(html).toContain('Empieza gratis con tu primer alumno')
        expect(html).not.toContain('tus primeros alumnos')
    })
})

describe('correos transaccionales al COACH — sin precios', () => {
    it('confirmación de correo', () => {
        assertNoPrices(buildCoachEmailConfirmationEmail({ coachName: 'Josefa', confirmUrl: `${APP_URL}/auth/confirm?x=1` }).html)
    })

    it('anuncio a coaches existentes', () => {
        assertNoPrices(
            buildExistingCoachAnnouncementEmail({
                coachName: 'Josefa',
                currentTier: 'Pro',
                subscriptionUrl: `${APP_URL}/coach/subscription`,
            }).html
        )
    })

    it('fin de beta → plan gratuito', () => {
        assertNoPrices(buildBetaTrialEndedFreeEmail({ coachName: 'Josefa', appUrl: APP_URL }).html)
    })

    it('alerta de alumnos inactivos (org)', () => {
        assertNoPrices(
            buildOrgInactiveClientsEmail({
                orgName: 'Gimnasio Norte',
                adminName: 'Rodrigo',
                inactiveClients: [{ name: 'Ana', coachName: 'Josefa', daysSinceLastLog: 12 }],
                orgUrl: `${APP_URL}/org/gimnasio-norte`,
            }).html
        )
    })
})

/**
 * W2.6 (flujo-coach-nuevo): el correo del alumno era el callejón 14 — decía «responde este correo»
 * y la respuesta llegaba a EVA, que no puede ayudarlo. Y la clave iba ARRIBA del botón, así que en
 * el teléfono el CTA quedaba bajo el pliegue.
 */
describe('buildClientWelcomeEmail — acceso arriba, clave abajo y reply al coach', () => {
    const base = {
        brandName: 'Studio Fuerza',
        coachName: 'Josefa',
        clientName: 'Ana',
        loginUrl: `${APP_URL}/c/studio-fuerza/login`,
        tempPassword: 'Temporal2026',
    }

    it('devuelve replyTo con el correo del coach', () => {
        const { replyTo } = buildClientWelcomeEmail({ ...base, coachEmail: 'josefa@example.com' })
        expect(replyTo).toBe('josefa@example.com')
    })

    it('sin correo del coach no inventa un replyTo', () => {
        expect(buildClientWelcomeEmail(base).replyTo).toBeUndefined()
        expect(buildClientWelcomeEmail({ ...base, coachEmail: '   ' }).replyTo).toBeUndefined()
    })

    it('con replyTo, la línea de respuesta nombra al coach', () => {
        const { html } = buildClientWelcomeEmail({ ...base, coachEmail: 'josefa@example.com' })
        expect(html).toContain('responde este correo y le llega a Josefa')
    })

    it('sin replyTo conserva la línea genérica (la respuesta va a EVA)', () => {
        const { html } = buildClientWelcomeEmail(base)
        expect(html).toContain('Si tienes algún problema, responde este correo.')
        expect(html).not.toContain('le llega a Josefa')
    })

    // El orden ES el cambio: el botón de entrar va antes del bloque de credenciales.
    it('el CTA de entrar aparece ANTES del bloque «Tus datos de acceso»', () => {
        const { html } = buildClientWelcomeEmail({ ...base, coachEmail: 'josefa@example.com' })
        const cta = html.indexOf('Entrar a mi cuenta')
        const credentials = html.indexOf('Tus datos de acceso')
        expect(cta).toBeGreaterThan(-1)
        expect(credentials).toBeGreaterThan(-1)
        expect(cta).toBeLessThan(credentials)
    })

    it('la clave temporal sigue estando (el alumno la necesita para entrar)', () => {
        expect(buildClientWelcomeEmail(base).html).toContain('Temporal2026')
    })
})

describe('correos transaccionales al ALUMNO — sin precios', () => {
    it('bienvenida del alumno', () => {
        assertNoPrices(
            buildClientWelcomeEmail({
                brandName: 'Studio Fuerza',
                coachName: 'Josefa',
                clientName: 'Ana',
                loginUrl: `${APP_URL}/c/studio-fuerza/login`,
                tempPassword: 'Temporal2026',
            }).html
        )
    })

    it('programa asignado', () => {
        assertNoPrices(
            buildProgramAssignedEmail({
                brandName: 'Studio Fuerza',
                clientName: 'Ana',
                programName: 'Fuerza 12 semanas',
                startDate: '25 de agosto',
                dashboardUrl: `${APP_URL}/c/studio-fuerza`,
            }).html
        )
    })

    it('alumno archivado', () => {
        assertNoPrices(
            buildClientArchivedEmail({
                clientName: 'Ana',
                coachBrandName: 'Studio Fuerza',
                coachName: 'Josefa',
                coachEmail: 'josefa@example.com',
                coachPublicUrl: `${APP_URL}/c/studio-fuerza`,
            }).html
        )
    })

    it('alumno reactivado', () => {
        assertNoPrices(
            buildClientUnarchivedEmail({
                clientName: 'Ana',
                coachBrandName: 'Studio Fuerza',
                coachName: 'Josefa',
                loginUrl: `${APP_URL}/c/studio-fuerza/login`,
            }).html
        )
    })
})

/**
 * EXCEPCIÓN DECLARADA (21-08): los dos correos de fin de prueba SÍ imprimen un precio, pero lo
 * reciben del catálogo (`api/cron/trial-expiry/route.ts` pasa `recConfig.monthlyPriceClp`), no de
 * un literal. Se pinnea que el único precio del HTML sea ése.
 */
describe('fin de prueba — el ÚNICO precio es el del catálogo', () => {
    const base = {
        coachName: 'Josefa',
        brandName: 'Studio Fuerza',
        activeClientCount: 8,
        recommendedTierLabel: TIER_CONFIG.pro.label,
        recommendedTierSlug: 'pro',
        recommendedMaxClients: TIER_CONFIG.pro.maxClients,
        recommendedPriceClp: TIER_CONFIG.pro.monthlyPriceClp,
        reactivateUrl: `${APP_URL}/coach/subscription`,
    }

    it('aviso de vencimiento', () => {
        assertOnlyCatalogPrice(buildTrialExpiryWarningEmail({ ...base, daysLeft: 3 }).html, TIER_CONFIG.pro.monthlyPriceClp)
    })

    it('prueba vencida', () => {
        assertOnlyCatalogPrice(buildTrialExpiredEmail(base).html, TIER_CONFIG.pro.monthlyPriceClp)
    })
})
