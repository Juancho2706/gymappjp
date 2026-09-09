import { useCallback, useReducer, type Context } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  EDITOR_TARGETS_COPY,
  quickEditReducer,
  type QeExchangeGroup,
  type QeTargetsText,
  type QeVariant,
  type QuickEditAction,
  type QuickEditState,
} from '@eva/nutrition-v2'

/**
 * W4.3 — SWITCH «Solo el {día}» de la card de metas (caso Pame Cid, 2026-09-08).
 *
 * Lo que fija este archivo es la decisión D2 del jefe: **apagar el switch nunca borra una meta**.
 * Hay dos caminos y ninguno escribe un vacío encima del día:
 *
 *  - base CON metas ⇒ el día vuelve a la del base (`scope: 'day'`, toast «… vuelve a la meta de
 *    todos los días»);
 *  - base SIN metas —el plan de Pame: base vacío y 2.040 kcal escritas solo en Martes— ⇒ lo del
 *    día se PROPAGA a toda la semana (`scope: 'all'`, toast «Ahora vale para toda la semana»).
 *
 * Los dos con «Deshacer», y ese «Deshacer» tiene que devolver los OTROS días también: propagar
 * toca el base y a los que heredaban, así que restaurar solo el día activo dejaría media semana
 * con una meta que el coach acaba de rechazar.
 *
 * El estado se verifica con el reducer de VERDAD (`quickEditReducer` sobre los dispatches
 * capturados): un test que solo mirara la forma del dispatch habría dado verde con el bug del
 * checkpoint, que era un dispatch impecable con el valor equivocado.
 */

/** Lo único del contexto del editor que esta card consume. */
type TargetsCardContext = {
  state: QuickEditState
  dispatch: (action: QuickEditAction) => void
  errors: Record<string, string>
  showErrors: boolean
  isPending: boolean
  exchangeGroups: QeExchangeGroup[]
}

const harness = vi.hoisted(() => ({
  /** Lo rellena el mock del provider (fuera de todo componente) con su propio `createContext`. */
  context: { current: null as unknown },
  dispatchMock: vi.fn(),
  toastMock: vi.fn(),
  captureMock: vi.fn(),
}))
const { dispatchMock, toastMock, captureMock } = harness

// El provider real monta el borrador entero (fetch, autosave, transiciones). Acá se reemplaza por
// un contexto pelado con el mismo shape mínimo y el reducer de producción detrás.
vi.mock('./QuickEditProvider', async () => {
  const { createContext, useContext } = await import('react')
  const TestContext = createContext<unknown>(null)
  harness.context.current = TestContext
  return { useQuickEdit: () => useContext(TestContext) }
})
vi.mock('sonner', () => ({ toast: harness.toastMock }))
vi.mock('@/lib/posthog/events', () => ({ useCaptureNutritionTargetsScope: () => harness.captureMock }))

import { TargetsEditorCard } from './TargetsEditorCard'

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
    passthroughTargets: { fiberG: null, sodiumMg: null, waterMl: null },
    slots: [],
  }
}

/** Las cuatro metas que Pame escribió parada en Martes. */
const MARTES = { calories: '2040', proteinG: '144', carbsG: '247', fatsG: '52' }
/** Las del base en el otro camino de D2. */
const BASE_1800 = { calories: '1800', proteinG: '120', carbsG: '200', fatsG: '60' }

function stateOf(variants: QeVariant[]): QuickEditState {
  return { variants, visibleNotes: '' }
}

/** Plan de Pame: base VACÍO, Lunes heredando y Martes con sus 2.040 kcal propias. */
function pameState(): QuickEditState {
  return stateOf([
    variant('default', 'Todos los días', null, true),
    variant('mon', 'Lunes', 1, false),
    variant('tue', 'Martes', 2, false, MARTES),
    // Miércoles tiene meta PROPIA y de UN solo campo: apenas el base recibe las 2.040 kcal queda
    // idéntico a él, que es el agujero por el que se colaba el pisado (ver el test de arriba).
    variant('wed', 'Miércoles', 3, false, { calories: '2040' }),
  ])
}

