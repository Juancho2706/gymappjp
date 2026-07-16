import { describe, expect, it } from 'vitest'
import {
  applyNutritionAttentionFilter,
  isNutritionHubPageComplete,
  localDateOf,
  mapNutritionHubMetrics,
  nutritionAttentionLabel,
  nutritionHubMetricScopeLabel,
  nutritionPlanCtaLabel,
  nutritionV2BuilderHref,
  type NutritionHubItemLike,
} from '../apps/mobile/lib/nutrition-v2-hub'
import {
  NUTRITION_PRO_HISTORY_DAYS_BASE,
  NUTRITION_PRO_MODULE_KEY,
  filterHistoryDaysToBaseWindow,
  shouldShowNutritionProHistoryBanner,
} from '../apps/mobile/lib/nutrition-v2-pro'
import {
  CATALOG_ODBL_GENERIC_LINE,
  OPEN_FOOD_FACTS_ODBL_LINE,
  catalogHasOpenFoodFactsSource,
  foodCategoryEmoji,
  foodMediaThumbnailUrl,
  foodOdblAttributionLine,
} from '../apps/mobile/lib/nutrition-v2-food-media'

const TZ = 'America/Santiago'

function makeItem(overrides: Partial<NutritionHubItemLike>): NutritionHubItemLike {
  return {
    clientName: 'Alumno',
    planId: null,
    planStatus: null,
    attentionReason: 'none',
    lastIntakeAt: null,
    ...overrides,
  }
}

describe('nutrition-v2-hub CTA label', () => {
  it('ofrece Nueva version solo con plan publicado', () => {
    expect(nutritionPlanCtaLabel('published')).toBe('Nueva versión')
  })
  it('ofrece Crear plan sin plan o con borrador pendiente', () => {
    expect(nutritionPlanCtaLabel(null)).toBe('Crear plan')
    expect(nutritionPlanCtaLabel('draft')).toBe('Crear plan')
    expect(nutritionPlanCtaLabel('superseded')).toBe('Crear plan')
  })
})

describe('nutrition-v2-hub builder href', () => {
  it('apunta a la ruta convenida con clientId codificado', () => {
    expect(nutritionV2BuilderHref('abc 123')).toBe('/coach/nutrition-v2/builder?clientId=abc%20123')
  })
})

describe('nutrition-v2-hub filtro por atencion', () => {
  const items = [
    makeItem({ clientName: 'A', attentionReason: 'no_plan' }),
    makeItem({ clientName: 'B', attentionReason: 'draft_pending' }),
    makeItem({ clientName: 'C', attentionReason: 'no_recent_intake' }),
    makeItem({ clientName: 'D', attentionReason: 'none' }),
  ]

  it('all no filtra y preserva el orden del servidor', () => {
    expect(applyNutritionAttentionFilter(items, 'all').map((i) => i.clientName)).toEqual(['A', 'B', 'C', 'D'])
  })
  it('needs_attention excluye solo los none', () => {
    expect(applyNutritionAttentionFilter(items, 'needs_attention').map((i) => i.clientName)).toEqual(['A', 'B', 'C'])
  })
  it('cada motivo especifico filtra exacto', () => {
    expect(applyNutritionAttentionFilter(items, 'no_plan').map((i) => i.clientName)).toEqual(['A'])
    expect(applyNutritionAttentionFilter(items, 'draft_pending').map((i) => i.clientName)).toEqual(['B'])
  })
})

describe('nutrition-v2-hub etiquetas de atencion', () => {
  it('mapea cada motivo', () => {
    expect(nutritionAttentionLabel('no_plan')).toBe('Sin plan V2')
    expect(nutritionAttentionLabel('draft_pending')).toBe('Borrador pendiente')
    expect(nutritionAttentionLabel('no_recent_intake')).toBe('Sin consumo reciente')
    expect(nutritionAttentionLabel('none')).toBe('Al día')
  })
})

describe('nutrition-v2-hub metricas + rotulo de pagina', () => {
  it('cuenta con/sin plan y actividad hoy en la zona del coach', () => {
    const today = localDateOf('2026-07-16T15:00:00Z', TZ) ?? ''
    const items = [
      makeItem({ planId: 'p1', lastIntakeAt: '2026-07-16T15:00:00Z' }),
      makeItem({ planId: null, lastIntakeAt: null }),
      makeItem({ planId: 'p2', lastIntakeAt: '2026-07-10T15:00:00Z' }),
    ]
    expect(mapNutritionHubMetrics(items, { todayLocalDate: today, timeZone: TZ })).toEqual({
      total: 3,
      withPlan: 2,
      withoutPlan: 1,
      activeToday: 1,
    })
  })

  it('rotula las metricas segun si la pagina es total real o resumen paginado', () => {
    expect(isNutritionHubPageComplete({ hasMore: false, hasIncomingCursor: false })).toBe(true)
    expect(isNutritionHubPageComplete({ hasMore: true, hasIncomingCursor: false })).toBe(false)
    expect(isNutritionHubPageComplete({ hasMore: false, hasIncomingCursor: true })).toBe(false)
    expect(nutritionHubMetricScopeLabel(true)).toBe('en este workspace')
    expect(nutritionHubMetricScopeLabel(false)).toBe('de esta página')
  })
})

