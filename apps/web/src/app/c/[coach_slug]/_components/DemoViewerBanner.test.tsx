import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Persona } from '@eva/schemas/persona'

/**
 * Banner de la vista de ejemplo (docs/specs/vive-tu-app-directo §3).
 *
 * Se monta con los headers simulados que inyecta el proxy (molde `lib/student-access.test.ts`):
 * es un server component y lo único que decide es qué salida ofrecerle al coach. Los tres modos
 * NO son intercambiables — ofrecer «Volver a mi panel» cuando no hay cookie de retorno sería
 * prometer algo que el servidor no puede cumplir.
 */

let headerMap: Record<string, string> = {}
let cookieMap: Record<string, string> = {}
let persona: Persona | null = null

vi.mock('next/headers', () => ({
    headers: async () => ({ get: (k: string) => headerMap[k.toLowerCase()] ?? null }),
    cookies: async () => ({
        get: (k: string) => (cookieMap[k] === undefined ? undefined : { name: k, value: cookieMap[k] }),
    }),
}))

vi.mock('../_data/client-root.queries', () => ({
    getDemoViewerPersona: async () => persona,
}))

import { DemoViewerBanner } from './DemoViewerBanner'

const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/126 Mobile Safari/537.36'
const IOS_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Version/17.5 Mobile Safari/605.1'

/** Espejo de `encodeBrandHeaderValue`: así viaja el nombre en el header del proxy. */
function asHeader(value: string) {
    return encodeURIComponent(value)
}

async function render(overrides: {
    mode?: string
    name?: string
    isDemo?: string
    ua?: string
    from?: string
}) {
    headerMap = {
        'x-client-is-demo': overrides.isDemo ?? '1',
        'x-client-display-name': asHeader(overrides.name ?? 'Matías Soto'),
        'x-vta-mode': overrides.mode ?? 'remote',
        'x-coach-id': 'coach-1',
        'user-agent': overrides.ua ?? ANDROID_UA,
    }
    cookieMap = overrides.from ? { eva_vta_from: overrides.from } : {}
    const element = await DemoViewerBanner({ identifier: 'X5UD9' })
    return element ? renderToStaticMarkup(element) : null
}

describe('DemoViewerBanner', () => {
    beforeEach(() => {
        persona = null
    })

    it('sin sesión demo no pinta nada (ningún alumno real lo ve)', async () => {
        expect(await render({ isDemo: '' })).toBeNull()
    })

    it('nombra al alumno de ejemplo con sus tildes y emojis intactos', async () => {
        const html = await render({ name: 'Matías 💪 Soto' })
        expect(html).toContain('Estás viendo tu app como Matías 💪 Soto.')
        expect(html).not.toContain('%C3%')
    })

    it('el vocabulario sale de la persona del coach, nunca hardcodeado', async () => {
        persona = 'nutrition'
        expect(await render({})).toContain('Así se ve tu app para tus pacientes.')

        persona = 'endurance'
        expect(await render({})).toContain('Así se ve tu app para tus atletas.')

        persona = null
        expect(await render({})).toContain('Así se ve tu app para tus alumnos.')
    })

    describe('modo `return`', () => {
        it('ofrece el POST a /volver-al-panel', async () => {
            const html = await render({ mode: 'return' })
            expect(html).toContain('action="/volver-al-panel"')
            expect(html).toContain('method="post"')
            expect(html).toContain('Volver a mi panel')
            expect(html).not.toContain('Salir de la vista de ejemplo')
        })
    })

    describe('modo `rn`', () => {
        it('Android vuelve por `intent://` (un `eva://` pelado da ERR_UNKNOWN_URL_SCHEME)', async () => {
            const html = await render({ mode: 'rn', ua: ANDROID_UA })
            expect(html).toContain('intent://coach/guia#Intent;scheme=eva;package=cl.evaapp.eva;')
            expect(html).toContain('S.browser_fallback_url=')
            expect(html).toContain('Volver a la app')
        })

        it('iOS abre el esquema directo con el gesto', async () => {
            const html = await render({ mode: 'rn', ua: IOS_UA })
            expect(html).toContain('href="eva://coach/guia"')
            expect(html).not.toContain('intent://')
        })

        it('desde el builder NO hay deep link: resetearía el stack con el borrador en pantalla', async () => {
            const html = await render({ mode: 'rn', from: 'builder' })
            expect(html).toContain('Vuelve a la app con el botón atrás.')
            expect(html).not.toContain('intent://')
            expect(html).not.toContain('eva://')
        })
    })

    describe('modo `remote`', () => {
        it('solo ofrece salir, y dice dónde quedó el panel', async () => {
            const html = await render({ mode: 'remote' })
            expect(html).toContain('Salir de la vista de ejemplo')
            expect(html).toContain('Tu panel sigue abierto donde lo dejaste.')
            expect(html).not.toContain('/volver-al-panel')
        })

        it('un modo desconocido (cookie basura) cae en `remote`, no en `return`', async () => {
            const html = await render({ mode: 'cualquier-cosa' })
            expect(html).toContain('Salir de la vista de ejemplo')
            expect(html).not.toContain('Volver a mi panel')
        })
    })

    it('cero venta: ni plan, ni precio, ni tier (regla 7 de la spec)', async () => {
        const html = (await render({ mode: 'return' })) ?? ''
        expect(html.toLowerCase()).not.toContain('plan ')
        expect(html).not.toContain('$')
        expect(html.toLowerCase()).not.toContain('pro')
    })
})
