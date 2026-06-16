import { describe, expect, it } from 'vitest'
import { hasEffectiveAccess, resolveCoachSubscriptionRedirect } from '@/lib/coach-subscription-gate'

/** ISO futuro: `trialing` / `canceled` solo tienen acceso si `current_period_end` > ahora */
const periodEndFuture = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

describe('resolveCoachSubscriptionRedirect', () => {
    it('sends blocked coaches to reactivate', () => {
        expect(resolveCoachSubscriptionRedirect('/coach/dashboard', 'pending_payment')).toBe('/coach/reactivate')
        expect(resolveCoachSubscriptionRedirect('/coach/clients', 'expired')).toBe('/coach/reactivate')
    })

    it('allows blocked coaches on gate pages', () => {
        expect(resolveCoachSubscriptionRedirect('/coach/reactivate', 'pending_payment')).toBeNull()
        expect(resolveCoachSubscriptionRedirect('/coach/subscription/processing', 'pending_payment')).toBeNull()
    })

    it('sends active coaches away from gate pages', () => {
        expect(resolveCoachSubscriptionRedirect('/coach/reactivate', 'active')).toBe('/coach/dashboard')
        expect(
            resolveCoachSubscriptionRedirect('/coach/subscription/processing', 'trialing', periodEndFuture)
        ).toBe('/coach/dashboard')
    })

    it('does not redirect active coaches on normal pages', () => {
        expect(resolveCoachSubscriptionRedirect('/coach/dashboard', 'active')).toBeNull()
        expect(resolveCoachSubscriptionRedirect('/coach/clients', 'trialing', periodEndFuture)).toBeNull()
    })
})

// P0-3a: dunning involuntario (paused/past_due) conserva acceso hasta current_period_end (gracia,
// como el cancel voluntario). pending_payment/expired siguen siendo bloqueo duro sin gracia.
const future = new Date(Date.now() + 86_400_000).toISOString()
const past = new Date(Date.now() - 86_400_000).toISOString()

describe('hasEffectiveAccess — gracia de dunning (P0-3a)', () => {
    it('paused con período vigente → acceso (gracia)', () => {
        expect(hasEffectiveAccess('paused', future)).toBe(true)
    })
    it('past_due con período vigente → acceso (gracia)', () => {
        expect(hasEffectiveAccess('past_due', future)).toBe(true)
    })
    it('paused con período vencido → bloqueado', () => {
        expect(hasEffectiveAccess('paused', past)).toBe(false)
    })
    it('paused sin período → bloqueado', () => {
        expect(hasEffectiveAccess('paused', null)).toBe(false)
    })
    it('expired SIEMPRE bloqueado (sin gracia, aún con período futuro)', () => {
        expect(hasEffectiveAccess('expired', future)).toBe(false)
    })
    it('pending_payment SIEMPRE bloqueado', () => {
        expect(hasEffectiveAccess('pending_payment', future)).toBe(false)
    })
    it('canceled con período vigente → acceso (sin regresión)', () => {
        expect(hasEffectiveAccess('canceled', future)).toBe(true)
    })
    it('active → acceso', () => {
        expect(hasEffectiveAccess('active', null)).toBe(true)
    })
    it('managed (org_managed) → acceso', () => {
        expect(hasEffectiveAccess('org_managed', null)).toBe(true)
    })
})
