import { describe, it, expect } from 'vitest'
import type { ExchangeGroup } from '@/domain/nutrition/exchange.types'
import {
    expandComposedGroups,
    macrosForTargets,
    dayTotals,
    dayTotalsByVariant,
    portionsSummaryLabel,
    hasUnconfirmedMacros,
    exchangeGroupColor,
    EXCHANGE_FALLBACK_COLORS,
} from './exchange-calc'

/** Valores provisorios del seed (SMAE/UDD, macros_confirmed=false) — PLAN §Seed. */
function g(partial: Partial<ExchangeGroup> & Pick<ExchangeGroup, 'id' | 'code'>): ExchangeGroup {
    return {
        slug: partial.code.toLowerCase(),
        name: partial.code,
        coachId: null,
        teamId: null,
        isSystem: true,
        refCalories: 0,
        refProteinG: 0,
        refCarbsG: 0,
        refFatsG: 0,
        color: null,
        sortOrder: 100,
        composedOf: null,
        macrosConfirmed: false,
        ...partial,
    }
}

const C = g({ id: 'g-c', code: 'C', refCalories: 70, refProteinG: 2, refCarbsG: 15, refFatsG: 0, sortOrder: 1 })
const P = g({ id: 'g-p', code: 'P', refCalories: 55, refProteinG: 7, refCarbsG: 0, refFatsG: 3, sortOrder: 2 })
const F = g({ id: 'g-f', code: 'F', refCalories: 60, refProteinG: 0, refCarbsG: 15, refFatsG: 0, sortOrder: 3 })
const LAC = g({ id: 'g-lac', code: 'LAC', refCalories: 95, refProteinG: 9, refCarbsG: 12, refFatsG: 2, sortOrder: 5, macrosConfirmed: true })
const LEG = g({
    id: 'g-leg',
    code: 'LEG',
    refCalories: 0,
    sortOrder: 9,
    composedOf: [
        { code: 'P', portions: 1 },
        { code: 'C', portions: 1 },
    ],
})
const GROUPS = [C, P, F, LAC, LEG]

describe('expandComposedGroups', () => {
    it('grupo simple pasa tal cual', () => {
        const out = expandComposedGroups([{ exchangeGroupId: 'g-c', portions: 2 }], GROUPS)
        expect(out).toHaveLength(1)
        expect(out[0].group.code).toBe('C')
        expect(out[0].portions).toBe(2)
    })

    it('LEG expande a 1P + 1C por porción (2 LEG ⇒ 2P + 2C)', () => {
        const out = expandComposedGroups([{ exchangeGroupId: 'g-leg', portions: 2 }], GROUPS)
        expect(out).toHaveLength(2)
        expect(out.map((o) => `${o.portions}${o.group.code}`).sort()).toEqual(['2C', '2P'])
        expect(out.every((o) => o.sourceGroup.code === 'LEG')).toBe(true)
    })

    it('compuesto con código irresoluble NO expande (fallback a sus propios ref_*)', () => {
        const broken = g({ id: 'g-x', code: 'X', refCalories: 99, composedOf: [{ code: 'ZZZ', portions: 1 }] })
        const out = expandComposedGroups([{ exchangeGroupId: 'g-x', portions: 1 }], [...GROUPS, broken])
        expect(out).toHaveLength(1)
        expect(out[0].group.id).toBe('g-x')
    })

    it('omite targets de grupos desconocidos y porciones <= 0', () => {
        const out = expandComposedGroups(
            [
                { exchangeGroupId: 'no-such', portions: 1 },
                { exchangeGroupId: 'g-c', portions: 0 },
            ],
            GROUPS
        )
        expect(out).toHaveLength(0)
    })
})

describe('macrosForTargets (golden)', () => {
    it('desayuno de Fran: 2C + 1LAC + 1F', () => {
        const m = macrosForTargets(
            [
                { exchangeGroupId: 'g-c', portions: 2 },
                { exchangeGroupId: 'g-lac', portions: 1 },
                { exchangeGroupId: 'g-f', portions: 1 },
            ],
            GROUPS
        )
        // 2×70 + 95 + 60 = 295 kcal · P 2×2+9 = 13 · CHO 2×15+12+15 = 57 · G 2×0+2+0 = 2
        expect(m).toEqual({ calories: 295, proteinG: 13, carbsG: 57, fatsG: 2 })
    })

    it('fracciones 0.5 con redondeo a 1 decimal', () => {
        const m = macrosForTargets([{ exchangeGroupId: 'g-p', portions: 0.5 }], GROUPS)
        expect(m).toEqual({ calories: 27.5, proteinG: 3.5, carbsG: 0, fatsG: 1.5 })
    })

    it('grupo compuesto: 1 LEG = macros de 1P + 1C', () => {
        const leg = macrosForTargets([{ exchangeGroupId: 'g-leg', portions: 1 }], GROUPS)
        expect(leg).toEqual({ calories: 125, proteinG: 9, carbsG: 15, fatsG: 3 })
    })

    it('lista vacía ⇒ cero', () => {
        expect(macrosForTargets([], GROUPS)).toEqual({ calories: 0, proteinG: 0, carbsG: 0, fatsG: 0 })
    })
})

