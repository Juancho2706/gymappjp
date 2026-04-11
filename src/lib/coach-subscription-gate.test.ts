import { describe, expect, it } from 'vitest'
import { resolveCoachSubscriptionRedirect } from '@/lib/coach-subscription-gate'

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
        expect(resolveCoachSubscriptionRedirect('/coach/subscription/processing', 'trialing')).toBe('/coach/dashboard')
    })

    it('does not redirect active coaches on normal pages', () => {
        expect(resolveCoachSubscriptionRedirect('/coach/dashboard', 'active')).toBeNull()
        expect(resolveCoachSubscriptionRedirect('/coach/clients', 'trialing')).toBeNull()
    })
})
