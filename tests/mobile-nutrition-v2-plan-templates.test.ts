import { describe, expect, it } from 'vitest'
import { formatPlanBuilderOrigin, parsePlanBuilderOrigin } from '@eva/nutrition-v2'
import { nutritionV2BuilderHref } from '../apps/mobile/lib/nutrition-v2-hub'
import {
  builderStateFromTemplateDraft,
  templateBuilderDraft,
  type TemplateDraftLike,
} from '../apps/mobile/lib/nutrition-v2-builder-template'
import { portionsKey } from '../apps/mobile/lib/nutrition-v2-builder-portions'
import type { BuilderFood } from '../apps/mobile/lib/nutrition-v2-builder'

/**
 * F4 — "aplicar plantilla de plan desde el builder RN".
 *
 * Dos piezas puras: la puerta con ORIGEN (`?from=`) y el adaptador plantilla -> estado del wizard.
 * Ambas gobiernan lo que el coach termina PUBLICANDO, asi que se testean sin RN ni red.
 */

const TODAY = '2026-08-03'
const TEMPLATE_ID = '11111111-2222-4333-8444-555555555555'

function food(overrides: Partial<BuilderFood> = {}): BuilderFood {
  return {
    id: 'food-1',
    name: 'Arroz',
    brand: null,
    calories: 130,
    proteinG: 2.7,
    carbsG: 28,
    fatsG: 0.3,
    fiberG: 0.4,
    servingSize: 100,
    servingUnit: 'g',
    category: null,
    media: null,
    householdGrams: null,
    householdLabel: null,
    ...overrides,
  }
}

function draft(overrides: Partial<TemplateDraftLike> = {}): TemplateDraftLike {
  return {
    name: 'Definición 2000',
    strategy: 'structured',
    permissions: { canRegisterFreely: false, canAdjustPrescribedQuantity: true, canSubstitute: false },
    dayVariants: [
      {
        key: 'default',
        label: '',
        dayOfWeek: null,
        default: true,
        targets: { calories: 2000, proteinG: 150, carbsG: 200, fatsG: 60 },
        mealSlots: [
          {
            name: 'Almuerzo',
            startTime: '13:30:00',
            items: [{ foodId: 'food-1', quantity: 150, unit: 'g', optional: false, notes: 'pesado en crudo' }],
            exchangeTargets: [{ exchangeGroupId: 'grp-1', portions: 2 }],
          },
        ],
      },
    ],
    ...overrides,
  }
}

describe('nutritionV2BuilderHref con ORIGEN (F4)', () => {
  it('propaga el origen como ?from= URL-encoded', () => {
    const from = formatPlanBuilderOrigin({ kind: 'template', id: TEMPLATE_ID })
    expect(from).toBe(`template:${TEMPLATE_ID}`)
    expect(nutritionV2BuilderHref('cli-1', { from })).toBe(
      `/coach/nutrition-v2/builder/cli-1?from=template%3A${TEMPLATE_ID}`,
    )
  })

  it('combina planId + from en ese orden, sin perder ninguno', () => {
    expect(
      nutritionV2BuilderHref('cli 1', { planId: 'plan-9', from: `template:${TEMPLATE_ID}` }),
    ).toBe(`/coach/nutrition-v2/builder/cli%201?planId=plan-9&from=template%3A${TEMPLATE_ID}`)
  })

  it('el origen que viaja vuelve a parsear al mismo par kind/id (ida y vuelta)', () => {
    // Lo que el href codifica es exactamente lo que el builder decodifica desde `useLocalSearchParams`.
    const from = formatPlanBuilderOrigin({ kind: 'template', id: TEMPLATE_ID })
    const encoded = nutritionV2BuilderHref('cli-1', { from }).split('?from=')[1]
    expect(parsePlanBuilderOrigin(decodeURIComponent(encoded))).toEqual({ kind: 'template', id: TEMPLATE_ID })
  })

  it('omite el query cuando no hay origen ni raiz de plan', () => {
    expect(nutritionV2BuilderHref('cli-1', { from: null })).toBe('/coach/nutrition-v2/builder/cli-1')
    expect(nutritionV2BuilderHref('cli-1', { from: '' })).toBe('/coach/nutrition-v2/builder/cli-1')
  })
})

