import { describe, expect, it } from 'vitest'
import {
  joinDayLabels,
  qeDaysMissingTargets,
  qeTargetsEqual,
  qeTargetsGapBar,
  quickEditReducer,
  type QeTargetsText,
  type QeVariant,
  type QuickEditState,
} from './editor-state'

// Metas por dia (tren «Porciones a la chilena», W4 — caso Pame Cid). Escribir 2.040 kcal parada
// en Martes dejaba al resto de la semana sin objetivo, porque el snapshot copia la variante
// entera y un dia con `target_calories NULL` NO hereda del base. `scope: 'all'` escribe en el
// base y en los dias que heredaban; sin `scope` el reducer hace exactamente lo de siempre.

function targets(partial: Partial<QeTargetsText> = {}): QeTargetsText {
  return { calories: '', proteinG: '', carbsG: '', fatsG: '', ...partial }
}

function variant(
  key: string,
  label: string,
  dayOfWeek: number | null,
  isDefault: boolean,
  values: Partial<QeTargetsText> = {},
): QeVariant {
  return {
    key,
    id: null,
    variantKey: key,
    label,
    dayOfWeek,
    isDefault,
    targets: targets(values),
    passthroughTargets: { fiberG: 30, sodiumMg: null, waterMl: null },
    slots: [],
  }
}

function stateOf(variants: QeVariant[]): QuickEditState {
  return { variants, visibleNotes: '' }
}

const BASE_EMPTY = variant('default', 'Todos los días', null, true)
const MONDAY_EMPTY = variant('mon', 'Lunes', 1, false)
const TUESDAY_EMPTY = variant('tue', 'Martes', 2, false)

describe('qeTargetsEqual', () => {
  it('compara solo kcal/P/C/G, normalizando el texto, e ignora passthroughTargets', () => {
    const a = variant('a', 'Lunes', 1, false, { calories: '2040', proteinG: '144' })
    const b = variant('b', 'Martes', 2, false, { calories: ' 2040.0 ', proteinG: '144' })
    expect(qeTargetsEqual(a, b)).toBe(true)
    const c: QeVariant = { ...b, passthroughTargets: { fiberG: null, sodiumMg: 2000, waterMl: 1 } }
    expect(qeTargetsEqual(a, c)).toBe(true)
    expect(qeTargetsEqual(a, variant('d', 'Miércoles', 3, false, { calories: '1800', proteinG: '144' }))).toBe(false)
  })

  it('dos dias vacios son iguales (es el caso Pame antes de escribir)', () => {
    expect(qeTargetsEqual(BASE_EMPTY, TUESDAY_EMPTY)).toBe(true)
    expect(qeTargetsEqual(BASE_EMPTY, variant('x', 'Martes', 2, false, { calories: '   ' }))).toBe(true)
  })
})

describe('SET_TARGET sin scope', () => {
  it('hace EXACTAMENTE lo de hoy: escribe en un solo dia y no toca a los demas', () => {
    const before = stateOf([BASE_EMPTY, MONDAY_EMPTY, TUESDAY_EMPTY])
    const after = quickEditReducer(before, {
      type: 'SET_TARGET',
      variantKey: 'tue',
      field: 'calories',
      value: '2040',
    })
    expect(after.variants.map((v) => v.targets.calories)).toEqual(['', '', '2040'])
    // Identidad: los dias no tocados son el MISMO objeto (memos de la UI intactos).
    expect(after.variants[0]).toBe(before.variants[0])
    expect(after.variants[1]).toBe(before.variants[1])
    // Y el resultado es identico al de `scope: 'day'` explicito.
    const explicit = quickEditReducer(before, {
      type: 'SET_TARGET',
      variantKey: 'tue',
      field: 'calories',
      value: '2040',
      scope: 'day',
    })
    expect(explicit).toEqual(after)
  })

  it('STEP_TARGET sin scope sigue subiendo 50 kcal solo en su dia', () => {
    const before = stateOf([BASE_EMPTY, TUESDAY_EMPTY])
    const after = quickEditReducer(before, {
      type: 'STEP_TARGET',
      variantKey: 'tue',
      field: 'calories',
      direction: 1,
    })
    expect(after.variants.map((v) => v.targets.calories)).toEqual(['', '50'])
  })
})

