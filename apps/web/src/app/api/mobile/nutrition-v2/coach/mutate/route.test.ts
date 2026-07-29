// NUT-005 — el endpoint de escrituras del coach movil es la barrera que RN no tenia:
// rollout (Edge Config), pertenencia al workspace y entitlement "Nutricion Pro" se re-validan
// SERVER-SIDE, y la persistencia corre con el cliente RLS del propio coach (nunca service_role).
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { NutritionPlanDraftSchema, type NutritionPlanDraft } from '@eva/nutrition-v2'

const getUser = vi.fn()
const adminMaybeSingle = vi.fn()
const fakeAdmin = {
  auth: { getUser: (...a: unknown[]) => getUser(...a) },
  from: (table: string) => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      is: () => chain,
      maybeSingle: () => adminMaybeSingle(table),
    }
    return chain
  },
}
vi.mock('@/lib/supabase/admin-client', () => ({
  createServiceRoleClient: vi.fn(() => fakeAdmin),
}))
vi.mock('@/lib/mobile-auth', () => ({
  verifyMobileBearer: vi.fn(async () => ({ ok: true, userId: COACH })),
  isBlockedClientRow: () => false,
}))

const resolveNutritionV2RolloutDecision = vi.fn()
vi.mock('@/services/nutrition-v2-rollout.service', () => ({
  resolveNutritionV2RolloutDecision: (...a: unknown[]) => resolveNutritionV2RolloutDecision(...a),
}))

const userRpc = vi.fn()
const userClient = { rpc: userRpc }
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => userClient),
}))

vi.mock('@/lib/rate-limit', () => ({
  rateLimitNutritionCoachWrite: vi.fn(async () => ({ ok: true })),
  jsonRateLimited: vi.fn(),
}))

const hasNutritionProV2 = vi.fn()
vi.mock('@/app/coach/nutrition-v2/_lib/nutrition-pro', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return { ...actual, hasNutritionProV2: (...a: unknown[]) => hasNutritionProV2(...a) }
})

const persistAndPublishDraft = vi.fn()
const resolveActiveClientPlanId = vi.fn()
vi.mock('@/app/coach/nutrition-v2/_actions/plan-persistence', () => ({
  persistAndPublishDraft: (...a: unknown[]) => persistAndPublishDraft(...a),
  resolveActiveClientPlanId: (...a: unknown[]) => resolveActiveClientPlanId(...a),
}))

const COACH = '99999999-9999-4999-8999-999999999999'
const CLIENT = '11111111-1111-4111-8111-111111111111'
const TEAM_ID = '22222222-2222-4222-8222-222222222222'
const PLAN_ROOT = '33333333-3333-4333-8333-333333333333'
const VERSION_ID = '44444444-4444-4444-8444-444444444444'

import { POST } from './route'

const SCOPE = { scopeType: 'standalone', teamId: null, orgId: null }

function draft(overrides: Record<string, unknown> = {}): NutritionPlanDraft {
  return NutritionPlanDraftSchema.parse({
    planId: PLAN_ROOT,
    clientId: CLIENT,
    name: 'Plan',
    strategy: 'structured',
    timezone: 'America/Santiago',
    permissions: {},
    dayVariants: [
      {
        key: 'default',
        label: 'Todos los dias',
        default: true,
        targets: { calories: 2000, proteinG: 150, carbsG: 200, fatsG: 60 },
        mealSlots: [
          { code: 'slot-1', name: 'Desayuno', startTime: '08:00', items: [{ customName: 'Avena', quantity: 80, unit: 'g' }] },
        ],
      },
    ],
    ...overrides,
  })
}

