import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { QePortionGroup, QePortionTarget, QeSlot } from '@eva/nutrition-v2'
import { EditablePortionsCard } from './EditablePortionsCard'

/**
 * RTL de la sección «Porciones a elección» del quick-edit web tras el tren «Porciones a la
 * chilena» (W2.7/W2.8): picker partido en tres secciones, fila ya usada VIVA (D2-A: tocarla suma
 * media porción en vez de estar deshabilitada), etiqueta «1 porción» que expande los compuestos y
 * carcasa del banner del plan legado.
 *
 * Archivo NUEVO a propósito: los 87 tests del reducer web (`quick-edit-state.test.ts` 58 +
 * `.meta` 22 + `publish-guards` 7) siguen verdes SIN editarse — es la invariante de conteo del
 * tren. Acá se prueba el COMPONENTE, no el reducer: `dispatch` es un doble y lo que se verifica
 * es la acción que sale, no el estado que entra.
 *
 * El provider se mockea entero (montar el real pide read model, server actions y router): el
 * contrato que consume la card son las llaves de `useQuickEdit` que se arman en `setContext`.
 */

const ctx = vi.hoisted(() => ({ value: {} as Record<string, unknown> }))
const toastMock = vi.hoisted(() => vi.fn())
const captureMock = vi.hoisted(() => vi.fn())

vi.mock('./QuickEditProvider', () => ({
  useQuickEdit: () => ctx.value,
  genQuickEditKey: () => 'key-nueva',
}))
vi.mock('sonner', () => ({ toast: toastMock }))
vi.mock('@/lib/posthog/events', () => ({
  useCaptureNutritionPortionGroupBumped: () => captureMock,
}))

const BANNER_TITLE = 'Este plan usa las porciones anteriores (SMAE)'
const CHILE = 'Sistema chileno · INTA 1999 · UDD 2019'
// Cabecera de la sección legado (`PORTIONS_COPY.builder.setLegacy()` sin conteo). NO es el chip
// `legacyBadge` de la fila, que sí es «Legado (SMAE)» a secas.
const LEGADO = 'Legado (SMAE) · Toca para ver'

function group(overrides: Partial<QePortionGroup> & Pick<QePortionGroup, 'exchangeGroupId'>): QePortionGroup {
  return {
    groupCode: 'PCT',
    groupName: 'Panes, cereales y tubérculos',
    color: null,
    ref: { calories: 140, proteinG: 3, carbsG: 30, fatsG: 1 },
    composedOf: null,
    macrosConfirmed: true,
    portionSystem: 'cl',
    ...overrides,
  }
}

function target(overrides: Partial<QePortionTarget> & Pick<QePortionTarget, 'exchangeGroupId'>): QePortionTarget {
  return {
    key: 't1',
    id: null,
    groupCode: 'PCT',
    groupName: 'Panes, cereales y tubérculos',
    color: null,
    macrosConfirmed: true,
    portions: '1,5',
    notes: null,
    ...overrides,
  }
}

function slotWith(portionTargets: QePortionTarget[]): QeSlot {
  return {
    key: 's1',
    id: null,
    code: 'desayuno',
    name: 'Desayuno',
    startTime: '',
    endTime: null,
    mode: 'anchor',
    required: false,
    instructions: null,
    targets: {},
    items: [],
    portionTargets,
  }
}

function setContext(overrides: Record<string, unknown> = {}) {
  const dispatch = vi.fn()
  ctx.value = {
    dispatch,
    errors: {},
    showErrors: false,
    isPending: false,
    portionFoodCounts: null,
    portionGroups: [],
    portionGroupChoices: [],
    portionCatalogMeta: null,
    portionSystem: 'cl',
    portionLegacySystems: [],
    portionSystemsDegraded: false,
    ...overrides,
  }
  return dispatch
}

/** Abre el picker «Agregar grupo» (bottom sheet: el `matchMedia` del setup devuelve `false`). */
function openPicker() {
  fireEvent.click(screen.getByTestId('qe-add-portion-group'))
}

/** Todo lo del picker se busca DENTRO del sheet: los nombres de grupo también viven en la card. */
function picker() {
  return within(screen.getByRole('dialog'))
}

/** Fila del picker por nombre de grupo (el botón envuelve nombre + subtítulo + apoyo). */
function pickerRow(name: string): HTMLButtonElement {
  const button = picker().getByText(name).closest<HTMLButtonElement>('button')
  if (!button) throw new Error(`Fila del picker sin botón: ${name}`)
  return button
}

