import { describe, expect, it, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// GET usa verifyMobileBearer (lectura); POST usa admin.auth.getUser (mutation:true).
const adminGetUser = vi.fn()
const adminMaybeSingle = vi.fn()
const fakeAdmin = {
  auth: { getUser: (...a: unknown[]) => adminGetUser(...a) },
  from: (table: string) => ({
    select: () => ({ eq: () => ({ maybeSingle: () => adminMaybeSingle(table) }) }),
  }),
}
vi.mock('@/lib/supabase/admin-client', () => ({
  createServiceRoleClient: vi.fn(() => fakeAdmin),
}))

const verifyMobileBearer = vi.fn()
vi.mock('@/lib/mobile-auth', () => ({
  verifyMobileBearer: (...a: unknown[]) => verifyMobileBearer(...a),
}))

const resolveNutritionV2RolloutDecision = vi.fn()
vi.mock('@/services/nutrition-v2-rollout.service', () => ({
  resolveNutritionV2RolloutDecision: (...a: unknown[]) => resolveNutritionV2RolloutDecision(...a),
}))

const userRpc = vi.fn()
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ rpc: userRpc })),
}))

let searchAllowed = true
// Espeja el contrato fail-CLOSED del reporte sin Redis: por default niega.
let reportResult: { ok: true } | { ok: false; retryAfter: number } = { ok: false, retryAfter: 3600 }
const rateLimitNutritionCatalogSearch = vi.fn(async (..._a: unknown[]) =>
  searchAllowed ? { ok: true as const } : { ok: false as const, retryAfter: 45 },
)
const rateLimitNutritionCatalogReport = vi.fn(async (..._a: unknown[]) => reportResult)
vi.mock('@/lib/rate-limit', () => ({
  rateLimitNutritionCatalogSearch: (...a: unknown[]) => rateLimitNutritionCatalogSearch(...a),
  rateLimitNutritionCatalogReport: (...a: unknown[]) => rateLimitNutritionCatalogReport(...a),
  jsonRateLimited: (retryAfter: number) =>
    new Response(JSON.stringify({ error: 'Too many requests', code: 'RATE_LIMIT' }), {
      status: 429,
      headers: { 'Retry-After': String(retryAfter) },
    }),
}))

import { GET, POST } from './route'

const CLIENT_ID = '33333333-3333-4333-8333-333333333333'

function getReq(query = 'operation=search&query=arroz') {
  return new NextRequest(`http://localhost/api/mobile/nutrition-v2/catalog?${query}`, {
    headers: { authorization: 'Bearer tok' },
  })
}

function postReq() {
  return new NextRequest('http://localhost/api/mobile/nutrition-v2/catalog', {
    method: 'POST',
    headers: { authorization: 'Bearer tok', 'content-type': 'application/json' },
    body: JSON.stringify({}),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  searchAllowed = true
  reportResult = { ok: false, retryAfter: 3600 }
  verifyMobileBearer.mockResolvedValue({ ok: true, userId: CLIENT_ID })
  adminGetUser.mockResolvedValue({ data: { user: { id: CLIENT_ID } }, error: null })
  adminMaybeSingle.mockImplementation((table: string) =>
    table === 'clients'
      ? { data: { id: CLIENT_ID, coach_id: 'coach-1', team_id: null, org_id: null }, error: null }
      : { data: null, error: null },
  )
  resolveNutritionV2RolloutDecision.mockResolvedValue({ enabled: true, reason: 'test' })
  userRpc.mockResolvedValue({ data: { schemaVersion: 1, items: [], nextCursor: null, hasMore: false }, error: null })
})

describe('GET /api/mobile/nutrition-v2/catalog · rate limit', () => {
  it('429 cuando el limitador de busqueda niega, sin tocar la RPC', async () => {
    searchAllowed = false
    const res = await GET(getReq())
    expect(res.status).toBe(429)
    expect(rateLimitNutritionCatalogSearch).toHaveBeenCalledWith(CLIENT_ID)
    expect(userRpc).not.toHaveBeenCalled()
  })
})

describe('POST /api/mobile/nutrition-v2/catalog · rate limit (reporte fail-closed sin Redis)', () => {
  it('429 cuando el limitador de reporte niega, sin tocar la RPC ni leer el body', async () => {
    // reportResult = fail-closed (lo que devuelve el limitador real sin Redis).
    const res = await POST(postReq())
    expect(res.status).toBe(429)
    expect(rateLimitNutritionCatalogReport).toHaveBeenCalledWith(CLIENT_ID)
    expect(userRpc).not.toHaveBeenCalled()
  })
})
