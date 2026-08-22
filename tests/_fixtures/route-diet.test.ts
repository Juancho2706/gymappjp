import { describe, it, expect } from 'vitest'
import { shouldAbort } from './route-diet'

const SITE = 'https://www.eva-app.cl'
const SUPABASE = 'https://abcdefghijklm.supabase.co'

describe('shouldAbort — intocables', () => {
    it('nunca aborta el REST de Supabase', () => {
        expect(shouldAbort({ url: `${SUPABASE}/rest/v1/coaches?select=id`, resourceType: 'fetch' })).toBe(false)
    })

    it('nunca aborta auth de Supabase', () => {
        expect(shouldAbort({ url: `${SUPABASE}/auth/v1/token?grant_type=refresh_token`, resourceType: 'xhr' })).toBe(false)
    })

    it('nunca aborta las API routes del propio sitio', () => {
        expect(shouldAbort({ url: `${SITE}/api/health`, resourceType: 'fetch' })).toBe(false)
        expect(shouldAbort({ url: `${SITE}/api/coach/search?q=ana`, resourceType: 'fetch' })).toBe(false)
    })

    it('nunca aborta una imagen servida desde /api/ (regla de ruta > regla de tipo)', () => {
        expect(shouldAbort({ url: `${SITE}/api/manifest/default/icon.png`, resourceType: 'image' })).toBe(false)
    })

    it('nunca aborta los chunks de Vercel', () => {
        expect(shouldAbort({ url: `${SITE}/_next/static/chunks/main-app-abc.js`, resourceType: 'script' })).toBe(false)
        expect(shouldAbort({ url: `${SITE}/_next/static/css/app.css`, resourceType: 'stylesheet' })).toBe(false)
    })

    it('nunca aborta el documento ni los datos RSC', () => {
        expect(shouldAbort({ url: `${SITE}/coach/dashboard`, resourceType: 'document' })).toBe(false)
        expect(shouldAbort({ url: `${SITE}/coach/clients?_rsc=1a2b3`, resourceType: 'fetch' })).toBe(false)
    })

    it('deja pasar esquemas que no son http(s)', () => {
        expect(shouldAbort({ url: 'data:image/png;base64,iVBORw0KGgo=', resourceType: 'image' })).toBe(false)
        expect(shouldAbort({ url: 'blob:https://www.eva-app.cl/9f1', resourceType: 'media' })).toBe(false)
    })

    it('ante una URL impareseable deja pasar (la dieta nunca causa un rojo)', () => {
        expect(shouldAbort({ url: 'no-es-una-url', resourceType: 'image' })).toBe(false)
    })
})

describe('shouldAbort — terceros', () => {
    it.each([
        ['https://us.i.posthog.com/decide/?v=3', 'fetch'],
        ['https://static.cloudflareinsights.com/beacon.min.js', 'script'],
        ['https://o123.ingest.sentry.io/api/456/envelope/', 'fetch'],
        ['https://fonts.gstatic.com/s/inter/v13/x.woff2', 'font'],
        ['https://www.googletagmanager.com/gtag/js', 'script'],
        ['https://connect.facebook.net/en_US/fbevents.js', 'script'],
    ])('aborta %s completo', (url, resourceType) => {
        expect(shouldAbort({ url, resourceType })).toBe(true)
    })

    it('aborta el tercero aunque el recurso sea liviano', () => {
        expect(shouldAbort({ url: 'https://us.i.posthog.com/e/', resourceType: 'xhr' })).toBe(true)
    })

    // Regresión del orden de reglas: las protecciones de `/api/` y de los `.js` son para el
    // SITIO. Si corren antes que la lista de terceros, Sentry, Cloudflare y Meta quedan blindados.
    it('aborta el envelope de Sentry aunque su ruta contenga /api/', () => {
        expect(
            shouldAbort({ url: 'https://o1.ingest.sentry.io/api/2/envelope/?sentry_key=x', resourceType: 'fetch' }),
        ).toBe(true)
    })

    it('aborta el beacon de Cloudflare aunque sea un .js', () => {
        expect(
            shouldAbort({ url: 'https://static.cloudflareinsights.com/beacon.min.js', resourceType: 'script' }),
        ).toBe(true)
    })
})

describe('shouldAbort — pesos muertos', () => {
    it('aborta los GIF/imágenes de Supabase Storage', () => {
        expect(
            shouldAbort({
                url: `${SUPABASE}/storage/v1/object/public/exercises/sentadilla.gif`,
                resourceType: 'image',
            }),
        ).toBe(true)
    })

    it('aborta el optimizador de imágenes de Next (proxea Storage y quema la cuota)', () => {
        expect(
            shouldAbort({ url: `${SITE}/_next/image?url=%2Fstorage%2Fx.png&w=640&q=75`, resourceType: 'image' }),
        ).toBe(true)
    })

    it('aborta video de Storage', () => {
        expect(
            shouldAbort({ url: `${SUPABASE}/storage/v1/object/public/demos/press.mp4`, resourceType: 'media' }),
        ).toBe(true)
    })

    it('NO aborta un estático propio servido por Vercel', () => {
        expect(shouldAbort({ url: `${SITE}/icon.png`, resourceType: 'image' })).toBe(false)
        expect(shouldAbort({ url: `${SITE}/_next/static/media/logo.svg`, resourceType: 'image' })).toBe(false)
    })

    it('NO aborta un fetch a Storage que no es imagen (podría ser dato del test)', () => {
        expect(
            shouldAbort({ url: `${SUPABASE}/storage/v1/object/list/exercises`, resourceType: 'fetch' }),
        ).toBe(false)
    })
})
