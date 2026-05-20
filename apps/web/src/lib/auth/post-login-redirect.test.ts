import { describe, expect, it } from 'vitest'
import { getPostLoginRedirect } from './post-login-redirect'

describe('getPostLoginRedirect', () => {
    it('sends org owners to the enterprise panel', () => {
        expect(getPostLoginRedirect({
            isCoach: true,
            activeOrgSlug: 'movida',
            activeOrgRole: 'org_owner',
        })).toBe('/org/movida')
    })

    it('sends org admins to the enterprise panel', () => {
        expect(getPostLoginRedirect({
            isCoach: true,
            activeOrgSlug: 'movida',
            activeOrgRole: 'org_admin',
        })).toBe('/org/movida')
    })

    it('sends enterprise coaches without admin role to the coach panel', () => {
        expect(getPostLoginRedirect({
            isCoach: true,
            activeOrgSlug: 'movida',
            activeOrgRole: 'coach',
        })).toBe('/coach/dashboard')
    })

    it('sends standalone coaches to the coach panel', () => {
        expect(getPostLoginRedirect({ isCoach: true })).toBe('/coach/dashboard')
    })

    it('sends clients to their white-label dashboard', () => {
        expect(getPostLoginRedirect({
            isCoach: false,
            clientCoachSlug: 'coach-a1-test',
        })).toBe('/c/coach-a1-test/dashboard')
    })
})
