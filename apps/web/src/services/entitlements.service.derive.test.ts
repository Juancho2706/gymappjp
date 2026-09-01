import { describe, it, expect, vi } from 'vitest'
import {
    hasActiveModuleAccess,
    deriveModulesForActiveAccess,
    getCoachEnabledModules,
    getTeamEnabledModules,
    hasModule,
    assertModule,
    MODULE_KEYS,
    type EnabledModules,
} from './entitlements.service'

/**
 * Criterio único: "coach con ACCESO VIGENTE ⇒ los 4 módulos incluidos" (managed, o
 * `hasEffectiveAccess` para el standalone). El tipo de suscripción no interviene: `subscriptionTier`
 * viaja en el snapshot solo por compatibilidad. UNION con las cortesías `admin_grant` crudas.
 * INACTIVO (expirado/bloqueado): sin derivación (sus cortesías siguen valiendo tal cual).
 * Derivar SOLO en lectura — jamás escribir coach_addons ni enabled_modules.
 * El kill-switch de operador se aplica por encima, en `hasModule` / `hasModuleFromMap`.
 */

const FUTURE = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
const PAST = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

/** Mock del chain `db.from(table).select(cols).eq(col, val).maybeSingle()`. */
function mockDb(row: Record<string, unknown> | null) {
    const maybeSingle = vi.fn().mockResolvedValue({ data: row, error: null })
    const eq = vi.fn(() => ({ maybeSingle }))
    const select = vi.fn(() => ({ eq }))
    const from = vi.fn(() => ({ select }))
    return { from } as never
}

describe('hasActiveModuleAccess', () => {
    it('activo (status active) ⇒ true, el tier no influye', () => {
        expect(
            hasActiveModuleAccess({ subscriptionStatus: 'active', currentPeriodEnd: FUTURE, subscriptionTier: 'pro' }),
        ).toBe(true)
    })

    it('activo con otro tier ⇒ true igual (el tier no gatea)', () => {
        expect(
            hasActiveModuleAccess({ subscriptionStatus: 'active', currentPeriodEnd: FUTURE, subscriptionTier: 'free' }),
        ).toBe(true)
    })

    it('INACTIVO (expired) ⇒ false, cualquiera sea el tier', () => {
        expect(
            hasActiveModuleAccess({ subscriptionStatus: 'expired', currentPeriodEnd: PAST, subscriptionTier: 'free' }),
        ).toBe(false)
    })

    it('expirado ⇒ false', () => {
        expect(
            hasActiveModuleAccess({ subscriptionStatus: 'expired', currentPeriodEnd: PAST, subscriptionTier: 'pro' }),
        ).toBe(false)
    })

    it('cancelado dentro de gracia (period_end futuro) ⇒ true', () => {
        expect(
            hasActiveModuleAccess({ subscriptionStatus: 'canceled', currentPeriodEnd: FUTURE, subscriptionTier: 'pro' }),
        ).toBe(true)
    })

    it('cancelado con gracia vencida ⇒ false', () => {
        expect(
            hasActiveModuleAccess({ subscriptionStatus: 'canceled', currentPeriodEnd: PAST, subscriptionTier: 'pro' }),
        ).toBe(false)
    })

    it('managed (team_managed / org_managed) ⇒ true sin importar tier', () => {
        expect(hasActiveModuleAccess({ subscriptionStatus: 'team_managed', subscriptionTier: 'free' })).toBe(true)
        expect(hasActiveModuleAccess({ subscriptionStatus: 'org_managed', subscriptionTier: null })).toBe(true)
    })
})

describe('deriveModulesForActiveAccess', () => {
    const activo = { subscriptionStatus: 'active', currentPeriodEnd: FUTURE, subscriptionTier: 'pro' }

    it('acceso vigente ⇒ los 4 módulos en ON', () => {
        const out = deriveModulesForActiveAccess({}, activo)
        for (const key of MODULE_KEYS) expect(out[key]).toBe(true)
    })

    it('acceso vigente con cortesía cruda ⇒ UNION (cortesía es no-op, quedan todos ON)', () => {
        const raw: EnabledModules = { cardio: true }
        const out = deriveModulesForActiveAccess(raw, activo)
        for (const key of MODULE_KEYS) expect(out[key]).toBe(true)
    })

    it('activo con otro tier ⇒ deriva los 4 en ON igual (el tier no influye)', () => {
        const out = deriveModulesForActiveAccess({}, {
            subscriptionStatus: 'active',
            currentPeriodEnd: FUTURE,
            subscriptionTier: 'free',
        })
        for (const key of MODULE_KEYS) expect(out[key]).toBe(true)
    })

    it('INACTIVO con cortesía `admin_grant` cruda ⇒ respeta el raw (solo esa cortesía ON)', () => {
        const raw: EnabledModules = { cardio: true }
        const out = deriveModulesForActiveAccess(raw, {
            subscriptionStatus: 'expired',
            currentPeriodEnd: PAST,
            subscriptionTier: 'free',
        })
        expect(out.cardio).toBe(true)
        expect(out.body_composition).toBeUndefined()
        expect(out.movement_assessment).toBeUndefined()
        expect(out.nutrition_exchanges).toBeUndefined()
    })

    it('expirado ⇒ respeta el raw (sin derivación)', () => {
        const raw: EnabledModules = { cardio: true }
        const out = deriveModulesForActiveAccess(raw, {
            subscriptionStatus: 'expired',
            currentPeriodEnd: PAST,
            subscriptionTier: 'pro',
        })
        expect(out).toEqual({ cardio: true })
    })
})

