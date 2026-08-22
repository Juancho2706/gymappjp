import { describe, expect, it } from 'vitest'
import { TIER_CONFIG, studentCountLabel } from '@eva/tiers'
import { buildDripTemplates, DRIP_TEMPLATE_KEYS, DRIP_UNSUBSCRIBE_FOOTER } from './drip-templates'
import { assertNoPrices, assertOnlyCatalogPrice, countLinks } from './__tests__/no-prices'

/**
 * Tests de RENDER puro (sin red, sin DB) de la serie de bienvenida del coach Free.
 *
 * Pinnean el contrato del embudo Free→Pro (SPEC §Reglas 4-5):
 *   1. CERO precios fuera de D+2 y D+14, y ahí el precio es el del CATÁLOGO vivo.
 *   2. UN solo link por correo.
 *   3. Pie de baja en texto plano en los cuatro (comunicación que EVA inicia sola).
 */

const BASE_URL = 'https://www.eva-app.cl'

const CTX: Parameters<typeof buildDripTemplates>[0] = {
    coachName: 'Josefa',
    brandName: 'Studio Fuerza',
    baseUrl: BASE_URL,
    inviteCode: 'X5UD9X44',
}

function byKey(key: string, ctx: Parameters<typeof buildDripTemplates>[0] = CTX) {
    const t = buildDripTemplates(ctx).find((tpl) => tpl.key === key)
    if (!t) throw new Error(`template ${key} no existe`)
    return t
}

describe('buildDripTemplates — forma de la serie', () => {
    it('devuelve exactamente las 4 keys de DRIP_TEMPLATE_KEYS, en orden y con sus días', () => {
        const templates = buildDripTemplates(CTX)
        expect(templates.map((t) => t.key)).toEqual([...DRIP_TEMPLATE_KEYS])
        expect(templates.map((t) => t.day)).toEqual([1, 2, 7, 14])
    })

    it('ninguna plantilla queda con subject o html vacío', () => {
        for (const t of buildDripTemplates(CTX)) {
            expect(t.subject.length).toBeGreaterThan(0)
            expect(t.html.length).toBeGreaterThan(0)
        }
    })

    it('las 4 llevan el pie de baja en TEXTO PLANO (sin segundo link)', () => {
        for (const t of buildDripTemplates(CTX)) {
            expect(t.html).toContain(DRIP_UNSUBSCRIBE_FOOTER)
            expect(countLinks(t.html)).toBe(1)
        }
    })

    it('sin coachName/brandName cae a los genéricos y no imprime null', () => {
        const templates = buildDripTemplates({ coachName: null, brandName: null, baseUrl: BASE_URL, inviteCode: null })
        for (const t of templates) {
            expect(t.subject).not.toContain('null')
            expect(t.html).not.toContain('null')
        }
        expect(templates[0].subject).toContain('Coach')
    })

    // El coach sin `brand_name` todavía no eligió una marca; lo que sí tiene es una app.
    // «entra directo a tu marca» no se entiende, «entra directo a tu app» sí.
    it('sin brandName el fallback es «tu app», nunca «tu marca»', () => {
        const templates = buildDripTemplates({ coachName: 'Josefa', brandName: null, baseUrl: BASE_URL, inviteCode: 'X5UD9X44' })
        const day1 = templates.find((t) => t.key === 'day1_value')!
        expect(day1.html).toContain('entra directo a tu app')
        expect(day1.html).not.toContain('entra directo a tu marca')
    })
})

