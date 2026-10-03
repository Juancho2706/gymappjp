import { describe, expect, it } from 'vitest'
import { writeFileSync } from 'node:fs'
import type { NutritionPlanReadModel } from '@eva/nutrition-v2'
import type { PdfBrand } from '@/domain/nutrition/exchange.types'
import {
    DEFAULT_PLAN_PDF_OPTIONS,
    buildNutritionV2PlanPdfModel,
    formatPdfPortions,
    macroEnergySplit,
    renderNutritionV2PlanPdf,
    type PlanPdfEquivalenceFood,
    type PlanPdfInput,
} from './nutrition-v2-plan-pdf'

/**
 * Fixture realista: pauta por porciones de Ana (4 franjas, alimentos fijos con medida casera,
 * reemplazos) y un «Día alto» propio el martes. Con `PLAN_PDF_PREVIEW_OUT=<ruta.pdf>` el smoke
 * escribe el PDF a disco para revisión visual (en CI la variable no existe).
 */

let seq = 0
const uuid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`

const GROUP = {
    C: { id: uuid(), name: 'Cereales', color: '#D9A520', ref: { calories: 140, proteinG: 3, carbsG: 30, fatsG: 1 } },
    LAC: { id: uuid(), name: 'Lácteos descremados', color: '#3B82F6', ref: { calories: 70, proteinG: 7, carbsG: 10, fatsG: 0 } },
    F: { id: uuid(), name: 'Frutas', color: '#16A34A', ref: { calories: 65, proteinG: 1, carbsG: 15, fatsG: 0 } },
    G: { id: uuid(), name: 'Aceites y grasas', color: '#A16207', ref: { calories: 90, proteinG: 0, carbsG: 0, fatsG: 10 } },
    P: { id: uuid(), name: 'Carnes bajas en grasa', color: '#DC2626', ref: { calories: 65, proteinG: 11, carbsG: 1, fatsG: 2 } },
    V: { id: uuid(), name: 'Verduras de libre consumo', color: '#059669', ref: { calories: 10, proteinG: 1, carbsG: 2, fatsG: 0 } },
} as const

type Code = keyof typeof GROUP

function target(code: Code, portions: number, orderIndex: number) {
    const g = GROUP[code]
    return {
        id: uuid(),
        exchangeGroupId: g.id,
        groupCode: code,
        groupName: g.name,
        color: g.color,
        portions,
        notes: null,
        orderIndex,
        ref: g.ref,
        composedOf: null,
        macrosConfirmed: true,
    }
}

function item(name: string, quantity: number, unit: string, kcal: number, extra: Record<string, unknown> = {}) {
    return {
        id: uuid(),
        foodId: uuid(),
        recipeId: null,
        name,
        brand: null,
        quantity,
        unit,
        minimumQuantity: null,
        maximumQuantity: null,
        optional: false,
        substitutionGroupId: null,
        notes: null,
        macros: { calories: kcal, proteinG: 0, carbsG: 0, fatsG: 0, fiberG: 0 },
        ...extra,
    }
}

function slot(name: string, startTime: string, targets: ReturnType<typeof target>[], items: ReturnType<typeof item>[] = [], instructions: string | null = null) {
    return {
        id: uuid(),
        code: name.toLowerCase(),
        name,
        startTime,
        endTime: null,
        mode: 'anchor' as const,
        required: true,
        instructions,
        targets: {},
        prescriptionItems: items,
        exchangeTargets: targets,
    }
}

const emptyTargets = { fiberG: null, sodiumMg: null, waterMl: null }

const baseSlots = [
    slot('Desayuno', '07:30:00', [target('C', 2, 0), target('LAC', 1, 1), target('F', 1, 2), target('G', 1, 3)], [
        item('Huevo', 122, 'g', 175, { householdLabel: '2 huevos', householdGrams: 61 }),
    ]),
    slot('Almuerzo', '13:30:00', [target('P', 2, 0), target('C', 2, 1), target('V', 2, 2), target('G', 1, 3)], [
        item('Pechuga de pollo', 120, 'g', 198, {
            notes: 'A la plancha o al horno, sin piel.',
            substitutions: [
                {
                    id: uuid(),
                    prescriptionItemId: uuid(),
                    foodId: uuid(),
                    recipeId: null,
                    name: 'Reineta',
                    brand: null,
                    quantity: 150,
                    unit: 'g',
                    macros: { calories: 150, proteinG: 30, carbsG: 0, fatsG: 2, fiberG: 0 },
                },
            ],
        }),
    ], 'Parte el plato por la mitad con verduras.'),
    slot('Once', '18:00:00', [target('C', 1, 0), target('LAC', 1, 1), target('P', 1, 2)], [
        item('Palta', 30, 'g', 50, { householdLabel: '2 cucharadas', optional: true }),
    ]),
    slot('Cena', '21:00:00', [target('P', 2, 0), target('V', 2, 1), target('G', 1, 2)]),
]

const plan = {
    schemaVersion: 1,
    generatedAt: '2026-10-03T12:00:00.000Z',
    asOfDate: '2026-10-03',
    timezone: 'America/Santiago',
    plan: {
        id: uuid(),
        name: 'Pauta de recomposición corporal',
        strategy: 'portions',
        versionId: uuid(),
        versionNumber: 3,
        status: 'published',
        effectiveFrom: '2026-09-28',
        effectiveTo: null,
    },
    visibleNotes: 'Toma 2 litros de agua al día. Si una comida no calza con tu horario, muévela pero no la saltes.',
    protocolNotes: null,
    permissions: {},
    dayVariants: [
        {
            id: uuid(),
            key: 'base',
            label: 'Día base',
            dayOfWeek: null,
            isDefault: true,
            targets: { calories: 1850, proteinG: 120, carbsG: 210, fatsG: 58, ...emptyTargets, fiberG: 30, waterMl: 2000 },
            mealSlots: baseSlots,
        },
        {
            id: uuid(),
            key: 'tue',
            label: 'Día de entrenamiento',
            dayOfWeek: 2,
            isDefault: false,
            targets: { calories: 2150, proteinG: 130, carbsG: 270, fatsG: 60, ...emptyTargets },
            mealSlots: [...baseSlots, slot('Post entreno', '19:30:00', [target('C', 1, 0), target('F', 1, 1)])],
        },
    ],
    exchangeGroups: (Object.keys(GROUP) as Code[]).map((code, i) => ({
        id: GROUP[code].id,
        slug: code.toLowerCase(),
        code,
        name: GROUP[code].name,
        coachId: null,
        teamId: null,
        isSystem: true,
        refCalories: GROUP[code].ref.calories,
        refProteinG: GROUP[code].ref.proteinG,
        refCarbsG: GROUP[code].ref.carbsG,
        refFatsG: GROUP[code].ref.fatsG,
        color: GROUP[code].color,
        sortOrder: i,
        composedOf: null,
        macrosConfirmed: true,
    })),
    syncToken: 'x',
} as unknown as NutritionPlanReadModel

const equivalences: PlanPdfEquivalenceFood[] = [
    { exchangeGroupId: GROUP.C.id, name: 'Marraqueta', portionLabel: '½ unidad', portionGrams: 50 },
    { exchangeGroupId: GROUP.C.id, name: 'Arroz cocido', portionLabel: '¾ taza', portionGrams: 120 },
    { exchangeGroupId: GROUP.C.id, name: 'Galletas de agua', portionLabel: '6 unidades', portionGrams: 35 },
    { exchangeGroupId: GROUP.C.id, name: 'Avena', portionLabel: '½ taza', portionGrams: 40 },
    { exchangeGroupId: GROUP.LAC.id, name: 'Leche descremada', portionLabel: '1 taza', portionGrams: 200 },
    { exchangeGroupId: GROUP.LAC.id, name: 'Yogur light', portionLabel: '1 unidad', portionGrams: 175 },
    { exchangeGroupId: GROUP.F.id, name: 'Manzana', portionLabel: '1 unidad chica', portionGrams: 120 },
    { exchangeGroupId: GROUP.F.id, name: 'Plátano', portionLabel: '½ unidad', portionGrams: 60 },
    { exchangeGroupId: GROUP.G.id, name: 'Palta', portionLabel: '2 cucharadas', portionGrams: 30 },
    { exchangeGroupId: GROUP.G.id, name: 'Almendras', portionLabel: '10 unidades', portionGrams: 15 },
    { exchangeGroupId: GROUP.P.id, name: 'Pechuga de pavo', portionLabel: '1 rebanada', portionGrams: 50 },
    { exchangeGroupId: GROUP.P.id, name: 'Atún en agua', portionLabel: '¼ tarro', portionGrams: 40 },
    { exchangeGroupId: GROUP.V.id, name: 'Lechuga', portionLabel: '1 taza', portionGrams: 50 },
]

const brand: PdfBrand = {
    brandName: 'Fran Nutrición',
    primaryColor: '#1F7A55',
    logoDataUrl: null,
    poweredByEva: false,
    showsEvaBadge: true,
}

const input = (over: Partial<PlanPdfInput> = {}): PlanPdfInput => ({
    plan,
    brand,
    clientName: 'Ana Rojas',
    equivalences,
    options: { ...DEFAULT_PLAN_PDF_OPTIONS, includeTracker: true },
    todayIso: '2026-10-03',
    ...over,
})

describe('formatPdfPortions', () => {
    it('escribe las fracciones como en una pauta', () => {
        expect(formatPdfPortions(2)).toBe('2')
        expect(formatPdfPortions(0.5)).toBe('½')
        expect(formatPdfPortions(1.5)).toBe('1½')
        expect(formatPdfPortions(0.25)).toBe('¼')
    })
})

describe('macroEnergySplit', () => {
    it('reparte la energía 4/4/9 y suma 100', () => {
        const s = macroEnergySplit({ calories: 1850, proteinG: 120, carbsG: 210, fatsG: 58, fiberG: null, waterMl: null, sodiumMg: null })
        expect(s).not.toBeNull()
        expect(s!.protein + s!.carbs + s!.fats).toBe(100)
        expect(s!.protein).toBe(26)
    })
    it('sin algún macro no inventa un reparto', () => {
        expect(macroEnergySplit({ calories: 1850, proteinG: null, carbsG: 210, fatsG: 58, fiberG: null, waterMl: null, sodiumMg: null })).toBeNull()
    })
})

describe('buildNutritionV2PlanPdfModel', () => {
    it('arma portada, días, equivalencias y registro a partir de la pauta', () => {
        const m = buildNutritionV2PlanPdfModel(input())
        expect(m.planName).toBe('Pauta de recomposición corporal')
        expect(m.meta).toEqual([
            { label: 'Vigente desde', value: '28-09-2026' },
            { label: 'Versión', value: '3' },
            { label: 'Entregada', value: '03-10-2026' },
        ])
        expect(m.days.map((d) => d.title)).toEqual(['Día base', 'Día de entrenamiento'])
        expect(m.days[1].appliesTo).toBe('Martes')
        expect(m.days[0].appliesTo).not.toContain('Martes')
        expect(m.week?.find((c) => c.short === 'Ma')).toMatchObject({ own: true, calories: 2150 })
        expect(m.glance.map((s) => s.time)).toEqual(['07:30', '13:30', '18:00', '21:00'])
        expect(m.glance[0].portionCodes).toBe('2C · 1LAC · 1F · 1G')
        expect(m.targetsCaption).toContain('Día base')
        expect(m.tracker?.rows).toEqual(['Desayuno', 'Almuerzo', 'Once', 'Cena', 'Agua'])
        expect(m.fileName).toBe('pauta-ana-rojas.pdf')
    })

    it('medida casera, opcional y reemplazos en cada alimento', () => {
        const m = buildNutritionV2PlanPdfModel(input())
        const [desayuno, almuerzo, once] = m.days[0].slots
        expect(desayuno.items[0].amount).toBe('2 huevos (122 g)')
        expect(almuerzo.items[0].swaps).toEqual(['Reineta (150 g)'])
        expect(almuerzo.instructions).toBe('Parte el plato por la mitad con verduras.')
        expect(once.items[0]).toMatchObject({ optional: true, amount: '2 cucharadas (30 g)' })
    })

    it('kcal de la franja: alimentos fijos no opcionales + porciones por su referencia', () => {
        const m = buildNutritionV2PlanPdfModel(input())
        // Desayuno: huevo 175 + 2×140 + 70 + 65 + 90
        expect(m.days[0].slots[0].macros.calories).toBe(680)
        // Once: la palta opcional no suma; 140 + 70 + 65
        expect(m.days[0].slots[2].macros.calories).toBe(275)
    })

    it('equivalencias solo de los grupos usados y en su orden', () => {
        const m = buildNutritionV2PlanPdfModel(input())
        expect(m.equivalences.map((g) => g.code)).toEqual(['C', 'LAC', 'F', 'G', 'P', 'V'])
        expect(m.equivalences[0].foods[0]).toEqual({ name: 'Marraqueta', portion: '½ unidad', grams: '50 g' })
        expect(m.equivalences[0].refLine).toBe('1 porción: 140 kcal · P 3 g · C 30 g · G 1 g')
    })

    it('sin macros: no viajan metas ni reparto', () => {
        const m = buildNutritionV2PlanPdfModel(input({ options: { ...DEFAULT_PLAN_PDF_OPTIONS, includeMacros: false } }))
        expect(m.showMacros).toBe(false)
        expect(m.targets).toBeNull()
        expect(m.macroSplit).toBeNull()
        expect(m.targetsCaption).toBeNull()
    })

    it('opciones apagadas: sin equivalencias ni registro', () => {
        const m = buildNutritionV2PlanPdfModel(
            input({ options: { ...DEFAULT_PLAN_PDF_OPTIONS, includeEquivalences: false, includeTracker: false } }),
        )
        expect(m.equivalences).toEqual([])
        expect(m.tracker).toBeNull()
    })
})

describe('renderNutritionV2PlanPdf', () => {
    it.each(['letter', 'a4'] as const)('dibuja el PDF completo en %s sin romper', async (pageSize) => {
        const model = buildNutritionV2PlanPdfModel(input({ options: { ...DEFAULT_PLAN_PDF_OPTIONS, includeTracker: true, pageSize } }))
        const doc = await renderNutritionV2PlanPdf(model, { brand, logoDataUrl: null, pageSize })
        // portada + 2 días + equivalencias + registro
        expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(5)
        const bytes = doc.output('arraybuffer')
        expect(bytes.byteLength).toBeGreaterThan(5_000)
        const out = process.env.PLAN_PDF_PREVIEW_OUT
        if (out && pageSize === 'letter') writeFileSync(out, Buffer.from(bytes))
    })
})
