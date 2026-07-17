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
