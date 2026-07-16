import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'

// Sin UPSTASH_REDIS_* el limitador queda null: comportamiento por default (dev/preview sin Redis).
// Valida el contrato de la decision: intake/catalog-search/coach-write fail-OPEN; catalog-report
// fail-CLOSED (espeja rateLimitCardChange).
beforeEach(() => {
  vi.stubEnv('UPSTASH_REDIS_REST_URL', '')
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

import {
  rateLimitNutritionCatalogReport,
  rateLimitNutritionCatalogSearch,
  rateLimitNutritionCoachWrite,
  rateLimitNutritionIntake,
} from './rate-limit'

describe('rate limiters Nutrición V2 · sin Redis', () => {
  it('rateLimitNutritionIntake permite (fail-open)', async () => {
    expect(await rateLimitNutritionIntake('u1')).toEqual({ ok: true })
  })

  it('rateLimitNutritionCatalogSearch permite (fail-open)', async () => {
    expect(await rateLimitNutritionCatalogSearch('u1')).toEqual({ ok: true })
  })

  it('rateLimitNutritionCoachWrite permite (fail-open)', async () => {
    expect(await rateLimitNutritionCoachWrite('c1')).toEqual({ ok: true })
  })

  it('rateLimitNutritionCatalogReport niega (fail-closed)', async () => {
    expect(await rateLimitNutritionCatalogReport('u1')).toEqual({ ok: false, retryAfter: 3600 })
  })
})
