import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SubstitutionIntakeRequestSchema } from '@eva/nutrition-v2'

vi.mock('@/services/nutrition-v2-student-permissions.service', () => ({
  resolveStudentIntakePermissions: vi.fn(async () => ({
    permissions: { canAdjustPrescribedQuantity: false, quantityAdjustmentPercent: null },
  })),
}))

/**
 * El read model del Today se deja pasar tal cual. Este archivo prueba el BOUNDARY -que opcion se
 * elige, con que clave y si registra o corrige-, no el contrato de `get_nutrition_today_v2`, que
 * tiene su propia bateria y lleva un mes en produccion. Armar un Today valido a mano aca solo
 * agregaria un fixture de cincuenta lineas que se rompe cada vez que el read model crece.
 * El resto de los schemas (opciones y request) son los REALES: son los que esta tanda cambia.
 */
vi.mock('@eva/nutrition-v2', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@eva/nutrition-v2')>()
  return {
    ...actual,
    NutritionTodayReadModelSchema: {
      safeParse: (data: unknown) => ({ success: true as const, data }),
    },
  }
})

const { planSubstitutionIntake } = await import('./substitution-intake.service')

const CLIENT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const ITEM = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const SUB = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const GROUP_FOOD = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const OTHER_FOOD = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
const VERSION = 'ffffffff-ffff-4fff-8fff-ffffffffffff'

function food(over: Record<string, unknown> = {}) {
  return {
    name: 'Pechuga de pollo',
    brand: null,
    calories: 165,
    proteinG: 31,
    carbsG: 0,
    fatsG: 3,
    fiberG: 0,
    macrosBasis: 'per_serving',
    servingSize: 100,
    servingUnit: 'g',
    hasOverride: false,
    ...over,
  }
}

function coachOption() {
  return {
    origin: 'coach',
    substitutionId: SUB,
    foodId: OTHER_FOOD,
    recipeId: null,
    customName: null,
    quantity: null,
    unit: null,
    food: food({ name: 'Posta' }),
    frozen: { name: 'Posta', brand: null, calories: 17 },
  }
}

function groupOption(foodId = GROUP_FOOD) {
  return {
    origin: 'group',
    substitutionId: null,
    foodId,
    recipeId: null,
    customName: null,
    quantity: null,
    unit: null,
    food: food(),
    frozen: { name: null, brand: null, calories: null },
  }
}

/**
 * Cliente falso. `groupOptions` se sirve SOLO cuando la llamada trae `p_group_food_id`, que es
 * exactamente como se comporta la RPC: la pagina por defecto no viaja. Asi el test comprueba de
 * verdad que el boundary usa el lookup dedicado y no la respuesta paginada.
 */
function makeSupabase(opts: {
  groupFoodIds?: string[]
  entries?: Array<{ idempotency_key: string | null; entry_status: string }>
  activeEntryId?: string | null
}) {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = []
  const supabase = {
    rpc: async (name: string, args: Record<string, unknown> = {}) => {
      calls.push({ name, args })
      if (name === 'get_nutrition_substitution_options_v2') {
        const requested = args.p_group_food_id as string | undefined
        const served =
          requested && (opts.groupFoodIds ?? []).includes(requested) ? [groupOption(requested)] : []
        return {
          data: {
            schemaVersion: 1,
            localDate: '2026-08-10',
            versionId: VERSION,
            items: [
              {
                prescriptionItemId: ITEM,
                mealSlotCode: 'lunch',
                item: { quantity: 100, unit: 'g', name: 'Arroz', calories: 200 },
                options: [coachOption()],
                group: { id: VERSION, code: 'P', name: 'Proteinas' },
                groupTotal: 601,
                groupOptions: served,
              },
            ],
          },
          error: null,
        }
      }
      if (name === 'get_nutrition_today_v2') {
        return {
          data: {
            schemaVersion: 1,
            localDate: '2026-08-10',
            timezone: 'America/Santiago',
            mealSlots: opts.activeEntryId
              ? [
                  {
                    id: 'slot',
                    code: 'lunch',
                    name: 'Almuerzo',
                    intakeItems: [
                      {
                        id: opts.activeEntryId,
                        prescriptionItemId: ITEM,
                        status: 'active',
                      },
                    ],
                  },
                ]
              : [],
            unassignedIntake: [],
          },
          error: null,
        }
      }
      return { data: null, error: null }
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            eq: async () => ({ data: opts.entries ?? [], error: null }),
          }),
        }),
      }),
    }),
  }
  return { supabase, calls }
}

