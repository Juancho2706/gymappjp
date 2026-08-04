import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NutritionPlanTemplateDraftSchema, TEMPLATE_SCHEMA_VERSION } from '@eva/nutrition-v2'
import type { PlanTemplateRow } from '@/infrastructure/db/plan-templates.repository'

/**
 * `updatePlanTemplateDraft` — guardar una plantilla que se abrio para EDITAR en el builder de
 * plantillas (`/coach/nutrition-v2/plantillas/builder?template=<id>`).
 *
 * Lo que se protege aca es lo mismo que en `savePlanTemplate`, porque el riesgo es identico:
 * dejar escrito en la columna `draft` algo que despues no se pueda volver a abrir. Sumado a lo
 * propio de un UPDATE: que reescriba la fila EXISTENTE (nunca inserte una copia) y que mueva
 * `summary`/`strategy` junto al draft, para que la biblioteca no muestre un resumen que miente.
 */

const { insertPlanTemplate, updatePlanTemplateDraftRow } = vi.hoisted(() => ({
  insertPlanTemplate: vi.fn(),
  updatePlanTemplateDraftRow: vi.fn(),
}))

vi.mock('@/infrastructure/db/plan-templates.repository', () => ({
  bumpPlanTemplateUsage: vi.fn(),
  countPlanTemplatesForCoach: vi.fn(async () => 0),
  findPlanTemplateById: vi.fn(),
  findPlanTemplates: vi.fn(async () => []),
  insertPlanTemplate,
  updatePlanTemplate: vi.fn(async () => ({})),
  updatePlanTemplateDraft: updatePlanTemplateDraftRow,
}))

const { updatePlanTemplateDraft } = await import('./plan-templates.service')

const TEMPLATE_ID = '11111111-2222-4333-8444-555555555555'
const CLIENT_ID = '99999999-8888-4777-8666-555555555555'

/** Draft del builder TAL COMO sale de `assembleAndValidateDraft` (con identidad). */
function builderDraft(overrides: Record<string, unknown> = {}) {
  return {
    planId: '22222222-3333-4444-8555-666666666666',
    versionId: '33333333-4444-4555-8666-777777777777',
    clientId: CLIENT_ID,
    name: 'Definición 2000',
    strategy: 'structured',
    effectiveFrom: '2026-08-04',
    timezone: 'America/Santiago',
    permissions: {
      canRegisterFreely: false,
      canAdjustPrescribedQuantity: true,
      quantityAdjustmentPercent: null,
      canSubstitute: false,
    },
    visibleNotes: null,
    privateNotes: null,
    protocolNotes: null,
    dayVariants: [
      {
        id: '44444444-5555-4666-8777-888888888888',
        key: 'default',
        label: 'Día base',
        dayOfWeek: null,
        default: true,
        targets: { calories: 2000, proteinG: 150, carbsG: 200, fatsG: 60 },
        orderIndex: 0,
        mealSlots: [
          {
            id: '55555555-6666-4777-8888-999999999999',
            key: 'slot-1',
            code: 'almuerzo',
            name: 'Almuerzo',
            startTime: '13:30',
            endTime: null,
            mode: 'anchor',
            orderIndex: 0,
            items: [
              {
                id: '66666666-7777-4888-8999-aaaaaaaaaaaa',
                foodId: '77777777-8888-4999-8aaa-bbbbbbbbbbbb',
                quantity: 150,
                unit: 'g',
                optional: false,
                notes: null,
                orderIndex: 0,
              },
            ],
            exchangeTargets: [
              {
                id: '88888888-9999-4aaa-8bbb-cccccccccccc',
                exchangeGroupId: '99999999-aaaa-4bbb-8ccc-dddddddddddd',
                portions: 2,
                orderIndex: 0,
              },
            ],
          },
        ],
      },
    ],
    ...overrides,
  }
}

function row(overrides: Partial<PlanTemplateRow> = {}): PlanTemplateRow {
  return {
    id: TEMPLATE_ID,
    name: 'Definición 2000',
    description: 'Para recomposición',
    strategy: 'structured',
    schemaVersion: TEMPLATE_SCHEMA_VERSION,
    payload: { schemaVersion: TEMPLATE_SCHEMA_VERSION, draft: {} } as never,
    summary: null,
    source: 'builder',
    sourcePlanId: null,
    legacyTemplateId: null,
    isFavorite: false,
    usageCount: 3,
    createdAt: '2026-08-01T00:00:00Z',
    updatedAt: '2026-08-04T00:00:00Z',
    ...overrides,
  }
}

const db = {} as never

beforeEach(() => {
  vi.clearAllMocks()
  updatePlanTemplateDraftRow.mockResolvedValue({ template: row() })
})

