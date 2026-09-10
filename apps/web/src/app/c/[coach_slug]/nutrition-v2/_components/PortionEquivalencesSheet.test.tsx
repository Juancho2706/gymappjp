import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  NutritionExchangeFoodRead,
  NutritionMealSlotRead,
  NutritionSlotExchangeTargetRead,
} from '@eva/nutrition-v2'
import { PortionEquivalencesSheet } from './PortionEquivalencesSheet'
import type { PortionMarksApi } from './PortionMarks'

/**
 * Se mockea el CLIENTE de PostHog, no `@/lib/posthog/events` (misma regla que
 * `PortionConversionDialog.test.tsx`): así corre la cadena entera —sheet → hook →
 * `equivalencesOpenedPayload` del paquete → `capture`— y lo que se afirma es el payload REAL.
 */
const captureMock = vi.hoisted(() => vi.fn())
vi.mock('posthog-js/react', () => ({ usePostHog: () => ({ capture: captureMock }) }))

/**
 * W2.9 — la cabecera del sheet del alumno imprime UNA porción con los grupos COMPUESTOS ya
 * expandidos. `editor-state.portions-ref.test.ts` cubre el helper puro; acá se prueba lo que el
 * helper puro NO puede probar: que este componente le pase el diccionario correcto. El plan
 * prescribe SOLO `LEG` (Legumbres), así que las bases P y C tienen que salir sintetizadas desde
 * el `composedOf` congelado del target — si el sheet le pasara otra lista, la cabecera volvería
 * a decir «≈ 0 kcal».
 *
 * Valores del seed SMAE: P = 55 kcal / 7 P / 0 C / 3 G y C = 70 kcal / 2 P / 15 C / 0 G, o sea
 * LEG = 125 kcal · 9 P · 15 C · 3 G.
 */

const REF_P = { calories: 55, proteinG: 7, carbsG: 0, fatsG: 3 }
const REF_C = { calories: 70, proteinG: 2, carbsG: 15, fatsG: 0 }
const CERO = { calories: 0, proteinG: 0, carbsG: 0, fatsG: 0 }

function target(
  overrides: Partial<NutritionSlotExchangeTargetRead> = {},
): NutritionSlotExchangeTargetRead {
  return {
    id: '0000e8c0-0000-0000-0000-000000000101',
    exchangeGroupId: '0000e8c0-0000-0000-0000-000000000001',
    groupCode: 'LEG',
    groupName: 'Leguminosas',
    color: null,
    portions: 2,
    notes: null,
    orderIndex: 0,
    // Ref crudo en cero: el valor de LEG vive en `composed_of`, no en la fila (D5/R11).
    ref: CERO,
    composedOf: [
      { code: 'P', portions: 1, ref: REF_P },
      { code: 'C', portions: 1, ref: REF_C },
    ],
    macrosConfirmed: false,
    ...overrides,
  }
}

function slotWith(exchangeTargets: NutritionSlotExchangeTargetRead[]): NutritionMealSlotRead {
  return {
    id: '0000e8c0-0000-0000-0000-0000000000aa',
    code: 'almuerzo',
    name: 'Almuerzo',
    startTime: null,
    endTime: null,
    mode: 'flexible',
    required: false,
    instructions: null,
    targets: {},
    prescriptionItems: [],
    intakeItems: [],
    exchangeTargets,
  }
}

/** Doble del API de marcas: el sheet solo lo toca al marcar, y acá no se marca nada. */
const api: PortionMarksApi = {
  coverageFor: () => ({ marcadas: 0, derivadas: 0, coverage: 0 }),
  hasInFlight: () => false,
  dayCoverage: [],
  mark: vi.fn(),
  dupWarningFor: () => null,
  nextMarkFor: () => ({ extra: false, portions: 1 }),
}

/** Texto del header con los espacios de JSX colapsados. */
function headerLine(): string {
  const heading = screen.getByRole('heading', { name: 'Equivalencias de Leguminosas' })
  const line = heading.nextElementSibling
  return (line?.textContent ?? '').replace(/\s+/g, ' ').trim()
}

afterEach(() => {
  cleanup()
})

