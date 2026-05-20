import { describe, expect, it } from 'vitest'
import { generateInviteCode, isValidInviteCode } from './invite-code'

describe('invite code helpers', () => {
    it('generates a valid five-character code', () => {
        expect(isValidInviteCode(generateInviteCode())).toBe(true)
    })

    it('rejects ambiguous and legacy values', () => {
        expect(isValidInviteCode('coach-a1-test')).toBe(false)
        expect(isValidInviteCode('A0I1O')).toBe(false)
        expect(isValidInviteCode('ABCDE')).toBe(true)
    })
})