describe('updatePlanTemplateDraft', () => {
  it('reescribe la plantilla EXISTENTE en vez de insertar una copia', async () => {
    const result = await updatePlanTemplateDraft(db, {
      id: TEMPLATE_ID,
      name: 'Definición 2000',
      draft: builderDraft(),
    })

    expect(result.success).toBe(true)
    expect(insertPlanTemplate).not.toHaveBeenCalled()
    expect(updatePlanTemplateDraftRow).toHaveBeenCalledTimes(1)
    expect(updatePlanTemplateDraftRow.mock.calls[0][1]).toBe(TEMPLATE_ID)
  })

  it('quita TODA la identidad antes de escribir: ni alumno, ni plan, ni ids de filas hijas', async () => {
    await updatePlanTemplateDraft(db, { id: TEMPLATE_ID, draft: builderDraft() })

    const payload = updatePlanTemplateDraftRow.mock.calls[0][2].payload as {
      draft: Record<string, unknown>
    }
    const draft = payload.draft
    // La identidad del plan no viaja...
    expect(draft).not.toHaveProperty('clientId')
    expect(draft).not.toHaveProperty('planId')
    expect(draft).not.toHaveProperty('versionId')
    expect(draft).not.toHaveProperty('effectiveFrom')
    // ...ni la de ninguna fila hija (variante / franja / item / target).
    const variant = (draft.dayVariants as Array<Record<string, unknown>>)[0]
    const slot = (variant.mealSlots as Array<Record<string, unknown>>)[0]
    expect(variant).not.toHaveProperty('id')
    expect(slot).not.toHaveProperty('id')
    expect((slot.items as Array<Record<string, unknown>>)[0]).not.toHaveProperty('id')
    expect((slot.exchangeTargets as Array<Record<string, unknown>>)[0]).not.toHaveProperty('id')
    // Lo que SÍ apunta al catálogo se conserva: sin esto la plantilla perdería los alimentos.
    expect((slot.items as Array<Record<string, unknown>>)[0].foodId).toBe(
      '77777777-8888-4999-8aaa-bbbbbbbbbbbb',
    )
    expect((slot.exchangeTargets as Array<Record<string, unknown>>)[0].exchangeGroupId).toBe(
      '99999999-aaaa-4bbb-8ccc-dddddddddddd',
    )
  })

  it('lo escrito se puede volver a leer (round-trip del contrato)', async () => {
    await updatePlanTemplateDraft(db, { id: TEMPLATE_ID, draft: builderDraft() })

    const payload = updatePlanTemplateDraftRow.mock.calls[0][2].payload as { draft: unknown }
    expect(NutritionPlanTemplateDraftSchema.safeParse(payload.draft).success).toBe(true)
  })

  it('mueve resumen, estrategia y versión de esquema junto al draft', async () => {
    await updatePlanTemplateDraft(db, { id: TEMPLATE_ID, draft: builderDraft() })

    const input = updatePlanTemplateDraftRow.mock.calls[0][2]
    expect(input.strategy).toBe('structured')
    expect(input.schemaVersion).toBe(TEMPLATE_SCHEMA_VERSION)
    expect(input.summary).toMatchObject({
      calories: 2000,
      dayVariantCount: 1,
      mealSlotCount: 1,
      itemCount: 1,
      hasPortions: true,
    })
  })

  it('conserva el `builder` del wizard: sin él los items libres perderían sus macros', async () => {
    const builder = { state: { variants: [{ key: 'default' }] }, portionsBySlot: {} }
    await updatePlanTemplateDraft(db, { id: TEMPLATE_ID, draft: builderDraft(), builder })

    const payload = updatePlanTemplateDraftRow.mock.calls[0][2].payload as { builder: unknown }
    expect(payload.builder).toEqual(builder)
  })

  it('no toca nombre ni descripción cuando el caller no los manda', async () => {
    await updatePlanTemplateDraft(db, { id: TEMPLATE_ID, draft: builderDraft() })

    const input = updatePlanTemplateDraftRow.mock.calls[0][2]
    expect(input).not.toHaveProperty('name')
    expect(input).not.toHaveProperty('description')
  })

  it('normaliza la descripción vacía a null (y no la deja como cadena en blanco)', async () => {
    await updatePlanTemplateDraft(db, {
      id: TEMPLATE_ID,
      draft: builderDraft(),
      description: '   ',
    })

    expect(updatePlanTemplateDraftRow.mock.calls[0][2].description).toBeNull()
  })

  it('rechaza un draft que no valida SIN escribir nada', async () => {
    const result = await updatePlanTemplateDraft(db, {
      id: TEMPLATE_ID,
      draft: builderDraft({ dayVariants: [{ nope: true }] }),
    })

    expect(result.success).toBe(false)
    expect(updatePlanTemplateDraftRow).not.toHaveBeenCalled()
  })

  it('propaga el error del repository (plantilla de otro coach o ya eliminada)', async () => {
    updatePlanTemplateDraftRow.mockResolvedValue({ error: 'Esa plantilla ya no esta disponible.' })

    const result = await updatePlanTemplateDraft(db, { id: TEMPLATE_ID, draft: builderDraft() })

    expect(result).toEqual({ success: false, error: 'Esa plantilla ya no esta disponible.' })
  })
})
