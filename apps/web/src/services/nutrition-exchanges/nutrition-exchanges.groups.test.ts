import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ExchangeGroup } from '@/domain/nutrition/exchange.types'

/**
 * Grupos de porciones PROPIOS del coach (porciones propias P-A).
 * Se testea la capa de decisiones del servicio: unicidad case-insensitive de `code` y
 * `slug` contra system + propios (incluida la colisión con la "C" del sistema), guardas de
 * inmutabilidad (system / compuestos), derivación del slug y el `macros_confirmed = false`
 * forzado por el repository (se verifica que el servicio NO lo mande a mano).
 */

const mocks = vi.hoisted(() => ({
    assertModule: vi.fn(),
    findExchangeGroupsForScope: vi.fn(),
    insertExchangeGroup: vi.fn(),
    updateExchangeGroup: vi.fn(),
    softDeleteExchangeGroup: vi.fn(),
}))

vi.mock('@/services/entitlements.service', () => ({
    assertModule: mocks.assertModule,
    getCoachEnabledModules: vi.fn(),
    getTeamEnabledModules: vi.fn(),
}))

vi.mock('@/services/team/team.service', () => ({ logTeamClientAccess: vi.fn() }))

vi.mock('@/infrastructure/db/exchanges.repository', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/infrastructure/db/exchanges.repository')>()),
    findExchangeGroupsForScope: mocks.findExchangeGroupsForScope,
    insertExchangeGroup: mocks.insertExchangeGroup,
    updateExchangeGroup: mocks.updateExchangeGroup,
    softDeleteExchangeGroup: mocks.softDeleteExchangeGroup,
}))

import {
    createCoachExchangeGroup,
    deleteCoachExchangeGroup,
    findExchangeGroupConflict,
    getExchangeGroupsForCoach,
    updateCoachExchangeGroup,
    MAX_CUSTOM_EXCHANGE_GROUPS,
} from './nutrition-exchanges.service'

const db = {} as never
const COACH = 'coach-1'
const SCOPE = { orgId: null, activeTeamId: null }

function group(partial: Partial<ExchangeGroup> & Pick<ExchangeGroup, 'id' | 'code' | 'slug'>): ExchangeGroup {
    return {
        name: partial.code,
        coachId: null,
        teamId: null,
        isSystem: false,
        refCalories: 0,
        refProteinG: 0,
        refCarbsG: 0,
        refFatsG: 0,
        color: null,
        sortOrder: 100,
        composedOf: null,
        macrosConfirmed: false,
        ...partial,
    }
}

const G_SYSTEM_C = group({
    id: 'sys-c',
    code: 'C',
    slug: 'carbohidratos',
    name: 'Carbohidratos',
    isSystem: true,
})
const G_SYSTEM_LEG = group({
    id: 'sys-leg',
    code: 'LEG',
    slug: 'legumbres',
    name: 'Legumbres',
    isSystem: true,
    composedOf: [{ code: 'P', portions: 1 }],
})
const G_OWN_SHK = group({
    id: 'own-shk',
    code: 'SHK',
    slug: 'batido',
    name: 'Batido',
    coachId: COACH,
})

const VALUES = {
    name: 'Batido nuevo',
    code: 'BAT',
    refCalories: 180,
    refProteinG: 25,
    refCarbsG: 10,
    refFatsG: 3,
    color: '#3B82F6',
}

beforeEach(() => {
    vi.clearAllMocks()
    mocks.findExchangeGroupsForScope.mockResolvedValue([G_SYSTEM_C, G_SYSTEM_LEG, G_OWN_SHK])
    mocks.insertExchangeGroup.mockResolvedValue({ group: G_OWN_SHK })
    mocks.updateExchangeGroup.mockResolvedValue({ group: G_OWN_SHK })
    mocks.softDeleteExchangeGroup.mockResolvedValue({})
})