function request(over: Record<string, unknown> = {}) {
  return {
    clientId: CLIENT,
    localDate: '2026-08-10',
    occurredAt: '2026-08-10T15:00:00.000Z',
    timezone: 'America/Santiago',
    prescriptionItemId: ITEM,
    attempt: 0,
    queuedAhead: 0,
    quantity: null,
    ...over,
  }
}

describe('SubstitutionIntakeRequestSchema - exactamente uno de los dos ids', () => {
  it('acepta solo substitutionId', () => {
    expect(SubstitutionIntakeRequestSchema.safeParse(request({ substitutionId: SUB })).success).toBe(
      true,
    )
  })

  it('acepta solo groupFoodId', () => {
    expect(
      SubstitutionIntakeRequestSchema.safeParse(request({ groupFoodId: GROUP_FOOD })).success,
    ).toBe(true)
  })

  it('rechaza los dos a la vez', () => {
    expect(
      SubstitutionIntakeRequestSchema.safeParse(
        request({ substitutionId: SUB, groupFoodId: GROUP_FOOD }),
      ).success,
    ).toBe(false)
  })

  it('rechaza ninguno', () => {
    expect(SubstitutionIntakeRequestSchema.safeParse(request()).success).toBe(false)
  })
})

describe('planSubstitutionIntake - opciones del grupo', () => {
  beforeEach(() => vi.clearAllMocks())

  it('registra un alimento del grupo y pide el lookup dedicado, no la pagina', async () => {
    const { supabase, calls } = makeSupabase({ groupFoodIds: [GROUP_FOOD] })
    const plan = await planSubstitutionIntake(
      supabase,
      SubstitutionIntakeRequestSchema.parse(request({ groupFoodId: GROUP_FOOD })),
    )

    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.mode).toBe('record')
    expect(plan.args.p_food_id).toBe(GROUP_FOOD)
    expect(plan.args.p_source).toBe('substitution')
    expect(plan.args.p_prescription_item_id).toBe(ITEM)
    // 200 kcal del item / 1,65 kcal por g = 121 g, redondeado al escalon de 5.
    expect(plan.quantity).toBe(120)

    const optionsCall = calls.find((c) => c.name === 'get_nutrition_substitution_options_v2')
    expect(optionsCall?.args.p_group_food_id).toBe(GROUP_FOOD)
    expect(optionsCall?.args.p_prescription_item_id).toBe(ITEM)
  })

  it('la clave lleva el namespace gf-, distinto del de las filas del coach', async () => {
    const { supabase } = makeSupabase({ groupFoodIds: [GROUP_FOOD] })
    const plan = await planSubstitutionIntake(
      supabase,
      SubstitutionIntakeRequestSchema.parse(request({ groupFoodId: GROUP_FOOD })),
    )
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.args.p_idempotency_key).toBe(`subst-2026-08-10-${ITEM}-gf-${GROUP_FOOD}-a0`)
  })

  it('un alimento que el servidor no reconoce del grupo NO se registra', async () => {
    // Es la misma respuesta para las tres formas del problema: fuera del grupo, privado de otro
    // coach, o excluido por el coach. El servidor simplemente no lo devuelve.
    const { supabase } = makeSupabase({ groupFoodIds: [] })
    const plan = await planSubstitutionIntake(
      supabase,
      SubstitutionIntakeRequestSchema.parse(request({ groupFoodId: GROUP_FOOD })),
    )
    expect(plan.ok).toBe(false)
    if (plan.ok) return
    expect(plan.code).toBe('SUBSTITUTION_NOT_AUTHORIZED')
  })

  it('una opcion hallada por el buscador, fuera de la primera pagina, SI se registra', async () => {
    // El fake nunca sirve pagina por defecto: si el boundary buscara ahi, esto fallaria.
    const lejano = '99999999-9999-4999-8999-999999999999'
    const { supabase } = makeSupabase({ groupFoodIds: [lejano] })
    const plan = await planSubstitutionIntake(
      supabase,
      SubstitutionIntakeRequestSchema.parse(request({ groupFoodId: lejano })),
    )
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.args.p_food_id).toBe(lejano)
  })

  it('con un registro activo del item, corrige en vez de duplicar', async () => {
    const { supabase } = makeSupabase({
      groupFoodIds: [GROUP_FOOD],
      activeEntryId: '11111111-1111-4111-8111-111111111111',
    })
    const plan = await planSubstitutionIntake(
      supabase,
      SubstitutionIntakeRequestSchema.parse(request({ groupFoodId: GROUP_FOOD })),
    )
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.mode).toBe('correct')
    expect(plan.rpcName).toBe('correct_nutrition_intake_v2')
  })

  it('la rama del coach sigue andando y usa el id de la fila', async () => {
    const { supabase, calls } = makeSupabase({})
    const plan = await planSubstitutionIntake(
      supabase,
      SubstitutionIntakeRequestSchema.parse(request({ substitutionId: SUB })),
    )
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.args.p_food_id).toBe(OTHER_FOOD)
    expect(plan.args.p_idempotency_key).toBe(`subst-2026-08-10-${ITEM}-${SUB}-a0`)
    // Sin `groupFoodId` la llamada NO pide lookup: es la misma de T2.4.
    const optionsCall = calls.find((c) => c.name === 'get_nutrition_substitution_options_v2')
    expect(optionsCall?.args.p_group_food_id).toBeUndefined()
  })
})

