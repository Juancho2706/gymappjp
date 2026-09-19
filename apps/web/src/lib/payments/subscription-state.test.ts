import { describe, expect, it } from 'vitest'
import { mapProviderStatus, resolveCurrentPeriodEnd, resolvePeriodDrift, resolveTerminalEvent } from '@/lib/payments/subscription-state'

describe('mapProviderStatus', () => {
    it('maps trialing', () => {
        expect(mapProviderStatus('trialing')).toBe('trialing')
    })

    it('maps authorized to active', () => {
        expect(mapProviderStatus('authorized')).toBe('active')
    })
})

describe('resolveCurrentPeriodEnd', () => {
    it('computes period for trialing like active when provider gives date', () => {
        const end = resolveCurrentPeriodEnd({
            status: 'trialing',
            billingCycle: 'monthly',
            currentPeriodEnd: null,
            providerCurrentPeriodEnd: '2030-01-01T00:00:00.000Z',
        })
        expect(end).toBe('2030-01-01T00:00:00.000Z')
    })

    it('returns null for canceled', () => {
        expect(
            resolveCurrentPeriodEnd({
                status: 'canceled',
                billingCycle: 'monthly',
                providerCurrentPeriodEnd: '2030-01-01T00:00:00.000Z',
            })
        ).toBeNull()
    })
})

describe('resolveTerminalEvent', () => {
    it('expires a paid coach on a rejected/expired event', () => {
        expect(
            resolveTerminalEvent({ statusForUpdate: 'expired', periodExpiredOrNull: true, subscriptionTier: 'pro' })
        ).toBe('expire')
    })

    it('expires a paid coach on a cancellation once the paid period has lapsed', () => {
        expect(
            resolveTerminalEvent({ statusForUpdate: 'canceled', periodExpiredOrNull: true, subscriptionTier: 'pro' })
        ).toBe('expire')
    })

    it('does not block a cancellation while the paid period is still active', () => {
        expect(
            resolveTerminalEvent({ statusForUpdate: 'canceled', periodExpiredOrNull: false, subscriptionTier: 'pro' })
        ).toBe('none')
    })

    it('ignores a stale terminal event for a free-tier coach (activate-free race)', () => {
        expect(
            resolveTerminalEvent({ statusForUpdate: 'canceled', periodExpiredOrNull: true, subscriptionTier: 'free' })
        ).toBe('ignore-free')
        expect(
            resolveTerminalEvent({ statusForUpdate: 'expired', periodExpiredOrNull: true, subscriptionTier: 'free' })
        ).toBe('ignore-free')
    })

    it('returns none for non-terminal events', () => {
        expect(
            resolveTerminalEvent({ statusForUpdate: 'active', periodExpiredOrNull: true, subscriptionTier: 'pro' })
        ).toBe('none')
        expect(
            resolveTerminalEvent({ statusForUpdate: 'pending_payment', periodExpiredOrNull: true, subscriptionTier: 'free' })
        ).toBe('none')
    })

    // El hueco del caso Joaquin (19-08): un decline de renovación con período PAGADO vigente
    // expulsaba al coach con días pagados adentro. La decisión vive en el status CRUDO del
    // gateway porque mapProviderStatus colapsa rejected/refunded/charged_back en 'expired'.
    it('grants dunning grace on a rejected renewal while the paid period is still running', () => {
        expect(
            resolveTerminalEvent({
                statusForUpdate: 'expired',
                periodExpiredOrNull: false,
                subscriptionTier: 'pro',
                providerStatus: 'rejected',
            })
        ).toBe('past-due')
    })

    it('still expires a rejected renewal once the paid period has lapsed (Joaquin timing)', () => {
        expect(
            resolveTerminalEvent({
                statusForUpdate: 'expired',
                periodExpiredOrNull: true,
                subscriptionTier: 'pro',
                providerStatus: 'rejected',
            })
        ).toBe('expire')
    })

    it('refund/chargeback expire on the spot even with a running period — the money went back', () => {
        expect(
            resolveTerminalEvent({
                statusForUpdate: 'expired',
                periodExpiredOrNull: false,
                subscriptionTier: 'elite',
                providerStatus: 'refunded',
            })
        ).toBe('expire')
        expect(
            resolveTerminalEvent({
                statusForUpdate: 'expired',
                periodExpiredOrNull: false,
                subscriptionTier: 'pro',
                providerStatus: 'charged_back',
            })
        ).toBe('expire')
    })

    it('free tier keeps its guard even on a rejected renewal with a running period', () => {
        expect(
            resolveTerminalEvent({
                statusForUpdate: 'expired',
                periodExpiredOrNull: false,
                subscriptionTier: 'free',
                providerStatus: 'rejected',
            })
        ).toBe('ignore-free')
    })
})

