import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import type { ExchangeGroup } from '@/domain/nutrition/exchange.types'

const mocks = vi.hoisted(() => ({
  gateNutritionV2Api: vi.fn(),
  getExchangeGroupsForCoach: vi.fn(),
  createCoachExchangeGroup: vi.fn(),
  updateCoachExchangeGroup: vi.fn(),
  deleteCoachExchangeGroup: vi.fn(),
}))

vi.mock('../_shared', () => ({
  gateNutritionV2Api: mocks.gateNutritionV2Api,
  jsonNoStore: (payload: unknown, status = 200) => NextResponse.json(payload, { status }),
  logNutritionV2Api: vi.fn(),
}))

vi.mock('@/services/nutrition-exchanges/nutrition-exchanges.service', () => ({
  getExchangeGroupsForCoach: mocks.getExchangeGroupsForCoach,
  createCoachExchangeGroup: mocks.createCoachExchangeGroup,
  updateCoachExchangeGroup: mocks.updateCoachExchangeGroup,
  deleteCoachExchangeGroup: mocks.deleteCoachExchangeGroup,
}))

import { DELETE, GET, PATCH, POST } from './route'

const TEAM_ID = '11111111-1111-4111-8111-111111111111'
const GROUP_ID = '22222222-2222-4222-8222-222222222222'
const USER_CLIENT = { tag: 'token-scoped' }

const GROUP: ExchangeGroup = {
  id: GROUP_ID,
  slug: 'batido',
  code: 'SHK',
  name: 'Batido',
  coachId: 'coach-1',
  teamId: null,
  isSystem: false,
  refCalories: 180,
  refProteinG: 25,
  refCarbsG: 10,
  refFatsG: 3,
  color: '#3B82F6',
  sortOrder: 100,
  composedOf: null,
  macrosConfirmed: false,
}

const VALUES = {
  name: 'Batido',
  code: 'SHK',
  refCalories: 180,
  refProteinG: 25,
  refCarbsG: 10,
  refFatsG: 3,
  color: '#3B82F6',
}

function request(method: string, body?: unknown, query = 'scopeType=standalone') {
  return new NextRequest(`http://localhost/api/mobile/nutrition-v2/exchange-groups?${query}`, {
    method,
    headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.gateNutritionV2Api.mockResolvedValue({
    ok: true,
    userId: 'coach-1',
    clientId: null,
    coachId: 'coach-1',
    teamId: null,
    orgId: null,
    rpc: USER_CLIENT,
  })
  mocks.getExchangeGroupsForCoach.mockResolvedValue([GROUP])
  mocks.createCoachExchangeGroup.mockResolvedValue({ success: true, group: GROUP })
  mocks.updateCoachExchangeGroup.mockResolvedValue({ success: true, group: GROUP })
  mocks.deleteCoachExchangeGroup.mockResolvedValue({ success: true })
})

describe('Nutrition V2 exchange groups', () => {
  it('lee el catálogo standalone con el cliente token-scoped y scope explícito', async () => {
    const response = await GET(request('GET'))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ groups: [GROUP] })
    expect(mocks.getExchangeGroupsForCoach).toHaveBeenCalledWith(
      USER_CLIENT,
      'coach-1',
      { activeTeamId: null, orgId: null },
    )
  })

  it('propaga el Team declarado al gate y al servicio, sin fallback standalone', async () => {
    mocks.gateNutritionV2Api.mockResolvedValueOnce({
      ok: true,
      userId: 'coach-1',
      clientId: null,
      coachId: 'coach-1',
      teamId: TEAM_ID,
      orgId: null,
      rpc: USER_CLIENT,
    })
    await GET(request('GET', undefined, `scopeType=team&teamId=${TEAM_ID}`))
    expect(mocks.gateNutritionV2Api.mock.calls[0]?.[1]).toMatchObject({
      surface: 'mobileCoach',
      coachScope: { scopeType: 'team', teamId: TEAM_ID, orgId: null },
    })
    expect(mocks.getExchangeGroupsForCoach.mock.calls[0]?.[2]).toEqual({ activeTeamId: TEAM_ID, orgId: null })
  })

  it('rechaza scope inválido antes de consultar o escribir', async () => {
    const response = await GET(request('GET', undefined, 'scopeType=team'))
    expect(response.status).toBe(400)
    expect(mocks.gateNutritionV2Api).not.toHaveBeenCalled()
    expect(mocks.getExchangeGroupsForCoach).not.toHaveBeenCalled()
  })

  it('crea con workspace dentro del body y valida el mismo contrato compartido', async () => {
    const response = await POST(request('POST', { ...VALUES, workspace: { scopeType: 'standalone', teamId: null, orgId: null } }))
    expect(response.status).toBe(200)
    expect(mocks.createCoachExchangeGroup.mock.calls[0]?.[0]).toBe(USER_CLIENT)
    expect(mocks.createCoachExchangeGroup.mock.calls[0]?.[1]).toMatchObject({
      actorCoachId: 'coach-1',
      scope: { activeTeamId: null, orgId: null },
      values: VALUES,
    })
  })

  it('rechaza una escritura sin workspace o groupId antes del servicio', async () => {
    expect((await POST(request('POST', VALUES))).status).toBe(400)
    expect((await PATCH(request('PATCH', { ...VALUES, workspace: { scopeType: 'standalone', teamId: null, orgId: null } }))).status).toBe(400)
    expect(mocks.createCoachExchangeGroup).not.toHaveBeenCalled()
    expect(mocks.updateCoachExchangeGroup).not.toHaveBeenCalled()
  })

  it('elimina únicamente mediante el workspace V2 autorizado', async () => {
    const response = await DELETE(request('DELETE', {
      workspace: { scopeType: 'standalone', teamId: null, orgId: null },
      groupId: GROUP_ID,
    }))
    expect(response.status).toBe(200)
    expect(mocks.deleteCoachExchangeGroup.mock.calls[0]?.[1]).toMatchObject({
      actorCoachId: 'coach-1',
      groupId: GROUP_ID,
      scope: { activeTeamId: null, orgId: null },
    })
  })
})