describe('PortionEquivalencesSheet — cabecera «1 porción» (W2.9)', () => {
  it('expande el compuesto con las bases sintetizadas desde `composedOf`, sin catálogo vivo', () => {
    render(
      <PortionEquivalencesSheet
        slot={slotWith([target()])}
        initialGroupCode="LEG"
        exchangeFoods={[]}
        api={api}
        onClose={() => {}}
        onRegister={null}
      />,
    )

    expect(headerLine()).toBe('≈ 125 kcal · P 9 g · C 15 g · G 3 g')
  })

  it('sin `composedOf` cae al ref crudo en vez de inventar: fallback honesto', () => {
    render(
      <PortionEquivalencesSheet
        slot={slotWith([target({ composedOf: null })])}
        initialGroupCode="LEG"
        exchangeFoods={[]}
        api={api}
        onClose={() => {}}
        onRegister={null}
      />,
    )

    expect(headerLine()).toBe('≈ 0 kcal · P 0 g · C 0 g · G 0 g')
  })

  it('un grupo simple imprime su propio ref (la expansión no lo altera)', () => {
    render(
      <PortionEquivalencesSheet
        slot={slotWith([
          target({ groupCode: 'C', groupName: 'Leguminosas', ref: REF_C, composedOf: null }),
        ])}
        initialGroupCode="C"
        exchangeFoods={[]}
        api={api}
        onClose={() => {}}
        onRegister={null}
      />,
    )

    expect(headerLine()).toBe('≈ 70 kcal · P 2 g · C 15 g · G 0 g')
  })
})

/* ── W5.7 / W5.9 — dos secciones, miniatura de 36 px y pie condicional ─────────────────────── */

const SUPABASE_URL = 'https://proj.supabase.co'
const GENERICS_TITLE = 'Genéricos · INTA · UDD'
const BRANDS_TITLE = 'Marcas y productos'
const PHOTO_CREDIT = 'Fotos: Open Food Facts (CC BY-SA)'

/** Fila del read model del sheet: las cuatro llaves nuevas son OPCIONALES a propósito. */
function food(overrides: Partial<NutritionExchangeFoodRead> = {}): NutritionExchangeFoodRead {
  return {
    foodId: '0000e8c0-0000-0000-0000-0000000000f1',
    exchangeGroupId: '0000e8c0-0000-0000-0000-000000000001',
    groupCode: 'LEG',
    name: 'Poroto cocido',
    brand: null,
    portionLabel: '¾ taza',
    portionGrams: 130,
    ...overrides,
  }
}

/** Fila de marca (`brand` no nula ⇒ va a la sección de abajo). */
function brandFood(overrides: Partial<NutritionExchangeFoodRead> = {}): NutritionExchangeFoodRead {
  return food({
    foodId: '0000e8c0-0000-0000-0000-0000000000f2',
    name: 'Porotos Wasil',
    brand: 'Wasil',
    portionLabel: null,
    portionGrams: 60,
    ...overrides,
  })
}

function renderSheet(exchangeFoods: NutritionExchangeFoodRead[]) {
  render(
    <PortionEquivalencesSheet
      slot={slotWith([target()])}
      initialGroupCode="LEG"
      exchangeFoods={exchangeFoods}
      api={api}
      onClose={() => {}}
      onRegister={null}
    />,
  )
}

describe('PortionEquivalencesSheet — secciones y buscador (W5.7)', () => {
  const prevUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL
    captureMock.mockClear()
  })
  afterEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl
  })

  it('con genéricos y marcas dibuja las DOS secciones, genéricos primero', () => {
    renderSheet([food(), brandFood()])

    expect(screen.getAllByRole('heading', { level: 4 }).map((h) => h.textContent)).toEqual([
      GENERICS_TITLE,
      BRANDS_TITLE,
    ])
  })

  it('un buscador que solo matchea marcas NO dibuja el encabezado de genéricos', () => {
    renderSheet([food(), brandFood()])

    fireEvent.change(screen.getByLabelText('Buscar alimento equivalente'), {
      target: { value: 'wasil' },
    })

    expect(screen.queryByText(GENERICS_TITLE)).toBeNull()
    expect(screen.getByText(BRANDS_TITLE)).toBeTruthy()
    expect(screen.queryByText('Poroto cocido')).toBeNull()
  })

  it('la medida casera manda y los gramos van debajo; sin medida casera manda el gramaje', () => {
    renderSheet([food(), brandFood()])

    expect(screen.getByText('¾ taza')).toBeTruthy()
    expect(screen.getByText('130 g')).toBeTruthy()
    // La marca no trae `portionLabel`: los gramos suben al lugar de la medida casera (una vez).
    expect(screen.getAllByText('60 g')).toHaveLength(1)
  })
})