describe('dayTotals / dayTotalsByVariant', () => {
    const desayuno = { targets: [{ exchangeGroupId: 'g-c', portions: 2 }], dayVariantId: null }
    const almuerzoDescanso = { targets: [{ exchangeGroupId: 'g-p', portions: 2 }], dayVariantId: 'v-desc' }
    const almuerzoEntreno = { targets: [{ exchangeGroupId: 'g-p', portions: 3 }], dayVariantId: 'v-entr' }

    it('suma todas las comidas sin variantes', () => {
        const t = dayTotals([desayuno, almuerzoDescanso], GROUPS)
        expect(t.calories).toBe(2 * 70 + 2 * 55)
    })

    it('sin variantes definidas devuelve una sola entrada null', () => {
        const rows = dayTotalsByVariant([desayuno], [], GROUPS)
        expect(rows).toHaveLength(1)
        expect(rows[0].variantId).toBeNull()
        expect(rows[0].totals.calories).toBe(140)
    })

    it('comida con variante NULL cuenta en TODAS las variantes', () => {
        const rows = dayTotalsByVariant(
            [desayuno, almuerzoDescanso, almuerzoEntreno],
            [
                { id: 'v-desc', name: 'Descanso' },
                { id: 'v-entr', name: 'Entreno AM' },
            ],
            GROUPS
        )
        expect(rows).toHaveLength(2)
        const desc = rows.find((r) => r.variantId === 'v-desc')!
        const entr = rows.find((r) => r.variantId === 'v-entr')!
        expect(desc.totals.calories).toBe(140 + 110) // desayuno (todas) + 2P
        expect(entr.totals.calories).toBe(140 + 165) // desayuno (todas) + 3P
    })
})

describe('portionsSummaryLabel', () => {
    it('ordena por sort_order y formatea fracciones', () => {
        const label = portionsSummaryLabel(
            [
                { exchangeGroupId: 'g-lac', portions: 1 },
                { exchangeGroupId: 'g-c', portions: 2 },
                { exchangeGroupId: 'g-f', portions: 1.5 },
            ],
            GROUPS
        )
        expect(label).toBe('2C · 1.5F · 1LAC')
    })

    it('NO expande compuestos (la nutri prescribe 1LEG)', () => {
        expect(portionsSummaryLabel([{ exchangeGroupId: 'g-leg', portions: 1 }], GROUPS)).toBe('1LEG')
    })

    it('omite grupos desconocidos', () => {
        expect(portionsSummaryLabel([{ exchangeGroupId: 'nope', portions: 1 }], GROUPS)).toBe('')
    })
})

describe('hasUnconfirmedMacros', () => {
    it('true si algún grupo usado tiene macros_confirmed=false', () => {
        expect(hasUnconfirmedMacros([{ exchangeGroupId: 'g-c', portions: 1 }], GROUPS)).toBe(true)
    })
    it('false si todos los grupos usados están confirmados', () => {
        expect(hasUnconfirmedMacros([{ exchangeGroupId: 'g-lac', portions: 1 }], GROUPS)).toBe(false)
    })
})

describe('exchangeGroupColor', () => {
    it('usa el color del grupo si es hex válido', () => {
        expect(exchangeGroupColor({ color: '#AABBCC', sortOrder: 1 })).toBe('#AABBCC')
    })
    it('deriva paleta determinística por sortOrder si no hay color', () => {
        expect(exchangeGroupColor({ color: null, sortOrder: 1 })).toBe(EXCHANGE_FALLBACK_COLORS[1])
        expect(exchangeGroupColor({ color: 'rojo', sortOrder: 0 })).toBe(EXCHANGE_FALLBACK_COLORS[0])
    })
})
