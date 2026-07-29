import { describe, expect, it, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const verifyMobileBearer = vi.fn()
vi.mock('@/lib/mobile-auth', () => ({
  verifyMobileBearer: (...a: unknown[]) => verifyMobileBearer(...a),
}))

// Fake admin encadenable: el gate y el helper de contexto usan `.select().eq()*.is()*.maybeSingle()`
// sobre varias tablas (coaches, clients, team_members, teams, organization_members,
// coach_client_assignments). Se responde por TABLA para poder simular pertenencias.
const adminMaybeSingle = vi.fn()
const fakeAdmin = {
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

/** Respuestas por tabla; lo no declarado devuelve `null` (fail-closed). */
function admin(rowsByTable: Record<string, unknown>) {
  adminMaybeSingle.mockImplementation((table: string) => ({
    data: rowsByTable[table] ?? null,
    error: null,
  }))
}

beforeEach(() => {
  vi.clearAllMocks()
  verifyMobileBearer.mockResolvedValue({ ok: true, userId: 'coach-1' })
  // Por defecto: coach standalone, sin fila de alumno, con membresias vivas donde se pidan.
  admin({
    coaches: { id: 'coach-1' },
    team_members: { id: 'tm-1' },
    teams: { id: TEAM_ID },
    organization_members: { id: 'om-1' },
  })
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

// NUT-013: el rollout se resolvia con teamId/orgId/clientId en null para CUALQUIER coach, asi que un
// canary por Team o por alumno encendia la UI (config/route si manda el scope) y esta ruta devolvia
// 404. Ahora el contexto se arma ANTES del gate con el workspace declarado y el alumno validado.
describe('GET /api/mobile/nutrition-v2/coach · contexto de rollout (NUT-013)', () => {
  it('allowlist por Team: el scope declarado llega al resolver y la lectura pasa (200)', async () => {
    const res = await GET(req(`view=hub&scopeType=team&teamId=${TEAM_ID}`))
    expect(res.status).toBe(200)
    expect(resolveNutritionV2RolloutDecision).toHaveBeenCalledWith(
      expect.objectContaining({
        surface: 'mobileCoach',
        userId: 'coach-1',
        coachId: 'coach-1',
        teamId: TEAM_ID,
        orgId: null,
        clientId: null,
      }),
    )
  })

  it('workspace AJENO (sin membresia activa): 403 y jamas se consulta el rollout', async () => {
    admin({ coaches: { id: 'coach-1' }, teams: { id: TEAM_ID } }) // sin fila en team_members
    const res = await GET(req(`view=hub&scopeType=team&teamId=${TEAM_ID}`))
    const body = await res.json()
    expect(res.status).toBe(403)
    expect(body.code).toBe('WORKSPACE_NOT_ALLOWED')
    expect(resolveNutritionV2RolloutDecision).not.toHaveBeenCalled()
    expect(userRpc).not.toHaveBeenCalled()
  })

  it('coach fuera de todo canary: 404 NUTRITION_V2_DISABLED', async () => {
    resolveNutritionV2RolloutDecision.mockResolvedValue({ enabled: false, reason: 'not_in_canary' })
    const res = await GET(req('view=hub&scopeType=standalone'))
    const body = await res.json()
    expect(res.status).toBe(404)
    expect(body.code).toBe('NUTRITION_V2_DISABLED')
    expect(userRpc).not.toHaveBeenCalled()
  })

  it('canary por alumno: el clientId de la ficha viaja si el workspace lo posee', async () => {
    admin({ coaches: { id: 'coach-1' }, clients: { id: CLIENT_ID } })
    await GET(req(`view=client&clientId=${CLIENT_ID}&scopeType=standalone`))
    expect(resolveNutritionV2RolloutDecision).toHaveBeenCalledWith(
      expect.objectContaining({ surface: 'mobileCoach', coachId: 'coach-1', clientId: CLIENT_ID }),
    )
  })

  it('clientId AJENO al workspace: se ignora (canary global del coach), no autoriza nada', async () => {
    admin({ coaches: { id: 'coach-1' } }) // el lookup de `clients` no devuelve fila
    await GET(req(`view=client&clientId=${CLIENT_ID}&scopeType=standalone`))
    expect(resolveNutritionV2RolloutDecision).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: null }),
    )
  })

  it('coach que ADEMAS es alumno de otro coach: su membresia de alumno no contamina el contexto', async () => {
    admin({
      coaches: { id: 'coach-1' },
      // Fila `clients` del PROPIO usuario (cuenta que tambien es alumno): team/org ajenos.
      clients: { id: 'coach-1', coach_id: 'otro-coach', team_id: ORG_ID, org_id: null },
    })
    await GET(req('view=hub&scopeType=standalone'))
    expect(resolveNutritionV2RolloutDecision).toHaveBeenCalledWith(
      expect.objectContaining({ coachId: 'coach-1', teamId: null, orgId: null, clientId: null }),
    )
  })
})
