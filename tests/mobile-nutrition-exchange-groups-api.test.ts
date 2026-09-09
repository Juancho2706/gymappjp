/**
 * Porciones propias del coach en RN (FD6a) — el camino de ESCRITURA de `exchange_groups`.
 *
 * Lección NUT-005: cero escrituras Supabase directas nuevas desde mobile. La RLS de las tablas
 * de módulo NO mira `enabled_modules`, así que un insert/update/delete directo con el JWT de la
 * sesión burlaría el cobro; el endpoint `/api/mobile/nutrition/exchanges/groups` corre
 * `assertModule` server-side ANTES de escribir. Estos tests fijan el invariante: las tres
 * mutaciones POSTean/PATCHean/DELETEan al endpoint con el cuerpo correcto, un fallo de red
 * devuelve un error TIPADO (nunca una excepción cruda ni un éxito silencioso), y el módulo jamás
 * toca `supabase.from('exchange_groups')` para escribir.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiFetchMock = vi.hoisted(() => vi.fn())
const fromMock = vi.hoisted(() => vi.fn())

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
vi.mock('../apps/mobile/lib/supabase', () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: 'coach-1' } } }) },
    from: fromMock,
  },
}))

const coach = await import('../apps/mobile/lib/nutrition-exchanges.coach')
const v2 = await import('../apps/mobile/lib/nutrition-v2-exchange-groups.api')

const GROUPS_PATH = '/api/mobile/nutrition/exchanges/groups'
const GROUP_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

const VALUES = {
  name: 'Batido',
  code: 'SHK',
  refCalories: 180,
  refProteinG: 20,
  refCarbsG: 15,
  refFatsG: 4,
  color: '#3B82F6',
}

/** Grupo tal como lo devuelve el endpoint: YA mapeado por el repo web (camelCase). */
const API_GROUP = {
  id: GROUP_ID,
  slug: 'batido',
  code: 'SHK',
  name: 'Batido',
  coachId: 'coach-1',
  teamId: null,
  isSystem: false,
  refCalories: 180,
  refProteinG: 20,
  refCarbsG: 15,
  refFatsG: 4,
  color: '#3B82F6',
  sortOrder: 100,
  composedOf: null,
  macrosConfirmed: false,
}

beforeEach(() => {
  apiFetchMock.mockReset()
  fromMock.mockReset()
})

describe('createCoachExchangeGroup', () => {
  it('POSTea al endpoint del módulo con los valores del formulario', async () => {
    apiFetchMock.mockResolvedValueOnce({ ok: true, group: API_GROUP })
    const res = await coach.createCoachExchangeGroup(VALUES)

    expect(apiFetchMock).toHaveBeenCalledTimes(1)
    const [path, options] = apiFetchMock.mock.calls[0]
    expect(path).toBe(GROUPS_PATH)
    expect(options.method).toBe('POST')
    expect(options.authenticated).toBe(true)
    expect(options.body).toEqual(VALUES)
    // `groupId` NO viaja en el alta (lo asigna la DB).
    expect('groupId' in (options.body as Record<string, unknown>)).toBe(false)

    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.group.id).toBe(GROUP_ID)
      expect(res.group.code).toBe('SHK')
      // Los grupos propios nacen SIEMPRE referenciales (el servidor fuerza macros_confirmed=false).
      expect(res.group.macrosConfirmed).toBe(false)
      expect(res.group.isSystem).toBe(false)
    }
  })

  it('sin red devuelve un error TIPADO (no lanza) con el mensaje del borde', async () => {
    apiFetchMock.mockRejectedValueOnce(new FakeApiError('Network request failed', 0))
    const res = await coach.createCoachExchangeGroup(VALUES)
    expect(res).toEqual({ ok: false, error: 'Network request failed' })
  })

  it('un 400 del gate (módulo apagado / código repetido) también degrada a error tipado', async () => {
    apiFetchMock.mockRejectedValueOnce(new FakeApiError('Ya tienes un grupo con el código SHK.', 400, 'GROUP_WRITE_FAILED'))
    const res = await coach.createCoachExchangeGroup(VALUES)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toContain('SHK')
  })

  it('una respuesta sin `group` NO inventa un grupo: error explícito', async () => {
    apiFetchMock.mockResolvedValueOnce({ ok: true })
    const res = await coach.createCoachExchangeGroup(VALUES)
    expect(res.ok).toBe(false)
  })

  it('números ausentes o basura del cuerpo no meten NaN en el catálogo', async () => {
    apiFetchMock.mockResolvedValueOnce({ ok: true, group: { id: GROUP_ID, name: 'X', code: 'X' } })
    const res = await coach.createCoachExchangeGroup(VALUES)
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.group.refCalories).toBe(0)
      expect(res.group.sortOrder).toBe(0)
      expect(res.group.color).toBeNull()
      expect(res.group.composedOf).toBeNull()
    }
  })
})

