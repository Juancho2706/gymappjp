import { describe, expect, it } from 'vitest'
import { NutritionPlanDraftSchema } from '@eva/nutrition-v2'
import {
  MAX_ITEM_SUBSTITUTIONS,
  assembleAndValidateDraft,
  assembleDraft,
  buildItemInsertRow,
  buildPublishIdempotencyKey,
  buildSlotInsertRow,
  buildVariantInsertRow,
  builderReducer,
  canProceedToPublishAfterArchive,
  computeItemMacros,
  createCoachFoodV2,
  createEmptyBuilderState,
  createEmptyItem,
  effectiveDateConflicts,
  itemMacros,
  mapFoodCatalogItemToBuilderFood,
  mapWriteError,
  persistAndPublishDraft,
  publishDraftRN,
  requiredNutritionProFeature,
  validateStep,
  type BuilderFood,
  type BuilderItem,
  type BuilderState,
  type DraftPrescriptionItem,
  type NutritionV2WriteClient,
} from '../apps/mobile/lib/nutrition-v2-builder'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const PLAN_ID = '22222222-2222-4222-8222-222222222222'
const FOOD_ID = '33333333-3333-4333-8333-333333333333'
const PUBLISHED_ID = '44444444-4444-4444-8444-444444444444'
const SUB_FOOD_ID = '55555555-5555-4555-8555-555555555555'

const FOOD: BuilderFood = {
  id: FOOD_ID,
  name: 'Pollo',
  brand: null,
  calories: 100,
  proteinG: 10,
  carbsG: 20,
  fatsG: 5,
  fiberG: 2,
  servingSize: 50,
  servingUnit: 'g',
}

function foodItem(overrides: Partial<BuilderItem> = {}): BuilderItem {
  return { ...createEmptyItem('i1'), food: FOOD, customName: null, quantity: '200', unit: 'g', ...overrides }
}

function subFood(id: string, name: string): BuilderFood {
  return { ...FOOD, id, name }
}

function structuredState(): BuilderState {
  return {
    step: 3,
    strategy: 'structured',
    planName: 'Plan estructurado',
    effectiveFrom: '2026-07-20',
    targets: { calories: '2000', proteinG: '150', carbsG: '', fatsG: '' },
    permissions: { canRegisterFreely: false, canAdjustPrescribedQuantity: true, canSubstitute: false },
    slots: [{ key: 'slot-a', name: 'Desayuno', startTime: '08:00', items: [foodItem()] }],
  }
}

function hybridState(): BuilderState {
  return { ...structuredState(), strategy: 'hybrid' }
}

describe('reducer / paridad con web', () => {
  it('SET_STRATEGY structured siembra una primera franja', () => {
    const next = builderReducer(createEmptyBuilderState('2026-07-20'), { type: 'SET_STRATEGY', strategy: 'structured', firstSlotKey: 'k1' })
    expect(next.slots).toHaveLength(1)
    expect(next.permissions.canRegisterFreely).toBe(false)
  })

  it('ADD_ITEM con alimento precarga cantidad y unidad', () => {
    let state = builderReducer(createEmptyBuilderState('2026-07-20'), { type: 'SET_STRATEGY', strategy: 'structured', firstSlotKey: 'slotK' })
    const slotKey = state.slots[0].key
    state = builderReducer(state, { type: 'ADD_ITEM', slotKey, key: 'itemK', food: FOOD })
    expect(state.slots[0].items[0].quantity).toBe('50')
    expect(state.slots[0].items[0].unit).toBe('g')
  })

  it('SET_PERMISSION conmuta un permiso; assembleDraft emite la eleccion del coach (sub-delta a)', () => {
    let state = builderReducer(createEmptyBuilderState('2026-07-20'), { type: 'SET_STRATEGY', strategy: 'structured', firstSlotKey: 'k1' })
    // Default structured: registrar OFF, sustituir OFF.
    expect(state.permissions.canRegisterFreely).toBe(false)
    expect(state.permissions.canSubstitute).toBe(false)
    state = builderReducer(state, { type: 'SET_PERMISSION', field: 'canSubstitute', value: true })
    expect(state.permissions.canSubstitute).toBe(true)
    const draft = assembleDraft(state, { clientId: CLIENT_ID })
    expect(draft.permissions.canSubstitute).toBe(true)
    expect(draft.permissions.canRegisterFreely).toBe(false)
  })
})