/** `portionCatalogMeta` del provider: `isSystem` y `sort_order` REALES del catálogo vivo. */
function meta(entries: Array<[string, { isSystem: boolean; sortOrder: number }]>) {
  return new Map(entries)
}

/**
 * Códigos de las filas del picker en orden de documento: el primer `<span>` de cada fila es el
 * circulito de identidad, que pinta `groupCode.slice(0, 3)`.
 */
function pickerRowCodes(): string[] {
  return picker()
    .getAllByRole('listitem')
    .map((node) => node.querySelector('span')?.textContent ?? '')
}

/** Etiquetas de las secciones del picker, en orden de documento. */
function pickerSections(): string[] {
  return picker()
    .getAllByRole('region')
    .map((node) => node.getAttribute('aria-label') ?? '')
}

beforeEach(() => {
  toastMock.mockClear()
  captureMock.mockClear()
})

afterEach(() => {
  cleanup()
})

describe('EditablePortionsCard — fila ya usada (D2-A)', () => {
  it('no está deshabilitada y su subtítulo dice la cantidad y qué va a pasar', () => {
    const pct = group({ exchangeGroupId: 'g-pct' })
    setContext({ portionGroups: [pct], portionGroupChoices: [pct] })

    render(<EditablePortionsCard variantKey="v1" slot={slotWith([target({ exchangeGroupId: 'g-pct' })])} />)
    openPicker()

    const row = pickerRow('Panes, cereales y tubérculos')
    expect(row).not.toBeDisabled()
    // La fila viva no puede llevar un `opacity-50` INCONDICIONAL (así se veía «desactivada»
    // antes de D2-A). Se compara clase por clase a propósito: `disabled:opacity-50` sí está y es
    // legítimo —solo pinta en el tope 99—, así que un `toContain('opacity-50')` daría un falso
    // positivo y un `not.toContain('opacity-50')` fallaría siempre.
    expect(row.className.split(/\s+/).filter((cls) => cls === 'opacity-50')).toEqual([])
    expect(row).toHaveTextContent('Ya está en Desayuno con 1,5 · Clic para sumar ½')
  })

  it('en el tope 99 es el ÚNICO caso que sigue deshabilitado, con el copy del máximo', () => {
    const pct = group({ exchangeGroupId: 'g-pct' })
    setContext({ portionGroups: [pct], portionGroupChoices: [pct] })

    render(
      <EditablePortionsCard
        variantKey="v1"
        slot={slotWith([target({ exchangeGroupId: 'g-pct', portions: '99' })])}
      />,
    )
    openPicker()

    const row = pickerRow('Panes, cereales y tubérculos')
    expect(row).toBeDisabled()
    expect(row).toHaveTextContent('Ya está en Desayuno con 99 · es el máximo')
  })
})

describe('EditablePortionsCard — bump al elegir un grupo presente', () => {
  it('despacha BUMP_PORTION_TARGET por exchangeGroupId, cierra el sheet y abre el toast con id estable', () => {
    const pct = group({ exchangeGroupId: 'g-pct' })
    const dispatch = setContext({ portionGroups: [pct], portionGroupChoices: [pct] })

    render(<EditablePortionsCard variantKey="v1" slot={slotWith([target({ exchangeGroupId: 'g-pct' })])} />)
    openPicker()
    fireEvent.click(pickerRow('Panes, cereales y tubérculos'))

    expect(dispatch).toHaveBeenCalledWith({
      type: 'BUMP_PORTION_TARGET',
      variantKey: 'v1',
      slotKey: 's1',
      exchangeGroupId: 'g-pct',
    })
    // Nada de ADD sobre un grupo presente: el guard de unicidad sigue siendo el cinturón.
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'ADD_PORTION_TARGET' }))
    expect(screen.queryByRole('dialog')).toBeNull()

    const [message, options] = toastMock.mock.calls[0] as [string, { id: string; action: { label: string } }]
    expect(message).toBe('Panes, cereales y tubérculos: ahora 2 porciones en Desayuno')
    expect(options.id).toBe('portion-bump:s1:g-pct')
    expect(options.action.label).toBe('Deshacer')
    // Analytics sin kcal, gramos, nombres ni ids: solo metadatos de la interacción.
    expect(captureMock).toHaveBeenCalledWith({
      groupCode: 'PCT',
      portionSystem: 'cl',
      from: 'picker',
      undone: false,
    })
  })

  it('«Deshacer» restaura el valor PREVIO capturado, no −0,5', () => {
    const pct = group({ exchangeGroupId: 'g-pct' })
    const dispatch = setContext({ portionGroups: [pct], portionGroupChoices: [pct] })

    render(
      <EditablePortionsCard
        variantKey="v1"
        slot={slotWith([target({ exchangeGroupId: 'g-pct', portions: '1,5' })])}
      />,
    )
    openPicker()
    fireEvent.click(pickerRow('Panes, cereales y tubérculos'))

    const [, options] = toastMock.mock.calls[0] as [string, { action: { onClick: () => void } }]
    options.action.onClick()
    expect(dispatch).toHaveBeenCalledWith({
      type: 'SET_PORTION_TARGET',
      variantKey: 'v1',
      slotKey: 's1',
      targetKey: 't1',
      value: '1,5',
    })
  })

  it('un grupo que NO está en la franja sigue dando de alta con ADD_PORTION_TARGET', () => {
    const pct = group({ exchangeGroupId: 'g-pct' })
    const fr = group({ exchangeGroupId: 'g-fr', groupCode: 'FR', groupName: 'Frutas' })
    const dispatch = setContext({ portionGroups: [pct], portionGroupChoices: [pct, fr] })

    render(<EditablePortionsCard variantKey="v1" slot={slotWith([target({ exchangeGroupId: 'g-pct' })])} />)
    openPicker()
    fireEvent.click(pickerRow('Frutas'))

    expect(dispatch).toHaveBeenCalledWith({
      type: 'ADD_PORTION_TARGET',
      variantKey: 'v1',
      slotKey: 's1',
      key: 'key-nueva',
      group: expect.objectContaining({ exchangeGroupId: 'g-fr' }),
    })
    expect(toastMock).not.toHaveBeenCalled()
  })
})

