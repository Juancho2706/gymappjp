import { describe, expect, it } from 'vitest'
import { EDITOR_TARGETS_COPY } from './editor-copy-targets'
import {
  autoDayVariantLabel,
  joinDayLabels,
  QE_TARGET_FIELDS,
  qeDaysMissingTargets,
  qeSwitchOffPlan,
  qeTargetsEqual,
  qeTargetsGapBar,
  quickEditReducer,
  type QeSwitchOffPlan,
  type QeTargetsText,
  type QeVariant,
  type QuickEditState,
} from './editor-state'
import { NUTRITION_WEEK_ORDER } from './day-variants'

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

  it('los 7 dias propios con meta ⇒ el base no sirve a nadie y NO figura sin meta (D4)', () => {
    // Antes contaba variantes: el base vacio pintaba punto ambar aunque ningun dia lo use.
    const week = NUTRITION_WEEK_ORDER.map((dow) =>
      variant(`d${dow}`, autoDayVariantLabel(dow), dow, false, { calories: '2040' }),
    )
    const state = stateOf([BASE_EMPTY, ...week])
    expect(qeDaysMissingTargets(state)).toEqual([])
    expect(qeTargetsGapBar(state)).toBeNull()
  })

  it('base vacio + Martes propio: el punto ambar y el aviso salen del MISMO mapa (D4)', () => {
    const tuesday = variant('tue', 'Martes', 2, false, { calories: '2040' })
    const state = stateOf([BASE_EMPTY, tuesday])
    // El base es la unica variante sin meta, y sirve a los 6 dias que el aviso nombra.
    expect(qeDaysMissingTargets(state)).toEqual([{ key: 'default', label: 'El día base', isDefault: true }])
    expect(qeTargetsGapBar(state)).toEqual({
      message: 'Solo Martes tiene meta. Lunes, miércoles, jueves, viernes, sábado y domingo quedan sin objetivo.',
      dayKey: 'tue',
    })
  })

  it('una variante no-default con dayOfWeek null no sirve a ningun dia y no cuenta (D4)', () => {
    const base = variant('default', 'Todos los días', null, true, { calories: '2000' })
    const huerfana = variant('vieja', 'Variante suelta', null, false)
    const state = stateOf([base, huerfana])
    expect(qeDaysMissingTargets(state)).toEqual([])
    expect(qeTargetsGapBar(state)).toBeNull()
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

  it('rellena campo a campo: un dia sin kcal pero con proteina propia la conserva (D4)', () => {
    const tuesday = variant('tue', 'Martes', 2, false, { calories: '2040', proteinG: '144' })
    // Dia a medio llenar: el coach ya escribio la proteina, pero no la energia.
    const monday = variant('mon', 'Lunes', 1, false, { proteinG: '120' })
    const after = quickEditReducer(stateOf([BASE_EMPTY, monday, tuesday]), {
      type: 'APPLY_BASE_TARGETS',
      fromVariantKey: 'tue',
    })
    expect(after.variants.map((v) => [v.key, v.targets.calories, v.targets.proteinG])).toEqual([
      ['default', '2040', '144'],
      ['mon', '2040', '120'],
      ['tue', '2040', '144'],
    ])
  })

  it('un origen inexistente o sin meta es un no-op total', () => {
    const before = stateOf([BASE_EMPTY, TUESDAY_EMPTY])
    expect(quickEditReducer(before, { type: 'APPLY_BASE_TARGETS', fromVariantKey: 'tue' })).toBe(before)
    expect(quickEditReducer(before, { type: 'APPLY_BASE_TARGETS', fromVariantKey: 'nope' })).toBe(before)
  })
})