describe('reducer / reemplazos autorizados F-02 (cinturon triple + remocion)', () => {
  const SLOT = 'slot-a'
  const ITEM = 'i1'

  function addSub(state: BuilderState, food: BuilderFood, key: string): BuilderState {
    return builderReducer(state, { type: 'ADD_ITEM_SUBSTITUTION', slotKey: SLOT, itemKey: ITEM, key, food })
  }

  it('agrega reemplazos del catalogo hasta el tope y rechaza el excedente', () => {
    let state = structuredState()
    for (let i = 0; i < MAX_ITEM_SUBSTITUTIONS; i++) {
      state = addSub(state, subFood('sub-' + i, 'Sub ' + i), 'k' + i)
    }
    expect(state.slots[0].items[0].substitutions).toHaveLength(MAX_ITEM_SUBSTITUTIONS)
    const overflow = addSub(state, subFood('sub-extra', 'Extra'), 'kX')
    expect(overflow.slots[0].items[0].substitutions).toHaveLength(MAX_ITEM_SUBSTITUTIONS)
  })

  it('rechaza duplicar el mismo alimento como reemplazo (por food.id)', () => {
    let state = addSub(structuredState(), subFood('sub-x', 'X'), 'k1')
    state = addSub(state, subFood('sub-x', 'X otra vez'), 'k2')
    expect(state.slots[0].items[0].substitutions).toHaveLength(1)
  })

  it('rechaza el propio alimento prescrito como reemplazo', () => {
    const state = addSub(structuredState(), subFood(FOOD_ID, 'Prescrito'), 'k1')
    expect(state.slots[0].items[0].substitutions).toHaveLength(0)
  })

  it('remueve un reemplazo por subKey', () => {
    let state = addSub(structuredState(), subFood('sub-a', 'A'), 'k1')
    state = addSub(state, subFood('sub-b', 'B'), 'k2')
    state = builderReducer(state, { type: 'REMOVE_ITEM_SUBSTITUTION', slotKey: SLOT, itemKey: ITEM, subKey: 'k1' })
    expect(state.slots[0].items[0].substitutions.map((s) => s.key)).toEqual(['k2'])
  })
})

describe('assembleDraft / reemplazos F-02 (spread condicional)', () => {
  it('omite la clave substitutions cuando no hay reemplazos (byte-identico a hoy)', () => {
    const draft = assembleDraft(structuredState(), { clientId: CLIENT_ID })
    expect('substitutions' in draft.dayVariants[0].mealSlots[0].items[0]).toBe(false)
  })

  it('emite substitutions mapeada al contrato solo con >=1 y valida contra el schema', () => {
    const withSub = builderReducer(structuredState(), {
      type: 'ADD_ITEM_SUBSTITUTION',
      slotKey: 'slot-a',
      itemKey: 'i1',
      key: 'k1',
      food: subFood(SUB_FOOD_ID, 'Pavo'),
    })
    const subs = assembleDraft(withSub, { clientId: CLIENT_ID }).dayVariants[0].mealSlots[0].items[0].substitutions
    expect(subs).toHaveLength(1)
    expect(subs?.[0]).toEqual({
      foodId: SUB_FOOD_ID,
      recipeId: null,
      customName: null,
      quantity: null,
      unit: null,
      orderIndex: 0,
    })
    expect(() => assembleAndValidateDraft(withSub, { clientId: CLIENT_ID })).not.toThrow()
  })
})

describe('computeItemMacros', () => {
  it('reutiliza el motor compartido (paridad con el alumno)', () => {
    const macros = computeItemMacros(FOOD, 200, 'g')
    expect(macros.calories).toBe(200)
    expect(macros.proteinG).toBe(20)
    expect(macros.fiberG).toBe(4)
  })
})

describe('assemble + validate', () => {
  it('structured: franjas + items prescritos, valido contra el contrato', () => {
    const draft = assembleAndValidateDraft(structuredState(), { clientId: CLIENT_ID })
    expect(draft.dayVariants[0].mealSlots[0].code).toBe('slot-1')
    expect(draft.dayVariants[0].mealSlots[0].items[0].foodId).toBe(FOOD_ID)
    expect(() => NutritionPlanDraftSchema.parse(draft)).not.toThrow()
  })

  it('propaga planId como nueva version', () => {
    expect(assembleDraft(structuredState(), { clientId: CLIENT_ID, planId: PLAN_ID }).planId).toBe(PLAN_ID)
  })

  it('paso 0 exige estrategia; paso 2 rechaza franja sin nombre', () => {
    expect(validateStep(createEmptyBuilderState('2026-07-20'), 0).ok).toBe(false)
    const bad = structuredState()
    bad.slots[0].name = ''
    expect(validateStep(bad, 2).ok).toBe(false)
  })
})