/** Mismo plan pero con el base ya con metas. */
function baseWithTargetsState(): QuickEditState {
  return stateOf([
    variant('default', 'Todos los días', null, true, BASE_1800),
    variant('mon', 'Lunes', 1, false),
    variant('tue', 'Martes', 2, false, MARTES),
  ])
}

function Harness({ initial, variantKey }: { initial: QuickEditState; variantKey: string }) {
  const [state, rawDispatch] = useReducer(quickEditReducer, initial)
  const dispatch = useCallback((action: QuickEditAction) => {
    dispatchMock(action)
    rawDispatch(action)
  }, [])
  const context: TargetsCardContext = {
    state,
    dispatch,
    errors: {},
    showErrors: false,
    isPending: false,
    exchangeGroups: [],
  }
  const active = state.variants.find((day) => day.key === variantKey)
  const TestContext = harness.context.current as Context<unknown>
  return (
    <TestContext.Provider value={context}>
      {active ? <TargetsEditorCard variant={active} chrome="bare" /> : null}
    </TestContext.Provider>
  )
}

/**
 * Estado al que llegó el harness: el MISMO reducer sobre los MISMOS dispatches, en orden. Se
 * reconstruye en vez de espiarse para no escribirle a una variable de módulo desde el render
 * (`react-hooks/immutability`), y de paso deja a la vista que nada más toca el estado.
 */
function finalState(initial: QuickEditState): QuickEditState {
  return dispatchMock.mock.calls.reduce<QuickEditState>(
    (acc, [action]) => quickEditReducer(acc, action as QuickEditAction),
    initial,
  )
}

function targetsOf(state: QuickEditState, key: string): QeTargetsText {
  const found = state.variants.find((day) => day.key === key)
  if (!found) throw new Error(`variante ${key} inexistente`)
  return found.targets
}

/** Las `SET_TARGET` que salieron de la card, ya filtradas del resto de acciones. */
function setTargetCalls(): Array<Extract<QuickEditAction, { type: 'SET_TARGET' }>> {
  return dispatchMock.mock.calls
    .map(([action]) => action as QuickEditAction)
    .filter((action): action is Extract<QuickEditAction, { type: 'SET_TARGET' }> => action.type === 'SET_TARGET')
}

/** El `onClick` de «Deshacer» del último toast. */
function undoFromToast(): () => void {
  const last = toastMock.mock.calls.at(-1)
  if (!last) throw new Error('no se disparó ningún toast')
  const [, options] = last as [string, { action?: { label: string; onClick: () => void } }]
  if (!options.action) throw new Error('el toast salió sin acción «Deshacer»')
  expect(options.action.label).toBe(EDITOR_TARGETS_COPY.targets.undo)
  return options.action.onClick
}

beforeEach(() => {
  dispatchMock.mockClear()
  toastMock.mockClear()
  captureMock.mockClear()
})

