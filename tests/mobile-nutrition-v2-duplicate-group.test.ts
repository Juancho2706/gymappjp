/**
 * "Duplicar y ajustar" + conteo de equivalencias en RN (última ola de paridad de porciones).
 *
 * Dos invariantes se fijan acá:
 *
 * 1. NUT-005 / money-safety: duplicar un grupo es una ESCRITURA y viaja por la API móvil
 *    (`PUT /api/mobile/nutrition/exchanges/groups`), que corre `assertModule` server-side. El
 *    teléfono nunca toca `exchange_groups` por PostgREST, y el reescalado de gramos jamás se
 *    calcula en el cliente: la respuesta trae `copied/attempted` ya resueltos.
 *
 * 2. El conteo de equivalencias tiene TRES estados, no dos. `undefined` (no viajó — el servidor
 *    lo degrada en silencio) NO puede leerse como 0: pintar "sin alimentos" sobre un grupo lleno
 *    es peor que no decir nada.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiFetchMock = vi.hoisted(() => vi.fn())

class FakeApiError extends Error {
  status: number
  code?: string
  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

vi.mock('../apps/mobile/lib/api', () => ({ apiFetch: apiFetchMock, ApiError: FakeApiError }))

const api = await import('../apps/mobile/lib/nutrition-v2-exchange-groups.api')
const { portionsFoodsHint } = await import('../apps/mobile/lib/nutrition-v2-builder-portions')
const { PORTIONS_COPY } = await import('../apps/mobile/lib/nutrition-portions-copy')

const GROUPS_PATH = '/api/mobile/nutrition/exchanges/groups'
const CATALOG_PATH = '/api/mobile/nutrition-v2/exchange-groups'
const SOURCE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const NEW_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

const SCOPE = { scopeType: 'standalone', teamId: null, orgId: null } as const

const API_GROUP = {
  id: NEW_ID,
  slug: 'cereales-ajustado',
  code: 'CA',
  name: 'Cereales (ajustado)',
  coachId: 'coach-1',
  teamId: null,
  isSystem: false,
  refCalories: 100,
  refProteinG: 2,
  refCarbsG: 20,
  refFatsG: 0,
  color: '#F59E0B',
  sortOrder: 100,
  composedOf: null,
  macrosConfirmed: false,
}

const VALUES = {
  sourceGroupId: SOURCE_ID,
  name: 'Cereales (ajustado)',
  code: 'CA',
  refCalories: 100,
  refProteinG: 2,
  refCarbsG: 20,
  refFatsG: 0,
  color: '#F59E0B',
  copyList: true,
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('duplicateNutritionV2ExchangeGroup', () => {
  it('PUTea al endpoint móvil con el grupo origen y copyList', async () => {
    apiFetchMock.mockResolvedValue({ ok: true, group: API_GROUP, copied: 715, attempted: 715 })
    const res = await api.duplicateNutritionV2ExchangeGroup(VALUES)

    expect(apiFetchMock).toHaveBeenCalledTimes(1)
    const [path, options] = apiFetchMock.mock.calls[0]
    expect(path).toBe(GROUPS_PATH)
    expect(options).toMatchObject({ method: 'PUT', authenticated: true })
    expect(options.body).toMatchObject({ sourceGroupId: SOURCE_ID, code: 'CA', copyList: true })
    expect(res).toMatchObject({ ok: true, copied: 715, attempted: 715 })
    if (res.ok) expect(res.group.id).toBe(NEW_ID)
  })

  it('copia parcial/fallida: el grupo se conserva y `copyError` viaja al caller', async () => {
    apiFetchMock.mockResolvedValue({
      ok: true,
      group: API_GROUP,
      copied: 0,
      attempted: 40,
      copyError: 'insert failed',
    })
    const res = await api.duplicateNutritionV2ExchangeGroup(VALUES)
    expect(res).toMatchObject({ ok: true, copied: 0, attempted: 40, copyError: 'insert failed' })
  })

  it('error de red ⇒ resultado TIPADO, nunca una excepción cruda', async () => {
    apiFetchMock.mockRejectedValue(new FakeApiError('Modulo no habilitado', 403, 'MODULE_OFF'))
    const res = await api.duplicateNutritionV2ExchangeGroup(VALUES)
    expect(res).toEqual({ ok: false, error: 'Modulo no habilitado' })
  })

  it('respuesta sin grupo ⇒ fallo explícito (jamás un éxito silencioso)', async () => {
    apiFetchMock.mockResolvedValue({ ok: true })
    const res = await api.duplicateNutritionV2ExchangeGroup(VALUES)
    expect(res.ok).toBe(false)
  })
})

describe('fetchNutritionV2ExchangeGroups: foodCounts', () => {
  it('devuelve el catálogo con su conteo', async () => {
    apiFetchMock.mockResolvedValue({ groups: [API_GROUP], foodCounts: { [NEW_ID]: 12 } })
    const res = await api.fetchNutritionV2ExchangeGroups(SCOPE)
    expect(res.groups).toHaveLength(1)
    expect(res.foodCounts).toEqual({ [NEW_ID]: 12 })
    expect(apiFetchMock.mock.calls[0][0]).toContain(CATALOG_PATH)
  })

  it('sin `foodCounts` en la respuesta ⇒ undefined (NO un objeto vacío que se leería como 0)', async () => {
    apiFetchMock.mockResolvedValue({ groups: [API_GROUP] })
    const res = await api.fetchNutritionV2ExchangeGroups(SCOPE)
    expect(res.foodCounts).toBeUndefined()
  })

  it('descarta valores no numéricos sin romper el catálogo', async () => {
    apiFetchMock.mockResolvedValue({ groups: [API_GROUP], foodCounts: { [NEW_ID]: 'muchos', otro: 3 } })
    const res = await api.fetchNutritionV2ExchangeGroups(SCOPE)
    expect(res.foodCounts).toEqual({ otro: 3 })
  })
})

describe('portionsFoodsHint', () => {
  it('conteo ausente ⇒ null (no se pinta nada)', () => {
    expect(portionsFoodsHint(undefined)).toBeNull()
  })

  it('cero ⇒ aviso en ámbar con el copy del alumno', () => {
    expect(portionsFoodsHint(0)).toEqual({ text: PORTIONS_COPY.builder.groupFoodsEmpty, empty: true })
  })

  it('singular y plural', () => {
    expect(portionsFoodsHint(1)).toEqual({ text: '1 alimento equivalente', empty: false })
    expect(portionsFoodsHint(715)).toEqual({ text: '715 alimentos equivalentes', empty: false })
  })
})