describe('EDITOR_TARGETS_COPY.targets (copys del apagado del switch, D2/D3)', () => {
  it('los textos nuevos son los aprobados, en tuteo y sin cifras', () => {
    // Base CON metas: el dia vuelve a la de todos los dias. El dia ABRE la oracion, asi que el
    // copy lo capitaliza venga como venga («martes» en RN, «Martes» en la web).
    expect(EDITOR_TARGETS_COPY.targets.backToBase('martes')).toBe('Martes vuelve a la meta de todos los días')
    expect(EDITOR_TARGETS_COPY.targets.backToBase('Martes')).toBe('Martes vuelve a la meta de todos los días')
    expect(EDITOR_TARGETS_COPY.targets.backToBase('miércoles')).toBe('Miércoles vuelve a la meta de todos los días')
    // Base VACIO (el plan de Pame): la meta del dia se propaga a la semana.
    expect(EDITOR_TARGETS_COPY.targets.appliedToAll).toBe('Ahora vale para toda la semana')
    expect(EDITOR_TARGETS_COPY.targets.undo).toBe('Deshacer')
    expect(EDITOR_TARGETS_COPY.targets.dayNoTarget).toBe('sin meta')
  })
})

// ---------------------------------------------------------------------------
// `qeSwitchOffPlan` (W4 remate 2): apagar el switch «Solo el {dia}» — la logica que vivia
// duplicada en las dos `TargetsEditorCard.planSwitchOff` (RN y web), con el conjunto de dias que
// antes armaba cada host. Apagar el switch NUNCA borra una meta (decision del jefe D2).
// ---------------------------------------------------------------------------

/** Las metas del caso Pame: lo que el coach escribio parado en Martes. */
const PAME = { calories: '2040', proteinG: '144', carbsG: '247', fatsG: '52' } as const

/** Aplica el plan como lo hace el consumidor: `SET_TARGET` por cada key × write, `scope: 'day'`. */
function applyPlan(state: QuickEditState, plan: QeSwitchOffPlan): QuickEditState {
  let next = state
  for (const variantKey of plan.keys) {
    for (const { field, value } of plan.writes) {
      next = quickEditReducer(next, { type: 'SET_TARGET', variantKey, field, value, scope: 'day' })
    }
  }
  return next
}

/** «Deshacer»: los 4 campos de cada dia del snapshot, `scope: 'day'` (C4: solo los TOCADOS). */
function restorePlan(state: QuickEditState, plan: QeSwitchOffPlan): QuickEditState {
  let next = state
  for (const day of plan.snapshot) {
    for (const field of QE_TARGET_FIELDS) {
      next = quickEditReducer(next, {
        type: 'SET_TARGET',
        variantKey: day.variantKey,
        field,
        value: day.targets[field],
        scope: 'day',
      })
    }
  }
  return next
}

