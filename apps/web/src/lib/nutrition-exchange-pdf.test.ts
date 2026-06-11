import { describe, it, expect } from 'vitest'
import type { ExchangeGroup } from '@/domain/nutrition/exchange.types'
import { buildExchangePdfModel, type ExchangePdfParams } from './nutrition-exchange-pdf'
import { EVA_PDF_BRAND } from './nutrition-pdf-brand'

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

const C = g({ id: 'g-c', code: 'C', name: 'Cereales', refCalories: 70, refCarbsG: 15, refProteinG: 2, sortOrder: 1 })
const P = g({ id: 'g-p', code: 'P', name: 'Proteínas', refCalories: 55, refProteinG: 7, refFatsG: 3, sortOrder: 2, macrosConfirmed: true })
const GROUPS = [C, P]

function baseParams(overrides: Partial<ExchangePdfParams> = {}): ExchangePdfParams {
    return {
        format: 'compact',
        brand: { brandName: 'Movida', primaryColor: '#EC4899', poweredByEva: false },
        planName: 'Pauta Fran',
        clientName: 'Alumna Test',
        goals: { calories: 1800, protein: 120, carbs: 180, fats: 60 },
        meals: [
            {
                id: 'm1',
                name: 'Desayuno 7:00',
                dayVariantId: null,
                targets: [
                    { exchangeGroupId: 'g-c', portions: 2 },
                    { exchangeGroupId: 'g-p', portions: 1 },
                ],
            },
        ],
        variants: [],
        groups: GROUPS,
        equivalences: [
            { foodId: 'f1', name: 'Pan marraqueta', exchangeGroupId: 'g-c', portionGrams: 50, portionLabel: '1/2 unidad' },
            { foodId: 'f2', name: 'Arroz cocido', exchangeGroupId: 'g-c', portionGrams: 100, portionLabel: '3/4 taza' },
            { foodId: 'f3', name: 'Pollo', exchangeGroupId: 'g-p', portionGrams: 40, portionLabel: '1 presa chica' },
        ],
        fileStem: 'test',
        ...overrides,
    }
}

describe('buildExchangePdfModel', () => {
    it('sin variantes ⇒ una sola sección null (layout F5 idéntico)', () => {
        const m = buildExchangePdfModel(baseParams())
        expect(m.sections).toHaveLength(1)
        expect(m.sections[0].variantId).toBeNull()
        expect(m.sections[0].title).toBeNull()
        expect(m.sections[0].meals[0].codes).toBe('2C · 1P')
        expect(m.sections[0].totals.calories).toBe(2 * 70 + 55)
    })

    it('con 3 variantes renderiza 3 secciones; comida sin variante aparece en todas', () => {
        const params = baseParams({
            variants: [
                { id: 'v1', name: 'Descanso' },
                { id: 'v2', name: 'Entreno AM' },
                { id: 'v3', name: 'Entreno PM' },
            ],
            meals: [
                { id: 'm1', name: 'Desayuno', dayVariantId: null, targets: [{ exchangeGroupId: 'g-c', portions: 1 }] },
                { id: 'm2', name: 'Almuerzo entreno', dayVariantId: 'v2', targets: [{ exchangeGroupId: 'g-p', portions: 2 }] },
            ],
        })
        const m = buildExchangePdfModel(params)
        expect(m.sections).toHaveLength(3)
        expect(m.sections.map((s) => s.title)).toEqual(['Descanso', 'Entreno AM', 'Entreno PM'])
        expect(m.sections[0].meals).toHaveLength(1) // solo desayuno
        expect(m.sections[1].meals).toHaveLength(2) // desayuno + almuerzo entreno
        expect(m.sections[1].totals.calories).toBe(70 + 110)
    })

    it('marca del tenant llega al modelo (threading server-side → PDF)', () => {
        expect(buildExchangePdfModel(baseParams()).brandName).toBe('Movida')
        expect(buildExchangePdfModel(baseParams({ brand: EVA_PDF_BRAND })).brandName).toBe('EVA FITNESS')
    })

    it('macrosProvisional=true si algún grupo usado no está confirmado (AC3)', () => {
        expect(buildExchangePdfModel(baseParams()).macrosProvisional).toBe(true)
        const confirmedOnly = baseParams({
            meals: [{ id: 'm1', name: 'Comida', targets: [{ exchangeGroupId: 'g-p', portions: 1 }] }],
        })
        expect(buildExchangePdfModel(confirmedOnly).macrosProvisional).toBe(false)
    })

    it('formato compact NO incluye equivalencias ni lista de compras', () => {
        const m = buildExchangePdfModel(baseParams({ format: 'compact' }))
        expect(m.includeEquivalences).toBe(false)
        expect(m.equivalenceSections).toHaveLength(0)
        expect(m.shoppingList).toHaveLength(0)
    })

    it('formato equivalences agrupa alimentos por grupo y arma lista de compras semanal', () => {
        const m = buildExchangePdfModel(baseParams({ format: 'equivalences' }))
        expect(m.equivalenceSections.map((s) => s.code)).toEqual(['C', 'P'])
        expect(m.equivalenceSections[0].foods).toHaveLength(2)
        const cRow = m.shoppingList.find((r) => r.code === 'C')!
        expect(cRow.portionsPerDay).toBe('2')
        expect(cRow.portionsPerWeek).toBe('14')
        expect(cRow.examples).toContain('Pan marraqueta')
    })

    it('lista de compras usa el MÁXIMO de porciones/día entre variantes', () => {
        const m = buildExchangePdfModel(
            baseParams({
                format: 'equivalences',
                variants: [
                    { id: 'v1', name: 'Descanso' },
                    { id: 'v2', name: 'Entreno' },
                ],
                meals: [
                    { id: 'm1', name: 'A', dayVariantId: 'v1', targets: [{ exchangeGroupId: 'g-c', portions: 1 }] },
                    { id: 'm2', name: 'B', dayVariantId: 'v2', targets: [{ exchangeGroupId: 'g-c', portions: 3 }] },
                ],
            })
        )
        const cRow = m.shoppingList.find((r) => r.code === 'C')!
        expect(cRow.portionsPerDay).toBe('3')
    })

    it('nomenclatura solo incluye grupos usados, en orden', () => {
        const m = buildExchangePdfModel(
            baseParams({ meals: [{ id: 'm1', name: 'X', targets: [{ exchangeGroupId: 'g-p', portions: 1 }] }] })
        )
        expect(m.nomenclature.map((n) => n.code)).toEqual(['P'])
    })

    it('formato full lanza (stub v2)', () => {
        expect(() => buildExchangePdfModel(baseParams({ format: 'full' }))).toThrow()
    })
})
