import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { QePickerGroup, QePortionGroup, QePortionTarget, QeSlot, QeVariant } from '@eva/nutrition-v2'
import { PortionConversionBanner, PortionConversionDialog } from './PortionConversionDialog'

/**
 * RTL del preview de la conversión SMAE → chileno en web (W3.5) y del banner que lo abre (W3.6).
 *
 * Archivo NUEVO: los 87 tests congelados del reducer web (`quick-edit-state.test.ts` 58 + `.meta`
 * 22 + `publish-guards` 7) siguen sin tocarse — invariante de conteo del tren. Acá se prueba la
 * PANTALLA: que el diff que pinta sea el del motor, que el selector de lácteo lo recalcule, y —lo
 * más importante— que el botón primario despache al reducer y NADA más (T-05: la conversión toca
 * el borrador; publicar es un paso aparte por el camino de siempre).
 *
 * El provider se mockea entero, igual que en `EditablePortionsCard.test.tsx`: el contrato que
 * consume el diálogo son las llaves de `useQuickEdit` que arma `setContext`.
 */

const ctx = vi.hoisted(() => ({ value: {} as Record<string, unknown> }))
const captureMock = vi.hoisted(() => vi.fn())
const toastMock = vi.hoisted(() => vi.fn())

vi.mock('./QuickEditProvider', () => ({
  useQuickEdit: () => ctx.value,
  genQuickEditKey: () => 'key-nueva',
}))
vi.mock('sonner', () => ({ toast: toastMock }))
/**
 * Lo mockeado es el CLIENTE de PostHog, no `@/lib/posthog/events` (E4 del jefe, 09-09).
 *
 * Antes se mockeaban los dos hooks y el test solo veía los argumentos que el diálogo les pasaba:
 * la web podía capturar con dos números sueltos, sin `surface` y con otro shape que RN, y la
 * suite seguía verde. Mockeando `usePostHog` corre la cadena entera —diálogo → hook →
 * `conversionPreviewedPayload` del paquete → `capture`— y lo que se afirma es el payload REAL que
 * sale a PostHog.
 */
const posthogStub = vi.hoisted(() => ({ capture: captureMock }))
vi.mock('posthog-js/react', () => ({ usePostHog: () => posthogStub }))

const BANNER_TITLE = 'Este plan usa las porciones anteriores (SMAE)'

// ── Catálogo (mismos refs del seed V1 y de la tabla UDD que usa el motor) ─────

function group(
  groupCode: string,
  groupName: string,
  ref: readonly [number, number, number, number],
  portionSystem: 'smae' | 'cl' | undefined,
): QePickerGroup {
  const [calories, proteinG, carbsG, fatsG] = ref
  return {
    exchangeGroupId: `id-${groupCode}`,
    groupCode,
    groupName,
    color: null,
    ref: { calories, proteinG, carbsG, fatsG },
    composedOf: null,
    macrosConfirmed: true,
    // Todo el catálogo del fixture es del SISTEMA: `draftUsesLegacySmae` falla cerrado
    // (`isSystem === true`, decisión (af)), así que sin este metadato el banner nunca se
    // pintaría. Los grupos propios del fixture se arman con `picker(source, false)`.
    isSystem: true,
    ...(portionSystem ? { portionSystem } : {}),
  }
}

const CATALOG: QePickerGroup[] = [
  group('C', 'Carbohidratos/Cereales', [70, 2, 15, 0], 'smae'),
  group('LAC', 'Lácteo', [95, 9, 12, 2], 'smae'),
  group('ARL', 'Alimento rico en lípidos', [45, 0, 0, 5], 'smae'),
  group('G', 'Grasa de cocina', [45, 0, 0, 5], 'smae'),
  group('LD', 'Lácteos descremados', [70, 7, 10, 0], 'cl'),
  group('LS', 'Lácteos semidescremados', [85, 5, 9, 3], 'cl'),
  group('LE', 'Lácteos enteros', [110, 5, 9, 6], 'cl'),
  group('PCT', 'Panes, cereales y tubérculos', [140, 3, 30, 1], 'cl'),
  group('AG', 'Aceites y grasas', [45, 0, 0, 5], 'cl'),
]