describe('catalogo -> BuilderFood', () => {
  it('mapea macros por 100 preservando serving', () => {
    const item = {
      id: FOOD_ID, catalogKey: null, gtin: null, name: 'Avena', brand: 'Marca', category: null, countryCode: 'CL',
      servingSize: 100, servingUnit: 'g', calories: 380, proteinG: 13, carbsG: 67, fatsG: 7, fiberG: 10,
      sodiumMg: null, sugarG: null, saturatedFatG: null, packageQuantity: null, packageUnit: null,
      source: 'off', sourceRef: null, verificationStatus: 'verified' as const, media: null,
    }
    const food = mapFoodCatalogItemToBuilderFood(item)
    expect(food.id).toBe(FOOD_ID)
    expect(food.servingSize).toBe(100)
    expect(itemMacros({ ...createEmptyItem('x'), food, quantity: '200', unit: 'g' }).calories).toBe(760)
  })
})

describe('gate Pro (contrato compartido)', () => {
  it('hybrid dispara hybrid_strategy; structured base = null', () => {
    expect(requiredNutritionProFeature(assembleDraft(hybridState(), { clientId: CLIENT_ID }))).toBe('hybrid_strategy')
    expect(requiredNutritionProFeature(assembleDraft(structuredState(), { clientId: CLIENT_ID }))).toBeNull()
  })
})

describe('insert row builders', () => {
  const item: DraftPrescriptionItem = {
    foodId: FOOD_ID, recipeId: null, customName: null, quantity: 200, unit: 'g',
    minimumQuantity: null, maximumQuantity: null, optional: false, substitutionGroupId: null, notes: null, orderIndex: 0,
  }
  it('buildItemInsertRow re-deriva snapshot desde el alimento', () => {
    const row = buildItemInsertRow({ versionId: 'v1', mealSlotId: 's1', orderIndex: 0, item, food: FOOD })
    expect(row.snapshot_name).toBe('Pollo')
    expect(row.snapshot_calories).toBe(200)
    expect(row.snapshot_fiber_g).toBe(4)
  })
  it('variant + slot mapean columnas de BD', () => {
    const draft = assembleAndValidateDraft(structuredState(), { clientId: CLIENT_ID })
    expect(buildVariantInsertRow('v1', draft.dayVariants[0]).is_default).toBe(true)
    expect(buildSlotInsertRow('v1', 'var1', draft.dayVariants[0].mealSlots[0]).slot_code).toBe('slot-1')
  })
})

describe('mapWriteError', () => {
  it('42501 => SCOPE_DENIED', () => {
    expect(mapWriteError({ message: 'denied', code: '42501' }, 'plan').code).toBe('SCOPE_DENIED')
  })
})

describe('buildPublishIdempotencyKey', () => {
  it('estable por operationId, incluye rn-builder', () => {
    const a = buildPublishIdempotencyKey({ clientId: CLIENT_ID, operationId: 'op-1' })
    const b = buildPublishIdempotencyKey({ clientId: CLIENT_ID, operationId: 'op-1' })
    expect(a).toBe(b)
    expect(a).toContain('rn-builder')
    expect(a).toContain('publish')
  })
})

// -- fake write client (registra escrituras + rpc) --
function makeClient(opts: {
  existingVersion?: { id: string; plan_id: string } | null
  existingPlan?: { id: string; client_id: string } | null
  foodRow?: Record<string, unknown> | null
} = {}) {
  const inserts: Array<{ table: string; rows: unknown }> = []
  const rpcCalls: Array<{ name: string; args?: Record<string, unknown> }> = []
  let counter = 0
  const client = {
    from(table: string) {
      return {
        select() {
          const eqs: string[] = []
          const chain: any = {
            eq(col: string) { eqs.push(col); return chain },
            order() { return chain },
            limit() { return chain },
            async maybeSingle() {
              if (table === 'nutrition_plan_versions_v2') {
                if (eqs.includes('publish_idempotency_key')) return { data: opts.existingVersion ?? null, error: null }
                return { data: null, error: null }
              }
              if (table === 'clients') return { data: { coach_id: 'coach-1', org_id: null, team_id: null }, error: null }
              if (table === 'nutrition_plans_v2') return { data: opts.existingPlan ?? null, error: null }
              if (table === 'foods') return { data: opts.foodRow ?? null, error: null }
              return { data: null, error: null }
            },
            then(resolve: (v: unknown) => void) { resolve({ data: [], error: null }) },
          }
          return chain
        },
        insert(rows: unknown) {
          inserts.push({ table, rows })
          return {
            select() {
              return { async single() { counter++; return { data: { id: table + '-' + counter }, error: null } } }
            },
            then(resolve: (v: unknown) => void) { resolve({ data: null, error: null }) },
          }
        },
      }
    },
    async rpc(name: string, args?: Record<string, unknown>) {
      rpcCalls.push({ name, args })
      return { data: PUBLISHED_ID, error: null }
    },
  }
  return { client: client as unknown as NutritionV2WriteClient, inserts, rpcCalls }
}

