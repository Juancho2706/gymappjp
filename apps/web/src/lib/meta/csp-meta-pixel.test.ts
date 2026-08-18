import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Guard estatico de la Content-Security-Policy para el Meta Pixel.
 *
 * INCIDENTE 2026-08-18 que este guard evita repetir: el pixel estuvo desplegado en produccion con
 * el `<Script id="meta-pixel">` montado y el ID correcto en el bundle, pero la CSP de `vercel.json`
 * no listaba `connect.facebook.net` en `script-src`. Resultado: `fbevents.js` moria con
 * `[FAILED] csp` en TODOS los navegadores, `window.fbq` quedaba como el stub del snippet (existe,
 * encola, nunca envia) y Events Manager reportaba "Tu pixel no ha recibido ninguna actividad"
 * mientras la web se veia perfecta. Se perdieron dias de diagnostico culpando a bloqueadores.
 *
 * Directivas necesarias:
 * - `script-src`  → `https://connect.facebook.net` (carga de `fbevents.js`).
 * - `connect-src` → `https://www.facebook.com` (los `POST /tr` del pixel) y
 *   `https://connect.facebook.net` (fetch de configuracion del propio SDK).
 * - `img-src` ya permite `https:` (los beacons de fallback por imagen pasan sin cambios).
 *
 * Los headers de `vercel.json` los aplica el RUNTIME de Vercel (no Next.js), asi que no hay forma
 * de ejercitarlos en un test de integracion local: este parse estatico del JSON es el UNICO guard
 * de CI contra una regresion que deje el pixel mudo SIN error de build.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// .../apps/web/src/lib/meta -> repo root (.../gymappjp)
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

describe('CSP de vercel.json — Meta Pixel', () => {
    const csp = readCspValue()
    const directives = parseCsp(csp)

    const expectDirectiveContains = (directive: string, origin: string) => {
        const sources = directives.get(directive) ?? []
        expect(
            sources,
            `CSP ${directive} debe incluir '${origin}': sin el, fbevents.js no carga y el pixel ` +
                `queda mudo en produccion sin ningun error visible. Sources actuales: ` +
                `[${sources.join(', ')}]`,
        ).toContain(origin)
    }

    describe('script-src (carga de fbevents.js)', () => {
        it("incluye 'https://connect.facebook.net'", () => {
            expectDirectiveContains('script-src', 'https://connect.facebook.net')
        })
    })

    describe('connect-src (envio de eventos del pixel)', () => {
        it("incluye 'https://www.facebook.com'", () => {
            expectDirectiveContains('connect-src', 'https://www.facebook.com')
        })

        it("incluye 'https://connect.facebook.net'", () => {
            expectDirectiveContains('connect-src', 'https://connect.facebook.net')
        })
    })

    describe('img-src (beacons de fallback por imagen)', () => {
        it("permite https: (comodin ya presente)", () => {
            const sources = directives.get('img-src') ?? []
            expect(
                sources.includes('https:') || sources.includes('https://www.facebook.com'),
                `CSP img-src debe permitir los beacons de Meta. Sources actuales: [${sources.join(', ')}]`,
            ).toBe(true)
        })
    })
})
