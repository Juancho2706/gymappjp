import { describe, expect, it } from 'vitest'
import {
  EMPTY_PLAN_SUBSTITUTIONS,
  describeItemSubstitutions,
  planSubstitutionsByItem,
  resolveItemDisplayNote,
  type PlanItemSubstitutionLike,
} from './plan-substitutions'

function sub(overrides: Partial<PlanItemSubstitutionLike> = {}): PlanItemSubstitutionLike {
  return { name: 'Pollo', quantity: null, unit: null, ...overrides }
}

describe('describeItemSubstitutions', () => {
  it('sin capa de reemplazos deja el item identico a hoy', () => {
    expect(describeItemSubstitutions({})).toBeNull()
    expect(describeItemSubstitutions({ substitutions: null })).toBeNull()
    expect(describeItemSubstitutions({ substitutions: [] })).toBeNull()
  })

  it('lista el nombre solo cuando el coach no fijo cantidad (el 100% de LIVE)', () => {
    expect(describeItemSubstitutions({ substitutions: [sub()] })).toBe('o Pollo')
  })

  it('usa la cantidad del coach cuando existe', () => {
    expect(
      describeItemSubstitutions({ substitutions: [sub({ quantity: 120, unit: 'g' })] }),
    ).toBe('o 120 g de Pollo')
  })

  it('encadena varias opciones con el separador del plan', () => {
    expect(
      describeItemSubstitutions({
        substitutions: [
          sub({ quantity: 120, unit: 'g' }),
          sub({ name: 'Huevo', quantity: 2, unit: 'un' }),
          sub({ name: 'Atun' }),
        ],
      }),
    ).toBe('o 120 g de Pollo · o 2 un de Huevo · o Atun')
  })

  it('media unidad contada NO se redondea a 1', () => {
    expect(
      describeItemSubstitutions({ substitutions: [sub({ name: 'Palta', quantity: 0.5, unit: 'un' })] }),
    ).toBe('o 0,5 un de Palta')
  })

  it('cantidad invalida o unidad vacia degradan al nombre, nunca a un 0', () => {
    expect(describeItemSubstitutions({ substitutions: [sub({ quantity: 0, unit: 'g' })] })).toBe('o Pollo')
    expect(describeItemSubstitutions({ substitutions: [sub({ quantity: -5, unit: 'g' })] })).toBe('o Pollo')
    expect(describeItemSubstitutions({ substitutions: [sub({ quantity: Number.NaN, unit: 'g' })] })).toBe('o Pollo')
    expect(describeItemSubstitutions({ substitutions: [sub({ quantity: 120, unit: '  ' })] })).toBe('o Pollo')
  })

  it('descarta reemplazos sin nombre en vez de pintar una opcion vacia', () => {
    expect(describeItemSubstitutions({ substitutions: [sub({ name: '   ' })] })).toBeNull()
    expect(
      describeItemSubstitutions({ substitutions: [sub({ name: '  ' }), sub({ name: 'Atun' })] }),
    ).toBe('o Atun')
  })
})

describe('resolveItemDisplayNote', () => {
  it('con reemplazos estructurados calla el texto legado "Alternativas: ..."', () => {
    expect(resolveItemDisplayNote('Alternativas: Pavo, Atun', true)).toBeNull()
  })

  it('sin reemplazos estructurados conserva el texto legado completo', () => {
    expect(resolveItemDisplayNote('Alternativas: Pavo, Atun', false)).toBe('Alternativas: Pavo, Atun')
  })

  it('cualquier otra nota del coach se conserva aunque haya reemplazos', () => {
    expect(resolveItemDisplayNote('Cocinar a la plancha', true)).toBe('Cocinar a la plancha')
  })

  it('nota vacia, nula o solo espacios no pinta nada', () => {
    expect(resolveItemDisplayNote(null, true)).toBeNull()
    expect(resolveItemDisplayNote(undefined, false)).toBeNull()
    expect(resolveItemDisplayNote('   ', false)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// planSubstitutionsByItem — de donde salen los reemplazos: read model o select.
// ---------------------------------------------------------------------------
//
// Un mapa (aunque este vacio) significa "el plan ya los trae, NO consultes
// `nutrition_item_substitutions_v2`". `null` significa "clave ausente: cae al select directo".
// Es la MISMA decision en web (`PlanVariantCard`) y en RN (tab "Plan"), por eso vive aca.

type TestItem = { id: string; substitutions?: readonly PlanItemSubstitutionLike[] | null }

function variant(...items: TestItem[]) {
  return { mealSlots: [{ prescriptionItems: items }] }
}

describe('planSubstitutionsByItem', () => {
  it('clave presente con reemplazos ⇒ mapa (el llamador NO consulta la tabla)', () => {
    const subs = [sub({ name: 'Pavo' })]
    const map = planSubstitutionsByItem([variant({ id: 'i1', substitutions: subs })])
    expect(map).not.toBeNull()
    expect(map?.i1).toEqual(subs)
  })

  it('clave presente en [] ⇒ mapa vacio: sin reemplazos y SIN select', () => {
    const map = planSubstitutionsByItem([
      variant({ id: 'i1', substitutions: [] }, { id: 'i2', substitutions: [] }),
    ])
    expect(map).toEqual({})
    expect(map).not.toBeNull()
  })

  it('clave ausente (RPC viejo o cache previa) ⇒ null: el llamador cae al select directo', () => {
    expect(planSubstitutionsByItem([variant({ id: 'i1' }, { id: 'i2' })])).toBeNull()
  })

  it('basta UN item con la clave para dar por nuevo al plan entero', () => {
    const map = planSubstitutionsByItem([
      variant({ id: 'i1' }, { id: 'i2', substitutions: [sub({ name: 'Atun' })] }),
    ])
    expect(map).not.toBeNull()
    expect(Object.keys(map ?? {})).toEqual(['i2'])
  })

  it('plan sin items prescritos ⇒ mapa vacio (no hay nada que resolver, tampoco por select)', () => {
    expect(planSubstitutionsByItem([])).toEqual({})
    expect(planSubstitutionsByItem([{ mealSlots: [] }])).toEqual({})
    expect(planSubstitutionsByItem([variant()])).toEqual({})
  })

  it('recorre TODAS las variantes y franjas del plan (RN pasa las 7 de una)', () => {
    const map = planSubstitutionsByItem([
      {
        mealSlots: [
          { prescriptionItems: [{ id: 'lu1', substitutions: [sub({ name: 'Pavo' })] }] },
          { prescriptionItems: [{ id: 'lu2', substitutions: [] }] },
        ],
      },
      { mealSlots: [{ prescriptionItems: [{ id: 'ma1', substitutions: [sub({ name: 'Atun' })] }] }] },
    ])
    expect(Object.keys(map ?? {}).sort()).toEqual(['lu1', 'ma1'])
  })

  it('`substitutions: null` cuenta como clave presente y no rompe el mapa', () => {
    expect(planSubstitutionsByItem([variant({ id: 'i1', substitutions: null })])).toEqual({})
  })

  it('EMPTY_PLAN_SUBSTITUTIONS es una referencia estable y vacia', () => {
    expect(EMPTY_PLAN_SUBSTITUTIONS).toEqual({})
    expect(EMPTY_PLAN_SUBSTITUTIONS).toBe(EMPTY_PLAN_SUBSTITUTIONS)
  })
})
