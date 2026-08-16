/**
 * Guard de dia vacio en la persistencia (defecto 2026-08-03).
 *
 * Un plan con franjas no puede publicar una variante de dia SIN ninguna: el alumno no ve
 * "un dia sin porciones", ve el dia entero vacio. El builder web ya lo bloqueaba en cliente
 * (`draft-builder.ts` valida `variant.slots.length === 0`) y aun asi entraron 16 variantes
 * asi a produccion por el quick-edit y por RN — de ahi que el guard tenga que vivir en el
 * unico punto por el que pasan TODAS las publicaciones.
 */

import { describe, expect, it } from 'vitest'
import {
  NutritionPlanDraftSchema,
  type BuilderFood,
  type NutritionPlanDraft,
} from '@eva/nutrition-v2'
import { buildPersistDraftPayload } from './plan-persistence'
import type { BuilderExchangeGroup } from '@/app/coach/nutrition-v2/_lib/plan-draft-rows'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'

function draft(input: {
  strategy: 'structured' | 'hybrid' | 'flexible'
  variants: Array<{ key: string; label: string; default?: boolean; slots: string[] }>
}): NutritionPlanDraft {
  return NutritionPlanDraftSchema.parse({
    clientId: CLIENT_ID,
    name: 'Plan',
    strategy: input.strategy,
    effectiveFrom: '2026-08-03',
    permissions: {},
    dayVariants: input.variants.map((variant) => ({
      key: variant.key,
      label: variant.label,
      default: variant.default ?? false,
      targets: {},
      mealSlots: variant.slots.map((name, index) => ({
        code: 'slot-' + String(index + 1),
        name,
        items: [],
      })),
    })),
  })
}

function build(d: NutritionPlanDraft) {
  return buildPersistDraftPayload({
    draft: d,
    foods: new Map<string, BuilderFood>(),
    exchangeGroupsById: new Map<string, BuilderExchangeGroup>(),
    resolveBaseGroup: () => null,
  })
}

describe('buildPersistDraftPayload — guard de dia vacio', () => {
  it('rechaza publicar cuando un dia del plan no tiene ninguna franja', () => {
    const res = build(
      draft({
        strategy: 'structured',
        variants: [
          { key: 'default', label: 'Todos los días', default: true, slots: ['Desayuno'] },
          { key: 'v-lu', label: 'Lunes', slots: [] },
        ],
      }),
    )
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.code).toBe('EMPTY_DAY_VARIANT')
      // El mensaje nombra el dia: el coach tiene que saber CUAL arreglar.
      expect(res.error).toContain('Lunes')
    }
  })

  it('tambien protege el dia base (un plan con franjas no puede quedarse sin ninguna)', () => {
    const res = build(
      draft({
        strategy: 'hybrid',
        variants: [{ key: 'default', label: 'Todos los días', default: true, slots: [] }],
      }),
    )
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe('EMPTY_DAY_VARIANT')
  })

  it('deja pasar el plan con todos los dias armados', () => {
    const res = build(
      draft({
        strategy: 'structured',
        variants: [
          { key: 'default', label: 'Todos los días', default: true, slots: ['Desayuno'] },
          { key: 'v-lu', label: 'Lunes', slots: ['Desayuno', 'Almuerzo'] },
        ],
      }),
    )
    expect(res.ok).toBe(true)
  })

  it('no aplica a la estrategia flexible: ahi un dia sin franjas es su estado correcto', () => {
    const res = build(
      draft({
        strategy: 'flexible',
        variants: [{ key: 'default', label: 'Todos los días', default: true, slots: [] }],
      }),
    )
    expect(res.ok).toBe(true)
  })
})
