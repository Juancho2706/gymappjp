import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import type { ExchangeGroup } from '@/domain/nutrition/exchange.types'

const mocks = vi.hoisted(() => ({
  gateNutritionV2Api: vi.fn(),
  getExchangeGroupsForCoach: vi.fn(),
  createCoachExchangeGroup: vi.fn(),
  updateCoachExchangeGroup: vi.fn(),
  deleteCoachExchangeGroup: vi.fn(),
  getExchangeListCounts: vi.fn(),
  findCoachPortionSystem: vi.fn(),
  findUsedPortionSystemsForCoach: vi.fn(),
  logNutritionV2Api: vi.fn(),
}))

vi.mock('../_shared', () => ({
  gateNutritionV2Api: mocks.gateNutritionV2Api,
  jsonNoStore: (payload: unknown, status = 200) => NextResponse.json(payload, { status }),
  logNutritionV2Api: mocks.logNutritionV2Api,
}))

vi.mock('@/services/nutrition-exchanges/nutrition-exchanges.service', () => ({
  getExchangeGroupsForCoach: mocks.getExchangeGroupsForCoach,
  createCoachExchangeGroup: mocks.createCoachExchangeGroup,
  updateCoachExchangeGroup: mocks.updateCoachExchangeGroup,
  deleteCoachExchangeGroup: mocks.deleteCoachExchangeGroup,
}))

vi.mock('@/services/nutrition-exchanges/exchange-lists.service', () => ({
  getExchangeListCounts: mocks.getExchangeListCounts,
}))

