import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { ExchangeGroup } from '@/domain/nutrition/exchange.types'

/**
 * W1.5 — el loader del picker web MARCA, NO FILTRA (decision del jefe 09-09), y su FAIL-OPEN
 * (DATA §7.1.1, R14 punto 4).
 *
 * Dos promesas se cuidan aca. La primera: `groups` sale SIEMPRE con el catalogo completo, porque
 * estas actions alimentan seis superficies y una de ellas (`FoodCatalogBrowser → ClassifyFoodFlow`)
 * resuelve ids YA asignados; recortando el catalogo, un coach `cl` sin targets SMAE veria «sin
 * clasificar» un alimento que si esta clasificado (misma clase de bug que R13). El servidor
 * tampoco manda `legacy` por fila: esa marca es del consumidor (W2.7).
 *
 * La segunda: si falla una lectura de SET, el resultado avisa con `degraded` en vez de inventar
 * legado. Se simulan las DOS formas de fallar, porque no son la misma: PostgREST devolviendo
 * `error` (que `findCoachPortionSystem` traduce a `null`) y la promesa RECHAZANDO. La segunda es la
 * que rompia el fail-open: sin `.catch` reventaba el `Promise.all` y el picker volvia
 * GROUPS_LOAD_FAILED, o sea CERO grupos — el opuesto exacto de lo prometido.
 */

const mocks = vi.hoisted(() => ({
  authorizeCoach: vi.fn(),
  getExchangeGroupsForCoach: vi.fn(),
  countExchangeListRowsByGroup: vi.fn(),
  findCoachPortionSystem: vi.fn(),
  findUsedPortionSystemsForCoach: vi.fn(),
}))

vi.mock('@/app/coach/nutrition-v2/_actions/plan-persistence', () => ({
  authorizeCoach: mocks.authorizeCoach,
  fail: (code: string, error: string) => ({ ok: false, code, error }),
}))

vi.mock('@/services/nutrition-exchanges/nutrition-exchanges.service', () => ({
  getExchangeGroupsForCoach: mocks.getExchangeGroupsForCoach,
}))

vi.mock('@/infrastructure/db/exchange-group-foods.repository', () => ({
  countExchangeListRowsByGroup: mocks.countExchangeListRowsByGroup,
}))

vi.mock('@/infrastructure/db/exchanges.repository', () => ({
  findCoachPortionSystem: mocks.findCoachPortionSystem,
  findUsedPortionSystemsForCoach: mocks.findUsedPortionSystemsForCoach,
}))

import {
  loadExchangeGroupsForBuilderAction,
  loadExchangeGroupsForCoachAction,
  type LoadExchangeGroupsResult,
} from './portions-groups.actions'

const CLIENT = '9d2b6f7a-1c44-4e58-9a11-0f3f0b6a2c31'

function group(
  partial: Partial<ExchangeGroup> & Pick<ExchangeGroup, 'id' | 'code' | 'slug'> & { portionSystem?: 'smae' | 'cl' },
): ExchangeGroup {
  return {
    name: partial.code,
    coachId: null,
    teamId: null,
    isSystem: true,
    refCalories: 100,
    refProteinG: 2,
    refCarbsG: 15,
    refFatsG: 1,
    color: null,
    sortOrder: 100,
    composedOf: null,
    macrosConfirmed: true,
    ...partial,
  }
}

/** Los dos sets del sistema + un custom del coach: el catalogo que devuelve el servicio. */
const SMAE_CODES = ['C', 'P', 'F', 'V', 'LAC', 'ARL', 'SP', 'G', 'LEG']
const CL_CODES = ['LD', 'LS', 'LE', 'CB', 'CA', 'LGS', 'VG', 'VL', 'FR', 'PCT', 'AG', 'AZ', 'SCP']
const CATALOG: ExchangeGroup[] = [
  ...SMAE_CODES.map((code, i) =>
    group({ id: `smae-${code}`, code, slug: `smae-${code.toLowerCase()}`, portionSystem: 'smae', sortOrder: 10 + i * 10 }),
  ),
  ...CL_CODES.map((code, i) =>
    group({ id: `cl-${code}`, code, slug: `cl-${code.toLowerCase()}`, portionSystem: 'cl', sortOrder: 210 + i * 10 }),
  ),
  group({ id: 'own-shk', code: 'SHK', slug: 'batido', portionSystem: 'smae', isSystem: false, coachId: 'coach-1' }),
]