describe('PortionEquivalencesSheet — foto, fallback y atribución (W5.9)', () => {
  const prevUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL
    captureMock.mockClear()
  })
  afterEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl
  })

  it('sin ninguna licencia `cc_by*` NO pinta el pie de Open Food Facts', () => {
    renderSheet([
      food({ imagePath: 'coach/poroto.webp', imageVersion: 1, imageLicense: 'eva_owned' }),
      brandFood({ imagePath: 'coach/wasil.webp', imageVersion: 1, imageLicense: 'supplier_authorized' }),
    ])

    expect(screen.queryByText(PHOTO_CREDIT)).toBeNull()
  })

  it('con una sola fila `cc_by_sa` pinta el pie UNA vez y la fila nombra su fuente', () => {
    renderSheet([
      food({ imagePath: 'coach/poroto.webp', imageVersion: 1, imageLicense: 'eva_owned' }),
      brandFood({ imagePath: 'off/3/012/345/front.jpg', imageVersion: 4, imageLicense: 'cc_by_sa' }),
    ])

    expect(screen.getAllByText(PHOTO_CREDIT)).toHaveLength(1)
    const photo = screen.getByRole('img', { name: 'Porotos Wasil · Foto: Open Food Facts (CC BY-SA)' })
    // La URL trae el `?v=` del cache-busting y apunta al objeto público del bucket.
    expect(photo.getAttribute('src')).toBe(
      `${SUPABASE_URL}/storage/v1/object/public/food-media/off/3/012/345/front.jpg?v=4`,
    )
    // La ilustración propia NO declara fuente.
    expect(screen.getByRole('img', { name: 'Poroto cocido' })).toBeTruthy()
  })

  it('la fila sin `imagePath` cae al marcador del grupo, no a un <img> roto', () => {
    renderSheet([food()])

    expect(screen.queryAllByRole('img')).toHaveLength(0)
    // Dos círculos con el código del grupo: el de la cabecera y el de la fila sin foto.
    expect(screen.getAllByText('LEG')).toHaveLength(2)
  })

  it('captura `nutrition_equivalences_opened` al abrir, sin nombres ni cifras', () => {
    renderSheet([food(), brandFood()])

    expect(captureMock).toHaveBeenCalledTimes(1)
    expect(captureMock).toHaveBeenCalledWith('nutrition_equivalences_opened', {
      surface: 'web',
      // 'LEG' no es uno de los 13 códigos chilenos ⇒ set legado (decisión W5.7).
      set: 'smae',
      has_generic: true,
      rows_bucket: '1-10',
    })
  })

  /**
   * DATA §11 (evento 5): «se dispara al abrir, UNA vez por apertura, no por cada cambio de tab de
   * grupo». Con el guard atado al grupo, una franja de 5 grupos emitía hasta 5 aperturas y el
   * embudo de D4-A quedaba inflado.
   */
  it('cambiar de tab de grupo NO emite una segunda apertura', () => {
    render(
      <PortionEquivalencesSheet
        slot={slotWith([
          target(),
          target({
            id: '0000e8c0-0000-0000-0000-000000000102',
            groupCode: 'C',
            groupName: 'Cereales',
            ref: REF_C,
            composedOf: null,
            orderIndex: 1,
          }),
        ])}
        initialGroupCode="LEG"
        exchangeFoods={[food(), brandFood()]}
        api={api}
        onClose={() => {}}
        onRegister={null}
      />,
    )

    expect(captureMock).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'C · Cereales' }))
    expect(captureMock).toHaveBeenCalledTimes(1)
  })
})
