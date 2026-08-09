import { describe, expect, it } from 'vitest'
import {
  SUBSTITUTION_MAX_MASS_QUANTITY,
  SubstitutionIntakeRequestSchema,
  computeSubstitutionEquivalence,
  roundSubstitutionQuantity,
  substituteNaturalUnit,
  substitutionAttemptFromToday,
  substitutionIntakeIdempotencyKey,
  type SubstitutionPrescribedItem,
  type SubstitutionSubstitute,
} from './substitution-intake'

/**
 * Los cuatro primeros casos son PARES REALES de produccion (leidos de LIVE el 2026-08-09). El
 * valor de estos golden tests es exactamente ese: si alguien cambia la formula, el test falla
 * con datos que un alumno esta viendo hoy en su telefono, no con un ejemplo inventado.
 */
function substitute(over: Partial<SubstitutionSubstitute> = {}): SubstitutionSubstitute {
  return {
    foodId: '11111111-1111-4111-8111-111111111111',
    customName: null,
    name: 'Sustituto',
    brand: null,
    calories: 100,
    proteinG: 10,
    carbsG: 5,
    fatsG: 2,
    fiberG: 1,
    macrosBasis: 'per_100',
    servingSize: 100,
    servingUnit: 'g',
    quantity: null,
    unit: null,
    ...over,
  }
}

function item(over: Partial<SubstitutionPrescribedItem> = {}): SubstitutionPrescribedItem {
  return { quantity: 100, unit: 'g', calories: 200, ...over }
}

describe('computeSubstitutionEquivalence — pares reales de LIVE', () => {
  it('Lomo liso 120 g / 240 kcal → Posta cocida (per_serving, 30 g, 55 kcal) ⇒ ~130 g', () => {
    const result = computeSubstitutionEquivalence({
      item: item({ quantity: 120, unit: 'g', calories: 240 }),
      substitute: substitute({
        name: 'Posta de vacuno cocida',
        calories: 55,
        proteinG: 10,
        carbsG: 0,
        fatsG: 1.5,
        fiberG: 0,
        macrosBasis: 'per_serving',
        servingSize: 30,
        servingUnit: 'g',
      }),
    })

    expect(result.kind).toBe('calorie-equivalent')
    expect(result.quantity).toBe(130)
    expect(result.unit).toBe('g')
    expect(result.requiresConfirmation).toBe(false)
    // Lo que HOY muestra la pill (snapshot congelado) son 16,5 kcal: el bug que T2.4 mata.
    expect(result.totals.calories).toBeGreaterThan(200)
    expect(result.totals.calories).toBeLessThan(250)
  })

  it('Palta 45 g / 72 kcal → Pechuga cocida (100 g, 165 kcal) ⇒ 45 g', () => {
    const result = computeSubstitutionEquivalence({
      item: item({ quantity: 45, unit: 'g', calories: 72 }),
      substitute: substitute({
        name: 'Pechuga de Pollo cocida',
        calories: 165,
        macrosBasis: 'per_serving',
        servingSize: 100,
        servingUnit: 'g',
      }),
    })

    expect(result.kind).toBe('calorie-equivalent')
    expect(result.quantity).toBe(45)
  })

  it('Yogurt proteico 1 un / 77 kcal → Leche protein (100 g, 60 kcal) ⇒ 130 g, NO "un"', () => {
    const result = computeSubstitutionEquivalence({
      item: item({ quantity: 1, unit: 'un', calories: 77 }),
      substitute: substitute({
        name: 'Leche protein colun/soprole',
        calories: 60,
        macrosBasis: 'per_serving',
        servingSize: 100,
        servingUnit: 'g',
      }),
    })

    expect(result.kind).toBe('calorie-equivalent')
    expect(result.quantity).toBe(130)
    // La unidad NUNCA se hereda del item: "1 un de leche" no significa nada.
    expect(result.unit).toBe('g')
  })

  it('Pechuga 100 g / 165 kcal → Espinaca (23 kcal/100 g) ⇒ needs-confirmation, no un tap', () => {
    const result = computeSubstitutionEquivalence({
      item: item({ quantity: 100, unit: 'g', calories: 165 }),
      substitute: substitute({
        name: 'Espinaca',
        calories: 23,
        macrosBasis: 'per_100',
        servingSize: 100,
        servingUnit: 'g',
      }),
    })

    expect(result.quantity).toBeGreaterThan(SUBSTITUTION_MAX_MASS_QUANTITY)
    expect(result.kind).toBe('needs-confirmation')
    expect(result.requiresConfirmation).toBe(true)
  })
})