describe('findExchangeGroupConflict (unicidad case-insensitive, decisión pura)', () => {
    const catalog = [G_SYSTEM_C, G_OWN_SHK]

    it('detecta colisión de código sin importar mayúsculas/espacios', () => {
        expect(findExchangeGroupConflict(catalog, { code: 'c', slug: 'otra-cosa' })).toBe('code')
        expect(findExchangeGroupConflict(catalog, { code: ' SHK ', slug: 'otra-cosa' })).toBe('code')
    })
    it('detecta colisión de slug', () => {
        expect(findExchangeGroupConflict(catalog, { code: 'ZZZ', slug: 'BATIDO' })).toBe('slug')
    })
    it('sin colisión devuelve null', () => {
        expect(findExchangeGroupConflict(catalog, { code: 'ZZZ', slug: 'nuevo' })).toBe(null)
    })
    it('excluye el grupo que se está editando (renombrarse a sí mismo no colisiona)', () => {
        expect(findExchangeGroupConflict(catalog, { code: 'SHK', slug: 'batido' }, 'own-shk')).toBe(null)
        // …pero sigue chocando con el resto del catálogo.
        expect(findExchangeGroupConflict(catalog, { code: 'C', slug: 'batido' }, 'own-shk')).toBe('code')
    })
})

describe('createCoachExchangeGroup', () => {
    it('crea coach-scoped, deriva el slug del nombre y NO manda macros_confirmed', async () => {
        const res = await createCoachExchangeGroup(db, { actorCoachId: COACH, scope: SCOPE, values: VALUES })
        expect(res.success).toBe(true)
        const [, owner, values, sortOrder] = mocks.insertExchangeGroup.mock.calls[0]
        expect(owner).toEqual({ coachId: COACH, teamId: null })
        expect(values.slug).toBe('batido-nuevo')
        expect(values.code).toBe('BAT')
        expect(values).not.toHaveProperty('macrosConfirmed')
        // 1 grupo propio existente ⇒ el nuevo va después.
        expect(sortOrder).toBe(101)
    })

    it('rechaza colisionar con el código "C" del sistema (mensaje claro, sin escribir)', async () => {
        const res = await createCoachExchangeGroup(db, {
            actorCoachId: COACH,
            scope: SCOPE,
            values: { ...VALUES, code: 'c', name: 'Carbo propio' },
        })
        expect(res.success).toBe(false)
        if (!res.success) expect(res.error).toContain('«C»')
        expect(mocks.insertExchangeGroup).not.toHaveBeenCalled()
    })

    it('rechaza un nombre que produce el mismo slug que otro grupo propio', async () => {
        const res = await createCoachExchangeGroup(db, {
            actorCoachId: COACH,
            scope: SCOPE,
            values: { ...VALUES, code: 'ZZZ', name: 'BATIDO' },
        })
        expect(res.success).toBe(false)
        if (!res.success) expect(res.error).toContain('nombre')
        expect(mocks.insertExchangeGroup).not.toHaveBeenCalled()
    })

    it('respeta el tope de grupos propios', async () => {
        mocks.findExchangeGroupsForScope.mockResolvedValue(
            Array.from({ length: MAX_CUSTOM_EXCHANGE_GROUPS }, (_, i) =>
                group({ id: 'own-' + i, code: 'X' + i, slug: 'own-' + i, coachId: COACH }),
            ),
        )
        const res = await createCoachExchangeGroup(db, { actorCoachId: COACH, scope: SCOPE, values: VALUES })
        expect(res.success).toBe(false)
        expect(mocks.insertExchangeGroup).not.toHaveBeenCalled()
    })

    it('propaga el error del repository (RLS negó, etc.)', async () => {
        mocks.insertExchangeGroup.mockResolvedValue({ error: 'new row violates row-level security policy' })
        const res = await createCoachExchangeGroup(db, { actorCoachId: COACH, scope: SCOPE, values: VALUES })
        expect(res.success).toBe(false)
    })

    it('nunca llama assertModule: las porciones no son Pro ni módulo-gated', async () => {
        await createCoachExchangeGroup(db, { actorCoachId: COACH, scope: SCOPE, values: VALUES })
        expect(mocks.assertModule).not.toHaveBeenCalled()
    })
})