const FOOD_DB_ROW = {
  id: FOOD_ID, name: 'Pollo', brand: null, calories: 100, protein_g: 10, carbs_g: 20, fats_g: 5, fiber_g: 2, serving_size: 50, serving_unit: 'g',
}

describe('persistAndPublishDraft (orden de escritura)', () => {
  it('escribe plan->version->variante->franja->items y publica con la idempotency key', async () => {
    const draft = assembleAndValidateDraft(structuredState(), { clientId: CLIENT_ID })
    const { client, inserts, rpcCalls } = makeClient({ foodRow: FOOD_DB_ROW })
    const res = await persistAndPublishDraft({ db: client, userId: 'coach-1', draft, idempotencyKey: 'publish:key:abcdef', effectiveFrom: '2026-07-20' })
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.versionId).toBe(PUBLISHED_ID)
    expect(inserts.map((i) => i.table)).toEqual([
      'nutrition_plans_v2',
      'nutrition_plan_versions_v2',
      'nutrition_day_variants_v2',
      'nutrition_meal_slots_v2',
      'nutrition_prescription_items_v2',
    ])
    expect(rpcCalls[0].name).toBe('publish_nutrition_plan_v2')
    expect(rpcCalls[0].args?.p_idempotency_key).toBe('publish:key:abcdef')
  })

  it('idempotente: version existente corta el flujo sin insertar', async () => {
    const draft = assembleAndValidateDraft(structuredState(), { clientId: CLIENT_ID })
    const { client, inserts, rpcCalls } = makeClient({ existingVersion: { id: 'ver-existing', plan_id: 'plan-existing' } })
    const res = await persistAndPublishDraft({ db: client, userId: 'coach-1', draft, idempotencyKey: 'publish:key:abcdef', effectiveFrom: '2026-07-20' })
    expect(res).toEqual({ ok: true, versionId: 'ver-existing', planId: 'plan-existing' })
    expect(inserts).toHaveLength(0)
    expect(rpcCalls).toHaveLength(0)
  })
})

describe('createCoachFoodV2 (alimento coach-scoped, sub-delta b)', () => {
  it('inserta en foods con macros por 100 + coach_id y devuelve el BuilderFood', async () => {
    const { client, inserts } = makeClient()
    const res = await createCoachFoodV2({
      db: client,
      userId: 'coach-1',
      input: { clientId: CLIENT_ID, name: 'Salsa casera', brand: null, unit: 'g', calories: 120, proteinG: 3, carbsG: 10, fatsG: 8 },
    })
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.food.id).toBe('foods-1')
      expect(res.food.servingSize).toBe(100)
      expect(res.food.servingUnit).toBe('g')
      expect(res.food.calories).toBe(120)
      expect(res.food.fiberG).toBeNull()
      expect(res.food.category).toBe('otro')
    }
    expect(inserts).toHaveLength(1)
    expect(inserts[0].table).toBe('foods')
    const row = inserts[0].rows as Record<string, unknown>
    expect(row.coach_id).toBe('coach-1')
    expect(row.org_id).toBeNull()
    expect(row.serving_size).toBe(100)
    expect(row.serving_unit).toBe('g')
    expect(row.catalog_source).toBe('coach')
    expect(row.verification_status).toBe('coach_verified')
    expect(row.is_liquid).toBe(false)
    expect(row.protein_g).toBe(3)
    expect(row.carbs_g).toBe(10)
    expect(row.fats_g).toBe(8)
  })

  it('unit ml => is_liquid true + serving_unit ml', async () => {
    const { client, inserts } = makeClient()
    const res = await createCoachFoodV2({
      db: client,
      userId: 'coach-1',
      input: { clientId: CLIENT_ID, name: 'Bebida', brand: null, unit: 'ml', calories: 40, proteinG: 0, carbsG: 10, fatsG: 0 },
    })
    expect(res.ok).toBe(true)
    const row = inserts[0].rows as Record<string, unknown>
    expect(row.is_liquid).toBe(true)
    expect(row.serving_unit).toBe('ml')
  })

  it('input invalido (nombre vacio) => INVALID_PAYLOAD sin tocar la BD', async () => {
    const { client, inserts } = makeClient()
    const res = await createCoachFoodV2({
      db: client,
      userId: 'coach-1',
      input: { clientId: CLIENT_ID, name: '', brand: null, unit: 'g', calories: 100, proteinG: 5, carbsG: 5, fatsG: 5 },
    })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe('INVALID_PAYLOAD')
    expect(inserts).toHaveLength(0)
  })

  it('error 42501 en el insert => SCOPE_DENIED (la RLS es la barrera real)', async () => {
    const failClient = {
      from() {
        return {
          insert() {
            return {
              select() {
                return { async single() { return { data: null, error: { message: 'denied', code: '42501' } } } }
              },
            }
          },
        }
      },
    } as unknown as NutritionV2WriteClient
    const res = await createCoachFoodV2({
      db: failClient,
      userId: 'coach-1',
      input: { clientId: CLIENT_ID, name: 'Salsa', brand: null, unit: 'g', calories: 100, proteinG: 5, carbsG: 5, fatsG: 5 },
    })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe('SCOPE_DENIED')
  })
})