function req(body: unknown) {
  return new NextRequest('http://localhost/api/mobile/nutrition-v2/coach/mutate', {
    method: 'POST',
    headers: { authorization: 'Bearer tok', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function admin(rowsByTable: Record<string, unknown>) {
  adminMaybeSingle.mockImplementation((table: string) => ({ data: rowsByTable[table] ?? null, error: null }))
}

beforeEach(() => {
  vi.clearAllMocks()
  getUser.mockResolvedValue({ data: { user: { id: COACH } }, error: null })
  admin({ coaches: { id: COACH }, clients: { id: CLIENT }, team_members: { id: 'tm' }, teams: { id: TEAM_ID } })
  resolveNutritionV2RolloutDecision.mockResolvedValue({ enabled: true, reason: 'global_on' })
  hasNutritionProV2.mockResolvedValue(true)
  persistAndPublishDraft.mockResolvedValue({ ok: true, versionId: VERSION_ID, planId: PLAN_ROOT })
})

describe('POST coach/mutate · gate de rollout y workspace', () => {
  it('rollout OFF => 404 NUTRITION_V2_DISABLED y NO persiste nada', async () => {
    resolveNutritionV2RolloutDecision.mockResolvedValue({ enabled: false, reason: 'mode_off' })
    const res = await POST(req({ action: 'publish', workspace: SCOPE, draft: draft(), idempotencyKey: 'publish:key:abcdef', effectiveFrom: '2026-07-28' }))
    const body = await res.json()
    expect(res.status).toBe(404)
    expect(body.code).toBe('NUTRITION_V2_DISABLED')
    expect(persistAndPublishDraft).not.toHaveBeenCalled()
  })

  it('workspace ajeno (team sin membresia) => 403 y sin consultar el rollout', async () => {
    admin({ coaches: { id: COACH }, teams: { id: TEAM_ID } })
    const res = await POST(
      req({
        action: 'publish',
        workspace: { scopeType: 'team', teamId: TEAM_ID, orgId: null },
        draft: draft(),
        idempotencyKey: 'publish:key:abcdef',
        effectiveFrom: '2026-07-28',
      }),
    )
    expect(res.status).toBe(403)
    expect(resolveNutritionV2RolloutDecision).not.toHaveBeenCalled()
    expect(persistAndPublishDraft).not.toHaveBeenCalled()
  })

  it('sesion invalida => 401', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { message: 'bad' } })
    const res = await POST(req({ action: 'publish', workspace: SCOPE, draft: draft(), idempotencyKey: 'publish:key:abcdef', effectiveFrom: '2026-07-28' }))
    expect(res.status).toBe(401)
  })

  it('accion desconocida => 400', async () => {
    const res = await POST(req({ action: 'nope', workspace: SCOPE }))
    expect(res.status).toBe(400)
  })
})

describe('POST coach/mutate · publish', () => {
  it('persiste con el cliente RLS del usuario y devuelve la version publicada', async () => {
    const res = await POST(req({ action: 'publish', workspace: SCOPE, draft: draft(), idempotencyKey: 'publish:key:abcdef', effectiveFrom: '2026-07-28', expectedCurrentVersionId: VERSION_ID }))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body).toMatchObject({ ok: true, versionId: VERSION_ID, planId: PLAN_ROOT })
    expect(persistAndPublishDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        db: userClient,
        userId: COACH,
        idempotencyKey: 'publish:key:abcdef',
        effectiveFrom: '2026-07-28',
        expectedCurrentVersionId: VERSION_ID,
      }),
    )
  })

  it('reintento con la MISMA clave: la idempotencia vive en el payload, no en el transporte', async () => {
    const payload = { action: 'publish', workspace: SCOPE, draft: draft(), idempotencyKey: 'publish:key:abcdef', effectiveFrom: '2026-07-28' }
    await POST(req(payload))
    await POST(req(payload))
    const keys = persistAndPublishDraft.mock.calls.map((c) => (c[0] as { idempotencyKey: string }).idempotencyKey)
    expect(keys).toEqual(['publish:key:abcdef', 'publish:key:abcdef'])
  })

  it('sin addon Pro un draft hibrido => 403 UPGRADE_REQUIRED sin escribir', async () => {
    hasNutritionProV2.mockResolvedValue(false)
    const res = await POST(req({ action: 'publish', workspace: SCOPE, draft: draft({ strategy: 'hybrid' }), idempotencyKey: 'publish:key:abcdef', effectiveFrom: '2026-07-28' }))
    const body = await res.json()
    expect(res.status).toBe(403)
    expect(body.code).toBe('UPGRADE_REQUIRED')
    expect(body.feature).toBe('hybrid_strategy')
    expect(persistAndPublishDraft).not.toHaveBeenCalled()
  })

  it('sin addon Pro un draft BASE publica igual (la frontera es por capacidad)', async () => {
    hasNutritionProV2.mockResolvedValue(false)
    const res = await POST(req({ action: 'publish', workspace: SCOPE, draft: draft(), idempotencyKey: 'publish:key:abcdef', effectiveFrom: '2026-07-28' }))
    expect(res.status).toBe(200)
    expect(persistAndPublishDraft).toHaveBeenCalledTimes(1)
  })

  it('draft invalido => 400 INVALID_PAYLOAD', async () => {
    const res = await POST(req({ action: 'publish', workspace: SCOPE, draft: { nope: true }, idempotencyKey: 'publish:key:abcdef', effectiveFrom: '2026-07-28' }))
    const body = await res.json()
    expect(res.status).toBe(400)
    expect(body.code).toBe('INVALID_PAYLOAD')
  })
})

