import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Server actions de la cola de curacion V2 (hub coach).
 *
 * Foco de NUT-014 / NUT-023: el workspace activo VIAJA al servidor en cada operacion
 * (`p_scope_type` / `p_team_id` / `p_org_id` derivados de `getPreferredWorkspaceForRender`),
 * un workspace que no es de coach corta antes de tocar la DB (`SCOPE_REQUIRED`), y el
 * `P0002` de las RPC scoped (cero filas actualizadas) se reporta como
 * `CURATION_ALREADY_RESOLVED` en vez de un exito falso.
 */

const { createClientMock, revalidatePathMock, coachMock, rolloutMock, workspaceMock, rateLimitMock } =
  vi.hoisted(() => ({
    createClientMock: vi.fn(),
    revalidatePathMock: vi.fn(),
    coachMock: vi.fn(),
    rolloutMock: vi.fn(),
    workspaceMock: vi.fn(),
    rateLimitMock: vi.fn(),
  }))

vi.mock('@/lib/supabase/server', () => ({ createClient: createClientMock }))
vi.mock('next/cache', () => ({
  revalidatePath: revalidatePathMock,
  unstable_noStore: vi.fn(),
}))
vi.mock('@/lib/rate-limit', () => ({ rateLimitNutritionCoachWrite: rateLimitMock }))
vi.mock('@/services/auth/workspace-render-cache', () => ({
  getPreferredWorkspaceForRender: workspaceMock,
}))
vi.mock('@/services/nutrition-v2-rollout.service', () => ({ isNutritionV2Enabled: rolloutMock }))
vi.mock('@/app/coach/nutrition-plans/_data/nutrition-page.queries', () => ({
  getNutritionPlansPageCoach: coachMock,
}))

import {
  createCoachFoodForCurationAction,
  listMissingFoodCodesHubAction,
  resolveMissingFoodCodeHubAction,
} from '@/app/coach/nutrition-v2/_actions/curation.actions'

const COACH_ID = '11111111-1111-4111-8111-111111111111'
const TEAM_ID = '22222222-2222-4222-8222-222222222222'
const ORG_ID = '33333333-3333-4333-8333-333333333333'
const MISSING_ID = '44444444-4444-4444-8444-444444444444'
const FOOD_ID = '55555555-5555-4555-8555-555555555555'

type Result = { data: unknown; error: { message: string; code?: string } | null }

function mockDb(result: Result = { data: null, error: null }) {
  const rpc = vi.fn(async () => result)
  createClientMock.mockResolvedValue({ rpc })
  return rpc
}

const TEAM_WORKSPACE = { type: 'coach_team', userId: COACH_ID, coachId: COACH_ID, teamId: TEAM_ID, label: 'Team' }
const STANDALONE_WORKSPACE = { type: 'coach_standalone', userId: COACH_ID, coachId: COACH_ID, label: 'Solo' }
const STUDENT_WORKSPACE = { type: 'student_standalone', userId: COACH_ID, clientId: COACH_ID, coachId: COACH_ID, label: 'Alumno' }

const CREATE_INPUT = {
  missingCodeId: MISSING_ID,
  name: 'Yogur natural',
  brand: 'Soprole',
  unit: 'g' as const,
  calories: 60,
  proteinG: 4,
  carbsG: 5,
  fatsG: 2,
}

beforeEach(() => {
  createClientMock.mockReset()
  revalidatePathMock.mockReset()
  coachMock.mockReset()
  rolloutMock.mockReset()
  workspaceMock.mockReset()
  rateLimitMock.mockReset()

  coachMock.mockResolvedValue({ user: { id: COACH_ID } })
  rolloutMock.mockResolvedValue(true)
  rateLimitMock.mockResolvedValue({ ok: true })
  workspaceMock.mockResolvedValue(TEAM_WORKSPACE)
})

describe('listMissingFoodCodesHubAction', () => {
  it('pasa el scope de equipo derivado del workspace a la RPC scoped', async () => {
    const rpc = mockDb({ data: [], error: null })
    const res = await listMissingFoodCodesHubAction({ offset: 20 })
    expect(res.ok).toBe(true)
    expect(rpc).toHaveBeenCalledWith('list_missing_food_codes_scoped_v2', {
      p_scope_type: 'team',
      p_team_id: TEAM_ID,
      p_org_id: null,
      p_offset: 20,
      p_page_size: 21,
    })
  })

  it('pasa el scope standalone (sin team ni org)', async () => {
    workspaceMock.mockResolvedValue(STANDALONE_WORKSPACE)
    const rpc = mockDb({ data: [], error: null })
    await listMissingFoodCodesHubAction({ offset: 0 })
    expect(rpc).toHaveBeenCalledWith(
      'list_missing_food_codes_scoped_v2',
      expect.objectContaining({ p_scope_type: 'standalone', p_team_id: null, p_org_id: null }),
    )
  })

  it('pasa el scope de organizacion tal cual (la RPC lo resuelve fail-closed)', async () => {
    workspaceMock.mockResolvedValue({
      type: 'enterprise_coach',
      userId: COACH_ID,
      coachId: COACH_ID,
      orgId: ORG_ID,
      memberId: 'm1',
      label: 'Org',
    })
    const rpc = mockDb({ data: [], error: null })
    await listMissingFoodCodesHubAction({ offset: 0 })
    expect(rpc).toHaveBeenCalledWith(
      'list_missing_food_codes_scoped_v2',
      expect.objectContaining({ p_scope_type: 'organization', p_team_id: null, p_org_id: ORG_ID }),
    )
  })

  it('sin workspace de coach devuelve SCOPE_REQUIRED sin tocar la DB', async () => {
    workspaceMock.mockResolvedValue(STUDENT_WORKSPACE)
    const res = await listMissingFoodCodesHubAction({ offset: 0 })
    expect(res).toMatchObject({ ok: false, code: 'SCOPE_REQUIRED' })
    expect(createClientMock).not.toHaveBeenCalled()
  })

  it('recorta a 20 y avanza el offset cuando llegan 21 filas', async () => {
    const rows = Array.from({ length: 21 }, (_, i) => ({
      id: `id-${i}`,
      barcode: '7801234567890',
      country_code: 'CL',
      sightings: 1,
      first_seen_at: '2026-07-01T00:00:00.000Z',
      last_seen_at: '2026-07-10T00:00:00.000Z',
    }))
    mockDb({ data: rows, error: null })
    const res = await listMissingFoodCodesHubAction({ offset: 0 })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.items).toHaveLength(20)
    expect(res.nextOffset).toBe(20)
  })
})