describe('getCoachEnabledModules (resolver que deriva en lectura)', () => {
    it('coach con acceso vigente ⇒ deriva los 4 ON', async () => {
        const db = mockDb({
            enabled_modules: {},
            subscription_status: 'active',
            current_period_end: FUTURE,
            subscription_tier: 'elite',
        })
        const out = await getCoachEnabledModules(db, 'coach-1')
        for (const key of MODULE_KEYS) expect(out[key]).toBe(true)
    })

    it('coach ACTIVO sin current_period_end ⇒ deriva los 4 ON (el tier no influye)', async () => {
        const db = mockDb({
            enabled_modules: {},
            subscription_status: 'active',
            current_period_end: null,
            subscription_tier: 'free',
        })
        const out = await getCoachEnabledModules(db, 'coach-1')
        for (const key of MODULE_KEYS) expect(out[key]).toBe(true)
    })

    it('coach INACTIVO con cortesía ⇒ solo la cortesía (sin derivación)', async () => {
        const db = mockDb({
            enabled_modules: { body_composition: true },
            subscription_status: 'expired',
            current_period_end: PAST,
            subscription_tier: 'free',
        })
        const out = await getCoachEnabledModules(db, 'coach-1')
        expect(out.body_composition).toBe(true)
        expect(out.cardio).toBeUndefined()
    })

    it('coach inexistente ⇒ {}', async () => {
        const out = await getCoachEnabledModules(mockDb(null), 'nope')
        expect(out).toEqual({})
    })
})

describe('hasModule / assertModule — coach activo vs inactivo', () => {
    const coachActivo = {
        enabled_modules: {},
        subscription_status: 'active',
        current_period_end: null,
        subscription_tier: 'free',
    }
    const coachInactivo = {
        enabled_modules: {},
        subscription_status: 'expired',
        current_period_end: PAST,
        subscription_tier: 'free',
    }

    it('coach ACTIVO ⇒ hasModule true para cardio y nutrition_exchanges', async () => {
        expect(await hasModule(mockDb(coachActivo), 'cardio', { coachId: 'coach-1' })).toBe(true)
        expect(await hasModule(mockDb(coachActivo), 'nutrition_exchanges', { coachId: 'coach-1' })).toBe(true)
    })

    it('coach INACTIVO ⇒ hasModule false', async () => {
        expect(await hasModule(mockDb(coachInactivo), 'cardio', { coachId: 'coach-1' })).toBe(false)
        expect(await hasModule(mockDb(coachInactivo), 'nutrition_exchanges', { coachId: 'coach-1' })).toBe(false)
    })

    it('assertModule sigue negando (throw) al coach INACTIVO', async () => {
        await expect(
            assertModule(mockDb(coachInactivo), 'cardio', { coachId: 'coach-1' }),
        ).rejects.toThrow('Modulo no habilitado: cardio')
    })

    it('assertModule NO lanza para el coach ACTIVO', async () => {
        await expect(
            assertModule(mockDb(coachActivo), 'nutrition_exchanges', { coachId: 'coach-1' }),
        ).resolves.toBeUndefined()
    })
})

describe('getTeamEnabledModules (pool con acceso siempre vigente ⇒ los 4 ON)', () => {
    it('team existente ⇒ los 4 módulos en ON (UNION con enabled_modules crudo)', async () => {
        const db = mockDb({ enabled_modules: {} })
        const out = await getTeamEnabledModules(db, 'team-1')
        for (const key of MODULE_KEYS) expect(out[key]).toBe(true)
    })

    it('team inexistente ⇒ {} (no deriva sobre una fila ausente)', async () => {
        const out = await getTeamEnabledModules(mockDb(null), 'nope')
        expect(out).toEqual({})
    })
})
