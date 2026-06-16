import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Guard estatico de la Content-Security-Policy para MercadoPago Secure Fields.
 *
 * Secure Fields monta iframes de MercadoPago (input de tarjeta tokenizado en el
 * lado de MP, PCI fuera de nuestro DOM) y carga su SDK desde el CDN de MP. Para
 * que esos iframes monten y el SDK cargue, la CSP debe permitir los origenes de
 * MercadoPago en `script-src`, `frame-src` y `connect-src`.
 *
 * Los headers de `vercel.json` los aplica el RUNTIME de Vercel (no Next.js), asi
 * que NO hay forma de ejercitarlos en un test de integracion local: este parse
 * estatico del JSON es el UNICO guard de CI contra una regresion de CSP que
 * rompa el checkout (los iframes simplemente no aparecerian en produccion, sin
 * error de build).
 *
 * NOTA: este test asserta el estado DESEADO de la CSP. La edicion de `vercel.json`
 * la hace el integrador por separado, asi que el test puede fallar hasta que ese
 * cambio aterrice — eso es esperado.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// .../apps/web/src/lib/payments -> repo root (.../gymappjp)
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..')
const VERCEL_JSON_PATH = path.join(REPO_ROOT, 'vercel.json')

type VercelHeader = { key: string; value: string }
type VercelHeadersEntry = { source: string; headers: VercelHeader[] }
type VercelConfig = { headers?: VercelHeadersEntry[] }

/** Lee la CSP de vercel.json (header cuyo key === 'Content-Security-Policy', case-insensitive). */
function readCspValue(): string {
    const raw = fs.readFileSync(VERCEL_JSON_PATH, 'utf8')
    const config = JSON.parse(raw) as VercelConfig
    const headerEntries = config.headers ?? []
    for (const entry of headerEntries) {
        for (const header of entry.headers ?? []) {
            if (header.key.toLowerCase() === 'content-security-policy') {
                return header.value
            }
        }
    }
    throw new Error(
        `No se encontro el header 'Content-Security-Policy' en ${VERCEL_JSON_PATH}`,
    )
}

/** Parsea el string CSP en un mapa directiva -> lista de sources. */
function parseCsp(csp: string): Map<string, string[]> {
    const directives = new Map<string, string[]>()
    for (const part of csp.split(';')) {
        const tokens = part.trim().split(/\s+/).filter(Boolean)
        if (tokens.length === 0) continue
        const [name, ...sources] = tokens
        directives.set(name.toLowerCase(), sources)
    }
    return directives
}

describe('CSP de vercel.json — MercadoPago Secure Fields', () => {
    const csp = readCspValue()
    const directives = parseCsp(csp)

    const expectDirectiveContains = (directive: string, origin: string) => {
        const sources = directives.get(directive) ?? []
        expect(
            sources,
            `CSP ${directive} debe incluir el origen de MercadoPago '${origin}' ` +
                `(Secure Fields no montara sin el). Sources actuales: [${sources.join(', ')}]`,
        ).toContain(origin)
    }

    describe('script-src (carga del SDK de MercadoPago)', () => {
        it("incluye 'https://sdk.mercadopago.com'", () => {
            expectDirectiveContains('script-src', 'https://sdk.mercadopago.com')
        })

        it("incluye 'https://*.mlstatic.com'", () => {
            expectDirectiveContains('script-src', 'https://*.mlstatic.com')
        })
    })

    describe('frame-src (iframes de Secure Fields)', () => {
        it("incluye 'https://*.mercadopago.com'", () => {
            expectDirectiveContains('frame-src', 'https://*.mercadopago.com')
        })

        it("incluye 'https://*.mlstatic.com'", () => {
            expectDirectiveContains('frame-src', 'https://*.mlstatic.com')
        })
    })

    describe('connect-src (llamadas del SDK / tokenizacion)', () => {
        it("incluye 'https://*.mercadopago.com'", () => {
            expectDirectiveContains('connect-src', 'https://*.mercadopago.com')
        })
    })
})