describe('SET_TARGET con scope: «all»', () => {
  it('caso Pame: base y martes vacios ⇒ los dos quedan con la meta', () => {
    const before = stateOf([BASE_EMPTY, MONDAY_EMPTY, TUESDAY_EMPTY])
    const after = quickEditReducer(before, {
      type: 'SET_TARGET',
      variantKey: 'tue',
      field: 'calories',
      value: '2040',
      scope: 'all',
    })
    expect(after.variants.map((v) => v.targets.calories)).toEqual(['2040', '2040', '2040'])
    // Fibra/sodio/agua no se tocan.
    expect(after.variants[0].passthroughTargets).toEqual({ fiberG: 30, sodiumMg: null, waterMl: null })
  })

  it('no pisa un dia con metas propias distintas', () => {
    const saturday = variant('sat', 'Sábado', 6, false, { calories: '1800' })
    const before = stateOf([BASE_EMPTY, MONDAY_EMPTY, saturday])
    const after = quickEditReducer(before, {
      type: 'SET_TARGET',
      variantKey: 'mon',
      field: 'calories',
      value: '2040',
      scope: 'all',
    })
    expect(after.variants.map((v) => [v.key, v.targets.calories])).toEqual([
      ['default', '2040'],
      ['mon', '2040'],
      ['sat', '1800'],
    ])
    expect(after.variants[2]).toBe(saturday)
  })

  it('desde un dia que HEREDA escribe tambien en el base y en los otros herederos', () => {
    const base = variant('default', 'Todos los días', null, true, { calories: '2000' })
    const monday = variant('mon', 'Lunes', 1, false, { calories: '2000' })
    const saturday = variant('sat', 'Sábado', 6, false, { calories: '1800' })
    const before = stateOf([base, monday, saturday])
    const after = quickEditReducer(before, {
      type: 'SET_TARGET',
      variantKey: 'mon',
      field: 'calories',
      value: '2200',
      scope: 'all',
    })
    expect(after.variants.map((v) => v.targets.calories)).toEqual(['2200', '2200', '1800'])
  })

  it('STEP_TARGET con scope «all» calcula el paso una vez y lo baja igual a todos', () => {
    const base = variant('default', 'Todos los días', null, true, { calories: '2000' })
    const monday = variant('mon', 'Lunes', 1, false, { calories: '2000' })
    const after = quickEditReducer(stateOf([base, monday]), {
      type: 'STEP_TARGET',
      variantKey: 'mon',
      field: 'calories',
      direction: 1,
      scope: 'all',
    })
    expect(after.variants.map((v) => v.targets.calories)).toEqual(['2050', '2050'])
  })
})

describe('qeDaysMissingTargets', () => {
  it('caso Pame: con meta solo en Martes, el base tambien figura sin meta', () => {
    const tuesday = variant('tue', 'Martes', 2, false, { calories: '2040' })
    const gaps = qeDaysMissingTargets(stateOf([BASE_EMPTY, MONDAY_EMPTY, tuesday]))
    expect(gaps).toEqual([
      { key: 'default', label: 'El día base', isDefault: true },
      { key: 'mon', label: 'Lunes', isDefault: false },
    ])
  })

  it('es [] si ningun dia tiene meta y si todos la tienen', () => {
    expect(qeDaysMissingTargets(stateOf([BASE_EMPTY, MONDAY_EMPTY]))).toEqual([])
    const base = variant('default', 'Todos los días', null, true, { calories: '2000' })
    const monday = variant('mon', 'Lunes', 1, false, { calories: '1800' })
    expect(qeDaysMissingTargets(stateOf([base, monday]))).toEqual([])
  })
})

