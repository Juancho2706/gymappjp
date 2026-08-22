import { describe, expect, it } from 'vitest'
import { DEFAULT_WEB_NEXT, resolveAbrirAppParams } from './params'

/**
 * Lo que se pinnea acá son los dos bordes que rompen el regreso a la app en iOS:
 *   1. el deep link tiene que ser parseable por `+native-intent` (scheme `eva`, ruta
 *      `auth/confirmed`, parámetro `email`) con CUALQUIER email real; y
 *   2. `next` es un query controlable por quien arme el link, así que no puede salir del sitio.
 */
describe('resolveAbrirAppParams — deep link a la app', () => {
    it('arma `eva://auth/confirmed?email=…` con el email codificado', () => {
        const { deepLink } = resolveAbrirAppParams({ email: 'coach@example.com' })
        expect(deepLink).toBe('eva://auth/confirmed?email=coach%40example.com')
    })

    it('codifica los caracteres que romperían el query (+, &, espacio, tildes)', () => {
        const { deepLink } = resolveAbrirAppParams({ email: 'josé+eva&x y@example.com' })
        // Ni un `+` crudo (la app lo leería como espacio) ni un `&` que corte el parámetro.
        expect(deepLink).toBe('eva://auth/confirmed?email=jos%C3%A9%2Beva%26x%20y%40example.com')
        expect(deepLink.split('?')[1]?.split('&')).toHaveLength(1)
    })

    it('sin email NO manda `email=` (la app cae al login con el campo vacío, no a `email=undefined`)', () => {
        expect(resolveAbrirAppParams({}).deepLink).toBe('eva://auth/confirmed')
        expect(resolveAbrirAppParams({ email: '   ' }).deepLink).toBe('eva://auth/confirmed')
        expect(resolveAbrirAppParams({ email: ['a@b.cl'] }).deepLink).toBe('eva://auth/confirmed')
        expect(resolveAbrirAppParams({ email: 'a'.repeat(321) }).deepLink).toBe('eva://auth/confirmed')
    })

    it('devuelve el email recortado para pintarlo', () => {
        expect(resolveAbrirAppParams({ email: '  coach@example.com  ' }).email).toBe('coach@example.com')
        expect(resolveAbrirAppParams({}).email).toBe('')
    })
})

describe('resolveAbrirAppParams — `next` de «Seguir en la web»', () => {
    it('conserva una ruta interna bajo /coach con su query', () => {
        expect(resolveAbrirAppParams({ next: '/coach/dashboard?welcome=free' }).webNext).toBe(
            '/coach/dashboard?welcome=free',
        )
    })

    it('cae al panel con cualquier `next` inválido', () => {
        const malicious = [
            'https://evil.tld',
            '//evil.tld',
            '/\evil.tld',
            '/coach/..%2Fadmin',
            'javascript:alert(1)',
            '/admin/dashboard',
            '',
            undefined,
            null,
            42,
        ]
        for (const next of malicious) {
            expect(resolveAbrirAppParams({ next }).webNext).toBe(DEFAULT_WEB_NEXT)
        }
        expect(DEFAULT_WEB_NEXT).toBe('/coach/dashboard')
    })
})
