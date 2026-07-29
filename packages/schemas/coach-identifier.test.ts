import { describe, expect, it } from 'vitest'
import {
    CoachInviteCodeSchema,
    CoachSlugSchema,
    MobileStudentWorkspaceValidationRequestSchema,
    MobileStudentWorkspaceValidationResponseSchema,
    parseCoachIdentifier,
} from './coach-identifier'

describe('CoachInviteCodeSchema', () => {
    it('normaliza espacios y minúsculas', () => {
        expect(CoachInviteCodeSchema.parse('  ab2z9 ')).toBe('AB2Z9')
    })

    it.each(['ABCD0', 'ABCD1', 'ABCD', 'ABCDEF'])(
        'rechaza el código ambiguo o de largo incorrecto %s',
        value => {
            expect(CoachInviteCodeSchema.safeParse(value).success).toBe(false)
        },
    )

    it.each(['ABCDI', 'ABCDO'])('preserva el contrato histórico para %s', value => {
        expect(CoachInviteCodeSchema.parse(value)).toBe(value)
    })
})

describe('CoachSlugSchema', () => {
    it('normaliza a minúsculas', () => {
        expect(CoachSlugSchema.parse(' Coach-JP ')).toBe('coach-jp')
    })

    it.each(['ab', 'coach_jp', 'coach jp', `coach-${'x'.repeat(46)}`])(
        'rechaza el slug fuera de contrato %s',
        value => {
            expect(CoachSlugSchema.safeParse(value).success).toBe(false)
        },
    )
})

describe('parseCoachIdentifier', () => {
    it.each([
        ['AB2Z9', { type: 'code', value: 'AB2Z9' }],
        [' ab2z9 ', { type: 'code', value: 'AB2Z9' }],
        ['coach-jp', { type: 'slug', value: 'coach-jp' }],
        ['Coach-JP?utm_source=app#hero', { type: 'slug', value: 'coach-jp' }],
        ['/c/coach-jp', { type: 'slug', value: 'coach-jp' }],
        ['/c/AB2Z9/login?utm_source=app#hero', { type: 'code', value: 'AB2Z9' }],
        ['/invite/ab2z9?utm_source=app#hero', { type: 'code', value: 'AB2Z9' }],
        ['https://eva-app.cl/c/coach-jp/login?utm_source=app#hero', { type: 'slug', value: 'coach-jp' }],
        ['eva-app.cl/invite/AB2Z9#hero', { type: 'code', value: 'AB2Z9' }],
        ['eva://c/coach-jp?utm_source=app', { type: 'slug', value: 'coach-jp' }],
        ['/c/coach%2Djp', { type: 'slug', value: 'coach-jp' }],
    ])('clasifica %s', (input, expected) => {
        expect(parseCoachIdentifier(input)).toEqual(expected)
    })

    it.each([
        '',
        null,
        undefined,
        123,
        '/otro/coach-jp',
        'https://eva-app.cl/otro/coach-jp',
        '/c/%E0%A4%A',
        '%E0%A4%A',
        'https://%',
        'coach/jp',
        'coach_jp',
        'ab',
        'x'.repeat(2_049),
    ])('devuelve invalid sin lanzar para %s', input => {
        expect(() => parseCoachIdentifier(input)).not.toThrow()
        expect(parseCoachIdentifier(input)).toEqual({ type: 'invalid' })
    })
})

describe('MobileStudentWorkspaceValidationRequestSchema', () => {
    it('acepta únicamente coachId UUID', () => {
        const valid = { coachId: '11111111-1111-4111-8111-111111111111' }
        expect(MobileStudentWorkspaceValidationRequestSchema.parse(valid)).toEqual(valid)
        expect(MobileStudentWorkspaceValidationRequestSchema.safeParse({ coachId: 'coach-jp' }).success).toBe(false)
        expect(MobileStudentWorkspaceValidationRequestSchema.safeParse({ ...valid, userId: valid.coachId }).success).toBe(false)
    })
})

describe('MobileStudentWorkspaceValidationResponseSchema', () => {
    it('acepta éxito y errores públicos sin campos extra', () => {
        expect(MobileStudentWorkspaceValidationResponseSchema.parse({
            ok: true,
            forcePasswordChange: false,
        })).toEqual({
            ok: true,
            forcePasswordChange: false,
        })
        expect(MobileStudentWorkspaceValidationResponseSchema.parse({
            ok: false,
            code: 'ACCESS_DENIED',
            error: 'No tienes acceso.',
        })).toEqual({
            ok: false,
            code: 'ACCESS_DENIED',
            error: 'No tienes acceso.',
        })
        expect(MobileStudentWorkspaceValidationResponseSchema.safeParse({
            ok: false,
            code: 'DB_ERROR',
            error: 'detail',
        }).success).toBe(false)
    })
})