// ── Drift de período (incidente 2026-09-18, coach JB fitness) ────────────────────────────────────
// El coach pagó el 26-08 y le fechamos el corte al 26-09 (`charged_at + 1 mes`), pero MP siguió
// facturando su día 18. El 18-09 cobró, la tarjeta rechazó, y quedó en dunning con OCHO DÍAS
// pagados por delante. Las dos fechas llevaban un mes separadas y nada las comparaba.
describe('resolvePeriodDrift — nuestro corte vs. el calendario del gateway', () => {
    it('el caso real: corte 26-09 vs MP cobrando el 18-09 ⇒ drift de 8 días', () => {
        const r = resolvePeriodDrift('2026-09-26T15:14:13Z', '2026-09-18T22:18:00Z')
        expect(r.comparable).toBe(true)
        expect(r.driftDays).toBe(8)
        expect(r.drifted).toBe(true)
    })

    it('fechas alineadas ⇒ sin drift', () => {
        const r = resolvePeriodDrift('2026-09-26T15:14:13Z', '2026-09-26T15:14:13Z')
        expect(r.driftDays).toBe(0)
        expect(r.drifted).toBe(false)
    })

    it('unas horas de diferencia NO son drift (reintentos, husos, fines de semana)', () => {
        const r = resolvePeriodDrift('2026-09-26T00:00:00Z', '2026-09-26T20:00:00Z')
        expect(r.drifted).toBe(false)
    })

    it('la tolerancia es de 2 días: 2 no alerta, 3 sí', () => {
        expect(resolvePeriodDrift('2026-09-26T00:00:00Z', '2026-09-24T00:00:00Z').drifted).toBe(false)
        expect(resolvePeriodDrift('2026-09-26T00:00:00Z', '2026-09-23T00:00:00Z').drifted).toBe(true)
    })

    it('es simétrico: da igual si el gateway cobra antes o después', () => {
        const antes = resolvePeriodDrift('2026-09-26T00:00:00Z', '2026-09-18T00:00:00Z')
        const despues = resolvePeriodDrift('2026-09-18T00:00:00Z', '2026-09-26T00:00:00Z')
        expect(antes.driftDays).toBe(despues.driftDays)
        expect(antes.drifted).toBe(despues.drifted)
    })

    it('sin fecha de alguno de los dos lados ⇒ NO comparable, que no es lo mismo que «sin drift»', () => {
        for (const [ours, theirs] of [
            [null, '2026-09-18T00:00:00Z'],
            ['2026-09-26T00:00:00Z', null],
            [null, null],
            [undefined, undefined],
            ['no-es-fecha', '2026-09-18T00:00:00Z'],
        ] as const) {
            const r = resolvePeriodDrift(ours, theirs)
            expect(r.comparable).toBe(false)
            expect(r.driftDays).toBeNull()
            // `drifted` false para no inundar de alertas falsas, pero `comparable` lo distingue.
            expect(r.drifted).toBe(false)
        }
    })

    it('la tolerancia es inyectable (un ciclo anual admite más holgura)', () => {
        const r = resolvePeriodDrift('2026-09-26T00:00:00Z', '2026-09-18T00:00:00Z', 10)
        expect(r.driftDays).toBe(8)
        expect(r.drifted).toBe(false)
    })
})