describe('EditablePortionsCard — stepper de la fila', () => {
  it('con «1,3» el StepperField queda marcado como inválido', () => {
    const pct = group({ exchangeGroupId: 'g-pct' })
    setContext({
      portionGroups: [pct],
      portionGroupChoices: [pct],
      showErrors: true,
      errors: { 'portion.t1.portions': 'Usa medias porciones (0,5).' },
    })

    render(
      <EditablePortionsCard
        variantKey="v1"
        slot={slotWith([target({ exchangeGroupId: 'g-pct', portions: '1,3' })])}
      />,
    )

    const value = screen.getByRole('button', { name: 'Editar Porciones de Panes, cereales y tubérculos' })
    expect(value.className).toContain('border-rose-400')
    expect(screen.getByText('Usa medias porciones (0,5).')).toBeInTheDocument()
  })
})

describe('EditablePortionsCard — secciones del picker', () => {
  const chileno = group({ exchangeGroupId: 'g-pct', portionSystem: 'cl' })
  const propio = group({
    exchangeGroupId: 'g-mio',
    groupCode: 'MIO',
    groupName: 'Mi grupo',
    portionSystem: undefined,
  })
  const legado = group({
    exchangeGroupId: 'g-c',
    groupCode: 'C',
    groupName: 'Cereales (SMAE)',
    portionSystem: 'smae',
    macrosConfirmed: false,
  })

  it('dibuja Sistema chileno → Propios → Legado (SMAE) y el orden de entrada del merge no las altera', () => {
    setContext({
      portionGroups: [chileno],
      portionGroupChoices: [legado, propio, chileno],
      portionLegacySystems: ['smae'],
    })
    render(<EditablePortionsCard variantKey="v1" slot={slotWith([])} />)
    openPicker()
    expect(pickerSections()).toEqual([CHILE, 'Propios', LEGADO])

    cleanup()

    setContext({
      portionGroups: [chileno],
      portionGroupChoices: [propio, chileno, legado],
      portionLegacySystems: ['smae'],
    })
    render(<EditablePortionsCard variantKey="v1" slot={slotWith([])} />)
    openPicker()
    expect(pickerSections()).toEqual([CHILE, 'Propios', LEGADO])
  })

  it('la sección legado nace colapsada, con aria-expanded, y no existe si el coach no usa el set viejo', () => {
    setContext({
      portionGroups: [chileno],
      portionGroupChoices: [chileno, propio, legado],
      portionLegacySystems: ['smae'],
    })
    render(<EditablePortionsCard variantKey="v1" slot={slotWith([])} />)
    openPicker()

    const header = picker().getByRole('button', { name: LEGADO })
    expect(header).toHaveAttribute('aria-expanded', 'false')
    expect(picker().queryByText('Cereales (SMAE)')).toBeNull()

    fireEvent.click(header)
    expect(header).toHaveAttribute('aria-expanded', 'true')
    // La fila legado lleva el chip «Legado (SMAE)» EN VEZ de «Valores referenciales».
    const row = pickerRow('Cereales (SMAE)')
    expect(row).toHaveTextContent('Legado (SMAE)')
    expect(row).not.toHaveTextContent('Valores referenciales')

    cleanup()

    setContext({ portionGroups: [chileno], portionGroupChoices: [chileno, propio], portionLegacySystems: [] })
    render(<EditablePortionsCard variantKey="v1" slot={slotWith([])} />)
    openPicker()
    expect(pickerSections()).toEqual([CHILE, 'Propios'])
  })

  it('la etiqueta «1 porción» expande los compuestos (Legumbres deja de decir 0 kcal)', () => {
    const proteina = group({
      exchangeGroupId: 'g-p',
      groupCode: 'P',
      groupName: 'Proteínas',
      ref: { calories: 75, proteinG: 7, carbsG: 0, fatsG: 5 },
      portionSystem: 'smae',
    })
    const cereal = group({
      exchangeGroupId: 'g-c2',
      groupCode: 'C',
      groupName: 'Cereales',
      ref: { calories: 70, proteinG: 2, carbsG: 15, fatsG: 0 },
      portionSystem: 'smae',
    })
    const legumbres = group({
      exchangeGroupId: 'g-leg',
      groupCode: 'LEG',
      groupName: 'Legumbres',
      ref: { calories: 0, proteinG: 0, carbsG: 0, fatsG: 0 },
      composedOf: [
        { code: 'P', portions: 1, ref: { calories: 75, proteinG: 7, carbsG: 0, fatsG: 5 } },
        { code: 'C', portions: 1, ref: { calories: 70, proteinG: 2, carbsG: 15, fatsG: 0 } },
      ],
      macrosConfirmed: false,
      portionSystem: 'smae',
    })
    setContext({
      portionGroups: [legumbres],
      portionGroupChoices: [legumbres, proteina, cereal],
      portionSystem: 'smae',
    })

    render(<EditablePortionsCard variantKey="v1" slot={slotWith([])} />)
    openPicker()

    const row = pickerRow('Legumbres')
    expect(row).toHaveTextContent('1 porción ≈ 145 kcal · 15 C · 9 P · 5 G')
    expect(row).not.toHaveTextContent('1 porción ≈ 0 kcal')
  })
})

