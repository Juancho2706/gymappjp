import { afterEach, describe, expect, it, vi } from 'vitest'
import { publicAppUrl, resolveMetadataBase } from './site-url'

/**
 * La base pública de los links que salen de la app. El caso que la creó (22-08): la variable de
 * Vercel con barra final convertía el acceso del alumno en `https://www.eva-app.cl//c/<code>/login`.
 */
afterEach(() => {
    vi.unstubAllEnvs()
})

describe('publicAppUrl', () => {
    it('recorta la barra final de NEXT_PUBLIC_APP_URL', () => {
        vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://www.eva-app.cl/')
        vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://www.eva-app.cl')
        expect(publicAppUrl()).toBe('https://www.eva-app.cl')
        expect(`${publicAppUrl()}/c/QAEMB/login`).toBe('https://www.eva-app.cl/c/QAEMB/login')
    })

    it('recorta varias barras y espacios', () => {
        vi.stubEnv('NEXT_PUBLIC_APP_URL', ' https://www.eva-app.cl//  ')
        expect(publicAppUrl()).toBe('https://www.eva-app.cl')
    })

    it('APP_URL gana sobre SITE_URL; sin APP_URL usa SITE_URL', () => {
        vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.example.test/')
        vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://site.example.test/')
        expect(publicAppUrl()).toBe('https://app.example.test')
        vi.stubEnv('NEXT_PUBLIC_APP_URL', '')
        expect(publicAppUrl()).toBe('https://site.example.test')
    })

    it('sin ninguna de las dos cae al origin de resolveMetadataBase (nunca un placeholder)', () => {
        vi.stubEnv('NEXT_PUBLIC_APP_URL', '')
        vi.stubEnv('NEXT_PUBLIC_SITE_URL', '')
        vi.stubEnv('VERCEL_URL', '')
        expect(publicAppUrl()).toBe(resolveMetadataBase().origin)
        expect(publicAppUrl()).toBe('https://www.eva-app.cl')
    })
})
