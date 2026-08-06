import { describe, expect, it } from 'vitest'
import {
  buildV2MealNamesByVariant,
  pickEffectiveV2VersionByClient,
  pickV2DayVariantByVersion,
  type NutritionV2PlanRow,
  type NutritionV2VariantRow,
  type NutritionV2VersionRow,
} from './v2-candidates'

const plans: NutritionV2PlanRow[] = [
  { id: 'plan-a', client_id: 'cli-1' },
  { id: 'plan-b', client_id: 'cli-1' },
  { id: 'plan-c', client_id: 'cli-2' },
]

function version(over: Partial<NutritionV2VersionRow> & { id: string; plan_id: string }): NutritionV2VersionRow {
  return {
    version_number: 1,
    effective_from: '2026-08-01',
    published_at: '2026-08-01T12:00:00Z',
    ...over,
  }
}

function variant(over: Partial<NutritionV2VariantRow> & { id: string; version_id: string }): NutritionV2VariantRow {
  return {
    day_of_week: null,
    is_default: false,
    order_index: 0,
    created_at: '2026-08-01T00:00:00Z',
    ...over,
  }
}

describe('pickEffectiveV2VersionByClient', () => {
  it('devuelve una sola version por alumno y omite planes sin version vigente', () => {
    const picked = pickEffectiveV2VersionByClient(plans, [
      version({ id: 'v1', plan_id: 'plan-a' }),
      version({ id: 'v2', plan_id: 'plan-a', version_number: 2, effective_from: '2026-08-05' }),
    ])
    expect(picked.get('cli-1')).toBe('v2')
    expect(picked.has('cli-2')).toBe(false)
  })

  it('ignora versiones de planes que no son del lote', () => {
    const picked = pickEffectiveV2VersionByClient(plans, [version({ id: 'v9', plan_id: 'plan-ajeno' })])
    expect(picked.size).toBe(0)
  })

  it('con dos raices activas del mismo alumno gana la publicacion mas reciente (no el version_number)', () => {
    // Regresion exacta de 20260728120500: la raiz nueva nace en version_number 1 y empataba
    // en effective_from contra la vieja, que ganaba por numero. Manda `published_at`.
    const picked = pickEffectiveV2VersionByClient(plans, [
      version({ id: 'vieja', plan_id: 'plan-a', version_number: 7, published_at: '2026-08-01T09:00:00Z' }),
      version({ id: 'nueva', plan_id: 'plan-b', version_number: 1, published_at: '2026-08-06T09:00:00Z' }),
    ])
    expect(picked.get('cli-1')).toBe('nueva')
  })

  it('trata published_at nulo como el ultimo del orden (nulls last)', () => {
    const picked = pickEffectiveV2VersionByClient(plans, [
      version({ id: 'sin-fecha', plan_id: 'plan-a', published_at: null }),
      version({ id: 'con-fecha', plan_id: 'plan-b', published_at: '2026-08-02T09:00:00Z' }),
    ])
    expect(picked.get('cli-1')).toBe('con-fecha')
  })

  it('desempata por id descendente cuando todo lo demas empata', () => {
    const picked = pickEffectiveV2VersionByClient(plans, [
      version({ id: 'aaa', plan_id: 'plan-a' }),
      version({ id: 'zzz', plan_id: 'plan-b' }),
    ])
    expect(picked.get('cli-1')).toBe('zzz')
  })
})

describe('pickV2DayVariantByVersion', () => {
  // 2026-08-06 = jueves ⇒ extract(dow) = 4.
  const today = '2026-08-06'

  it('prefiere el match exacto de day_of_week sobre el dia base', () => {
    const picked = pickV2DayVariantByVersion(
      [
        variant({ id: 'base', version_id: 'v1', is_default: true }),
        variant({ id: 'jueves', version_id: 'v1', day_of_week: 4, order_index: 3 }),
      ],
      today,
    )
    expect(picked.get('v1')).toBe('jueves')
  })

  it('cae al dia base cuando ninguna variante reclama hoy', () => {
    const picked = pickV2DayVariantByVersion(
      [
        variant({ id: 'lunes', version_id: 'v1', day_of_week: 1 }),
        variant({ id: 'base', version_id: 'v1', is_default: true, order_index: 9 }),
      ],
      today,
    )
    expect(picked.get('v1')).toBe('base')
  })

  it('sin match ni dia base no inventa variante', () => {
    const picked = pickV2DayVariantByVersion([variant({ id: 'lunes', version_id: 'v1', day_of_week: 1 })], today)
    expect(picked.has('v1')).toBe(false)
  })

  it('resuelve cada version por separado', () => {
    const picked = pickV2DayVariantByVersion(
      [
        variant({ id: 'a', version_id: 'v1', is_default: true }),
        variant({ id: 'b', version_id: 'v2', day_of_week: 4 }),
      ],
      today,
    )
    expect([...picked]).toEqual([
      ['v1', 'a'],
      ['v2', 'b'],
    ])
  })
})

describe('buildV2MealNamesByVariant', () => {
  it('ordena por order_index, limpia vacios y deduplica', () => {
    const names = buildV2MealNamesByVariant([
      { day_variant_id: 'dv1', name: 'Cena', order_index: 3 },
      { day_variant_id: 'dv1', name: '  Desayuno ', order_index: 1 },
      { day_variant_id: 'dv1', name: 'Desayuno', order_index: 2 },
      { day_variant_id: 'dv1', name: '   ', order_index: 4 },
      { day_variant_id: 'dv1', name: null, order_index: 5 },
    ])
    expect(names.get('dv1')).toEqual(['Desayuno', 'Cena'])
  })

  it('omite variantes que no dejan ningun nombre util', () => {
    const names = buildV2MealNamesByVariant([{ day_variant_id: 'dv2', name: null, order_index: 0 }])
    expect(names.has('dv2')).toBe(false)
  })
})