describe('switch «Solo el {día}» — apagarlo con el base VACÍO (caso Pame)', () => {
  it("propaga las metas del día a toda la semana con scope 'all' y NUNCA escribe vacíos", () => {
    render(<Harness initial={pameState()} variantKey="tue" />)

    // El día tiene metas propias y el base no: el default por ESTADO deja el switch ENCENDIDO.
    const toggle = screen.getByRole('switch', { name: /Solo el martes/ })
    expect(toggle).toHaveAttribute('aria-checked', 'true')

    fireEvent.click(toggle)

    // Los días destino se resuelven UNA vez contra el estado previo y se escriben con
    // `scope: 'day'` (paridad exacta con RN): el día, el base y el que heredaba ⇒ 3 × 4.
    const calls = setTargetCalls()
    expect(calls).toHaveLength(12)
    expect(calls[0]).toEqual({
      type: 'SET_TARGET',
      variantKey: 'tue',
      field: 'calories',
      value: '2040',
      scope: 'day',
    })
    expect([...new Set(calls.map((call) => call.variantKey))]).toEqual(['tue', 'default', 'mon'])
    // Ni un solo vacío: ese era el bug (se copiaban los strings del base encima del día).
    expect(calls.every((call) => call.scope === 'day' && call.value !== '')).toBe(true)

    // Y el estado termina con la semana entera en 2.040: el base y el día que heredaba.
    const state = finalState(pameState())
    expect(targetsOf(state, 'tue')).toEqual(targets(MARTES))
    expect(targetsOf(state, 'default')).toEqual(targets(MARTES))
    expect(targetsOf(state, 'mon')).toEqual(targets(MARTES))
    // Y el día con meta PROPIA queda intacto: con `scope: 'all'` campo a campo, tras el write de
    // `calories` el base quedaba idéntico a Miércoles y P/C/G le caían encima (SPEC §7.5).
    expect(targetsOf(state, 'wed')).toEqual(targets({ calories: '2040' }))

    expect(toggle).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByText(EDITOR_TARGETS_COPY.targets.onlyThisDayOff)).toBeInTheDocument()
    expect(toastMock).toHaveBeenCalledTimes(1)
    expect(toastMock.mock.calls[0]?.[0]).toBe(EDITOR_TARGETS_COPY.targets.appliedToAll)
    expect(toastMock.mock.calls[0]?.[0]).toBe('Ahora vale para toda la semana')
    expect(captureMock).toHaveBeenCalledWith('all', 'switch')
  })

  it('«Deshacer» devuelve el base y los días que heredaban a vacío, y el día se queda con la suya', () => {
    render(<Harness initial={pameState()} variantKey="tue" />)
    fireEvent.click(screen.getByRole('switch', { name: /Solo el martes/ }))

    // Fuera de un handler de React: `act` deja que se apliquen los dispatches de la restauración.
    act(() => undoFromToast()())

    const state = finalState(pameState())
    expect(targetsOf(state, 'default')).toEqual(targets())
    expect(targetsOf(state, 'mon')).toEqual(targets())
    expect(targetsOf(state, 'tue')).toEqual(targets(MARTES))
    // El switch vuelve a ENCENDIDO: deshacer es deshacer todo, también el control.
    expect(screen.getByRole('switch', { name: /Solo el martes/ })).toHaveAttribute('aria-checked', 'true')
    // Y el embudo se entera del retroceso (D5, mismo criterio que RN): si el «Deshacer» no
    // reportara, quedaría un 'all' que el coach canceló y ningún 'day' de vuelta.
    expect(captureMock).toHaveBeenLastCalledWith('day', 'switch')
  })

  it('con el base a medio llenar propaga solo lo que el día tiene y NO le vacía la proteína al base', () => {
    // El caso que `applyBaseTargets` (D4) ya contemplaba: un día sin kcal pero con la proteína
    // escrita. Propagar los cuatro campos mandaría un '' al base con `scope: 'all'` y la semana
    // entera se quedaría sin proteína — exactamente el borrado que D2 prohíbe.
    const initial = stateOf([
      variant('default', 'Todos los días', null, true, { proteinG: '120' }),
      variant('tue', 'Martes', 2, false, { calories: '2040' }),
    ])
    render(<Harness initial={initial} variantKey="tue" />)

    fireEvent.click(screen.getByRole('switch', { name: /Solo el martes/ }))

    // Una sola escritura (solo kcal) sobre dos días: el activo y el base.
    const calls = setTargetCalls()
    expect(calls).toHaveLength(2)
    expect(calls[0]).toEqual({
      type: 'SET_TARGET',
      variantKey: 'tue',
      field: 'calories',
      value: '2040',
      scope: 'day',
    })
    expect(calls[1]?.variantKey).toBe('default')

    const state = finalState(initial)
    expect(targetsOf(state, 'default')).toEqual(targets({ calories: '2040', proteinG: '120' }))
    expect(targetsOf(state, 'tue')).toEqual(targets({ calories: '2040' }))
  })
})