describe('computeSubstitutionEquivalence — reglas', () => {
  it('la cantidad explicita del coach gana y no se somete al tope', () => {
    const result = computeSubstitutionEquivalence({
      item: item({ calories: 200 }),
      substitute: substitute({ calories: 23, quantity: 900, unit: 'g' }),
    })

    expect(result.kind).toBe('explicit')
    expect(result.quantity).toBe(900)
    expect(result.requiresConfirmation).toBe(false)
  })

  it('quantity explicita con unit NULL cae a la unidad natural del sustituto, no a la del item', () => {
    const result = computeSubstitutionEquivalence({
      item: item({ quantity: 2, unit: 'un', calories: 200 }),
      substitute: substitute({ quantity: 250, unit: null, servingUnit: 'ml' }),
    })

    expect(result.kind).toBe('explicit')
    expect(result.quantity).toBe(250)
    expect(result.unit).toBe('ml')
  })

  it('sustituto sin kcal vigentes ⇒ unavailable, prellenado con SU porcion, no la del item', () => {
    const result = computeSubstitutionEquivalence({
      item: item({ quantity: 300, unit: 'g', calories: 1140 }),
      substitute: substitute({ name: 'Nescafe', calories: 0, servingSize: 2, servingUnit: 'g' }),
    })

    expect(result.kind).toBe('unavailable')
    expect(result.requiresConfirmation).toBe(true)
    // La porcion del sustituto (2 g) redondeada al escalon de masa, NUNCA los 300 g del item.
    expect(result.quantity).toBe(5)
    expect(result.quantity).not.toBe(300)
  })

  it('item sin kcal congeladas ⇒ unavailable', () => {
    const result = computeSubstitutionEquivalence({
      item: item({ calories: null }),
      substitute: substitute(),
    })

    expect(result.kind).toBe('unavailable')
    expect(result.targetCalories).toBeNull()
  })

  it('per_100 y per_serving escalan distinto para el mismo alimento', () => {
    const base = { name: 'X', calories: 200, servingSize: 50, servingUnit: 'g' as const }
    const per100 = computeSubstitutionEquivalence({
      item: item({ calories: 200 }),
      substitute: substitute({ ...base, macrosBasis: 'per_100' }),
    })
    const perServing = computeSubstitutionEquivalence({
      item: item({ calories: 200 }),
      substitute: substitute({ ...base, macrosBasis: 'per_serving' }),
    })

    // per_100: 200 kcal/100 g ⇒ 100 g. per_serving: 200 kcal por 50 g ⇒ 50 g.
    expect(per100.quantity).toBe(100)
    expect(perServing.quantity).toBe(50)
  })

  it('unidades contadas usan escalon de 0,5 y su propio tope', () => {
    const result = computeSubstitutionEquivalence({
      item: item({ calories: 130 }),
      substitute: substitute({ calories: 100, servingUnit: 'un', servingSize: 100 }),
    })

    expect(result.unit).toBe('un')
    expect(result.quantity).toBe(1.5)
  })

  it('el snapshot no inventa la base cuando el alimento no la declara', () => {
    const result = computeSubstitutionEquivalence({
      item: item(),
      substitute: substitute({ macrosBasis: null }),
    })

    expect('macrosBasis' in result.snapshot).toBe(false)
  })
})

describe('roundSubstitutionQuantity', () => {
  it('redondea masa a multiplos de 5 y nunca devuelve 0', () => {
    expect(roundSubstitutionQuantity(43.6, 'g')).toBe(45)
    expect(roundSubstitutionQuantity(0.4, 'g')).toBe(5)
    expect(roundSubstitutionQuantity(0, 'g')).toBe(5)
  })

  it('redondea contadas a multiplos de 0,5 sin arrastrar error binario', () => {
    expect(roundSubstitutionQuantity(1.3, 'un')).toBe(1.5)
    expect(roundSubstitutionQuantity(0.1, 'un')).toBe(0.5)
    expect(roundSubstitutionQuantity(2.24, 'porción')).toBe(2)
  })
})

