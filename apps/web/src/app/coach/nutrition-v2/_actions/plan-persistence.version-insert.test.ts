import { describe, expect, it, vi } from 'vitest'
import { NutritionPlanDraftSchema, type NutritionPlanDraft } from '@eva/nutrition-v2'

// Mocks de modulos server-only cargados por plan-persistence (mismo patron que
// plan-persistence.orphan-reuse.test.ts). La rutina bajo prueba solo usa el `db` inyectado.
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/services/auth/workspace-render-cache', () => ({ getPreferredWorkspaceForRender: vi.fn() }))
vi.mock('@/services/nutrition-v2-rollout.service', () => ({ isNutritionV2Enabled: vi.fn() }))
vi.mock('@/services/nutrition-v2-read.service', () => ({ nutritionV2CoachScopeFromWorkspace: vi.fn() }))
vi.mock('@/app/coach/nutrition-plans/_data/nutrition-page.queries', () => ({
  getNutritionPlansPageCoach: vi.fn(),
}))

import { persistAndPublishDraft, type NutritionV2Db } from './plan-persistence'

const CLIENT = '6a8adf41-f971-45ca-9e62-69aa2d9638c4'
const COACH = '22222222-2222-4222-8222-222222222222'
const PLAN = '44444444-4444-4444-8444-444444444444'
const VERSION = '55555555-5555-4555-8555-555555555555'
const FOOD = '66666666-6666-4666-8666-666666666666'

function flexibleDraft(): NutritionPlanDraft {
  return NutritionPlanDraftSchema.parse({
    planId: PLAN,
    clientId: CLIENT,
    name: 'Plan',
    strategy: 'flexible',
    effectiveFrom: '2026-07-28',
    permissions: {},
    visibleNotes: 'Toma agua',
    // El contrato ADMITE privateNotes (un cliente forjado podria mandarlas); la persistencia
    // no debe reenviarlas a la columna deprecada.
    privateNotes: 'nota clinica que nadie puede leer',
    protocolNotes: null,
    dayVariants: [
      { key: 'default', label: 'Todos los dias', default: true, targets: { calories: 2000 }, mealSlots: [] },
    ],
  })
}

function structuredDraft(): NutritionPlanDraft {
  return NutritionPlanDraftSchema.parse({
    planId: PLAN,
    clientId: CLIENT,
    name: 'Plan',
    strategy: 'structured',
    effectiveFrom: '2026-07-28',
    permissions: {},
    dayVariants: [
      {
        key: 'default',
        label: 'Todos los dias',
        default: true,
        targets: { calories: 2000 },
        mealSlots: [
          {
            code: 'slot-1',
            name: 'Desayuno',
            startTime: '08:00',
            orderIndex: 0,
            items: [
              {
                foodId: FOOD,
                quantity: 200,
                unit: 'g',
                orderIndex: 0,
                substitutions: [{ foodId: FOOD, orderIndex: 0 }],
              },
            ],
          },
        ],
      },
    ],
  })
}

const FOOD_ROW = {
  id: FOOD,
  name: 'Arroz',
  brand: null,
  calories: 130,
  protein_g: 2.7,
  carbs_g: 28,
  fats_g: 0.3,
  fiber_g: 0.4,
  serving_size: 100,
  serving_unit: 'g',
}

interface Captured {
  table: string
  rows: Record<string, unknown> | Record<string, unknown>[]
}

/**
 * DB fake minima: captura CUALQUIER insert directo (no debe haber ninguno: NUT-011 movio todo
 * el arbol a la RPC transaccional) y responde las lecturas del freeze (foods).
 */
function makeDb(captured: Captured[]): NutritionV2Db {
  return {
    from(table: string) {
      const chain: Record<string, unknown> = {}
      const self = () => chain
      Object.assign(chain, {
        select: self,
        eq: self,
        order: self,
        limit: self,
        maybeSingle: async () => {
          if (table === 'foods') return { data: FOOD_ROW, error: null }
          return { data: null, error: null }
        },
        insert: (rows: Record<string, unknown> | Record<string, unknown>[]) => {
          captured.push({ table, rows })
          return {
            select: () => ({ single: async () => ({ data: { id: 'row-1' }, error: null }) }),
            then: (resolve: (v: unknown) => void) => resolve({ data: null, error: null }),
          }
        },
      })
      return chain
    },
    rpc: vi.fn(async () => ({ data: { versionId: VERSION, planId: PLAN }, error: null })),
  } as unknown as NutritionV2Db
}

function rpcArgs(db: NutritionV2Db): Record<string, unknown> {
  const rpc = db.rpc as unknown as ReturnType<typeof vi.fn>
  return rpc.mock.calls[0][1] as Record<string, unknown>
}

