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
const ORG_ID = '22222222-2222-4222-8222-222222222222'
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

    expect(
      nutritionV2CoachScopeFromWorkspace({
        type: 'enterprise_coach',
        userId: 'u',
        orgId: ORG_ID,
        coachId: 'c',
        memberId: 'm',
        label: 'x',
      } as WorkspaceSummary),
    ).toEqual({ scopeType: 'organization', teamId: null, orgId: ORG_ID })
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
    })
  })
})

describe('getNutritionClientDetailV2ForWeb', () => {
  it('llama la RPC scoped de detalle con clientId + los 3 params de workspace', async () => {
    // Corta antes del parse del read model: solo verificamos la construccion de la llamada scoped.
    rpc.mockResolvedValue({ data: null, error: { message: 'stop', code: 'STOP' } })

    await expect(
      getNutritionClientDetailV2ForWeb({
        clientId: CLIENT_ID,
        scope: { scopeType: 'organization', teamId: null, orgId: ORG_ID },
        date: '2026-07-14',
      }),
    ).rejects.toThrow()

    expect(rpc).toHaveBeenCalledWith('get_nutrition_client_detail_scoped_v2', {
      p_client_id: CLIENT_ID,
      p_scope_type: 'organization',
      p_team_id: null,
      p_org_id: ORG_ID,
      p_local_date: '2026-07-14',
      p_timezone: 'America/Santiago',
    })
  })
})