describe('qeTargetsGapBar', () => {
  it('es null sin ninguna meta y con la semana entera cubierta', () => {
    expect(qeTargetsGapBar(stateOf([BASE_EMPTY, MONDAY_EMPTY, TUESDAY_EMPTY]))).toBeNull()
    const base = variant('default', 'Todos los días', null, true, { calories: '2000' })
    const saturday = variant('sat', 'Sábado', 6, false, { calories: '1800' })
    expect(qeTargetsGapBar(stateOf([base, saturday]))).toBeNull()
    // El base solo, con meta, cubre los 7 dias: tampoco hay hueco.
    expect(qeTargetsGapBar(stateOf([base]))).toBeNull()
  })

  it('caso Pame: nombra el unico dia con meta y los seis sin objetivo', () => {
    const tuesday = variant('tue', 'Martes', 2, false, { calories: '2040' })
    expect(qeTargetsGapBar(stateOf([BASE_EMPTY, MONDAY_EMPTY, tuesday]))).toEqual({
      message: 'Solo Martes tiene meta. Lunes, miércoles, jueves, viernes, sábado y domingo quedan sin objetivo.',
      dayKey: 'tue',
    })
  })

  it('nombra 2 y 3 dias con la gramatica de joinDayLabels', () => {
    const monday = variant('mon', 'Lunes', 1, false, { calories: '2040' })
    const tuesday = variant('tue', 'Martes', 2, false, { calories: '2040' })
    const wednesday = variant('wed', 'Miércoles', 3, false, { calories: '2040' })
    expect(qeTargetsGapBar(stateOf([BASE_EMPTY, monday, tuesday]))?.message).toBe(
      'Solo Lunes y martes tiene meta. Miércoles, jueves, viernes, sábado y domingo quedan sin objetivo.',
    )
    expect(qeTargetsGapBar(stateOf([BASE_EMPTY, monday, tuesday, wednesday]))?.message).toBe(
      'Solo Lunes, martes y miércoles tiene meta. Jueves, viernes, sábado y domingo quedan sin objetivo.',
    )
  })

  it('joinDayLabels: 1, 2 y 3 etiquetas', () => {
    expect(joinDayLabels(['Lunes'])).toBe('Lunes')
    expect(joinDayLabels(['Lunes', 'martes'])).toBe('Lunes y martes')
    expect(joinDayLabels(['Lunes', 'martes', 'miércoles'])).toBe('Lunes, martes y miércoles')
  })
})

describe('APPLY_BASE_TARGETS', () => {
  it('baja la meta del dia de origen al base y a los dias vacios, y es idempotente', () => {
    const tuesday = variant('tue', 'Martes', 2, false, { calories: '2040', proteinG: '144' })
    const saturday = variant('sat', 'Sábado', 6, false, { calories: '1800' })
    const before = stateOf([BASE_EMPTY, MONDAY_EMPTY, tuesday, saturday])
    const after = quickEditReducer(before, { type: 'APPLY_BASE_TARGETS', fromVariantKey: 'tue' })
    expect(after.variants.map((v) => [v.key, v.targets.calories, v.targets.proteinG])).toEqual([
      ['default', '2040', '144'],
      ['mon', '2040', '144'],
      ['tue', '2040', '144'],
      ['sat', '1800', ''],
    ])
    // Un dia con meta propia no se pisa y conserva su identidad.
    expect(after.variants[3]).toBe(saturday)
    // Segundo dispatch: ya no queda ningun dia sin meta ⇒ MISMA referencia.
    expect(quickEditReducer(after, { type: 'APPLY_BASE_TARGETS', fromVariantKey: 'tue' })).toBe(after)
    expect(qeTargetsGapBar(after)).toBeNull()
  })

  it('un origen inexistente o sin meta es un no-op total', () => {
    const before = stateOf([BASE_EMPTY, TUESDAY_EMPTY])
    expect(quickEditReducer(before, { type: 'APPLY_BASE_TARGETS', fromVariantKey: 'tue' })).toBe(before)
    expect(quickEditReducer(before, { type: 'APPLY_BASE_TARGETS', fromVariantKey: 'nope' })).toBe(before)
  })
})
