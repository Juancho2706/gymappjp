import { describe, expect, it, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const verifyMobileBearer = vi.fn()
vi.mock('@/lib/mobile-auth', () => ({
  verifyMobileBearer: (...a: unknown[]) => verifyMobileBearer(...a),
}))

const adminMaybeSingle = vi.fn()
const fakeAdmin = {
  from: (table: string) => ({
    select: () => ({
      eq: () => ({
        maybeSingle: () => adminMaybeSingle(table),
      }),
    }),
  }),
}
vi.mock('@/lib/supabase/admin-client', () => ({
  createServiceRoleClient: vi.fn(() => fakeAdmin),
}))

const resolveNutritionV2RolloutDecision = vi.fn()
vi.mock('@/services/nutrition-v2-rollout.service', () => ({
  resolveNutritionV2RolloutDecision: (...a: unknown[]) => resolveNutritionV2RolloutDecision(...a),
}))

const userRpc = vi.fn()
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ rpc: userRpc })),
}))

import { GET } from './route'

const TEAM_ID = '11111111-1111-4111-8111-111111111111'
const ORG_ID = '22222222-2222-4222-8222-222222222222'
const CLIENT_ID = '33333333-3333-4333-8333-333333333333'

const EMPTY_HUB_PAGE = {
  schemaVersion: 1,
  generatedAt: '2026-07-14T00:00:00.000Z',
  items: [],
  nextCursor: null,
  hasMore: false,
}

function req(query: string) {
  return new NextRequest(`http://localhost/api/mobile/nutrition-v2/coach?${query}`, {
    headers: { authorization: 'Bearer tok' },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  verifyMobileBearer.mockResolvedValue({ ok: true, userId: 'coach-1' })
  // Gate: the caller is a coach (coaches row present), not a student.
  adminMaybeSingle.mockImplementation((table: string) =>
    table === 'coaches' ? { data: { id: 'coach-1' }, error: null } : { data: null, error: null },
  )
  resolveNutritionV2RolloutDecision.mockResolvedValue({ enabled: true, reason: 'test' })
  userRpc.mockResolvedValue({ data: EMPTY_HUB_PAGE, error: null })
})

describe('GET /api/mobile/nutrition-v2/coach · workspace scope', () => {
  it('400 con scopeType desconocido y NO toca la RPC', async () => {
    const res = await GET(req('view=hub&scopeType=bogus'))
    const body = await res.json()
    expect(res.status).toBe(400)
    expect(body.code).toBe('INVALID_WORKSPACE_SCOPE')
    expect(userRpc).not.toHaveBeenCalled()
  })

  it('400 cuando el scope team no trae teamId (invariante cruzada)', async () => {
    const res = await GET(req('view=hub&scopeType=team'))
    expect(res.status).toBe(400)
    expect(userRpc).not.toHaveBeenCalled()
  })

  it('acepta standalone y llama la RPC scoped del hub', async () => {
    const res = await GET(req('view=hub&scopeType=standalone'))
    expect(res.status).toBe(200)
    expect(userRpc).toHaveBeenCalledWith(
      'get_nutrition_coach_hub_scoped_v2',
      expect.objectContaining({ p_scope_type: 'standalone', p_team_id: null, p_org_id: null }),
    )
  })

  it('acepta team con teamId y propaga p_team_id', async () => {
    const res = await GET(req(`view=hub&scopeType=team&teamId=${TEAM_ID}`))
    expect(res.status).toBe(200)
    expect(userRpc).toHaveBeenCalledWith(
      'get_nutrition_coach_hub_scoped_v2',
      expect.objectContaining({ p_scope_type: 'team', p_team_id: TEAM_ID, p_org_id: null }),
    )
  })

  it('acepta organization con orgId y propaga p_org_id', async () => {
    const res = await GET(req(`view=hub&scopeType=organization&orgId=${ORG_ID}`))
    expect(res.status).toBe(200)
    expect(userRpc).toHaveBeenCalledWith(
      'get_nutrition_coach_hub_scoped_v2',
      expect.objectContaining({ p_scope_type: 'organization', p_team_id: null, p_org_id: ORG_ID }),
    )
  })

  it('la ficha usa la RPC scoped de detalle con clientId + scope', async () => {
    userRpc.mockResolvedValue({ data: null, error: { message: 'stop', code: 'STOP' } })
    const res = await GET(req(`view=client&clientId=${CLIENT_ID}&scopeType=team&teamId=${TEAM_ID}`))
    // rpcErrorResponse mapea un error no-42501 a 500; lo que importa es la llamada scoped.
    expect(res.status).toBe(500)
    expect(userRpc).toHaveBeenCalledWith('get_nutrition_client_detail_scoped_v2', {
      p_client_id: CLIENT_ID,
      p_scope_type: 'team',
      p_team_id: TEAM_ID,
      p_org_id: null,
      p_local_date: expect.any(String),
      p_timezone: 'America/Santiago',
    })
  })
})