describe('day1_value — valor, sin precio', () => {
    it('deja el link de invitación listo para copiar y es el ÚNICO link del correo', () => {
        const { html, subject } = byKey('day1_value')
        expect(subject).toContain('Josefa')
        expect(html).toContain(`${BASE_URL}/join/X5UD9X44`)
        expect(countLinks(html)).toBe(1)
    })

    it('nombra la marca del coach y las 3 acciones del día', () => {
        const { html } = byKey('day1_value')
        expect(html).toContain('Studio Fuerza')
        expect(html).toContain('Invítalo con el link')
        expect(html).toContain('Asígnale una rutina')
        expect(html).toContain('Súmale su plan de nutrición')
    })

    it('sin invite_code no rompe: manda a Alumnos y sigue con un solo link', () => {
        const { html } = byKey('day1_value', { ...CTX, inviteCode: null })
        expect(html).not.toContain('/join/')
        expect(html).toContain(`${BASE_URL}/coach/clients`)
        expect(countLinks(html)).toBe(1)
    })

    // M-7: sin código el cuerpo manda a Alumnos, así que el asunto y la preview no pueden seguir
    // prometiendo «tu link ya está listo» — es una promesa que ese correo no cumple.
    it('sin invite_code cambian TAMBIÉN el asunto y la preview', () => {
        const con = byKey('day1_value')
        const sin = byKey('day1_value', { ...CTX, inviteCode: null })

        expect(con.subject).toBe('Josefa, tu link de invitación ya está listo')
        expect(con.html).toContain('Cópialo, mándalo por WhatsApp y tu alumno entra hoy mismo.')

        expect(sin.subject).toBe('Josefa, tu app ya está lista')
        expect(sin.html).toContain('Invita a tu primer alumno desde Alumnos.')
        expect(sin.html).not.toContain('Cópialo, mándalo por WhatsApp')
    })

    // El link de invitación es el que el coach REENVÍA a sus alumnos: etiquetarlo atribuiría al drip
    // altas de alumnos, que no es lo que mide este correo.
    it('el link de invitación va SIN utm', () => {
        const { html } = byKey('day1_value')
        expect(html).toContain(`${BASE_URL}/join/X5UD9X44`)
        expect(html).not.toContain('utm_source')
    })

    it('no lleva precios', () => {
        assertNoPrices(byKey('day1_value').html)
        assertNoPrices(byKey('day1_value', { ...CTX, inviteCode: null }).html)
    })
})

describe('day2_pro — el único correo del cupo, con el precio del catálogo', () => {
    it('lleva EXACTAMENTE el precio de TIER_CONFIG.pro y ningún otro número con forma de precio', () => {
        assertOnlyCatalogPrice(byKey('day2_pro').html, TIER_CONFIG.pro.monthlyPriceClp)
    })

    it('usa studentCountLabel para los cupos (nunca «1 alumnos»)', () => {
        const { html } = byKey('day2_pro')
        expect(html).toContain(studentCountLabel(TIER_CONFIG.pro.maxClients))
        expect(html).toContain(studentCountLabel(TIER_CONFIG.free.maxClients))
        expect(html).not.toContain('1 alumnos')
    })

    it('nombra el sello «Hecho con EVA» y ofrece archivar como alternativa', () => {
        const { html } = byKey('day2_pro')
        expect(html).toContain('Hecho con EVA')
        expect(html).toContain('archivar')
    })

    it('el único CTA va al checkout con utm_campaign=day2_pro', () => {
        const { html } = byKey('day2_pro')
        expect(countLinks(html)).toBe(1)
        expect(html).toContain('/coach/subscription?utm_source=drip&utm_medium=email&utm_campaign=day2_pro')
    })
})

describe('day7_nutrition — nutrición incluida, sin precio', () => {
    it('dice que la nutrición está incluida en el plan gratuito y manda a nutrición', () => {
        const { html } = byKey('day7_nutrition')
        expect(html).toContain('gratuito')
        expect(html.toLowerCase()).toContain('nutrición')
        expect(html).toContain(`${BASE_URL}/coach/nutrition-plans`)
        expect(countLinks(html)).toBe(1)
    })

    // M-6: era el único CTA de la serie sin atribución — el D+7 se veía como tráfico directo.
    it('su único CTA lleva utm_campaign=day7_nutrition', () => {
        const { html } = byKey('day7_nutrition')
        expect(html).toContain(
            `${BASE_URL}/coach/nutrition-plans?utm_source=drip&utm_medium=email&utm_campaign=day7_nutrition`
        )
        expect(countLinks(html)).toBe(1)
    })

    it('no lleva precios', () => {
        assertNoPrices(byKey('day7_nutrition').html)
    })
})

describe('day14_last_call — última llamada, precio del catálogo', () => {
    it('lleva EXACTAMENTE el precio de TIER_CONFIG.pro y ningún otro', () => {
        assertOnlyCatalogPrice(byKey('day14_last_call').html, TIER_CONFIG.pro.monthlyPriceClp)
    })

    it('el único CTA va al checkout con utm_campaign=day14_last_call', () => {
        const { html } = byKey('day14_last_call')
        expect(countLinks(html)).toBe(1)
        expect(html).toContain('/coach/subscription?utm_source=drip&utm_medium=email&utm_campaign=day14_last_call')
    })

    it('cierra sin presión: declara que es el último de la serie y que el plan gratuito no vence', () => {
        const { html } = byKey('day14_last_call')
        expect(html).toContain('La serie llega hasta acá, Josefa')
        expect(html).toContain('último correo')
        expect(html).toContain('sin fecha de vencimiento')
    })
})