describe('updateCoachExchangeGroup', () => {
  it('PATCHea con groupId + valores', async () => {
    apiFetchMock.mockResolvedValueOnce({ ok: true, group: { ...API_GROUP, name: 'Batido pro' } })
    const res = await coach.updateCoachExchangeGroup(GROUP_ID, { ...VALUES, name: 'Batido pro' })

    const [path, options] = apiFetchMock.mock.calls[0]
    expect(path).toBe(GROUPS_PATH)
    expect(options.method).toBe('PATCH')
    expect(options.body).toEqual({ groupId: GROUP_ID, ...VALUES, name: 'Batido pro' })
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.group.name).toBe('Batido pro')
  })

  it('sin red devuelve error tipado', async () => {
    apiFetchMock.mockRejectedValueOnce(new FakeApiError('Network request failed', 0))
    const res = await coach.updateCoachExchangeGroup(GROUP_ID, VALUES)
    expect(res.ok).toBe(false)
  })
})

describe('deleteCoachExchangeGroup', () => {
  it('DELETEa con solo el groupId', async () => {
    apiFetchMock.mockResolvedValueOnce({ ok: true, groupId: GROUP_ID })
    const res = await coach.deleteCoachExchangeGroup(GROUP_ID)

    const [path, options] = apiFetchMock.mock.calls[0]
    expect(path).toBe(GROUPS_PATH)
    expect(options.method).toBe('DELETE')
    expect(options.body).toEqual({ groupId: GROUP_ID })
    expect(res.ok).toBe(true)
  })

  it('un fallo del servidor NO se reporta como éxito', async () => {
    apiFetchMock.mockRejectedValueOnce(new FakeApiError('Ese grupo ya no está disponible.', 400))
    const res = await coach.deleteCoachExchangeGroup(GROUP_ID)
    expect(res.ok).toBe(false)
    expect(res.error).toContain('disponible')
  })
})

describe('NUT-005: jamás Supabase directo para escribir grupos', () => {
  it('ninguna de las tres mutaciones toca `db.from(...)`', async () => {
    apiFetchMock.mockResolvedValue({ ok: true, group: API_GROUP })
    await coach.createCoachExchangeGroup(VALUES)
    await coach.updateCoachExchangeGroup(GROUP_ID, VALUES)
    await coach.deleteCoachExchangeGroup(GROUP_ID)
    expect(fromMock).not.toHaveBeenCalled()
    expect(apiFetchMock).toHaveBeenCalledTimes(3)
    for (const [path] of apiFetchMock.mock.calls) expect(path).toBe(GROUPS_PATH)
  })

  it('el módulo no expone ninguna rutina de escritura directa de exchange_groups', () => {
    const source = coach as Record<string, unknown>
    // Las lecturas del catálogo SÍ van por PostgREST (RLS coach-scoped); las escrituras, nunca.
    expect(typeof source.fetchCoachExchangeGroups).toBe('function')
    expect(typeof source.createCoachExchangeGroup).toBe('function')
    expect(typeof source.updateCoachExchangeGroup).toBe('function')
    expect(typeof source.deleteCoachExchangeGroup).toBe('function')
    expect(source.insertExchangeGroupRow).toBeUndefined()
  })
})

/**
 * W1.6 — contrato de LECTURA del catálogo V2 móvil: `{ groups, foodCounts, portionSystem,
 * legacySystems }` (nombres canónicos, DATA §7.1.1).
 *
 * Las tres llaves nuevas son OPCIONALES a propósito y eso es el fail-open del cliente: un binario
 * nuevo contra un deploy viejo —o el borde degradado, que omite AMBAS llaves si falla una de sus
 * dos lecturas— recibe el cuerpo de siempre y NO marca nada como legado. Esconder un grupo que la
 * pauta del coach usa es peor que mostrar uno de más.
 *
 * Y `legacy` JAMÁS viaja por fila (R18): el servidor no puede afirmar «legado» sobre un grupo que
 * sale del PLAN, porque el snapshot congelado no guarda el set. Se deriva en el cliente con
 * `systemOf(group, portionSystem)`.
 */