describe('EditablePortionsCard — carcasa del banner del plan legado (W3 lo cablea)', () => {
  it('sin onConvertClick el banner NO se monta', () => {
    const pct = group({ exchangeGroupId: 'g-pct' })
    setContext({ portionGroups: [pct], portionGroupChoices: [pct] })

    render(<EditablePortionsCard variantKey="v1" slot={slotWith([])} />)

    expect(screen.queryByText(BANNER_TITLE)).toBeNull()
  })

  it('con onConvertClick se monta y «Ver conversión» llama al handler', () => {
    const pct = group({ exchangeGroupId: 'g-pct' })
    setContext({ portionGroups: [pct], portionGroupChoices: [pct] })
    const onConvertClick = vi.fn()

    render(<EditablePortionsCard variantKey="v1" slot={slotWith([])} onConvertClick={onConvertClick} />)

    expect(screen.getByText(BANNER_TITLE)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Ver conversión' }))
    expect(onConvertClick).toHaveBeenCalledTimes(1)
  })
})

describe('EditablePortionsCard — `isSystem` y orden vienen del catálogo, no del código', () => {
  it('un grupo PROPIO con un código del set chileno («FR») no se toma por del sistema ni se pierde', () => {
    // Coach 'smae' SIN legado chileno vivo: si «FR» se infiriera del sistema, la regla de
    // visibilidad lo sacaría del picker y el coach perdería su propio grupo.
    const cereales = group({
      exchangeGroupId: 'g-c',
      groupCode: 'C',
      groupName: 'Cereales',
      portionSystem: 'smae',
    })
    const mio = group({
      exchangeGroupId: 'g-mio',
      groupCode: 'FR',
      groupName: 'Mi mezcla',
      portionSystem: undefined,
    })
    setContext({
      portionGroups: [cereales],
      portionGroupChoices: [cereales, mio],
      portionSystem: 'smae',
      portionLegacySystems: [],
      portionCatalogMeta: meta([
        ['g-c', { isSystem: true, sortOrder: 10 }],
        ['g-mio', { isSystem: false, sortOrder: 900 }],
      ]),
    })

    render(<EditablePortionsCard variantKey="v1" slot={slotWith([])} />)
    openPicker()

    const propios = picker().getByRole('region', { name: 'Propios' })
    expect(within(propios).getByText('Mi mezcla')).toBeInTheDocument()
  })

  it('dentro de la sección propia manda el `sort_order` del catálogo, no el orden del merge', () => {
    const azucares = group({
      exchangeGroupId: 'g-az',
      groupCode: 'AZ',
      groupName: 'Azúcares',
      portionSystem: 'cl',
    })
    const pct = group({ exchangeGroupId: 'g-pct', portionSystem: 'cl' })
    setContext({
      // El merge pone primero los del plan: sin el `sort_order` real, AZ quedaría antes que PCT.
      portionGroups: [azucares],
      portionGroupChoices: [azucares, pct],
      portionCatalogMeta: meta([
        ['g-az', { isSystem: true, sortOrder: 330 }],
        ['g-pct', { isSystem: true, sortOrder: 210 }],
      ]),
    })

    render(<EditablePortionsCard variantKey="v1" slot={slotWith([])} />)
    openPicker()

    expect(pickerRowCodes()).toEqual(['PCT', 'AZ'])
  })

  it('sin catálogo (modo degradado) el picker conserva el orden del merge', () => {
    const azucares = group({
      exchangeGroupId: 'g-az',
      groupCode: 'AZ',
      groupName: 'Azúcares',
      portionSystem: 'cl',
    })
    const pct = group({ exchangeGroupId: 'g-pct', portionSystem: 'cl' })
    setContext({ portionGroups: [azucares], portionGroupChoices: [azucares, pct], portionCatalogMeta: null })

    render(<EditablePortionsCard variantKey="v1" slot={slotWith([])} />)
    openPicker()

    expect(pickerRowCodes()).toEqual(['AZ', 'PCT'])
  })
})

describe('EditablePortionsCard — la sección propia no se anuncia como chilena si el coach es SMAE', () => {
  it('con `portion_system` SMAE no hay región «Sistema chileno»', () => {
    const cereales = group({
      exchangeGroupId: 'g-c',
      groupCode: 'C',
      groupName: 'Cereales',
      portionSystem: 'smae',
    })
    setContext({
      portionGroups: [cereales],
      portionGroupChoices: [cereales],
      portionSystem: 'smae',
      portionCatalogMeta: meta([['g-c', { isSystem: true, sortOrder: 10 }]]),
    })

    render(<EditablePortionsCard variantKey="v1" slot={slotWith([])} />)
    openPicker()

    expect(picker().queryByLabelText(CHILE)).toBeNull()
    expect(picker().queryByText(CHILE)).toBeNull()
    expect(pickerRow('Cereales')).toBeInTheDocument()
  })
})

describe('EditablePortionsCard — doble clic en la misma apertura', () => {
  it('solo despacha UN bump: el sheet tarda en desmontarse (PLAN §W2, riesgo (a))', () => {
    const pct = group({ exchangeGroupId: 'g-pct' })
    const dispatch = setContext({ portionGroups: [pct], portionGroupChoices: [pct] })

    render(<EditablePortionsCard variantKey="v1" slot={slotWith([target({ exchangeGroupId: 'g-pct' })])} />)
    openPicker()

    const row = pickerRow('Panes, cereales y tubérculos')
    fireEvent.click(row)
    fireEvent.click(row)

    const bumps = dispatch.mock.calls.filter(([action]) => action.type === 'BUMP_PORTION_TARGET')
    expect(bumps).toHaveLength(1)
    expect(toastMock).toHaveBeenCalledTimes(1)
    expect(captureMock).toHaveBeenCalledTimes(1)
  })

  it('reabrir el picker vuelve a habilitar la elección', () => {
    const pct = group({ exchangeGroupId: 'g-pct' })
    const dispatch = setContext({ portionGroups: [pct], portionGroupChoices: [pct] })

    render(<EditablePortionsCard variantKey="v1" slot={slotWith([target({ exchangeGroupId: 'g-pct' })])} />)
    openPicker()
    fireEvent.click(pickerRow('Panes, cereales y tubérculos'))
    openPicker()
    fireEvent.click(pickerRow('Panes, cereales y tubérculos'))

    const bumps = dispatch.mock.calls.filter(([action]) => action.type === 'BUMP_PORTION_TARGET')
    expect(bumps).toHaveLength(2)
  })
})