describe('effectiveDateConflicts (sub-delta c)', () => {
  it('igual o anterior choca; posterior no; faltante no bloquea', () => {
    expect(effectiveDateConflicts('2026-07-20', '2026-07-20')).toBe(true)
    expect(effectiveDateConflicts('2026-07-19', '2026-07-20')).toBe(true)
    expect(effectiveDateConflicts('2026-07-21', '2026-07-20')).toBe(false)
    expect(effectiveDateConflicts(null, '2026-07-20')).toBe(false)
    expect(effectiveDateConflicts('2026-07-20', null)).toBe(false)
    expect(effectiveDateConflicts(undefined, undefined)).toBe(false)
  })
})

describe('canProceedToPublishAfterArchive (sub-delta c)', () => {
  it('OK y PLAN_NOT_FOUND avanzan; otros fallos bloquean', () => {
    // Forma RN del ArchiveWriteOutcome (code: 'OK') + PLAN_NOT_FOUND idempotente.
    expect(canProceedToPublishAfterArchive({ code: 'OK' })).toBe(true)
    expect(canProceedToPublishAfterArchive({ code: 'PLAN_NOT_FOUND' })).toBe(true)
    // Forma web (ok: true) por robustez.
    expect(canProceedToPublishAfterArchive({ ok: true })).toBe(true)
    expect(canProceedToPublishAfterArchive({ code: 'SCOPE_DENIED' })).toBe(false)
    expect(canProceedToPublishAfterArchive({ code: 'WRITE_FAILED' })).toBe(false)
  })
})

describe('publishDraftRN (gate Pro cliente)', () => {
  it('hybrid sin Pro => UPGRADE_REQUIRED, sin tocar la BD', async () => {
    const draft = assembleAndValidateDraft(hybridState(), { clientId: CLIENT_ID })
    const { client, inserts } = makeClient()
    const res = await publishDraftRN({ db: client, userId: 'coach-1', draft, idempotencyKey: 'publish:key:abcdef', effectiveFrom: '2026-07-20', hasNutritionPro: false })
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.code).toBe('UPGRADE_REQUIRED')
      expect(res.feature).toBe('hybrid_strategy')
    }
    expect(inserts).toHaveLength(0)
  })

  it('structured base sin Pro => publica', async () => {
    const draft = assembleAndValidateDraft(structuredState(), { clientId: CLIENT_ID })
    const { client } = makeClient({ foodRow: FOOD_DB_ROW })
    const res = await publishDraftRN({ db: client, userId: 'coach-1', draft, idempotencyKey: 'publish:key:abcdef', effectiveFrom: '2026-07-20', hasNutritionPro: false })
    expect(res.ok).toBe(true)
  })

  it('draft invalido => INVALID_PAYLOAD', async () => {
    const { client } = makeClient()
    const res = await publishDraftRN({ db: client, userId: 'coach-1', draft: { nope: true }, idempotencyKey: 'publish:key:abcdef', effectiveFrom: '2026-07-20', hasNutritionPro: true })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe('INVALID_PAYLOAD')
  })
})