const AUTH_OK = { ok: true, db: {}, userId: 'coach-1', proCtx: {}, workspace: null }

function ok(result: LoadExchangeGroupsResult) {
  if (!result.ok) throw new Error(`se esperaba ok, vino ${result.code}`)
  return result
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.authorizeCoach.mockResolvedValue(AUTH_OK)
  mocks.getExchangeGroupsForCoach.mockResolvedValue(CATALOG)
  mocks.countExchangeListRowsByGroup.mockResolvedValue({ counts: { 'cl-PCT': 7 }, truncated: false })
  mocks.findCoachPortionSystem.mockResolvedValue('cl')
  mocks.findUsedPortionSystemsForCoach.mockResolvedValue(['cl'])
})

describe('loadExchangeGroups… · camino leido', () => {
  it('coach cl que ya no usa SMAE: catalogo MIXTO completo, sin `legacy` por fila y sin degradado', async () => {
    const res = ok(await loadExchangeGroupsForBuilderAction({ clientId: CLIENT }))
    expect(res.groups.map((g) => g.code).sort()).toEqual(CATALOG.map((g) => g.code).sort())
    expect(res.groups.some((g) => 'legacy' in g)).toBe(false)
    expect(res.portionSystem).toBe('cl')
    expect(res.legacySystems).toEqual([])
    expect(res.degraded).toBeUndefined()
    expect(res.foodCounts).toEqual({ 'cl-PCT': 7 })
    expect(res.foodCountsTruncated).toBeUndefined()
  })

  it('coach cl con targets SMAE vivos: el mismo catalogo entero, y el set ajeno solo en `legacySystems`', async () => {
    mocks.findUsedPortionSystemsForCoach.mockResolvedValue(['cl', 'smae'])
    const res = ok(await loadExchangeGroupsForBuilderAction({ clientId: CLIENT }))
    expect(res.groups).toHaveLength(CATALOG.length)
    expect(res.groups.some((g) => 'legacy' in g)).toBe(false)
    expect(res.legacySystems).toEqual(['smae'])
    expect(res.degraded).toBeUndefined()
  })

  it('un grupo SMAE ASIGNADO a un alimento sigue estando en `groups` para un coach cl sin targets SMAE', async () => {
    // El caso que mata el filtro: `ClassifyFoodFlow` resuelve `groups.find(g => g.id === groupId)`.
    // Si el grupo asignado no viniera, el alimento se pintaria «sin clasificar» siendo mentira.
    const asignado = CATALOG.find((g) => g.id === 'smae-C')
    const res = ok(await loadExchangeGroupsForBuilderAction({ clientId: CLIENT }))
    expect(res.legacySystems).toEqual([])
    expect(res.groups.find((g) => g.id === 'smae-C')).toEqual(asignado)
    expect(res.groups.filter((g) => g.portionSystem === 'smae').map((g) => g.code).sort()).toEqual(
      [...SMAE_CODES, 'SHK'].sort(),
    )
  })

  it('sets en uso REPETIDOS: `legacySystems` deduplica y no pinta «Legado» dos veces', async () => {
    mocks.findUsedPortionSystemsForCoach.mockResolvedValue(['smae', 'cl', 'smae', 'cl'])
    const res = ok(await loadExchangeGroupsForBuilderAction({ clientId: CLIENT }))
    expect(res.legacySystems).toEqual(['smae'])
    expect(res.groups).toHaveLength(CATALOG.length)
  })
})

