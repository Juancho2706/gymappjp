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
        // `/join/<código>` es el enlace que EVA reparte de verdad (QR, póster, TeamShareLink y la
        // tarjeta de Share Entreno con `?ref&src&k`). Antes caía en `invalid`.
        [
            'https://www.eva-app.cl/join/CRDZ9?ref=ba265b0b-1111-4111-8111-111111111111&src=share_card&k=placa',
            { type: 'code', value: 'CRDZ9' },
        ],
        ['https://www.eva-app.cl/join/crdz9', { type: 'code', value: 'CRDZ9' }],
        ['www.eva-app.cl/join/CRDZ9?src=share_card', { type: 'code', value: 'CRDZ9' }],
        ['/join/CRDZ9', { type: 'code', value: 'CRDZ9' }],
        ['eva://join/CRDZ9?ref=x', { type: 'code', value: 'CRDZ9' }],
        ['https://www.eva-app.cl/join/coach-jp', { type: 'slug', value: 'coach-jp' }],
        ['/join/coach%2Djp', { type: 'slug', value: 'coach-jp' }],
        // Deep link propio de la app: el identificador viaja en el query, no en la ruta.
        ['https://www.eva-app.cl/alumno/codigo?identifier=CRDZ9&auto=1', { type: 'code', value: 'CRDZ9' }],
        ['https://www.eva-app.cl/c/AB2Z9/login#hero', { type: 'code', value: 'AB2Z9' }],
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
        // Guardas de que la allowlist no se abrió de más.
        '/join',
        'https://www.eva-app.cl/join/',
        'https://www.eva-app.cl/t/mi-equipo',
        'https://www.eva-app.cl/org/acme',
        'https://www.eva-app.cl/join/ab',
        'https://www.eva-app.cl/coach/clients',
        'https://www.eva-app.cl/pricing?code=nope!',
    ])('devuelve invalid sin lanzar para %s', input => {
        expect(() => parseCoachIdentifier(input)).not.toThrow()
        expect(parseCoachIdentifier(input)).toEqual({ type: 'invalid' })
    })

    describe('?code= no se traga los callbacks de auth de Supabase', () => {
        it.each([
            // El caso real: `app/auth/callback` y `app/register-callback` reciben `?code=<uuid>`.
            // El uuid pasaba el CoachSlugSchema y se clasificaba como slug, así que un código de
            // un solo uso terminaba viajando al RPC de branding.
            'https://eva-app.cl/auth/callback?code=11111111-1111-4111-8111-111111111111',
            'https://eva-app.cl/register-callback?code=11111111-1111-4111-8111-111111111111',
            'https://eva-app.cl/auth/callback?code=abcdef',
            'https://eva-app.cl/auth/callback?code=abcd',
        ])('ignora %s', input => {
            expect(parseCoachIdentifier(input)).toEqual({ type: 'invalid' })
        })

        it('sigue aceptando ?code= cuando tiene forma de código público EVA', () => {
            expect(parseCoachIdentifier('https://eva-app.cl/alumno/codigo?code=CRDZ9'))
                .toEqual({ type: 'code', value: 'CRDZ9' })
            expect(parseCoachIdentifier('https://eva-app.cl/alumno/codigo?code=crdz9'))
                .toEqual({ type: 'code', value: 'CRDZ9' })
        })

        it('un ?code= descartado no tapa al ?identifier= que sí sirve', () => {
            expect(parseCoachIdentifier('https://eva-app.cl/alumno/codigo?code=11111111-1111-4111-8111-111111111111&identifier=coach-jp'))
                .toEqual({ type: 'slug', value: 'coach-jp' })
        })

        it('la ruta pública sigue mandando sobre el query', () => {
            expect(parseCoachIdentifier('https://eva-app.cl/join/CRDZ9?code=11111111-1111-4111-8111-111111111111'))
                .toEqual({ type: 'code', value: 'CRDZ9' })
        })
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
