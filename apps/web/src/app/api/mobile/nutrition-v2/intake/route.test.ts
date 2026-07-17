import { describe, expect, it, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Gate (mutation:true) resuelve el token via admin.auth.getUser + valida workspace.
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

let intakeAllowed = true
const rateLimitNutritionIntake = vi.fn(async (..._a: unknown[]) =>
  intakeAllowed ? { ok: true as const } : { ok: false as const, retryAfter: 30 },
)
vi.mock('@/lib/rate-limit', () => ({
  rateLimitNutritionIntake: (...a: unknown[]) => rateLimitNutritionIntake(...a),
  jsonRateLimited: (retryAfter: number) =>
    new Response(JSON.stringify({ error: 'Too many requests', code: 'RATE_LIMIT' }), {
      status: 429,
      headers: { 'Retry-After': String(retryAfter) },
    }),
}))

import { POST } from './route'

const CLIENT_ID = '33333333-3333-4333-8333-333333333333'

function req() {
  return new NextRequest('http://localhost/api/mobile/nutrition-v2/intake', {
    method: 'POST',
    headers: { authorization: 'Bearer tok', 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'record', payload: {} }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  intakeAllowed = true
  adminGetUser.mockResolvedValue({ data: { user: { id: CLIENT_ID } }, error: null })
  adminMaybeSingle.mockImplementation((table: string) =>
    table === 'clients'
      ? { data: { id: CLIENT_ID, coach_id: 'coach-1', team_id: null, org_id: null }, error: null }
      : { data: null, error: null },
  )
  resolveNutritionV2RolloutDecision.mockResolvedValue({ enabled: true, reason: 'test' })
})

describe('POST /api/mobile/nutrition-v2/intake · rate limit', () => {
  it('429 cuando el limitador de registro niega, sin tocar la RPC ni leer el body', async () => {
    intakeAllowed = false
    const res = await POST(req())
    expect(res.status).toBe(429)
    expect(rateLimitNutritionIntake).toHaveBeenCalledWith(CLIENT_ID)
    expect(userRpc).not.toHaveBeenCalled()
  })

  it('deja pasar cuando el limitador permite (llega a parsear la accion)', async () => {
    intakeAllowed = true
    const res = await POST(req())
    // Payload vacio => 400 INVALID_PAYLOAD, pero NUNCA 429: el limitador permitio.
    expect(res.status).not.toBe(429)
    expect(rateLimitNutritionIntake).toHaveBeenCalledWith(CLIENT_ID)
  })
})