describe('substituteNaturalUnit', () => {
  it('cae a g cuando la unidad del catalogo no es una unidad de intake conocida', () => {
    expect(substituteNaturalUnit({ servingUnit: null })).toBe('g')
    expect(substituteNaturalUnit({ servingUnit: 'sobre' })).toBe('g')
    expect(substituteNaturalUnit({ servingUnit: 'ml' })).toBe('ml')
  })
})

describe('substitutionAttemptFromToday', () => {
  const ITEM = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

  const today = (ids: Array<string | null>, unassigned: Array<string | null> = []) => ({
    mealSlots: [{ intakeItems: ids.map((prescriptionItemId) => ({ prescriptionItemId })) }],
    unassignedIntake: unassigned.map((prescriptionItemId) => ({ prescriptionItemId })),
  })

  it('sin registros del item ⇒ 0', () => {
    expect(substitutionAttemptFromToday(today([OTHER, null]), ITEM)).toBe(0)
  })

  it('cuenta las entries de CUALQUIER estado, no solo las activas', () => {
    // El read-model trae la retirada y la corregida como filas propias: contarlas es lo que
    // impide que la clave se repita tras un "deshacer" (el short-circuit del RPC no filtra
    // entry_status y devolveria el id de la entry retirada).
    expect(substitutionAttemptFromToday(today([ITEM, ITEM, OTHER]), ITEM)).toBe(2)
  })

  it('suma los registros sin franja', () => {
    expect(substitutionAttemptFromToday(today([ITEM], [ITEM, OTHER]), ITEM)).toBe(2)
  })
})

describe('substitutionIntakeIdempotencyKey', () => {
  const base = {
    localDate: '2026-08-09',
    prescriptionItemId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    substitutionId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  }

  it('es estable para la misma intencion y cabe en el rango del RPC (8..200)', () => {
    const key = substitutionIntakeIdempotencyKey({ ...base, attempt: 0 })
    expect(key).toBe(substitutionIntakeIdempotencyKey({ ...base, attempt: 0 }))
    expect(key.length).toBeGreaterThanOrEqual(8)
    expect(key.length).toBeLessThanOrEqual(200)
  })

  it('cambia con el intento (deshacer y volver a registrar) y con el reemplazo (ciclo A→B→A)', () => {
    const a1 = substitutionIntakeIdempotencyKey({ ...base, attempt: 0 })
    const a2 = substitutionIntakeIdempotencyKey({ ...base, attempt: 1 })
    const b1 = substitutionIntakeIdempotencyKey({
      ...base,
      substitutionId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      attempt: 1,
    })

    expect(a1).not.toBe(a2)
    expect(a2).not.toBe(b1)
  })

  it('rechaza un attempt invalido en vez de fabricar una clave', () => {
    expect(() => substitutionIntakeIdempotencyKey({ ...base, attempt: -1 })).toThrow()
    expect(() => substitutionIntakeIdempotencyKey({ ...base, attempt: 1.5 })).toThrow()
  })
})

describe('SubstitutionIntakeRequestSchema', () => {
  const valid = {
    clientId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    localDate: '2026-08-09',
    occurredAt: '2026-08-09T12:00:00.000Z',
    timezone: 'America/Santiago',
    prescriptionItemId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    substitutionId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    attempt: 0,
  }

  it('acepta el gesto minimo y deja quantity en null', () => {
    const parsed = SubstitutionIntakeRequestSchema.parse(valid)
    expect(parsed.quantity).toBeNull()
  })

  it('no acepta que el cliente elija el alimento ni mande macros', () => {
    const parsed = SubstitutionIntakeRequestSchema.parse({
      ...valid,
      foodId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      snapshot: { calories: 1 },
    })
    expect(parsed).not.toHaveProperty('foodId')
    expect(parsed).not.toHaveProperty('snapshot')
  })
})