describe('updateCoachExchangeGroup', () => {
    it('edita un grupo propio', async () => {
        const res = await updateCoachExchangeGroup(db, {
            actorCoachId: COACH,
            scope: SCOPE,
            groupId: 'own-shk',
            values: { ...VALUES, code: 'SHK', name: 'Batido' },
        })
        expect(res.success).toBe(true)
        expect(mocks.updateExchangeGroup).toHaveBeenCalled()
    })

    it('NIEGA editar un grupo del sistema (aunque la RLS ya lo negaría)', async () => {
        const res = await updateCoachExchangeGroup(db, {
            actorCoachId: COACH,
            scope: SCOPE,
            groupId: 'sys-c',
            values: VALUES,
        })
        expect(res.success).toBe(false)
        expect(mocks.updateExchangeGroup).not.toHaveBeenCalled()
    })

    it('NIEGA editar un compuesto (fuera de alcance F1)', async () => {
        const res = await updateCoachExchangeGroup(db, {
            actorCoachId: COACH,
            scope: SCOPE,
            groupId: 'sys-leg',
            values: VALUES,
        })
        expect(res.success).toBe(false)
        expect(mocks.updateExchangeGroup).not.toHaveBeenCalled()
    })

    it('un grupo fuera del catálogo visible no se edita (cross-tenant)', async () => {
        const res = await updateCoachExchangeGroup(db, {
            actorCoachId: COACH,
            scope: SCOPE,
            groupId: 'de-otro-coach',
            values: VALUES,
        })
        expect(res.success).toBe(false)
        expect(mocks.updateExchangeGroup).not.toHaveBeenCalled()
    })
})

describe('deleteCoachExchangeGroup', () => {
    it('soft-borra un grupo propio', async () => {
        const res = await deleteCoachExchangeGroup(db, { actorCoachId: COACH, scope: SCOPE, groupId: 'own-shk' })
        expect(res.success).toBe(true)
        expect(mocks.softDeleteExchangeGroup).toHaveBeenCalledWith(db, 'own-shk')
    })
    it('NIEGA borrar un grupo del sistema', async () => {
        const res = await deleteCoachExchangeGroup(db, { actorCoachId: COACH, scope: SCOPE, groupId: 'sys-c' })
        expect(res.success).toBe(false)
        expect(mocks.softDeleteExchangeGroup).not.toHaveBeenCalled()
    })
    it('grupo invisible para el actor ⇒ error, sin escribir', async () => {
        const res = await deleteCoachExchangeGroup(db, { actorCoachId: COACH, scope: SCOPE, groupId: 'ajeno' })
        expect(res.success).toBe(false)
        expect(mocks.softDeleteExchangeGroup).not.toHaveBeenCalled()
    })
})

// ─── W1.12 · el filtro de visibilidad NO puede vivir rio arriba (R13 / T-02 / B-01) ─────
//
// Este bloque NO mockea `findExchangeGroupsForScope`: la deja correr de verdad contra un
// doble de supabase-js con los DOS sets en la tabla. Es la unica forma de que el test se
// ponga rojo el dia que alguien mueva `visibleExchangeGroupsForCoach` adentro del repo o del
// servicio: filtrado por set, un coach 'cl' SIN targets SMAE dejaria de ver la 'C', la 'LAC'
// y la 'LEG' del sistema, y `findExchangeGroupConflict` —que es puro y recibe ese mismo
// array— lo dejaria crear su propio grupo con ese codigo. El indice
// `exchange_groups_system_code_uq` no lo atrapa: es parcial `where is_system`.

type FakeResult = { data: unknown; error: null }

function systemRow(code: string, slug: string, portionSystem: 'smae' | 'cl', sortOrder: number) {
    return {
        id: `sys-${code.toLowerCase()}`,
        slug,
        code,
        name: code,
        coach_id: null,
        team_id: null,
        is_system: true,
        ref_calories: 100,
        ref_protein_g: 2,
        ref_carbs_g: 15,
        ref_fats_g: 1,
        color: null,
        sort_order: sortOrder,
        composed_of: null,
        macros_confirmed: true,
        portion_system: portionSystem,
    }
}

/** 9 SMAE + 13 chilenos, tal como los ve la RLS `xg_select` (que no conoce sets). */
const CATALOG_ROWS = [
    ...['C', 'P', 'F', 'V', 'LAC', 'ARL', 'SP', 'G', 'LEG'].map((code, i) =>
        systemRow(code, `smae-${code.toLowerCase()}`, 'smae', 10 + i * 10),
    ),
    ...['LD', 'LS', 'LE', 'CB', 'CA', 'LGS', 'VG', 'VL', 'FR', 'PCT', 'AG', 'AZ', 'SCP'].map((code, i) =>
        systemRow(code, `cl-${code.toLowerCase()}`, 'cl', 210 + i * 10),
    ),
    {
        ...systemRow('SHK', 'batido', 'smae', 100),
        id: 'own-shk',
        is_system: false,
        coach_id: COACH,
        name: 'Batido',
    },
]