describe('switch «Solo el {día}» — mover el switch sin metas que mover', () => {
  it('ENCENDERLO solo reporta el alcance: ni una escritura ni un toast', () => {
    // Lunes hereda del base (los dos vacíos) ⇒ el default por estado lo deja APAGADO.
    render(<Harness initial={pameState()} variantKey="mon" />)
    const toggle = screen.getByRole('switch', { name: /Solo el lunes/ })
    expect(toggle).toHaveAttribute('aria-checked', 'false')

    fireEvent.click(toggle)

    expect(toggle).toHaveAttribute('aria-checked', 'true')
    expect(setTargetCalls()).toHaveLength(0)
    expect(toastMock).not.toHaveBeenCalled()
    expect(captureMock.mock.calls).toEqual([['day', 'switch']])
  })

  it('APAGARLO con el día ya igual al base es un noop: sin toast y sin dispatches', () => {
    const initial = stateOf([
      variant('default', 'Todos los días', null, true, BASE_1800),
      variant('wed', 'Miércoles', 3, false, BASE_1800),
    ])
    render(<Harness initial={initial} variantKey="wed" />)
    const toggle = screen.getByRole('switch', { name: /Solo el miércoles/ })

    // Encenderlo a mano (nace apagado porque el día ya usa la meta del base) y volver a apagarlo:
    // no hay ninguna meta que mover, así que nada de un toast «Deshacer» que no deshace nada.
    fireEvent.click(toggle)
    fireEvent.click(toggle)

    expect(toggle).toHaveAttribute('aria-checked', 'false')
    expect(setTargetCalls()).toHaveLength(0)
    expect(toastMock).not.toHaveBeenCalled()
    expect(captureMock.mock.calls).toEqual([
      ['day', 'switch'],
      ['all', 'switch'],
    ])
  })
})

describe('switch «Solo el {día}» — apagarlo con el base CON metas', () => {
  it("copia la meta del base sobre el día con scope 'day' y avisa que vuelve a la de todos los días", () => {
    render(<Harness initial={baseWithTargetsState()} variantKey="tue" />)

    fireEvent.click(screen.getByRole('switch', { name: /Solo el martes/ }))

    const calls = setTargetCalls()
    expect(calls).toHaveLength(4)
    expect(calls[0]).toEqual({
      type: 'SET_TARGET',
      variantKey: 'tue',
      field: 'calories',
      value: '1800',
      scope: 'day',
    })
    expect(calls.every((call) => call.scope === 'day')).toBe(true)

    // El día toma la del base; el base y el resto de la semana quedan como estaban.
    const state = finalState(baseWithTargetsState())
    expect(targetsOf(state, 'tue')).toEqual(targets(BASE_1800))
    expect(targetsOf(state, 'default')).toEqual(targets(BASE_1800))
    expect(targetsOf(state, 'mon')).toEqual(targets())

    expect(toastMock.mock.calls[0]?.[0]).toBe(EDITOR_TARGETS_COPY.targets.backToBase('martes'))
    expect(toastMock.mock.calls[0]?.[0]).toBe('Martes vuelve a la meta de todos los días')
    expect(captureMock).toHaveBeenCalledWith('all', 'switch')
  })

  it('«Deshacer» restaura las 2.040 kcal del día', () => {
    render(<Harness initial={baseWithTargetsState()} variantKey="tue" />)
    fireEvent.click(screen.getByRole('switch', { name: /Solo el martes/ }))

    act(() => undoFromToast()())

    const state = finalState(baseWithTargetsState())
    expect(targetsOf(state, 'tue')).toEqual(targets(MARTES))
    expect(targetsOf(state, 'default')).toEqual(targets(BASE_1800))
    expect(captureMock).toHaveBeenLastCalledWith('day', 'switch')
  })
})

describe('switch «Solo el {día}» — dónde NO aparece', () => {
  it('parado en el base no hay switch (escribir la base ya es escribir todos los días)', () => {
    render(<Harness initial={pameState()} variantKey="default" />)

    expect(screen.queryByRole('switch')).toBeNull()
  })

  it('en un plan de un solo día tampoco (no hay «los demás días» que separar)', () => {
    render(<Harness initial={stateOf([variant('default', 'Todos los días', null, true)])} variantKey="default" />)

    expect(screen.queryByRole('switch')).toBeNull()
  })
})