describe('POST coach/mutate · assign', () => {
  it('relee la FUENTE con la RPC scoped antes de copiar nada (NUT-012)', async () => {
    userRpc.mockResolvedValue({ data: null, error: null })
    await POST(
      req({
        action: 'assign',
        workspace: SCOPE,
        sourceClientId: CLIENT,
        expectedVersionId: VERSION_ID,
        targetClientIds: ['66666666-6666-4666-8666-666666666666'],
        effectiveFrom: '2026-07-28',
        operationId: 'assign-op-123456',
      }),
    )
    expect(userRpc).toHaveBeenCalledWith(
      'get_nutrition_client_detail_scoped_v2',
      expect.objectContaining({ p_client_id: CLIENT, p_scope_type: 'standalone' }),
    )
  })

  it('si la fuente no se puede releer NO copia nada (fail-closed, sin plan viejo propagado)', async () => {
    userRpc.mockResolvedValue({ data: null, error: { message: 'denied', code: '42501' } })
    const res = await POST(
      req({
        action: 'assign',
        workspace: SCOPE,
        sourceClientId: CLIENT,
        expectedVersionId: VERSION_ID,
        targetClientIds: ['66666666-6666-4666-8666-666666666666'],
        effectiveFrom: '2026-07-28',
        operationId: 'assign-op-123456',
      }),
    )
    const body = await res.json()
    expect(res.status).toBe(403)
    expect(body.code).toBe('SCOPE_DENIED')
    expect(persistAndPublishDraft).not.toHaveBeenCalled()
  })

  it('seleccion invalida (la fuente entre los destinos) => 400 sin releer ni escribir', async () => {
    const res = await POST(
      req({
        action: 'assign',
        workspace: SCOPE,
        sourceClientId: CLIENT,
        expectedVersionId: VERSION_ID,
        targetClientIds: [CLIENT],
        effectiveFrom: '2026-07-28',
        operationId: 'assign-op-123456',
      }),
    )
    expect(res.status).toBe(400)
    expect(userRpc).not.toHaveBeenCalled()
    expect(persistAndPublishDraft).not.toHaveBeenCalled()
  })
})

describe('POST coach/mutate · archive', () => {
  it('valida los ids y no escribe con un payload malformado', async () => {
    const res = await POST(req({ action: 'archive', workspace: SCOPE, clientId: 'no-uuid', planId: PLAN_ROOT }))
    expect(res.status).toBe(400)
  })
})