describe('fetchNutritionV2ExchangeGroups: contrato de sets de porciones (W1.6)', () => {
  const SCOPE = { scopeType: 'standalone', teamId: null, orgId: null } as const
  const CATALOG_PATH = '/api/mobile/nutrition-v2/exchange-groups'
  const CL_GROUP = { ...API_GROUP, code: 'PCT', isSystem: true, portionSystem: 'cl' }
  const SMAE_GROUP = {
    ...API_GROUP,
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    code: 'C',
    isSystem: true,
    portionSystem: 'smae',
  }

  it('parsea las tres llaves nuevas y el `portionSystem` de cada grupo', async () => {
    apiFetchMock.mockResolvedValueOnce({
      groups: [CL_GROUP, SMAE_GROUP],
      foodCounts: { [GROUP_ID]: 12 },
      portionSystem: 'cl',
      legacySystems: ['smae'],
    })
    const res = await v2.fetchNutritionV2ExchangeGroups(SCOPE)

    const [path, options] = apiFetchMock.mock.calls[0]
    expect(path).toBe(`${CATALOG_PATH}?scopeType=standalone`)
    expect(options.authenticated).toBe(true)

    expect(res.portionSystem).toBe('cl')
    expect(res.legacySystems).toEqual(['smae'])
    expect(res.groups.map((group) => group.portionSystem)).toEqual(['cl', 'smae'])
    expect(res.foodCounts).toEqual({ [GROUP_ID]: 12 })
  })

  it('FAIL-OPEN: sin las tres llaves también parsea, y no inventa set ni legado', async () => {
    apiFetchMock.mockResolvedValueOnce({ groups: [{ ...API_GROUP }] })
    const res = await v2.fetchNutritionV2ExchangeGroups(SCOPE)

    expect(res.groups).toHaveLength(1)
    expect(res.portionSystem).toBeUndefined()
    expect(res.legacySystems).toBeUndefined()
    expect(res.foodCounts).toBeUndefined()
    // Sin el dato el grupo NO queda con un set inventado: `systemOf` decidirá por código. La llave
    // queda presente con `undefined`, igual que el mapeador web (`exchanges.repository.ts:79`).
    expect(res.groups[0]!.portionSystem).toBeUndefined()
  })

  it('un `portionSystem` de fila con basura se OMITE en vez de propagarse', async () => {
    apiFetchMock.mockResolvedValueOnce({
      groups: [
        { ...API_GROUP, portionSystem: 'usda' },
        { ...API_GROUP, id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', portionSystem: 7 },
      ],
      portionSystem: 'usda',
    })
    const res = await v2.fetchNutritionV2ExchangeGroups(SCOPE)
    expect(res.groups.map((group) => group.portionSystem)).toEqual([undefined, undefined])
    expect(res.portionSystem).toBeUndefined()
  })

  it('`legacySystems` con basura se filtra a `[]` (llegó la llave, pero no hay legado válido)', async () => {
    apiFetchMock.mockResolvedValueOnce({
      groups: [],
      portionSystem: 'cl',
      legacySystems: ['usda', 3],
    })
    const res = await v2.fetchNutritionV2ExchangeGroups(SCOPE)
    // `[]` («se leyó y no usa nada») ≠ `undefined` («no se pudo leer»): la diferencia decide si el
    // picker muestra el bloque «Legado» o no muestra nada.
    expect(res.legacySystems).toEqual([])
    expect(res.legacySystems).not.toBeUndefined()
  })

  it('`legacySystems` conserva solo los sets válidos y sin repetir', async () => {
    apiFetchMock.mockResolvedValueOnce({
      groups: [],
      portionSystem: 'smae',
      legacySystems: ['cl', null, 'cl'],
    })
    const res = await v2.fetchNutritionV2ExchangeGroups(SCOPE)
    // Deduplicado: el picker pinta UN bloque «Legado» por set, no uno por aparición.
    expect(res.legacySystems).toEqual(['cl'])
    expect(res.portionSystem).toBe('smae')
  })

  it('FAIL-OPEN: si el `portionSystem` no parsea, `legacySystems` cae con él (nunca a medias)', async () => {
    apiFetchMock.mockResolvedValueOnce({
      groups: [CL_GROUP, SMAE_GROUP],
      portionSystem: 'usda',
      legacySystems: ['smae'],
    })
    const res = await v2.fetchNutritionV2ExchangeGroups(SCOPE)
    // Sin set del coach no hay contra qué medir el legado: quedarse con `['smae']` escondería los
    // grupos SMAE del coach que justo usa SMAE. Se omiten las dos y se muestra el catálogo entero.
    expect(res.portionSystem).toBeUndefined()
    expect(res.legacySystems).toBeUndefined()
    expect(res.groups).toHaveLength(2)
  })

  it('R18: ninguna fila del catálogo trae `legacy` (se deriva en el cliente, no en el servidor)', async () => {
    // Aunque un servidor lo mandara, el mapeador NO lo copia: el sheet decide con `systemOf`, que
    // es lo único que no marca legado a un grupo del plan sin la columna.
    apiFetchMock.mockResolvedValueOnce({
      groups: [
        { ...CL_GROUP, legacy: true },
        { ...SMAE_GROUP, legacy: true },
      ],
      portionSystem: 'cl',
      legacySystems: ['smae'],
    })
    const res = await v2.fetchNutritionV2ExchangeGroups(SCOPE)
    expect(res.groups).toHaveLength(2)
    for (const group of res.groups) {
      expect('legacy' in group).toBe(false)
    }
  })
})