describe('planSubstitutionIntake - claves quemadas', () => {
  it('deshacer y re-elegir la MISMA opcion del grupo produce una clave nueva', async () => {
    const { supabase } = makeSupabase({
      groupFoodIds: [GROUP_FOOD],
      entries: [
        { idempotency_key: `subst-2026-08-10-${ITEM}-gf-${GROUP_FOOD}-a0`, entry_status: 'voided' },
      ],
    })
    const plan = await planSubstitutionIntake(
      supabase,
      SubstitutionIntakeRequestSchema.parse(request({ groupFoodId: GROUP_FOOD })),
    )
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.args.p_idempotency_key).toBe(`subst-2026-08-10-${ITEM}-gf-${GROUP_FOOD}-a1`)
  })

  it('una entry CORREGIDA tambien quema la clave (ciclo A -> B -> A)', async () => {
    const { supabase } = makeSupabase({
      groupFoodIds: [GROUP_FOOD],
      entries: [
        {
          idempotency_key: `subst-2026-08-10-${ITEM}-gf-${GROUP_FOOD}-a0`,
          entry_status: 'corrected',
        },
      ],
    })
    const plan = await planSubstitutionIntake(
      supabase,
      SubstitutionIntakeRequestSchema.parse(request({ groupFoodId: GROUP_FOOD })),
    )
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.args.p_idempotency_key).toBe(`subst-2026-08-10-${ITEM}-gf-${GROUP_FOOD}-a1`)
  })

  it('una entry ACTIVA con la misma clave NO la quema: es un reintento', async () => {
    const { supabase } = makeSupabase({
      groupFoodIds: [GROUP_FOOD],
      entries: [
        { idempotency_key: `subst-2026-08-10-${ITEM}-gf-${GROUP_FOOD}-a0`, entry_status: 'active' },
      ],
    })
    const plan = await planSubstitutionIntake(
      supabase,
      SubstitutionIntakeRequestSchema.parse(request({ groupFoodId: GROUP_FOOD })),
    )
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.args.p_idempotency_key).toBe(`subst-2026-08-10-${ITEM}-gf-${GROUP_FOOD}-a0`)
  })

  it('los gestos encolados sin red corren el attempt', async () => {
    const { supabase } = makeSupabase({ groupFoodIds: [GROUP_FOOD] })
    const plan = await planSubstitutionIntake(
      supabase,
      SubstitutionIntakeRequestSchema.parse(request({ groupFoodId: GROUP_FOOD, queuedAhead: 2 })),
    )
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.args.p_idempotency_key).toBe(`subst-2026-08-10-${ITEM}-gf-${GROUP_FOOD}-a2`)
  })
})