describe('loadExchangeGroups… · FAIL-OPEN de cada lectura (W1.5)', () => {
  /** Lo que el modo degradado promete, sea cual sea la lectura que fallo. */
  function expectFailOpen(res: LoadExchangeGroupsResult) {
    const okRes = ok(res)
    expect(okRes.groups).toHaveLength(CATALOG.length)
    expect(okRes.groups.map((g) => g.code)).toEqual(expect.arrayContaining([...SMAE_CODES, ...CL_CODES]))
    expect(okRes.groups.some((g) => 'legacy' in g)).toBe(false)
    expect(okRes.portionSystem).toBe('cl')
    expect(okRes.legacySystems).toEqual([])
    expect(okRes.degraded).toBe(true)
  }

  it('falla la lectura de los sets EN USO (la promesa rechaza)', async () => {
    mocks.findUsedPortionSystemsForCoach.mockRejectedValue(new Error('boom targets'))
    expectFailOpen(await loadExchangeGroupsForBuilderAction({ clientId: CLIENT }))
  })

  it('falla la lectura del set del COACH devolviendo null (PostgREST con error)', async () => {
    mocks.findCoachPortionSystem.mockResolvedValue(null)
    expectFailOpen(await loadExchangeGroupsForBuilderAction({ clientId: CLIENT }))
  })

  it('falla la lectura del set del COACH RECHAZANDO: no puede volver GROUPS_LOAD_FAILED', async () => {
    mocks.findCoachPortionSystem.mockRejectedValue(new Error('boom coaches'))
    expectFailOpen(await loadExchangeGroupsForBuilderAction({ clientId: CLIENT }))
  })

  it('fallan las DOS lecturas a la vez', async () => {
    mocks.findCoachPortionSystem.mockRejectedValue(new Error('boom coaches'))
    mocks.findUsedPortionSystemsForCoach.mockRejectedValue(new Error('boom targets'))
    expectFailOpen(await loadExchangeGroupsForBuilderAction({ clientId: CLIENT }))
  })

  it('el mismo fail-open en la variante SIN alumno (builder de plantillas)', async () => {
    mocks.findUsedPortionSystemsForCoach.mockRejectedValue(new Error('boom targets'))
    expectFailOpen(await loadExchangeGroupsForCoachAction())
    expect(mocks.authorizeCoach).toHaveBeenCalledWith(null, 'catalog-search')
  })
})

describe('loadExchangeGroups… · conteo de equivalencias (W1.9)', () => {
  it('un grupo chileno con equivalencias trae su numero, no un cero inventado', async () => {
    mocks.countExchangeListRowsByGroup.mockResolvedValue({
      counts: { 'cl-PCT': 715, 'cl-LD': 0 },
      truncated: false,
    })
    const res = ok(await loadExchangeGroupsForBuilderAction({ clientId: CLIENT }))
    expect(res.foodCounts['cl-PCT']).toBe(715)
    expect(res.foodCounts['cl-LD']).toBe(0)
    expect(res.foodCountsTruncated).toBeUndefined()
  })

  it('conteo TRUNCADO: el mapa vuelve sparse y el borde lo dice', async () => {
    mocks.countExchangeListRowsByGroup.mockResolvedValue({ counts: { 'cl-PCT': 715 }, truncated: true })
    const res = ok(await loadExchangeGroupsForBuilderAction({ clientId: CLIENT }))
    expect(res.foodCountsTruncated).toBe(true)
    expect(res.foodCounts['cl-LD']).toBeUndefined()
  })

  it('conteo que LANZA: mapa vacio + truncated, y el picker igual carga', async () => {
    mocks.countExchangeListRowsByGroup.mockRejectedValue(new Error('boom counts'))
    const res = ok(await loadExchangeGroupsForBuilderAction({ clientId: CLIENT }))
    expect(res.foodCounts).toEqual({})
    expect(res.foodCountsTruncated).toBe(true)
    expect(res.groups.length).toBeGreaterThan(0)
  })
})

describe('loadExchangeGroups… · lo que SI falla cerrado', () => {
  it('si el catalogo mismo no se puede leer, el picker muestra su error con reintento', async () => {
    mocks.getExchangeGroupsForCoach.mockRejectedValue(new Error('boom catalogo'))
    const res = await loadExchangeGroupsForBuilderAction({ clientId: CLIENT })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe('GROUPS_LOAD_FAILED')
  })

  it('el ActionFailure del gate vuelve tal cual, sin tocar la base', async () => {
    mocks.authorizeCoach.mockResolvedValue({ ok: false, code: 'RATE_LIMITED', error: 'Demasiadas solicitudes.' })
    const res = await loadExchangeGroupsForBuilderAction({ clientId: CLIENT })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe('RATE_LIMITED')
    expect(mocks.getExchangeGroupsForCoach).not.toHaveBeenCalled()
  })

  it('un clientId que no es uuid no llega ni al gate', async () => {
    const res = await loadExchangeGroupsForBuilderAction({ clientId: 'no-uuid' })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe('INVALID_PAYLOAD')
    expect(mocks.authorizeCoach).not.toHaveBeenCalled()
  })
})