describe('resolveMissingFoodCodeHubAction', () => {
  it('vincula por la RPC scoped con el workspace activo', async () => {
    const rpc = mockDb({ data: MISSING_ID, error: null })
    const res = await resolveMissingFoodCodeHubAction({
      missingCodeId: MISSING_ID,
      resolvedFoodId: FOOD_ID,
    })
    expect(res).toEqual({ ok: true })
    expect(rpc).toHaveBeenCalledWith('resolve_missing_food_code_scoped_v2', {
      p_missing_code_id: MISSING_ID,
      p_food_id: FOOD_ID,
      p_scope_type: 'team',
      p_team_id: TEAM_ID,
      p_org_id: null,
    })
    expect(revalidatePathMock).toHaveBeenCalledWith('/coach/nutrition-v2')
  })

  it('P0002 (cero filas) => CURATION_ALREADY_RESOLVED y sin revalidate', async () => {
    mockDb({ data: null, error: { message: 'not found', code: 'P0002' } })
    const res = await resolveMissingFoodCodeHubAction({
      missingCodeId: MISSING_ID,
      resolvedFoodId: FOOD_ID,
    })
    expect(res).toMatchObject({ ok: false, code: 'CURATION_ALREADY_RESOLVED' })
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })

  it('rechaza ids no-uuid sin tocar la DB', async () => {
    const res = await resolveMissingFoodCodeHubAction({ missingCodeId: 'nope', resolvedFoodId: FOOD_ID })
    expect(res).toMatchObject({ ok: false, code: 'INVALID_PAYLOAD' })
    expect(createClientMock).not.toHaveBeenCalled()
  })

  it('sin workspace de coach devuelve SCOPE_REQUIRED sin tocar la DB', async () => {
    workspaceMock.mockResolvedValue(null)
    const res = await resolveMissingFoodCodeHubAction({
      missingCodeId: MISSING_ID,
      resolvedFoodId: FOOD_ID,
    })
    expect(res).toMatchObject({ ok: false, code: 'SCOPE_REQUIRED' })
    expect(createClientMock).not.toHaveBeenCalled()
  })
})

describe('createCoachFoodForCurationAction', () => {
  it('crea y vincula en una sola RPC atomica, con el scope activo', async () => {
    const rpc = mockDb({ data: FOOD_ID, error: null })
    const res = await createCoachFoodForCurationAction(CREATE_INPUT)
    expect(res).toEqual({ ok: true })
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('create_food_and_resolve_missing_code_scoped_v2', {
      p_missing_code_id: MISSING_ID,
      p_name: 'Yogur natural',
      p_calories: 60,
      p_protein_g: 4,
      p_carbs_g: 5,
      p_fats_g: 2,
      p_scope_type: 'team',
      p_brand: 'Soprole',
      p_unit: 'g',
      p_team_id: TEAM_ID,
      p_org_id: null,
    })
  })

  it('P0002 => CURATION_ALREADY_RESOLVED (una sola llamada, sin compensacion)', async () => {
    const rpc = mockDb({ data: null, error: { message: 'not found', code: 'P0002' } })
    const res = await createCoachFoodForCurationAction(CREATE_INPUT)
    expect(res).toMatchObject({ ok: false, code: 'CURATION_ALREADY_RESOLVED' })
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('sin workspace de coach devuelve SCOPE_REQUIRED sin tocar la DB', async () => {
    workspaceMock.mockResolvedValue(STUDENT_WORKSPACE)
    const res = await createCoachFoodForCurationAction(CREATE_INPUT)
    expect(res).toMatchObject({ ok: false, code: 'SCOPE_REQUIRED' })
    expect(createClientMock).not.toHaveBeenCalled()
  })

  it('rechaza macros fuera de rango sin tocar la DB', async () => {
    const res = await createCoachFoodForCurationAction({ ...CREATE_INPUT, calories: 3000 })
    expect(res).toMatchObject({ ok: false, code: 'INVALID_PAYLOAD' })
    expect(createClientMock).not.toHaveBeenCalled()
  })
})