vi.mock('@/infrastructure/db/exchanges.repository', () => ({
  findCoachPortionSystem: mocks.findCoachPortionSystem,
  findUsedPortionSystemsForCoach: mocks.findUsedPortionSystemsForCoach,
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
  mocks.getExchangeListCounts.mockResolvedValue({ [GROUP_ID]: 7 })
  mocks.findCoachPortionSystem.mockResolvedValue('cl')
  mocks.findUsedPortionSystemsForCoach.mockResolvedValue(['cl'])
})

describe('Nutrition V2 exchange groups', () => {
  it('lee el catálogo standalone con el cliente token-scoped y scope explícito', async () => {
    const response = await GET(request('GET'))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      groups: [GROUP],
      foodCounts: { [GROUP_ID]: 7 },
      portionSystem: 'cl',
      legacySystems: [],
    })
    expect(mocks.getExchangeGroupsForCoach).toHaveBeenCalledWith(
      USER_CLIENT,
      'coach-1',
      { activeTeamId: null, orgId: null },
    )
    expect(mocks.getExchangeListCounts).toHaveBeenCalledWith(USER_CLIENT, [GROUP_ID])
  })

  // El conteo es informativo: si revienta, el coach igual necesita su catálogo (criterio del
  // builder web). Se degrada a `{}`, jamás a un 500 ni a un catálogo vacío.
  it('un fallo del conteo NO rompe el catálogo', async () => {
    mocks.getExchangeListCounts.mockRejectedValueOnce(new Error('boom'))
    const response = await GET(request('GET'))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      groups: [GROUP],
      foodCounts: {},
      portionSystem: 'cl',
      legacySystems: [],
    })
  })

  // R14: el borde MARCA (agrega las dos llaves) y jamás filtra — el catálogo sale completo y el
  // cliente particiona con `systemOf`.
  it('emite `portionSystem` + `legacySystems` sin tocar la lista de grupos', async () => {
    mocks.findCoachPortionSystem.mockResolvedValueOnce('cl')
    mocks.findUsedPortionSystemsForCoach.mockResolvedValueOnce(['cl', 'smae'])
    const response = await GET(request('GET'))
    const body = await response.json()
    expect(body.portionSystem).toBe('cl')
    // Solo los sets AJENOS al del coach quedan como legado.
    expect(body.legacySystems).toEqual(['smae'])
    expect(body.groups).toEqual([GROUP])
    // R18: el servidor no puede afirmar «legado» por fila (un grupo del plan no trae la columna).
    expect('legacy' in body.groups[0]).toBe(false)
    expect(mocks.findCoachPortionSystem).toHaveBeenCalledWith(USER_CLIENT, 'coach-1')
    expect(mocks.findUsedPortionSystemsForCoach).toHaveBeenCalledWith(USER_CLIENT, 'coach-1')
  })

  /**
   * Catálogo MIXTO (un grupo 'cl' + uno 'smae') con un coach chileno que NO tiene targets SMAE
   * vivos: el borde MARCA (`portionSystem: 'cl'`, `legacySystems: []`) y devuelve los DOS grupos.
   * Filtrar el SMAE acá sería el bug que R14 prohíbe: el catálogo se parte en el cliente, que es
   * el único que sabe qué grupo usa la pauta abierta.
   */
  it('catálogo MIXTO: marca el set del coach y NO esconde el grupo del otro set', async () => {
    const SMAE_GROUP: ExchangeGroup = {
      ...GROUP,
      id: '33333333-3333-4333-8333-333333333333',
      code: 'C',
      name: 'Cereales',
      isSystem: true,
      coachId: null,
      portionSystem: 'smae',
    }
    mocks.getExchangeGroupsForCoach.mockResolvedValueOnce([{ ...GROUP, portionSystem: 'cl' }, SMAE_GROUP])
    mocks.findCoachPortionSystem.mockResolvedValueOnce('cl')
    // El coach usa SOLO su set: no hay legado que anunciar, pero el grupo SMAE igual viaja.
    mocks.findUsedPortionSystemsForCoach.mockResolvedValueOnce(['cl'])

    const body = await (await GET(request('GET'))).json()
    expect(body.portionSystem).toBe('cl')
    expect(body.legacySystems).toEqual([])
    expect(body.groups).toHaveLength(2)
    expect(body.groups.map((group: ExchangeGroup) => group.portionSystem)).toEqual(['cl', 'smae'])
  })

  it('el modo degradado deja marcador en el log, sin tocar la respuesta', async () => {
    mocks.findUsedPortionSystemsForCoach.mockRejectedValueOnce(new Error('boom'))
    const response = await GET(request('GET'))
    await expect(response.json()).resolves.toEqual({ groups: [GROUP], foodCounts: { [GROUP_ID]: 7 } })
    expect(mocks.logNutritionV2Api).toHaveBeenCalledWith(
      expect.objectContaining({ route: 'mobile.nutrition-v2.exchange-groups', status: 200, errorCode: 'VISIBILITY_DEGRADED' }),
    )
  })

  it('el camino sano NO marca degradación en el log', async () => {
    await GET(request('GET'))
    expect(mocks.logNutritionV2Api).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: undefined }),
    )
  })

  it('respeta al coach `smae`: su set es el propio y el chileno es el legado', async () => {
    mocks.findCoachPortionSystem.mockResolvedValueOnce('smae')
    mocks.findUsedPortionSystemsForCoach.mockResolvedValueOnce(['smae', 'cl'])
    const body = await (await GET(request('GET'))).json()
    expect(body.portionSystem).toBe('smae')
    expect(body.legacySystems).toEqual(['cl'])
  })

  /**
   * FAIL-OPEN (R14 punto 4): si falla CUALQUIERA de las dos lecturas se omiten las DOS llaves. Sin
   * `portionSystem` el cliente no marca nada como legado y muestra el catálogo entero.
   *
   * `findCoachPortionSystem` NO lanza: devuelve `null` ante error. Si el borde tradujera ese `null`
   * a `'cl'`, un coach `smae` sin targets vivos recibiría `{ portionSystem: 'cl', legacySystems: [] }`
   * y el picker le ESCONDERÍA sus 9 grupos SMAE. Por eso `null` ⇒ omitir, no ⇒ default.
   */
  it('FAIL-OPEN: `findCoachPortionSystem` devuelve null ⇒ se omiten las DOS llaves', async () => {
    mocks.findCoachPortionSystem.mockResolvedValueOnce(null)
    mocks.findUsedPortionSystemsForCoach.mockResolvedValueOnce([])
    const response = await GET(request('GET'))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ groups: [GROUP], foodCounts: { [GROUP_ID]: 7 } })
  })

  it('FAIL-OPEN: si revienta la lectura de sets en uso, se omiten las DOS llaves', async () => {
    mocks.findUsedPortionSystemsForCoach.mockRejectedValueOnce(new Error('boom'))
    const response = await GET(request('GET'))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ groups: [GROUP], foodCounts: { [GROUP_ID]: 7 } })
  })

  it('FAIL-OPEN: si revienta la lectura del set del coach, se omiten las DOS llaves', async () => {
    mocks.findCoachPortionSystem.mockRejectedValueOnce(new Error('boom'))
    const response = await GET(request('GET'))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ groups: [GROUP], foodCounts: { [GROUP_ID]: 7 } })
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