describe('qeSwitchOffPlan', () => {
  it('caso Pame: base vacio ⇒ la meta del Martes se propaga al base y a los dias que heredaban', () => {
    const tuesday = variant('tue', 'Martes', 2, false, PAME)
    const thursday = variant('thu', 'Jueves', 4, false, { calories: '1800' })
    const plan = qeSwitchOffPlan(stateOf([BASE_EMPTY, MONDAY_EMPTY, tuesday, thursday]), 'tue')
    expect(plan?.mode).toBe('applied_to_all')
    // El Jueves tiene meta propia distinta: NO entra (SPEC §7.5).
    expect(plan?.keys).toEqual(['tue', 'default', 'mon'])
    expect(plan?.writes).toEqual([
      { field: 'calories', value: '2040' },
      { field: 'proteinG', value: '144' },
      { field: 'carbsG', value: '247' },
      { field: 'fatsG', value: '52' },
    ])
    expect(plan?.snapshot).toEqual([
      { variantKey: 'tue', targets: targets(PAME) },
      { variantKey: 'default', targets: targets() },
      { variantKey: 'mon', targets: targets() },
    ])
  })

  it('propaga SOLO los campos no vacios del dia: un base con proteina cargada no la pierde (D2)', () => {
    const tuesday = variant('tue', 'Martes', 2, false, { calories: '2040', carbsG: '247' })
    const plan = qeSwitchOffPlan(stateOf([BASE_EMPTY, MONDAY_EMPTY, tuesday]), 'tue')
    expect(plan?.mode).toBe('applied_to_all')
    expect(plan?.writes).toEqual([
      { field: 'calories', value: '2040' },
      { field: 'carbsG', value: '247' },
    ])
  })

  it('base CON meta ⇒ el dia vuelve a ESPEJAR el base: los 4 campos, vacios incluidos, y solo el', () => {
    const base = variant('default', 'Todos los días', null, true, { calories: '1800' })
    const tuesday = variant('tue', 'Martes', 2, false, PAME)
    const plan = qeSwitchOffPlan(stateOf([base, MONDAY_EMPTY, tuesday]), 'tue')
    expect(plan?.mode).toBe('back_to_base')
    expect(plan?.keys).toEqual(['tue'])
    expect(plan?.writes).toEqual([
      { field: 'calories', value: '1800' },
      { field: 'proteinG', value: '' },
      { field: 'carbsG', value: '' },
      { field: 'fatsG', value: '' },
    ])
    expect(plan?.snapshot).toEqual([{ variantKey: 'tue', targets: targets(PAME) }])
  })

  it('es null cuando el dia ya muestra la meta del base (se apaga sin anunciar nada)', () => {
    const base = variant('default', 'Todos los días', null, true, { calories: '2040' })
    const tuesday = variant('tue', 'Martes', 2, false, { calories: ' 2040.0 ' })
    expect(qeSwitchOffPlan(stateOf([base, tuesday]), 'tue')).toBeNull()
  })

  it('es null si el plan entero esta sin kcal, con el dayKey del base y con uno inexistente', () => {
    const tuesday = variant('tue', 'Martes', 2, false, { proteinG: '144' })
    expect(qeSwitchOffPlan(stateOf([BASE_EMPTY, tuesday]), 'tue')).toBeNull()
    const withTargets = stateOf([BASE_EMPTY, variant('tue', 'Martes', 2, false, PAME)])
    expect(qeSwitchOffPlan(withTargets, 'default')).toBeNull()
    expect(qeSwitchOffPlan(withTargets, 'nope')).toBeNull()
    // Sin dia base no hay «todos los dias» posible.
    expect(qeSwitchOffPlan(stateOf([variant('tue', 'Martes', 2, false, PAME)]), 'tue')).toBeNull()
  })

  it('una variante no-default con dayOfWeek null no sirve a ningun dia y queda fuera de keys', () => {
    const huerfana = variant('vieja', 'Variante suelta', null, false)
    const tuesday = variant('tue', 'Martes', 2, false, PAME)
    const plan = qeSwitchOffPlan(stateOf([BASE_EMPTY, MONDAY_EMPTY, huerfana, tuesday]), 'tue')
    expect(plan?.keys).toEqual(['tue', 'default', 'mon'])
    expect(plan?.snapshot.map((day) => day.variantKey)).toEqual(['tue', 'default', 'mon'])
  })

  it('end-to-end con el reducer: aplicar deja la semana con 2.040 y «Deshacer» vuelve exacto', () => {
    const tuesday = variant('tue', 'Martes', 2, false, PAME)
    const thursday = variant('thu', 'Jueves', 4, false, { calories: '1800' })
    const before = stateOf([BASE_EMPTY, MONDAY_EMPTY, tuesday, thursday])
    const plan = qeSwitchOffPlan(before, 'tue')
    expect(plan).not.toBeNull()
    if (!plan) return
    const after = applyPlan(before, plan)
    expect(after.variants.map((v) => [v.key, v.targets.calories, v.targets.proteinG])).toEqual([
      ['default', '2040', '144'],
      ['mon', '2040', '144'],
      ['tue', '2040', '144'],
      ['thu', '1800', ''],
    ])
    // El dia con meta propia distinta no se toco NI se le cambio la identidad.
    expect(after.variants[3]).toBe(thursday)
    // Y ya no queda ningun dia sin objetivo: es el bug de Pame cerrado.
    expect(qeTargetsGapBar(after)).toBeNull()
    // «Deshacer» devuelve la foto exacta de los dias tocados.
    expect(restorePlan(after, plan).variants.map((v) => v.targets)).toEqual(before.variants.map((v) => v.targets))
  })
})
