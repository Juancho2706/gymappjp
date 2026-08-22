import { describe, expect, it, vi } from 'vitest'

// `dashboard.queries` arrastra el mundo server (cookies, service-role, cachés de request). Acá se
// prueban SOLO sus resolvers puros: se apagan las dependencias que tocan Supabase/Next.
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/supabase/admin-client', () => ({ createServiceRoleClient: vi.fn() }))

import { buildDemoKpis, hasCustomBrand, parsePersona, EMPTY_DEMO_STATS } from './dashboard.queries'

describe('hasCustomBrand — señal del paso 1 de la guía v2', () => {
    it('el verde sembrado en el alta NO cuenta como marca elegida', () => {
        // Drift documentado: los 6 caminos de alta siembran `#10B981`. Si contara, el coach nuevo
        // arrancaría con el paso 1 tildado sin haber tocado nada.
        expect(
            hasCustomBrand({ logo_url: null, theme_preset_key: null, primary_color: '#10B981' })
        ).toBe(false)
        expect(
            hasCustomBrand({ logo_url: null, theme_preset_key: null, primary_color: '#10b981' })
        ).toBe(false)
    })

    it('el azul EVA por defecto tampoco cuenta', () => {
        expect(
            hasCustomBrand({ logo_url: null, theme_preset_key: null, primary_color: '#1462DC' })
        ).toBe(false)
    })

    it('un color propio, un preset o un logo sí cuentan', () => {
        expect(
            hasCustomBrand({ logo_url: null, theme_preset_key: null, primary_color: '#7C3AED' })
        ).toBe(true)
        expect(
            hasCustomBrand({ logo_url: null, theme_preset_key: 'ember', primary_color: '#10B981' })
        ).toBe(true)
        expect(
            hasCustomBrand({
                logo_url: 'https://x.supabase.co/logo.png',
                theme_preset_key: null,
                primary_color: '#10B981',
            })
        ).toBe(true)
    })

    it('columnas vacías o en blanco no son marca', () => {
        expect(hasCustomBrand({ logo_url: '   ', theme_preset_key: '', primary_color: '' })).toBe(false)
        expect(hasCustomBrand({ logo_url: null, theme_preset_key: null, primary_color: null })).toBe(false)
    })
})

describe('parsePersona', () => {
    it('acepta las 5 personas del CHECK', () => {
        expect(parsePersona('strength')).toBe('strength')
        expect(parsePersona('nutrition')).toBe('nutrition')
        expect(parsePersona('rehab')).toBe('rehab')
        expect(parsePersona('endurance')).toBe('endurance')
        expect(parsePersona('other')).toBe('other')
    })

    it('null / valor desconocido ⇒ null (la guía cae en los pasos de `other`)', () => {
        expect(parsePersona(null)).toBeNull()
        expect(parsePersona(undefined)).toBeNull()
        expect(parsePersona('kinesiologo')).toBeNull()
    })
})

describe('buildDemoKpis — 3 mini-KPIs por persona', () => {
    it('sin datos devuelve los 3 en null (la tarjeta dice «se carga al abrir», no un cero)', () => {
        for (const persona of ['strength', 'nutrition', 'rehab', 'endurance', 'other'] as const) {
            const kpis = buildDemoKpis(persona, EMPTY_DEMO_STATS)
            expect(kpis).toHaveLength(3)
            expect(kpis.every((k) => k.value === null)).toBe(true)
        }
    })

    it('fuerza: programa, sesiones y mejor carga', () => {
        const kpis = buildDemoKpis('strength', {
            ...EMPTY_DEMO_STATS,
            programName: 'Full body 3 días',
            workoutLogCount: 12,
            bestWeightKg: 82.5,
        })
        expect(kpis.map((k) => k.value)).toEqual(['Full body 3 días', '12', '82.5 kg'])
    })

    it('nutrición: pauta activa, comidas registradas y % de grasa', () => {
        const kpis = buildDemoKpis('nutrition', {
            ...EMPTY_DEMO_STATS,
            nutritionPlanCount: 1,
            intakeEntryCount: 21,
            bodyFatPercent: 27.4,
        })
        expect(kpis.map((k) => k.value)).toEqual(['Activa', '21', '27%'])
    })

    it('rehabilitación: la reevaluación solo aparece con un segundo screening', () => {
        const uno = buildDemoKpis('rehab', { ...EMPTY_DEMO_STATS, movementAssessmentCount: 1 })
        expect(uno[0].value).toBe('Hecho')
        expect(uno[2].value).toBeNull()

        const dos = buildDemoKpis('rehab', { ...EMPTY_DEMO_STATS, movementAssessmentCount: 2 })
        expect(dos[2].value).toBe('1')
    })

    it('resistencia: las zonas necesitan FC de reposo Y marca de 5K', () => {
        const soloFc = buildDemoKpis('endurance', { ...EMPTY_DEMO_STATS, restingHr: 58 })
        expect(soloFc[0].value).toBeNull()

        const completo = buildDemoKpis('endurance', {
            ...EMPTY_DEMO_STATS,
            restingHr: 58,
            ref5kTimeSec: 1500,
        })
        expect(completo[0].value).toBe('Calculadas')
    })
})
