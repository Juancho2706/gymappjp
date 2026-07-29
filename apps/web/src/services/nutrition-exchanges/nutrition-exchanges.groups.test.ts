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
