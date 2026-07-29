import { describe, expect, it, vi, beforeEach } from 'vitest'

// --- Mocks de las dependencias de authorizeCoach + del motor de entitlements ---
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/services/entitlements.service', () => ({ hasModule: vi.fn(), assertModule: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/services/auth/workspace-render-cache', () => ({ getPreferredWorkspaceForRender: vi.fn() }))
vi.mock('@/services/nutrition-v2-rollout.service', () => ({ isNutritionV2Enabled: vi.fn() }))
vi.mock('@/services/nutrition-v2-read.service', () => ({ nutritionV2CoachScopeFromWorkspace: vi.fn() }))
vi.mock('@/app/coach/nutrition-plans/_data/nutrition-page.queries', () => ({
  getNutritionPlansPageCoach: vi.fn(),
}))

import { hasModule } from '@/services/entitlements.service'
import { createClient } from '@/lib/supabase/server'
import { getPreferredWorkspaceForRender } from '@/services/auth/workspace-render-cache'
import { isNutritionV2Enabled } from '@/services/nutrition-v2-rollout.service'
import { nutritionV2CoachScopeFromWorkspace } from '@/services/nutrition-v2-read.service'
import { getNutritionPlansPageCoach } from '@/app/coach/nutrition-plans/_data/nutrition-page.queries'
import { publishPlanAction } from './builder.actions'

const COACH_ID = '22222222-2222-4222-8222-222222222222'
const CLIENT_ID = '11111111-1111-4111-8111-111111111111'

// NUT-011: la persistencia entera va por UNA RPC transaccional. El fake devuelve la version
// publicada; el `from` queda para las lecturas del freeze (aqui ninguna: drafts sin items).
// Solo se alcanza si el gate Pro pasa.
const PUBLISHED_VERSION = '55555555-5555-4555-8555-555555555555'
const PUBLISHED_PLAN = '66666666-6666-4666-8666-666666666666'
const dbFrom = vi.fn(() => ({
  select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: null, error: null })) })) })),
}))
const dbRpc = vi.fn(async () => ({
  data: { versionId: PUBLISHED_VERSION, planId: PUBLISHED_PLAN },
  error: null,
}))
const dbMock = { from: dbFrom, rpc: dbRpc }

function draft(overrides: Record<string, unknown> = {}) {
  return {
    clientId: CLIENT_ID,
    name: 'Plan',
    strategy: 'flexible' as const,
    timezone: 'America/Santiago',
    permissions: {},
    dayVariants: [{ key: 'default', label: 'Todos los dias', targets: {}, mealSlots: [] }],
    ...overrides,
  }
}

const variant = (key: string) => ({ key, label: key, targets: {}, mealSlots: [] })

function input(draftOverrides: Record<string, unknown> = {}) {
  return {
    draft: draft(draftOverrides),
    idempotencyKey: 'idem-key-1234567',
    effectiveFrom: '2026-07-15',
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getNutritionPlansPageCoach).mockResolvedValue({ user: { id: COACH_ID } } as never)
  vi.mocked(getPreferredWorkspaceForRender).mockResolvedValue({ type: 'coach_standalone' } as never)
  vi.mocked(isNutritionV2Enabled).mockResolvedValue(true)
  vi.mocked(nutritionV2CoachScopeFromWorkspace).mockReturnValue({
    scopeType: 'standalone',
    teamId: null,
    orgId: null,
  } as never)
  vi.mocked(createClient).mockResolvedValue(dbMock as never)
})

describe('publishPlanAction — gate del addon Nutricion Pro', () => {
  it('SIN addon: hibrida => UPGRADE_REQUIRED (no 500), sin tocar la DB', async () => {
    vi.mocked(hasModule).mockResolvedValue(false)
    const res = await publishPlanAction(input({ strategy: 'hybrid' }))
    expect(res).toMatchObject({ ok: false, code: 'UPGRADE_REQUIRED', feature: 'hybrid_strategy' })
    expect(dbFrom).not.toHaveBeenCalled()
    expect(dbRpc).not.toHaveBeenCalled()
  })

  it('SIN addon: mas de una variante => UPGRADE_REQUIRED', async () => {
    vi.mocked(hasModule).mockResolvedValue(false)
    const res = await publishPlanAction(input({ dayVariants: [variant('a'), variant('b')] }))
    expect(res).toMatchObject({ ok: false, code: 'UPGRADE_REQUIRED', feature: 'multi_variant' })
  })

  it('SIN addon: notas privadas => UPGRADE_REQUIRED', async () => {
    vi.mocked(hasModule).mockResolvedValue(false)
    const res = await publishPlanAction(input({ privateNotes: 'nota clinica' }))
    expect(res).toMatchObject({ ok: false, code: 'UPGRADE_REQUIRED', feature: 'private_notes' })
  })

  it('SIN addon: protocolo => UPGRADE_REQUIRED', async () => {
    vi.mocked(hasModule).mockResolvedValue(false)
    const res = await publishPlanAction(input({ protocolNotes: 'protocolo' }))
    expect(res).toMatchObject({ ok: false, code: 'UPGRADE_REQUIRED', feature: 'protocol_notes' })
  })

  it('CON addon: hibrida pasa el gate y prosigue la publicacion', async () => {
    vi.mocked(hasModule).mockResolvedValue(true)
    const res = await publishPlanAction(input({ strategy: 'hybrid' }))
    expect(res).toMatchObject({ ok: true, versionId: PUBLISHED_VERSION, planId: PUBLISHED_PLAN })
    expect(dbRpc).toHaveBeenCalledWith('persist_and_publish_nutrition_plan_v2', expect.anything())
  })

  it('BASE sin addon: flexible con 1 variante publica sin friccion (gate se salta)', async () => {
    vi.mocked(hasModule).mockResolvedValue(false)
    const res = await publishPlanAction(input({ strategy: 'flexible' }))
    expect(res).toMatchObject({ ok: true, versionId: PUBLISHED_VERSION, planId: PUBLISHED_PLAN })
    // El gate ni consulta el entitlement cuando el draft es BASE.
    expect(hasModule).not.toHaveBeenCalled()
  })

  it('BASE sin addon: structured con 1 variante tambien publica (structured = BASE, CEO)', async () => {
    vi.mocked(hasModule).mockResolvedValue(false)
    const res = await publishPlanAction(input({ strategy: 'structured' }))
    expect(res).toMatchObject({ ok: true })
    expect(hasModule).not.toHaveBeenCalled()
  })
})