describe('nutrition-v2-pro ventana 30d + banner', () => {
  it('el module key es el mismo addon que V1', () => {
    expect(NUTRITION_PRO_MODULE_KEY).toBe('nutrition_exchanges')
    expect(NUTRITION_PRO_HISTORY_DAYS_BASE).toBe(30)
  })

  it('recorta el historial a la ventana base de 30 dias inclusive', () => {
    const today = '2026-07-16'
    const days = [
      { localDate: '2026-07-16' },
      { localDate: '2026-06-16' },
      { localDate: '2026-06-15' },
      { localDate: '2026-05-01' },
    ]
    expect(filterHistoryDaysToBaseWindow(days, today).map((d) => d.localDate)).toEqual(['2026-07-16', '2026-06-16'])
  })

  it('respeta una ventana custom', () => {
    const today = '2026-07-16'
    const days = [{ localDate: '2026-07-16' }, { localDate: '2026-07-09' }, { localDate: '2026-07-08' }]
    expect(filterHistoryDaysToBaseWindow(days, today, 7).map((d) => d.localDate)).toEqual(['2026-07-16', '2026-07-09'])
  })

  it('el banner se muestra solo sin el addon Pro', () => {
    expect(shouldShowNutritionProHistoryBanner({ hasNutritionPro: false })).toBe(true)
    expect(shouldShowNutritionProHistoryBanner({ hasNutritionPro: true })).toBe(false)
  })
})

describe('nutrition-v2-food-media thumbnails', () => {
  const base = 'https://proj.supabase.co'

  it('arma la URL publica del bucket con path codificado y cache-bust', () => {
    expect(
      foodMediaThumbnailUrl({ bucket: 'food-media', objectPath: 'off/3/012/front.jpg', version: 2 }, base),
    ).toBe('https://proj.supabase.co/storage/v1/object/public/food-media/off/3/012/front.jpg?v=2')
  })

  it('codifica segmentos con espacios preservando los slash', () => {
    expect(
      foodMediaThumbnailUrl({ bucket: 'food-media', objectPath: 'coach/mi foto.png', version: 1 }, base),
    ).toBe('https://proj.supabase.co/storage/v1/object/public/food-media/coach/mi%20foto.png?v=1')
  })

  it('devuelve null sin media o sin base', () => {
    expect(foodMediaThumbnailUrl(null, base)).toBeNull()
    expect(foodMediaThumbnailUrl({ bucket: 'food-media', objectPath: 'x.jpg', version: 1 }, null)).toBeNull()
  })
})

describe('nutrition-v2-food-media placeholder por categoria', () => {
  it('mapea categorias conocidas y cae a otro', () => {
    expect(foodCategoryEmoji('proteina')).toBe('\u{1F357}')
    expect(foodCategoryEmoji('fruta')).toBe('\u{1F34E}')
    expect(foodCategoryEmoji('desconocida')).toBe(foodCategoryEmoji('otro'))
    expect(foodCategoryEmoji(null)).toBe(foodCategoryEmoji('otro'))
  })
})

describe('nutrition-v2-food-media atribucion ODbL', () => {
  it('per-item solo Open Food Facts exige atribucion', () => {
    expect(foodOdblAttributionLine('open_food_facts')).toBe(OPEN_FOOD_FACTS_ODBL_LINE)
    expect(foodOdblAttributionLine('eva')).toBeNull()
    expect(foodOdblAttributionLine('coach')).toBeNull()
    expect(foodOdblAttributionLine(null)).toBeNull()
  })

  it('pie generico se muestra si la lista tiene al menos un item OFF', () => {
    expect(catalogHasOpenFoodFactsSource([{ source: 'eva' }, { source: 'open_food_facts' }])).toBe(true)
    expect(catalogHasOpenFoodFactsSource([{ source: 'eva' }, { source: 'coach' }])).toBe(false)
    expect(catalogHasOpenFoodFactsSource([])).toBe(false)
    expect(CATALOG_ODBL_GENERIC_LINE).toContain('ODbL')
  })
})
