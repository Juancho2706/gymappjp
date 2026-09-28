import { describe, expect, it } from 'vitest'
import { resolvePaidExpiryDecision, type RemoteVerification } from './paid-expiry'

// Función PURA del cron paid-expiry: decide EXPIRE vs ALERT-ONLY a partir del estado remoto verificado
// en el gateway + el estado en DB. Money-safety: en la duda, SIEMPRE alert-only.

const DB_STATUSES = ['active', 'canceled', 'past_due', 'paused'] as const

describe('resolvePaidExpiryDecision — remota MUERTA → EXPIRE (regla 1)', () => {
    for (const dbStatus of DB_STATUSES) {
        it(`mappedStatus 'canceled' (db=${dbStatus}) → expire`, () => {
            const d = resolvePaidExpiryDecision({ dbStatus, remote: { kind: 'status', mappedStatus: 'canceled' } })
            expect(d.action).toBe('expire')
            expect(d.reason).toBe('remote_dead:canceled')
        })
        it(`mappedStatus 'expired' (db=${dbStatus}) → expire`, () => {
            const d = resolvePaidExpiryDecision({ dbStatus, remote: { kind: 'status', mappedStatus: 'expired' } })
            expect(d.action).toBe('expire')
            expect(d.reason).toBe('remote_dead:expired')
        })
        it(`not_found / 404 (db=${dbStatus}) → expire`, () => {
            const d = resolvePaidExpiryDecision({ dbStatus, remote: { kind: 'not_found' } })
            expect(d.action).toBe('expire')
            expect(d.reason).toBe('remote_not_found')
        })
        it(`foreign_account / MP 400 callerId (db=${dbStatus}) → expire (cuenta vieja, incobrable)`, () => {
            const d = resolvePaidExpiryDecision({ dbStatus, remote: { kind: 'foreign_account' } })
            expect(d.action).toBe('expire')
            expect(d.reason).toBe('remote_foreign_account')
        })
    }
})

describe('resolvePaidExpiryDecision — remota VIVA → ALERT-ONLY (regla 3)', () => {
    const aliveStatuses = ['active', 'trialing', 'paused', 'pending_payment']
    for (const dbStatus of DB_STATUSES) {
        for (const mapped of aliveStatuses) {
            it(`mappedStatus '${mapped}' (db=${dbStatus}) → alert (nunca cortar; el gateway aún cobra)`, () => {
                const d = resolvePaidExpiryDecision({ dbStatus, remote: { kind: 'status', mappedStatus: mapped } })
                expect(d.action).toBe('alert')
                expect(d.reason).toBe(`remote_alive:${mapped}`)
            })
        }
    }
})

describe('resolvePaidExpiryDecision — sin id de suscripción (regla 2 vs 4)', () => {
    it("db 'canceled' + sin id → expire (cancelación ya procesada, nada que verificar)", () => {
        const d = resolvePaidExpiryDecision({ dbStatus: 'canceled', remote: { kind: 'no_sub_id' } })
        expect(d.action).toBe('expire')
        expect(d.reason).toBe('canceled_no_sub_id')
    })
    for (const dbStatus of ['active', 'past_due', 'paused'] as const) {
        it(`db '${dbStatus}' + sin id → alert (fail-safe: no cortar 'active' sin verificar)`, () => {
            const d = resolvePaidExpiryDecision({ dbStatus, remote: { kind: 'no_sub_id' } })
            expect(d.action).toBe('alert')
            expect(d.reason).toBe(`no_verifiable_id:${dbStatus}`)
        })
    }
})

describe('resolvePaidExpiryDecision — error transitorio → ALERT-ONLY (regla 4, fail-safe)', () => {
    for (const dbStatus of DB_STATUSES) {
        it(`error de verificación (db=${dbStatus}) → alert`, () => {
            const d = resolvePaidExpiryDecision({ dbStatus, remote: { kind: 'error' } })
            expect(d.action).toBe('alert')
            expect(d.reason).toBe('transient_error')
        })
    }
})

describe('resolvePaidExpiryDecision — estado mapeado desconocido → ALERT-ONLY (fail-safe)', () => {
    it("mappedStatus inesperado ('weird') → alert, no expira a ciegas", () => {
        const remote: RemoteVerification = { kind: 'status', mappedStatus: 'weird' }
        const d = resolvePaidExpiryDecision({ dbStatus: 'active', remote })
        expect(d.action).toBe('alert')
        expect(d.reason).toBe('remote_unknown:weird')
    })
})

describe('resolvePaidExpiryDecision — Flow MOROSA (regla 5, caso olympuswolf 09-2026)', () => {
    const status = (dunning: { morose: boolean; retriesPending: boolean } | null): RemoteVerification => ({
        kind: 'status',
        mappedStatus: 'active',
        dunning,
    })

    it('morosa y Flow ya no reintenta → expire + cancelAtProvider (cancelar antes de cortar)', () => {
        const d = resolvePaidExpiryDecision({ dbStatus: 'active', remote: status({ morose: true, retriesPending: false }) })
        expect(d).toEqual({ action: 'expire', reason: 'remote_morose_exhausted', cancelAtProvider: true })
    })

    it('morosa pero Flow sigue reintentando → alert (el cobro todavía puede entrar)', () => {
        const d = resolvePaidExpiryDecision({ dbStatus: 'active', remote: status({ morose: true, retriesPending: true }) })
        expect(d.action).toBe('alert')
        expect(d.reason).toBe('remote_dunning_retrying:active')
        expect(d.cancelAtProvider).toBeUndefined()
    })

    it('al día (no morosa) o sin dato de cobranza (MP) → alert remote_alive, igual que antes', () => {
        for (const dunning of [{ morose: false, retriesPending: false }, null]) {
            const d = resolvePaidExpiryDecision({ dbStatus: 'active', remote: status(dunning) })
            expect(d).toEqual({ action: 'alert', reason: 'remote_alive:active' })
        }
    })
})
