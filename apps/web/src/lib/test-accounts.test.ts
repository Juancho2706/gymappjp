import { describe, expect, it } from 'vitest'
import { isTestCoachEmail, TEST_COACH_EMAILS, TEST_COACH_EMAIL_DOMAINS } from './test-accounts'

describe('isTestCoachEmail', () => {
    it('matches the test domain (@evatest.cl) regardless of local part', () => {
        expect(isTestCoachEmail('persona1@evatest.cl')).toBe(true)
        expect(isTestCoachEmail('coach.e2e@evatest.cl')).toBe(true)
    })

    it('matches explicit listed emails', () => {
        expect(isTestCoachEmail('juanmvr2706@gmail.com')).toBe(true)
    })

    it('is case-insensitive (domain and explicit)', () => {
        expect(isTestCoachEmail('Persona1@EVATEST.CL')).toBe(true)
        expect(isTestCoachEmail('JuanMVR2706@Gmail.com')).toBe(true)
    })

    it('trims surrounding whitespace', () => {
        expect(isTestCoachEmail('  persona1@evatest.cl  ')).toBe(true)
        expect(isTestCoachEmail('  juanmvr2706@gmail.com ')).toBe(true)
    })

    it('returns false for real (non-test) coach emails', () => {
        expect(isTestCoachEmail('real.coach@gmail.com')).toBe(false)
        expect(isTestCoachEmail('owner@somegym.cl')).toBe(false)
        // Substring of the domain but not the domain itself.
        expect(isTestCoachEmail('user@notevatest.cl.evil.com')).toBe(false)
        expect(isTestCoachEmail('user@evatest.cl.attacker.com')).toBe(false)
    })

    it('returns false for null/undefined/empty', () => {
        expect(isTestCoachEmail(null)).toBe(false)
        expect(isTestCoachEmail(undefined)).toBe(false)
        expect(isTestCoachEmail('')).toBe(false)
        expect(isTestCoachEmail('   ')).toBe(false)
    })

    it('exports a documented explicit list and domain list to keep in sync with the SQL RPCs', () => {
        expect(TEST_COACH_EMAILS).toContain('juanmvr2706@gmail.com')
        expect(TEST_COACH_EMAIL_DOMAINS).toContain('evatest.cl')
    })
})
