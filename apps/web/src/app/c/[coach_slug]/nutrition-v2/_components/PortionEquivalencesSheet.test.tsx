import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  NutritionMealSlotRead,
  NutritionSlotExchangeTargetRead,
} from '@eva/nutrition-v2'
import { PortionEquivalencesSheet } from './PortionEquivalencesSheet'
import type { PortionMarksApi } from './PortionMarks'

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