/**
 * Doble de PostgREST que SI aplica `eq` / `in` / `is` sobre las filas.
 *
 * Un doble que los ignoraba dejaba estos 11 casos verdes ante la regresion que vienen a
 * cuidar: si alguien mete el filtro de set en la capa DB —`.eq('portion_system', coachSystem)`
 * dentro de `findExchangeGroupsForScope`, que es la forma natural de hacerlo mal— el catalogo
 * de autorizacion se achica, `findExchangeGroupConflict` deja de ver el otro set y el coach
 * puede crear un custom con el codigo `C`. Con el doble filtrando de verdad, ese cambio pone
 * en rojo el largo del catalogo Y los diez casos de unicidad.
 *
 * El `or()` del scope 3-vias NO se evalua a proposito: es el techo que la RLS ya impone y las
 * filas del fixture son justamente las que el coach puede ver.
 */
function catalogDb(rows: unknown[]) {
    // Una cadena NUEVA por `from()`: los predicados son de esa consulta, no del doble entero.
    const makeChain = () => {
        const chain: Record<string, unknown> = {}
        const predicates: ((row: Record<string, unknown>) => boolean)[] = []
        const resolveRows = () =>
            (rows as Record<string, unknown>[]).filter((row) => predicates.every((predicate) => predicate(row)))
        Object.assign(chain, {
            select: () => chain,
            or: () => chain,
            is: (column: string, value: unknown) => {
                predicates.push((row) => (row[column] ?? null) === value)
                return chain
            },
            in: (column: string, values: unknown[]) => {
                predicates.push((row) => values.includes(row[column]))
                return chain
            },
            eq: (column: string, value: unknown) => {
                predicates.push((row) => row[column] === value)
                return chain
            },
            order: () => chain,
            limit: () => chain,
            then: (resolve: (value: FakeResult) => unknown) =>
                Promise.resolve({ data: resolveRows(), error: null } as FakeResult).then(resolve),
        })
        return chain
    }
    return { from: () => makeChain() } as never
}

describe('W1.12 · visibilidad fuera del catalogo de autorizacion', () => {
    const catalogoDb = catalogDb(CATALOG_ROWS)
    const CL_COACH_VALUES = { ...VALUES, refCalories: 90 }

    beforeEach(async () => {
        const real = await vi.importActual<typeof import('@/infrastructure/db/exchanges.repository')>(
            '@/infrastructure/db/exchanges.repository',
        )
        // La REAL, no un stub: si alguien le mete el filtro adentro, estos casos se caen.
        mocks.findExchangeGroupsForScope.mockImplementation(real.findExchangeGroupsForScope)
    })

    it('getExchangeGroupsForCoach sigue devolviendo los DOS sets, sin filtrar ni marcar', async () => {
        const catalog = await getExchangeGroupsForCoach(catalogoDb, COACH, SCOPE)
        expect(catalog).toHaveLength(CATALOG_ROWS.length)
        expect(catalog.filter((g) => g.portionSystem === 'smae').map((g) => g.code)).toContain('C')
        expect(catalog.filter((g) => g.portionSystem === 'cl').map((g) => g.code)).toContain('PCT')
        expect(catalog.some((g) => 'legacy' in g)).toBe(false)
    })

    it.each(['C', 'LAC', 'LEG', 'FR', 'PCT'])(
        'un coach cl SIN targets SMAE no puede CREAR un grupo propio con el codigo %s',
        async (code) => {
            const res = await createCoachExchangeGroup(catalogoDb, {
                actorCoachId: COACH,
                scope: SCOPE,
                values: { ...CL_COACH_VALUES, code, name: `Mi ${code}` },
            })
            expect(res.success).toBe(false)
            if (!res.success) expect(res.error).toContain(`«${code}»`)
            expect(mocks.insertExchangeGroup).not.toHaveBeenCalled()
        },
    )

    it.each(['C', 'LAC', 'LEG', 'FR', 'PCT'])(
        'tampoco puede RENOMBRAR su grupo propio al codigo %s',
        async (code) => {
            const res = await updateCoachExchangeGroup(catalogoDb, {
                actorCoachId: COACH,
                scope: SCOPE,
                groupId: 'own-shk',
                values: { ...CL_COACH_VALUES, code, name: `Mi ${code}` },
            })
            expect(res.success).toBe(false)
            if (!res.success) expect(res.error).toContain(`«${code}»`)
            expect(mocks.updateExchangeGroup).not.toHaveBeenCalled()
        },
    )
})
