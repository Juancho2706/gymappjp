import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { getEvaBadgeUrl } from '@eva/tiers'
import { LandingBrandProvider } from '@/components/landing-v2/_brand-provider'
import HechoConEvaContent from './_components/HechoConEvaContent'

/**
 * `/hecho-con-eva` es la ÚNICA página web a la que la app móvil manda al usuario (el sello «Hecho
 * con EVA» del alumno, iOS incluido). Si un día alguien le pega una sección de la home con precios
 * —o cambia una sección reutilizada y esa sección empieza a mostrarlos—, la app pasa a llevar a
 * comprar fuera de la tienda y eso es un rechazo de App Review, no un bug cosmético.
 *
 * Por eso el test renderiza el árbol REAL (incluidas `MarcaShowcase` y `CoachesProof`) y busca
 * plata en el HTML resultante, en vez de leer el archivo: un precio importado desde otro módulo no
 * se ve en el fuente de esta carpeta, pero sí en lo que el navegador pinta.
 */

// `next/image` necesita la config que inyecta el build de Next; en el render de test alcanza con
// un <img> equivalente. No cambia nada de lo que este test mide (texto visible).
vi.mock('next/image', () => ({
    default: ({ src, alt, width, height }: { src: string; alt: string; width?: number; height?: number }) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} width={width} height={height} />
    ),
}))

function renderPage(): string {
    return renderToStaticMarkup(
        <LandingBrandProvider>
            <HechoConEvaContent exerciseCount={129} />
        </LandingBrandProvider>
    )
}

/** HTML sin tags: solo lo que el usuario LEE (evita falsos positivos de `$` en estilos inline). */
function visibleText(html: string): string {
    return html
        .replace(/<style[\s\S]*?<\/style>/g, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&#x27;|&#39;/g, "'")
        .replace(/\s+/g, ' ')
}

describe('/hecho-con-eva — la landing del sello no vende', () => {
    const html = renderPage()
    const text = visibleText(html)

    it('no muestra ni un peso', () => {
        expect(text).not.toMatch(/\$/)
        expect(text).not.toMatch(/CLP/)
        expect(text).not.toMatch(/\/mes\b/)
        expect(text).not.toMatch(/\/año\b/)
    })

    it('no nombra planes ni invita a elegir uno', () => {
        expect(text).not.toMatch(/precio/i)
        expect(text).not.toMatch(/\bElegir\b/i)
        // «Pro» como nombre de plan. `pruébalo`/`profesional` no cuentan: el patrón exige la
        // palabra suelta.
        expect(text).not.toMatch(/\bPro\b/)
        expect(text).not.toMatch(/\bElite\b/i)
        expect(text).not.toMatch(/\bFree\b/i)
        expect(text).not.toMatch(/suscri/i)
        expect(text).not.toMatch(/\bpagar\b|\bpago\b/i)
    })

    it('no enlaza a ninguna superficie con precios (home, /pricing, #precios)', () => {
        const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1])
        expect(hrefs.length).toBeGreaterThan(0)
        for (const href of hrefs) {
            expect(href).not.toMatch(/#precios/)
            expect(href).not.toMatch(/^\/pricing/)
            // Un `href="/"` devolvería al alumno a la home, que sí monta PreciosSection.
            expect(href).not.toBe('/')
        }
    })

    it('tiene un solo CTA y apunta al registro', () => {
        const ctas = [...html.matchAll(/href="(\/register[^"]*)"/g)].map((m) => m[1])
        expect(ctas).toEqual(['/register?tier=free'])
        expect(text).toContain('Crear mi cuenta de coach gratis')
    })

    it('el hero le habla al alumno que llegó desde la app de su coach', () => {
        expect(text).toContain('Tu coach usa EVA')
        expect(html).toMatch(/<h1[^>]*>/)
    })

    it('monta las secciones reutilizadas de la landing (marca + hechos del producto)', () => {
        expect(html).toContain('id="marca"')
        expect(html).toContain('id="coaches"')
        expect(text).toContain('129 ejercicios')
    })
})

describe('el sello del paquete y la ruta de la app no se despegan', () => {
    it('getEvaBadgeUrl apunta a esta ruta (si se renombra la carpeta, el sello queda en 404)', () => {
        expect(new URL(getEvaBadgeUrl('student_app')).pathname).toBe('/hecho-con-eva')
    })

    // Que la page sea indexable y declare su canónica ya no se afirma leyendo el fuente
    // como texto: vive en la regla eslint `local/hecho-con-eva-metadata`
    // (tools/eslint-rules/), que corre en `pnpm lint` sobre `page.tsx`.
})