/** Grupos PROPIOS del coach (sin `portionSystem`: el catálogo no marca set a los custom). */
const PROPIO_SIN_MATCH = group('MIO', 'Proteinapro', [422, 40, 10, 12], undefined)
const PROPIO_QUE_CALZA = group('MIC', 'Carbohidratos 140/30', [140, 3, 30, 1], undefined)

function byCode(code: string): QePortionGroup {
  const found = CATALOG.find((candidate) => candidate.groupCode === code)
  if (!found) throw new Error(`fixture sin grupo ${code}`)
  return found
}

// ── Borrador ─────────────────────────────────────────────────────────────────

function target(code: string, portions: string): QePortionTarget {
  const source = byCode(code)
  return {
    key: `t-${code}`,
    id: `row-${code}`,
    exchangeGroupId: source.exchangeGroupId,
    groupCode: source.groupCode,
    groupName: source.groupName,
    color: source.color,
    macrosConfirmed: source.macrosConfirmed,
    portions,
    notes: null,
  }
}

/** Target de un grupo PROPIO o congelado: `target()` solo sabe de los 9 + 13 del fixture. */
function propioTarget(source: QePortionGroup, portions: string): QePortionTarget {
  return {
    key: `t-${source.groupCode}`,
    id: `row-${source.groupCode}`,
    exchangeGroupId: source.exchangeGroupId,
    groupCode: source.groupCode,
    groupName: source.groupName,
    color: source.color,
    macrosConfirmed: source.macrosConfirmed,
    portions,
    notes: null,
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

function variantWith(portionTargets: QePortionTarget[]): QeVariant {
  return {
    key: 'v1',
    id: null,
    variantKey: 'v1',
    label: 'Día base',
    dayOfWeek: null,
    isDefault: true,
    targets: {},
    passthroughTargets: { fiberG: null, sodiumMg: null, waterMl: null },
    slots: [slotWith(portionTargets)],
  }
}

function setContext(portionTargets: QePortionTarget[], overrides: Record<string, unknown> = {}) {
  const dispatch = vi.fn()
  const publishNow = vi.fn()
  const openConfirm = vi.fn()
  ctx.value = {
    state: { variants: [variantWith(portionTargets)] },
    dispatch,
    publishNow,
    openConfirm,
    planId: 'plan-1',
    portionGroupChoices: CATALOG,
    // `null` a propósito: el overlay del paquete no toca nada y los `portionSystem` del fixture
    // (que es lo que el catálogo vivo pegaría por id) mandan tal cual.
    portionCatalog: null,
    portionSystem: 'cl',
    portionLegacySystems: [],
    ...overrides,
  }
  return { dispatch, publishNow, openConfirm }
}

/** El contenido del diálogo (bottom sheet: el `matchMedia` del setup devuelve `false`). */
function dialog() {
  return within(screen.getByRole('dialog'))
}

/** Fila del preview por nombre del grupo destino. */
function row(destino: string): HTMLElement {
  const node = dialog().getByText(destino).closest('li')
  if (!node) throw new Error(`Fila sin <li>: ${destino}`)
  return node
}

/** Payloads capturados de un evento, en orden. */
function capturas(evento: string): Record<string, unknown>[] {
  return captureMock.mock.calls
    .filter((call) => call[0] === evento)
    .map((call) => call[1] as Record<string, unknown>)
}

const PREVIEWED = 'nutrition_portion_conversion_previewed'
const APPLIED = 'nutrition_portion_conversion_applied'

/** El mismo grupo, con el `isSystem` que el overlay del catálogo vivo le pegaría por id. */
function picker(source: QePortionGroup, isSystem: boolean): QePickerGroup {
  return { ...source, isSystem }
}

beforeEach(() => {
  captureMock.mockClear()
  toastMock.mockClear()
  window.localStorage.clear()
})

afterEach(() => {
  cleanup()
})

describe('PortionConversionDialog — diff por franja', () => {
  it('con «C × 2» y «LAC × 1» pinta dos filas; la del lácteo va marcada y con el selector en Descremado', () => {
    setContext([target('C', '2'), target('LAC', '1')])

    render(<PortionConversionDialog open onOpenChange={vi.fn()} />)

    const filas = dialog().getAllByRole('listitem')
    expect(filas).toHaveLength(2)

    // Cereales: 2 × 0,5 = 1 PCT y la energía no se mueve ⇒ sin chip «Revisar».
    const cereales = row('Panes, cereales y tubérculos')
    expect(cereales).toHaveTextContent('Carbohidratos/Cereales 2')
    expect(cereales).toHaveTextContent('Panes, cereales y tubérculos 1')
    expect(cereales).toHaveTextContent('140 → 140 kcal')
    expect(within(cereales).queryByText('Revisar')).toBeNull()

    // Lácteo: destino elegible ⇒ SIEMPRE «Revisar» (R3), aunque el drift fuera 0.
    const lacteo = row('Lácteos descremados')
    expect(within(lacteo).getByText('Revisar')).toBeInTheDocument()
    expect(lacteo).toHaveTextContent('95 → 105 kcal')

    const selector = within(lacteo).getByRole('radiogroup')
    expect(within(selector).getByRole('radio', { name: 'Descremado' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    expect(within(selector).getByRole('radio', { name: 'Entero' })).toHaveAttribute(
      'aria-checked',
      'false',
    )

    // Y el preview se anuncia UNA vez, con los conteos y ninguna cifra del plan.
    expect(capturas(PREVIEWED)).toEqual([
      {
        surface: 'web',
        slots: 1,
        rows: 2,
        rows_review: 1,
        has_dairy: true,
        has_collapse: false,
        has_custom_match: false,
      },
    ])
  })

  it('elegir «Entero» recalcula el destino: 5,5 LAC ⇒ 5 LE (DATA §6.4 caso 12)', () => {
    setContext([target('LAC', '5,5')])

    render(<PortionConversionDialog open onOpenChange={vi.fn()} />)

    // Default: 5,5 × (95/70) = 7,46 ⇒ 7,5 LD.
    expect(row('Lácteos descremados')).toHaveTextContent('Lácteos descremados 7,5')

    fireEvent.click(dialog().getByRole('radio', { name: 'Entero' }))

    // 5,5 × (95/110) = 4,75 ⇒ 5 LE, y la fila sigue marcada.
    const entero = row('Lácteos enteros')
    expect(entero).toHaveTextContent('Lácteos enteros 5')
    expect(within(entero).getByText('Revisar')).toBeInTheDocument()
    expect(dialog().queryByText('Lácteos descremados')).toBeNull()
    // Cambiar de lácteo NO es abrir otro preview: el evento sigue en uno.
    expect(capturas(PREVIEWED)).toHaveLength(1)
  })

  it('«ARL × 1» + «G × 1» en la misma franja dan UNA sola fila AG con sus dos orígenes (R2)', () => {
    setContext([target('ARL', '1'), target('G', '1')])

    render(<PortionConversionDialog open onOpenChange={vi.fn()} />)

    expect(dialog().getAllByRole('listitem')).toHaveLength(1)
    const aceites = row('Aceites y grasas')
    expect(aceites).toHaveTextContent('Alimento rico en lípidos 1 + Grasa de cocina 1')
    expect(aceites).toHaveTextContent('Aceites y grasas 2')
    expect(aceites).toHaveTextContent('90 → 90 kcal')
  })
})

describe('PortionConversionDialog — aplicar', () => {
  it('«Convertir borrador» despacha REPLACE_PORTION_GROUPS y no toca ninguna vía de persistencia', () => {
    const { dispatch, publishNow, openConfirm } = setContext([target('C', '2'), target('LAC', '1')])
    const onOpenChange = vi.fn()

    render(<PortionConversionDialog open onOpenChange={onOpenChange} />)
    fireEvent.click(dialog().getByRole('button', { name: 'Convertir borrador' }))

    expect(dispatch).toHaveBeenCalledTimes(1)
    const [action] = dispatch.mock.calls[0]
    expect(action.type).toBe('REPLACE_PORTION_GROUPS')
    // El árbol convertido: la franja queda con los DOS destinos chilenos, ninguno duplicado.
    expect(action.variants[0].slots[0].portionTargets.map((t: QePortionTarget) => t.groupCode)).toEqual([
      'PCT',
      'LD',
    ])

    // T-05: publicar sigue siendo un paso aparte. Ni el publish directo ni el confirm se tocan.
    expect(publishNow).not.toHaveBeenCalled()
    expect(openConfirm).not.toHaveBeenCalled()
    expect(capturas(APPLIED)).toEqual([
      { surface: 'web', slots: 1, rows: 2, dairy_choice: 'LD', custom_replaced: 0 },
    ])
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('el pie promete lo mismo que hace el botón', () => {
    setContext([target('C', '2')])

    render(<PortionConversionDialog open onOpenChange={vi.fn()} />)

    expect(
      dialog().getByText('Cambia el borrador. No se publica nada hasta que toques Publicar.'),
    ).toBeInTheDocument()
    // Delta del día al pie: 140 kcal de cereales ⇒ 140 kcal de PCT.
    expect(dialog().getByText('Día base')).toBeInTheDocument()
    // Dos veces: en la fila y en el pie del día (es el único grupo de la franja).
    expect(dialog().getAllByText('140 → 140 kcal')).toHaveLength(2)
  })
})

describe('PortionConversionBanner — quién lo ve y «Ahora no» (W3.6)', () => {
  it('con targets SMAE en el borrador se monta una sola vez y abre el preview', () => {
    setContext([target('C', '2')])

    render(<PortionConversionBanner />)

    expect(screen.getAllByText(BANNER_TITLE)).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Ver conversión' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('un borrador ya chileno no lo ve', () => {
    setContext([target('PCT', '1')])

    render(<PortionConversionBanner />)

    expect(screen.queryByText(BANNER_TITLE)).toBeNull()
  })

  it('«Ahora no» lo esconde y deja la marca con fecha, por planId', () => {
    setContext([target('C', '2')])

    render(<PortionConversionBanner />)
    fireEvent.click(screen.getByRole('button', { name: 'Ahora no' }))

    expect(screen.queryByText(BANNER_TITLE)).toBeNull()
    const marca = window.localStorage.getItem('nutrition-v2:portion-conversion-dismissed:plan-1')
    expect(Number(marca)).toBeGreaterThan(0)
  })

  /**
   * Estado REAL entre el deploy y W6.8: los 13 grupos `cl` viven con `deleted_at` (TASKS W0.3) y
   * no llegan al catálogo. El borrador es SMAE, pero no hay ni un destino: el banner prometía
   * «Puedes convertir el borrador» y el diálogo solo podía decir «todavía no está disponible» con
   * el botón apagado. Callejón sin salida ⇒ no se pinta.
   */
  it('sin ni un destino chileno vivo en el catálogo el banner no se pinta', () => {
    setContext([target('C', '2')], { portionGroupChoices: [byCode('C'), byCode('LAC')] })

    render(<PortionConversionBanner />)

    expect(screen.queryByText(BANNER_TITLE)).toBeNull()
  })

  it('una marca de hace más de 30 días ya no lo esconde', () => {
    window.localStorage.setItem(
      'nutrition-v2:portion-conversion-dismissed:plan-1',
      String(Date.now() - 31 * 24 * 60 * 60 * 1000),
    )
    setContext([target('C', '2')])

    render(<PortionConversionBanner />)

    expect(screen.getByText(BANNER_TITLE)).toBeInTheDocument()
  })
})

describe('PortionConversionDialog — «se conservan tal cual»: una línea por RAZÓN', () => {
  /**
   * Las tres razones de `ClConversionUnresolvedReason` dicen cosas distintas y la de más arriba
   * es la que mordía en producción: entre el deploy y W6.8 los 13 chilenos viven con `deleted_at`
   * (TASKS W0.3), así que «Cereales (SMAE)» —del SISTEMA, con regla escrita— cae a
   * `destino_ausente_en_catalogo` y el diálogo le decía al coach que era un grupo suyo.
   */
  it('`destino_ausente_en_catalogo`: el grupo del sistema espera a su destino, no es «tuyo»', () => {
    // Catálogo SIN los destinos chilenos (el estado real hasta W6.8).
    setContext([target('C', '2')], { portionGroupChoices: [byCode('C')] })

    render(<PortionConversionDialog open onOpenChange={vi.fn()} />)

    expect(
      dialog().getByText('Carbohidratos/Cereales: su equivalente chileno todavía no está disponible.'),
    ).toBeInTheDocument()
    expect(dialog().queryByText(/es tuyo/)).toBeNull()
  })

  it('`custom_sin_match`: el grupo propio sin equivalente SÍ dice que es tuyo', () => {
    setContext([propioTarget(PROPIO_SIN_MATCH, '1')], {
      portionGroupChoices: [...CATALOG, PROPIO_SIN_MATCH],
    })

    render(<PortionConversionDialog open onOpenChange={vi.fn()} />)

    expect(dialog().getByText('Proteinapro: es tuyo y no tiene equivalente chileno.')).toBeInTheDocument()
  })

  it('`sin_regla`: el grupo congelado que ya no está en el catálogo se conserva y lo dice', () => {
    // El target existe en el plan pero su grupo no llega ni por catálogo ni por el merge.
    setContext([propioTarget(PROPIO_SIN_MATCH, '1')], { portionGroupChoices: CATALOG })

    render(<PortionConversionDialog open onOpenChange={vi.fn()} />)

    expect(
      dialog().getByText('Proteinapro: ya no está en tu catálogo, así que se conserva.'),
    ).toBeInTheDocument()
  })

  it('con match único ofrece el reemplazo con el nombre del grupo CHILENO, y hay que confirmarlo', () => {
    // Señuelo: un grupo del plan con el mismo `code` del destino pero declarado SMAE. El nombre
    // de la propuesta sale del set chileno (`isClGroup`), no del primero que calce por código.
    const senuelo = group('PCT', 'Carbohidratos (viejo)', [140, 3, 30, 1], 'smae')
    const { dispatch } = setContext([propioTarget(PROPIO_QUE_CALZA, '1')], {
      portionGroupChoices: [senuelo, ...CATALOG, PROPIO_QUE_CALZA],
    })

    render(<PortionConversionDialog open onOpenChange={vi.fn()} />)

    const oferta = dialog().getByRole('checkbox', {
      name: 'Reemplazar «Carbohidratos 140/30» por «Panes, cereales y tubérculos»',
    })
    expect(oferta).not.toBeChecked()
    // Nada se reemplaza por defecto: sin confirmar, el botón primario no tiene qué aplicar.
    expect(dialog().getByRole('button', { name: 'Convertir borrador' })).toBeDisabled()

    fireEvent.click(oferta)
    fireEvent.click(dialog().getByRole('button', { name: 'Convertir borrador' }))
    const [action] = dispatch.mock.calls[0]
    expect(action.variants[0].slots[0].portionTargets.map((t: QePortionTarget) => t.groupCode)).toEqual([
      'PCT',
    ])
  })
})

describe('PortionConversionDialog — el evento cuenta previews, no aperturas', () => {
  it('un borrador ya chileno abre el diálogo, avisa que no hay nada y NO emite `previewed`', () => {
    setContext([target('PCT', '1')])

    render(<PortionConversionDialog open onOpenChange={vi.fn()} />)

    expect(
      dialog().getByText('Este borrador ya usa el sistema chileno: no hay nada que convertir.'),
    ).toBeInTheDocument()
    expect(dialog().getByRole('button', { name: 'Convertir borrador' })).toBeDisabled()
    expect(capturas(PREVIEWED)).toHaveLength(0)
  })
})

describe('PortionConversionDialog — el vacío no felicita por una migración que no hubo', () => {
  /**
   * El coach borró el número de su único grupo SMAE. El motor deja el target intacto y no emite
   * ni `diff` ni `unresolved` (`exchange-conversion.ts:453-468`), así que el preview queda sin
   * secciones sobre un borrador 100 % SMAE: el copy tiene que hablar de las cantidades, no
   * declarar migrado el plan.
   */
  it('con el único target SMAE sin cantidad legible avisa de las cantidades, no de la migración', () => {
    setContext([target('C', '')])

    render(<PortionConversionDialog open onOpenChange={vi.fn()} />)

    expect(
      dialog().getByText(
        'Este borrador usa las porciones anteriores, pero ninguna tiene una cantidad válida: revísalas y vuelve a intentarlo.',
      ),
    ).toBeInTheDocument()
    expect(dialog().queryByText(/ya usa el sistema chileno/)).toBeNull()
    expect(dialog().getByRole('button', { name: 'Convertir borrador' })).toBeDisabled()
  })
})

describe('PortionConversionDialog — deshacer', () => {
  it('«Convertir borrador» deja un toast que devuelve el árbol anterior con RESTORE_DRAFT', () => {
    const { dispatch } = setContext([target('C', '2')])
    const antes = (ctx.value.state as { variants: QeVariant[] }).variants

    render(<PortionConversionDialog open onOpenChange={vi.fn()} />)
    fireEvent.click(dialog().getByRole('button', { name: 'Convertir borrador' }))

    const [mensaje, opciones] = toastMock.mock.calls[0]
    expect(mensaje).toBe('Borrador convertido')
    expect(opciones.action.label).toBe('Deshacer')

    opciones.action.onClick()
    expect(dispatch).toHaveBeenLastCalledWith({
      type: 'RESTORE_DRAFT',
      state: expect.objectContaining({ variants: antes }),
    })
  })
})

describe('PortionConversionDialog — selector de lácteo con teclado', () => {
  it('un solo tab stop y ←/→ mueven la elección (patrón ARIA de radiogroup)', () => {
    setContext([target('LAC', '1')])

    render(<PortionConversionDialog open onOpenChange={vi.fn()} />)

    const descremado = dialog().getByRole('radio', { name: 'Descremado' })
    expect(descremado).toHaveAttribute('tabindex', '0')
    expect(dialog().getByRole('radio', { name: 'Semi' })).toHaveAttribute('tabindex', '-1')

    fireEvent.keyDown(descremado, { key: 'ArrowRight' })
    expect(dialog().getByRole('radio', { name: 'Semi' })).toHaveAttribute('aria-checked', 'true')

    fireEvent.keyDown(dialog().getByRole('radio', { name: 'Semi' }), { key: 'End' })
    expect(dialog().getByRole('radio', { name: 'Entero' })).toHaveAttribute('aria-checked', 'true')

    // Y mover la elección con el teclado tampoco abre otro preview.
    expect(capturas(PREVIEWED)).toHaveLength(1)
  })
})

describe('PortionConversionBanner — «SMAE en uso» es SOLO el set del sistema (E1)', () => {
  /**
   * El grupo PROPIO del coach nace con `portion_system = 'smae'` por el default de la columna
   * (W0.1), no porque el coach eligiera el set viejo. Contarlo como legado le pintaba «tu plan usa
   * las porciones anteriores» a un coach que nunca prescribió un grupo del sistema, y el botón del
   * aviso le abría un preview sin una sola fila: todo lo suyo cae a «se conserva tal cual».
   *
   * La decisión la toma `draftUsesLegacySmae` en el paquete y RN pregunta lo mismo (E2).
   */
  const PROPIO_SMAE = group('MIS', 'Mi cereal', [70, 2, 15, 0], 'smae')

  it('un borrador con puros grupos PROPIOS marcados «smae» no ve el banner', () => {
    setContext([propioTarget(PROPIO_SMAE, '2')], {
      // Los 13 destinos chilenos SÍ están: lo único que decide acá es `isSystem === false`.
      portionGroupChoices: [...CATALOG.map((g) => picker(g, true)), picker(PROPIO_SMAE, false)],
    })

    render(<PortionConversionBanner />)

    expect(screen.queryByText(BANNER_TITLE)).toBeNull()
  })

  it('con un grupo del SISTEMA «C» y un destino chileno vivo el banner sí se monta', () => {
    setContext([target('C', '2')], {
      portionGroupChoices: CATALOG.map((g) => picker(g, true)),
    })

    render(<PortionConversionBanner />)

    expect(screen.getByText(BANNER_TITLE)).toBeInTheDocument()
  })
})

describe('PortionConversionDialog — el payload es el del paquete, con `surface: web` (E4)', () => {
  it('`previewed` sale con las 7 llaves de DATA §11 y las banderas del caso', () => {
    // ARL + G colapsan en una fila (has_collapse) y el grupo propio que calza ofrece reemplazo
    // (has_custom_match). Sin lácteo en la franja, `has_dairy` queda en false.
    setContext([target('ARL', '1'), target('G', '1'), propioTarget(PROPIO_QUE_CALZA, '1')], {
      portionGroupChoices: [...CATALOG, PROPIO_QUE_CALZA],
    })

    render(<PortionConversionDialog open onOpenChange={vi.fn()} />)

    const [payload] = capturas(PREVIEWED)
    expect(Object.keys(payload).sort()).toEqual([
      'has_collapse',
      'has_custom_match',
      'has_dairy',
      'rows',
      'rows_review',
      'slots',
      'surface',
    ])
    expect(payload).toEqual({
      surface: 'web',
      slots: 1,
      rows: 1,
      rows_review: 0,
      has_dairy: false,
      has_collapse: true,
      has_custom_match: true,
    })
  })

  it('`applied` sale con las 5 llaves, el lácteo elegido y cuántos grupos propios se reemplazaron', () => {
    setContext([target('LAC', '1'), propioTarget(PROPIO_QUE_CALZA, '1')], {
      portionGroupChoices: [...CATALOG, PROPIO_QUE_CALZA],
    })

    render(<PortionConversionDialog open onOpenChange={vi.fn()} />)

    fireEvent.click(dialog().getByRole('radio', { name: 'Entero' }))
    fireEvent.click(
      dialog().getByRole('checkbox', {
        name: 'Reemplazar «Carbohidratos 140/30» por «Panes, cereales y tubérculos»',
      }),
    )
    fireEvent.click(dialog().getByRole('button', { name: 'Convertir borrador' }))

    const [payload] = capturas(APPLIED)
    expect(Object.keys(payload).sort()).toEqual([
      'custom_replaced',
      'dairy_choice',
      'rows',
      'slots',
      'surface',
    ])
    expect(payload).toEqual({
      surface: 'web',
      slots: 1,
      rows: 2,
      dairy_choice: 'LE',
      custom_replaced: 1,
    })
  })
})
