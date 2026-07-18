import { describe, it, expect, vi } from 'vitest'
import {
    hasPaidModuleAccess,
    deriveModulesForPaidAccess,
    getCoachEnabledModules,
    getTeamEnabledModules,
    MODULE_KEYS,
    type EnabledModules,
} from './entitlements.service'

/**
 * Derivación CEO (2026-07-17): "suscripción PAGA activa ⇒ los 4 módulos incluidos", como UNION con
 * las cortesías `admin_grant` crudas. FREE/expirado/bloqueado: sin derivación (sus cortesías siguen
 * valiendo tal cual). Derivar SOLO en lectura — jamás escribir coach_addons ni enabled_modules.
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

describe('hasPaidModuleAccess', () => {
    it('pago activo (status active + tier pago) ⇒ true', () => {
        expect(
            hasPaidModuleAccess({ subscriptionStatus: 'active', currentPeriodEnd: FUTURE, subscriptionTier: 'pro' }),
        ).toBe(true)
    })

    it('FREE (tier free, aunque el status sea active) ⇒ false', () => {
        expect(
            hasPaidModuleAccess({ subscriptionStatus: 'active', currentPeriodEnd: FUTURE, subscriptionTier: 'free' }),
        ).toBe(false)
    })

    it('expirado ⇒ false', () => {
        expect(
            hasPaidModuleAccess({ subscriptionStatus: 'expired', currentPeriodEnd: PAST, subscriptionTier: 'pro' }),
        ).toBe(false)
    })

    it('cancelado dentro de gracia (period_end futuro) ⇒ true', () => {
        expect(
            hasPaidModuleAccess({ subscriptionStatus: 'canceled', currentPeriodEnd: FUTURE, subscriptionTier: 'pro' }),
        ).toBe(true)
    })

    it('cancelado con gracia vencida ⇒ false', () => {
        expect(
            hasPaidModuleAccess({ subscriptionStatus: 'canceled', currentPeriodEnd: PAST, subscriptionTier: 'pro' }),
        ).toBe(false)
    })

    it('managed (team_managed / org_managed) ⇒ true sin importar tier', () => {
        expect(hasPaidModuleAccess({ subscriptionStatus: 'team_managed', subscriptionTier: 'free' })).toBe(true)
        expect(hasPaidModuleAccess({ subscriptionStatus: 'org_managed', subscriptionTier: null })).toBe(true)
    })
})

describe('deriveModulesForPaidAccess', () => {
    const paid = { subscriptionStatus: 'active', currentPeriodEnd: FUTURE, subscriptionTier: 'pro' }

    it('pago ⇒ los 4 módulos en ON', () => {
        const out = deriveModulesForPaidAccess({}, paid)
        for (const key of MODULE_KEYS) expect(out[key]).toBe(true)
    })

    it('pago con cortesía cruda ⇒ UNION (cortesía es no-op, quedan todos ON)', () => {
        const raw: EnabledModules = { cardio: true }
        const out = deriveModulesForPaidAccess(raw, paid)
        for (const key of MODULE_KEYS) expect(out[key]).toBe(true)
    })

    it('FREE con cortesía `admin_grant` cruda ⇒ respeta el raw (solo esa cortesía ON)', () => {
        const raw: EnabledModules = { cardio: true }
        const out = deriveModulesForPaidAccess(raw, {
            subscriptionStatus: 'active',
            currentPeriodEnd: FUTURE,
            subscriptionTier: 'free',
        })
        expect(out.cardio).toBe(true)
        expect(out.body_composition).toBeUndefined()
        expect(out.movement_assessment).toBeUndefined()
        expect(out.nutrition_exchanges).toBeUndefined()
    })

    it('expirado ⇒ respeta el raw (sin derivación)', () => {
        const raw: EnabledModules = { cardio: true }
        const out = deriveModulesForPaidAccess(raw, {
            subscriptionStatus: 'expired',
            currentPeriodEnd: PAST,
            subscriptionTier: 'pro',
        })
        expect(out).toEqual({ cardio: true })
    })
})

describe('getCoachEnabledModules (resolver que deriva en lectura)', () => {
    it('coach pago ⇒ deriva los 4 ON', async () => {
        const db = mockDb({
            enabled_modules: {},
            subscription_status: 'active',
            current_period_end: FUTURE,
            subscription_tier: 'elite',
        })
        const out = await getCoachEnabledModules(db, 'coach-1')
        for (const key of MODULE_KEYS) expect(out[key]).toBe(true)
    })

    it('coach FREE con cortesía ⇒ solo la cortesía (sin derivación)', async () => {
        const db = mockDb({
            enabled_modules: { body_composition: true },
            subscription_status: 'active',
            current_period_end: FUTURE,
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

describe('getTeamEnabledModules (pool pago por diseño ⇒ los 4 ON)', () => {
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
