import { describe, expect, it } from 'vitest'
import {
  QE_TARGET_FIELDS,
  qeSwitchOffPlan,
  quickEditReducer,
  type QeSwitchOffPlan,
  type QeTargetsText,
  type QeVariant,
  type QuickEditState,
} from '@eva/nutrition-v2'

// W4 «Metas por día» (caso Pame Cid), REMATE 2: el gesto de APAGAR el switch «Solo el {día}» en
// RN. La card ya no calcula nada —el criterio entero vive en `qeSwitchOffPlan`, compartido con la
// web—: lo que este test fija es el CONTRATO DEL HOST de `QuickEditMode`, o sea que despachar el
// plan tal cual el host lo despacha (`SET_TARGET` con `scope: 'day'` por key × write, y el
// «Deshacer» con el `snapshot`) da el resultado que SPEC §7.5 promete. Es el pedazo que
// `editor-state.day-targets.test.ts` no puede cubrir: ahí se fija el PLAN, acá el plan APLICADO
// contra el reducer real.

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

/** Cómo se leen las metas del estado, en el mismo orden de las variantes. */
function kcalOf(state: QuickEditState): string[] {
  return state.variants.map((v) => v.targets.calories)
}

/**
 * EXACTAMENTE el bucle de `handleTargetsSwitchOff` en `QuickEditMode.tsx`: key × write con
 * `scope: 'day'`, nunca `scope: 'all'` (con 'all' la 2.ª escritura le pisa la meta propia al día
 * que la 1.ª acababa de dejar igual al base). Si el plan es `null` el switch se apaga y ya.
 */
function applySwitchOff(state: QuickEditState, dayKey: string): { state: QuickEditState; plan: QeSwitchOffPlan | null } {
  const plan = qeSwitchOffPlan(state, dayKey)
  if (!plan) return { state, plan: null }
  let next = state
  for (const variantKey of plan.keys) {
    for (const write of plan.writes) {
      next = quickEditReducer(next, {
        type: 'SET_TARGET',
        variantKey,
        field: write.field,
        value: write.value,
        scope: 'day',
      })
    }
  }
  return { state: next, plan }
}

/** El «Deshacer» del host: SOLO las variantes del snapshot (C4), los cuatro campos, `scope: 'day'`. */
function applyUndo(state: QuickEditState, plan: QeSwitchOffPlan): QuickEditState {
  let next = state
  for (const entry of plan.snapshot) {
    for (const field of QE_TARGET_FIELDS) {
      next = quickEditReducer(next, {
        type: 'SET_TARGET',
        variantKey: entry.variantKey,
        field,
        value: entry.targets[field],
        scope: 'day',
      })
    }
  }
  return next
}

describe('apagar «Solo el {día}» en RN — caso Pame (base vacío)', () => {
  // El plan de Pame tal cual llegó: base sin meta, lunes heredando (vacío) y el martes con las
  // 2.040 kcal que ella escribió parada ahí.
  const pame = stateOf([
    variant('default', 'Todos los días', null, true),
    variant('mon', 'Lunes', 1, false),
    variant('tue', 'Martes', 2, false, { calories: '2040', proteinG: '144' }),
  ])

  it('propaga la meta del martes al base y a los días que heredaban', () => {
    const { state, plan } = applySwitchOff(pame, 'tue')
    expect(plan?.mode).toBe('applied_to_all')
    // Base = Lunes = Martes = 2.040: nadie queda sin objetivo, que era el bug del caso.
    expect(kcalOf(state)).toEqual(['2040', '2040', '2040'])
    expect(state.variants.map((v) => v.targets.proteinG)).toEqual(['144', '144', '144'])
  })

  it('«Deshacer» devuelve el plan tal cual estaba, sin borrarle la meta al martes', () => {
    const { state, plan } = applySwitchOff(pame, 'tue')
    expect(plan).not.toBeNull()
    const back = applyUndo(state, plan as QeSwitchOffPlan)
    expect(kcalOf(back)).toEqual(['', '', '2040'])
    expect(back.variants.map((v) => v.targets.proteinG)).toEqual(['', '', '144'])
  })

  it('no arrastra al día con meta propia distinta', () => {
    const conMiercoles = stateOf([...pame.variants, variant('wed', 'Miércoles', 3, false, { calories: '1600' })])
    const { state } = applySwitchOff(conMiercoles, 'tue')
    expect(kcalOf(state)).toEqual(['2040', '2040', '2040', '1600'])
  })
})

describe('apagar «Solo el {día}» en RN — el base SÍ tiene meta', () => {
  it('el día vuelve a ESPEJAR el base, campos vacíos incluidos, y solo él', () => {
    const before = stateOf([
      variant('default', 'Todos los días', null, true, { calories: '1800' }),
      variant('mon', 'Lunes', 1, false, { calories: '1800' }),
      variant('tue', 'Martes', 2, false, { calories: '2040', proteinG: '144' }),
    ])
    const { state, plan } = applySwitchOff(before, 'tue')
    expect(plan?.mode).toBe('back_to_base')
    expect(plan?.keys).toEqual(['tue'])
    expect(kcalOf(state)).toEqual(['1800', '1800', '1800'])
    // La proteína del martes se va: el día vuelve a la meta de todos los días, que no la tiene.
    expect(state.variants[2].targets.proteinG).toBe('')
    // Y el base y el lunes quedan intactos (misma identidad: los memos de la UI no se rompen).
    expect(state.variants[0]).toBe(before.variants[0])
    expect(state.variants[1]).toBe(before.variants[1])
  })

  it('un día que ya muestra la meta del base no mueve nada ni anuncia nada', () => {
    const before = stateOf([
      variant('default', 'Todos los días', null, true, { calories: '1800' }),
      variant('tue', 'Martes', 2, false, { calories: ' 1800 ' }),
    ])
    const { state, plan } = applySwitchOff(before, 'tue')
    expect(plan).toBeNull()
    expect(state).toBe(before)
  })
})
