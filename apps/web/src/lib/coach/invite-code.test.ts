import { describe, expect, it } from 'vitest'
import { generateInviteCode, isValidInviteCode, needsPublicCodeConfirmation, PUBLIC_CODE_CUTOVER } from './invite-code'

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

describe('needsPublicCodeConfirmation — el modal «Tu link de alumnos cambió»', () => {
    const base = { inviteCode: 'ABCDE', generated: false, inviteCodeConfirmed: false }

    it('coach creado DESPUÉS del corte: nació con código, no confirma nada', () => {
        expect(needsPublicCodeConfirmation({ ...base, createdAt: '2026-08-22T05:00:00Z' })).toBe(false)
    })

    it('coach anterior al corte sin confirmar: sí, puede tener el link viejo', () => {
        expect(needsPublicCodeConfirmation({ ...base, createdAt: '2026-04-10T12:00:00Z' })).toBe(true)
    })

    it('ya confirmado ⇒ no, sea de cuando sea', () => {
        expect(needsPublicCodeConfirmation({ ...base, inviteCodeConfirmed: true, createdAt: '2026-04-10T12:00:00Z' })).toBe(false)
    })

    it('código recién generado ⇒ sí, aunque el coach sea nuevo', () => {
        expect(needsPublicCodeConfirmation({ ...base, generated: true, createdAt: '2026-08-22T05:00:00Z' })).toBe(true)
    })

    it('sin código válido ⇒ nunca', () => {
        expect(needsPublicCodeConfirmation({ ...base, inviteCode: 'X5UD9X44', createdAt: '2026-04-10T12:00:00Z' })).toBe(false)
    })

    it('sin fecha o con fecha inválida ⇒ conservador: sí', () => {
        expect(needsPublicCodeConfirmation({ ...base, createdAt: null })).toBe(true)
        expect(needsPublicCodeConfirmation({ ...base, createdAt: 'no-es-fecha' })).toBe(true)
        expect(PUBLIC_CODE_CUTOVER.toISOString()).toBe('2026-05-23T00:00:00.000Z')
    })
})
