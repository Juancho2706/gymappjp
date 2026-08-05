import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { WorkspaceSummary } from '@/domain/auth/types'

vi.mock('next/cache', () => ({ unstable_noStore: () => {} }))

const rpc = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ rpc })),
}))

import {
  getNutritionCoachHubV2ForWeb,
  getNutritionClientDetailV2ForWeb,
  nutritionV2CoachScopeFromWorkspace,
} from './nutrition-v2-read.service'

const TEAM_ID = '11111111-1111-4111-8111-111111111111'
const CLIENT_ID = '33333333-3333-4333-8333-333333333333'

const EMPTY_HUB_PAGE = {
  schemaVersion: 1,
  generatedAt: '2026-07-14T00:00:00.000Z',
  items: [],
  nextCursor: null,
  hasMore: false,
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('nutritionV2CoachScopeFromWorkspace', () => {
  it('mapea cada workspace coach a su scope', () => {
    expect(
      nutritionV2CoachScopeFromWorkspace({
        type: 'coach_standalone',
        userId: 'u',
        coachId: 'c',
        label: 'x',
      } as WorkspaceSummary),
    ).toEqual({ scopeType: 'standalone', teamId: null, orgId: null })

    expect(
      nutritionV2CoachScopeFromWorkspace({
        type: 'coach_team',
        userId: 'u',
        coachId: 'c',
        teamId: TEAM_ID,
        label: 'x',
      } as WorkspaceSummary),
    ).toEqual({ scopeType: 'team', teamId: TEAM_ID, orgId: null })

    expect(() =>
      nutritionV2CoachScopeFromWorkspace({
        type: 'enterprise_coach',
        userId: 'u',
        orgId: '22222222-2222-4222-8222-222222222222',
        coachId: 'c',
        memberId: 'm',
        label: 'x',
      } as WorkspaceSummary),
    ).toThrow('not available for enterprise')
  })

  it('falla cerrado (throw) ante null o un workspace no-coach — jamas sin scope', () => {
    expect(() => nutritionV2CoachScopeFromWorkspace(null)).toThrow()
    expect(() =>
      nutritionV2CoachScopeFromWorkspace({
        type: 'student_standalone',
        userId: 'u',
        clientId: 'cl',
        coachId: 'c',
        label: 'x',
      } as WorkspaceSummary),
    ).toThrow()
  })
})

describe('getNutritionCoachHubV2ForWeb', () => {
  it('llama la RPC scoped con los 3 params de workspace', async () => {
    rpc.mockResolvedValue({ data: EMPTY_HUB_PAGE, error: null })

    const res = await getNutritionCoachHubV2ForWeb({
      scope: { scopeType: 'team', teamId: TEAM_ID, orgId: null },
      pageSize: 25,
    })

    expect(res.items).toEqual([])
    expect(rpc).toHaveBeenCalledWith('get_nutrition_coach_hub_scoped_v2', {
      p_scope_type: 'team',
      p_team_id: TEAM_ID,
      p_org_id: null,
      p_cursor_updated_at: null,
      p_cursor_client_id: null,
      p_page_size: 25,
      p_search: null,
      p_sort: 'default',
      p_cursor_score: null,
    })
  })

  it('propaga busqueda, orden y el keyset por score del triage', async () => {
    rpc.mockResolvedValue({ data: EMPTY_HUB_PAGE, error: null })

    await getNutritionCoachHubV2ForWeb({
      scope: { scopeType: 'standalone', teamId: null, orgId: null },
      search: '  ana  ',
      sort: 'attention',
      cursorUpdatedAt: '2026-08-05T12:00:00.000Z',
      cursorClientId: CLIENT_ID,
      cursorScore: 21000,
    })

    expect(rpc).toHaveBeenCalledWith('get_nutrition_coach_hub_scoped_v2', {
      p_scope_type: 'standalone',
      p_team_id: null,
      p_org_id: null,
      p_cursor_updated_at: '2026-08-05T12:00:00.000Z',
      p_cursor_client_id: CLIENT_ID,
      p_page_size: 25,
      p_search: 'ana',
      p_sort: 'attention',
      p_cursor_score: 21000,
    })
  })

  it('una busqueda en blanco viaja como null (no como cadena vacia)', async () => {
    rpc.mockResolvedValue({ data: EMPTY_HUB_PAGE, error: null })

    await getNutritionCoachHubV2ForWeb({
      scope: { scopeType: 'standalone', teamId: null, orgId: null },
      search: '   ',
    })

    expect(rpc.mock.calls[0]?.[1]).toMatchObject({ p_search: null })
  })
})

describe('getNutritionClientDetailV2ForWeb', () => {
  it('llama la RPC scoped de detalle con clientId + los 3 params de workspace', async () => {
    // Corta antes del parse del read model: solo verificamos la construccion de la llamada scoped.
    rpc.mockResolvedValue({ data: null, error: { message: 'stop', code: 'STOP' } })

    await expect(
      getNutritionClientDetailV2ForWeb({
        clientId: CLIENT_ID,
        scope: { scopeType: 'team', teamId: TEAM_ID, orgId: null },
        date: '2026-07-14',
      }),
    ).rejects.toThrow()

    expect(rpc).toHaveBeenCalledWith('get_nutrition_client_detail_scoped_v2', {
      p_client_id: CLIENT_ID,
      p_scope_type: 'team',
      p_team_id: TEAM_ID,
      p_org_id: null,
      p_local_date: '2026-07-14',
      p_timezone: 'America/Santiago',
    })
  })
})