describe('builderStateFromTemplateDraft (port RN del adaptador web)', () => {
  it('reconstruye un draft minimo en un BuilderState publicable', () => {
    const result = builderStateFromTemplateDraft({
      draft: draft(),
      foods: { 'food-1': food() },
      clientTimezoneToday: TODAY,
    })
    expect(result).not.toBeNull()
    const state = result!.state
    expect(state.step).toBe(0)
    expect(state.strategy).toBe('structured')
    expect(state.planName).toBe('Definición 2000')
    // La plantilla NO trae fecha de vigencia: arranca HOY (nunca la del plan que la origino).
    expect(state.effectiveFrom).toBe(TODAY)
    expect(state.targets).toEqual({ calories: '2000', proteinG: '150', carbsG: '200', fatsG: '60' })
    expect(state.permissions).toEqual({
      canRegisterFreely: false,
      canAdjustPrescribedQuantity: true,
      canSubstitute: false,
    })
    expect(state.variants).toHaveLength(1)
    expect(state.activeVariantKey).toBe(state.variants[0].key)
  })

  it('el dia base queda etiquetado y heredando aunque el label venga vacio', () => {
    const state = builderStateFromTemplateDraft({
      draft: draft(),
      clientTimezoneToday: TODAY,
    })!.state
    const base = state.variants[0]
    expect(base.isDefault).toBe(true)
    expect(base.dayOfWeek).toBeNull()
    expect(base.label).toBe('Todos los días')
    expect(base.targetsMode).toBe('inherit')
  })

  it('resuelve el item de catalogo contra `foods` y normaliza franja + hora', () => {
    const state = builderStateFromTemplateDraft({
      draft: draft(),
      foods: { 'food-1': food() },
      clientTimezoneToday: TODAY,
    })!.state
    const slot = state.variants[0].slots[0]
    expect(slot.name).toBe('Almuerzo')
    // `13:30:00` (columna `time`) -> `13:30`, que es lo que espera el input del wizard.
    expect(slot.startTime).toBe('13:30')
    expect(slot.items).toHaveLength(1)
    const item = slot.items[0]
    expect(item.food?.id).toBe('food-1')
    expect(item.customName).toBeNull()
    expect(item.quantity).toBe('150')
    expect(item.unit).toBe('g')
    expect(item.notes).toBe('pesado en crudo')
    expect(item.substitutions).toEqual([])
  })

  it('un alimento que ya no se puede leer degrada a item LIBRE con su nombre (no desaparece)', () => {
    const state = builderStateFromTemplateDraft({
      draft: draft({
        dayVariants: [
          {
            key: 'default',
            label: '',
            dayOfWeek: null,
            default: true,
            mealSlots: [
              {
                name: 'Cena',
                items: [{ foodId: 'borrado', customName: 'Pollo', quantity: 200, unit: 'g' }],
              },
            ],
          },
        ],
      }),
      foods: {},
      clientTimezoneToday: TODAY,
    })!.state
    const item = state.variants[0].slots[0].items[0]
    expect(item.food).toBeNull()
    expect(item.customName).toBe('Pollo')
    expect(item.quantity).toBe('200')
  })

  it('las claves de franja son PROPIAS de la plantilla (`t{v}-{s}`): nunca ids de otro plan', () => {
    const result = builderStateFromTemplateDraft({
      draft: draft(),
      foods: { 'food-1': food() },
      clientTimezoneToday: TODAY,
    })!
    const slot = result.state.variants[0].slots[0]
    expect(slot.key).toBe('t0-0')
    expect(slot.items[0].key).toBe('t0-0-i0')
    // Las porciones a eleccion viajan al mapa hermano, indexadas por la clave COMPUESTA.
    expect(result.portionsBySlot).toEqual({ [portionsKey('default', 't0-0')]: [{ exchangeGroupId: 'grp-1', portions: 2 }] })
  })

  it('multi-dia: el dia especifico conserva su dow y sus metas propias', () => {
    const state = builderStateFromTemplateDraft({
      draft: draft({
        dayVariants: [
          { key: 'default', label: 'Todos los días', dayOfWeek: null, default: true, targets: { calories: 2000 } },
          { key: 'sat', label: '', dayOfWeek: 6, targets: { calories: 2600 }, mealSlots: [] },
        ],
      }),
      clientTimezoneToday: TODAY,
    })!.state
    expect(state.variants).toHaveLength(2)
    // La default queda PRIMERA (orden de lectura del wizard y `orderIndex` del draft).
    expect(state.variants[0].isDefault).toBe(true)
    const saturday = state.variants[1]
    expect(saturday.dayOfWeek).toBe(6)
    expect(saturday.isDefault).toBe(false)
    expect(saturday.label).toBe('Sábado')
    expect(saturday.targetsMode).toBe('custom')
    expect(saturday.targets.calories).toBe('2600')
  })

  it('una plantilla sin dias no se aplica (null, y el wizard sigue con lo suyo)', () => {
    expect(
      builderStateFromTemplateDraft({ draft: draft({ dayVariants: [] }), clientTimezoneToday: TODAY }),
    ).toBeNull()
  })
})