describe('persistAndPublishDraft — payload de la RPC transaccional', () => {
  it('NUT-007: el payload NO incluye notas privadas (columna deprecada e ilegible)', async () => {
    const captured: Captured[] = []
    const db = makeDb(captured)

    const res = await persistAndPublishDraft({
      db,
      userId: COACH,
      draft: flexibleDraft(),
      idempotencyKey: 'idem-key-0001',
      effectiveFrom: '2026-07-28',
    })

    expect(res).toEqual({ ok: true, versionId: VERSION, planId: PLAN })
    const draftArg = rpcArgs(db).p_draft as Record<string, unknown>
    expect(Object.keys(draftArg)).not.toContain('privateNotes')
    expect(JSON.stringify(draftArg)).not.toContain('nota clinica')
    // El resto de las notas sigue viajando igual (no es una poda a ciegas).
    expect(draftArg.visibleNotes).toBe('Toma agua')
    expect(draftArg.protocolNotes).toBeNull()
  })

  it('NUT-011: el cliente ya no numera la version ni escribe el arbol (todo va en la RPC)', async () => {
    const captured: Captured[] = []
    const db = makeDb(captured)

    await persistAndPublishDraft({
      db,
      userId: COACH,
      draft: flexibleDraft(),
      idempotencyKey: 'idem-key-0002',
      effectiveFrom: '2026-07-28',
    })

    // Cero INSERT directos: no hay forma de dejar una version draft con arbol parcial.
    expect(captured).toEqual([])
    const rpc = db.rpc as unknown as ReturnType<typeof vi.fn>
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc.mock.calls[0][0]).toBe('persist_and_publish_nutrition_plan_v2')
    // `version_number = max+1` se calcula EN SQL bajo el lock del alumno.
    expect(JSON.stringify(rpcArgs(db))).not.toContain('version_number')
    // La raiz explicita del draft viaja para que la RPC haga append sobre ella.
    expect(rpcArgs(db).p_plan_id).toBe(PLAN)
    expect(rpcArgs(db).p_effective_from).toBe('2026-07-28')
    expect(rpcArgs(db).p_idempotency_key).toBe('idem-key-0002')
  })

  it('congela los snapshot_* del item y del reemplazo con las macros del alimento resuelto', async () => {
    const captured: Captured[] = []
    const db = makeDb(captured)

    await persistAndPublishDraft({
      db,
      userId: COACH,
      draft: structuredDraft(),
      idempotencyKey: 'idem-key-0004',
      effectiveFrom: '2026-07-28',
    })

    const draftArg = rpcArgs(db).p_draft as {
      variants: Array<{
        mealSlots: Array<{
          slot_code: string
          start_time: string | null
          items: Array<Record<string, unknown> & { substitutions: Array<Record<string, unknown>> }>
        }>
      }>
    }
    const slot = draftArg.variants[0].mealSlots[0]
    expect(slot.slot_code).toBe('slot-1')
    expect(slot.start_time).toBe('08:00')
    const item = slot.items[0]
    // 200 g de un alimento por 100 g => factor 2.
    expect(item.snapshot_name).toBe('Arroz')
    expect(item.snapshot_calories).toBe(260)
    expect(item.snapshot_protein_g).toBe(5.4)
    expect(item.order_index).toBe(0)
    // Las claves de vinculacion las asigna la RPC con los ids que inserta.
    expect(item).not.toHaveProperty('version_id')
    expect(item).not.toHaveProperty('meal_slot_id')
    const sub = item.substitutions[0]
    expect(sub.snapshot_name).toBe('Arroz')
    expect(sub).not.toHaveProperty('prescription_item_id')
  })

  it('propaga el compare-and-swap al RPC cuando el caller manda expectedCurrentVersionId', async () => {
    const captured: Captured[] = []
    const db = makeDb(captured)
    const base = '77777777-7777-4777-8777-777777777777'

    await persistAndPublishDraft({
      db,
      userId: COACH,
      draft: flexibleDraft(),
      idempotencyKey: 'idem-key-0002',
      effectiveFrom: '2026-07-28',
      expectedCurrentVersionId: base,
    })

    const rpc = db.rpc as unknown as ReturnType<typeof vi.fn>
    expect(rpc).toHaveBeenCalledWith(
      'persist_and_publish_nutrition_plan_v2',
      expect.objectContaining({ p_expected_current_version_id: base }),
    )
  })

  it('sin CAS el RPC no recibe la clave (builder de plan nuevo: comportamiento intacto)', async () => {
    const captured: Captured[] = []
    const db = makeDb(captured)

    await persistAndPublishDraft({
      db,
      userId: COACH,
      draft: flexibleDraft(),
      idempotencyKey: 'idem-key-0003',
      effectiveFrom: '2026-07-28',
    })

    expect(rpcArgs(db)).not.toHaveProperty('p_expected_current_version_id')
  })
})