describe('templateBuilderDraft (payload exacto del wizard web)', () => {
  const savedState = {
    step: 1,
    strategy: 'structured',
    planName: 'Volumen 3200',
    // Fecha con la que se creo la plantilla: NO debe heredarse.
    effectiveFrom: '2026-01-15',
    targets: { calories: '3200', proteinG: '190', carbsG: '380', fatsG: '90' },
    permissions: { canRegisterFreely: true, canAdjustPrescribedQuantity: true, canSubstitute: false },
    visibleNotes: 'Toma agua',
    variants: [
      {
        key: 'default',
        label: 'Todos los días',
        dayOfWeek: null,
        isDefault: true,
        targetsMode: 'inherit',
        targets: { calories: '', proteinG: '', carbsG: '', fatsG: '' },
        slots: [{ key: 's1', name: 'Desayuno', startTime: '08:00', items: [] }],
      },
    ],
    activeVariantKey: 'default',
  }

  it('abre la plantilla EXACTA pero con vigencia hoy y en el paso 0', () => {
    const result = templateBuilderDraft(
      { state: savedState, portionsBySlot: { 'default::s1': [{ exchangeGroupId: 'grp-1', portions: 3 }] } },
      TODAY,
    )
    expect(result).not.toBeNull()
    expect(result!.state.planName).toBe('Volumen 3200')
    expect(result!.state.visibleNotes).toBe('Toma agua')
    expect(result!.state.variants[0].slots[0].name).toBe('Desayuno')
    expect(result!.state.effectiveFrom).toBe(TODAY)
    expect(result!.state.step).toBe(0)
    expect(result!.portionsBySlot).toEqual({ 'default::s1': [{ exchangeGroupId: 'grp-1', portions: 3 }] })
  })

  it('descarta payloads inusables en vez de abrir el wizard en blanco', () => {
    expect(templateBuilderDraft(null, TODAY)).toBeNull()
    expect(templateBuilderDraft({}, TODAY)).toBeNull()
    // `variants: []` es la trampa: `migrateBuilderState` lo normalizaria a un dia base VACIO.
    expect(templateBuilderDraft({ state: { ...savedState, variants: [] } }, TODAY)).toBeNull()
    expect(templateBuilderDraft({ state: { hola: 'mundo' } }, TODAY)).toBeNull()
  })

  it('ignora targets de porciones corruptos sin tirar el resto del mapa', () => {
    const result = templateBuilderDraft(
      {
        state: savedState,
        portionsBySlot: {
          'default::s1': [{ exchangeGroupId: 'grp-1', portions: 3 }, { exchangeGroupId: 42, portions: 'dos' }],
          'default::s2': 'no soy un arreglo',
        },
      },
      TODAY,
    )
    expect(result!.portionsBySlot).toEqual({ 'default::s1': [{ exchangeGroupId: 'grp-1', portions: 3 }] })
  })
})
