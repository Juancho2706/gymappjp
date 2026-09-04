import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearClientCaches } from './clear-client-caches'

// Este archivo cae en el project `web-node` (vitest.config.ts: los `*.test.ts` corren en `node`),
// donde CacheStorage no existe. El doble se monta a mano en cada caso — y el caso "sin caches" es
// justamente no montarlo.
type CachesDouble = Pick<CacheStorage, 'keys' | 'delete'>

/**
 * Nombres reales: leídos de `apps/web/public/sw.js` (no una copia manual — ese era exactamente el
 * fallo que advierte `sw.js:22-27`: un RENAME de NAV_CACHE/CLIENT_DATA_CACHE dejaba este test en
 * verde por una copia vieja mientras la purga del logout, que matchea por PREFIJO, quedaba muerta
 * EN SILENCIO). Mismo patrón que `tests/pwa-sw-navigation.test.ts:23-26,38` para `NAV_CACHE`.
 */
const SW_SOURCE = readFileSync(
    fileURLToPath(new URL('../../../public/sw.js', import.meta.url)),
    'utf8'
).replace(/^﻿/, '')

function extractConst(source: string, name: string): string {
    const match = new RegExp(`const ${name} = '([^']+)'`).exec(source)
    if (!match) throw new Error(`sw.js ya no declara ${name} como const string: actualizar este test`)
    return match[1]
}

const SHELL_CACHE = extractConst(SW_SOURCE, 'SHELL_CACHE')
const NAV_CACHE = extractConst(SW_SOURCE, 'NAV_CACHE')
const STATIC_CACHE = extractConst(SW_SOURCE, 'STATIC_CACHE')
const CLIENT_DATA_CACHE = extractConst(SW_SOURCE, 'CLIENT_DATA_CACHE')

/** Los 4 nombres de cache que declara sw.js hoy, derivados del source (no una copia manual). */
const SW_CACHES = [SHELL_CACHE, NAV_CACHE, STATIC_CACHE, CLIENT_DATA_CACHE]

/**
 * `STUDENT_DATA_CACHE_PREFIXES` (clear-client-caches.ts:18) no se exporta a propósito (ver su
 * comentario de :10-17) y este worker tiene prohibido tocar ese archivo (tren offline sin commit
 * de otro worker) — así que se lee del SOURCE, igual que sw.js arriba, en vez de duplicar el
 * literal a mano.
 */
const CLEAR_CACHES_SOURCE = readFileSync(
    fileURLToPath(new URL('./clear-client-caches.ts', import.meta.url)),
    'utf8'
)

function extractPrefixes(source: string): string[] {
    const arrayMatch = /const STUDENT_DATA_CACHE_PREFIXES = \[([^\]]+)\]/.exec(source)
    if (!arrayMatch) {
        throw new Error('clear-client-caches.ts ya no declara STUDENT_DATA_CACHE_PREFIXES: actualizar este test')
    }
    return [...arrayMatch[1].matchAll(/'([^']+)'/g)].map((m) => m[1]!)
}

const STUDENT_DATA_CACHE_PREFIXES = extractPrefixes(CLEAR_CACHES_SOURCE)

function installCaches(names: string[], del?: CachesDouble['delete']) {
    const deleted: string[] = []
    const deleteSpy = vi.fn(
        del ??
            (async (name: string) => {
                deleted.push(name)
                return true
            })
    )
    const double: CachesDouble = { keys: async () => names, delete: deleteSpy }
    ;(globalThis as { caches?: unknown }).caches = double
    return { deleted, deleteSpy }
}

describe('clearClientCaches (purga de datos del alumno en el logout)', () => {
    afterEach(() => {
        delete (globalThis as { caches?: unknown }).caches
        vi.restoreAllMocks()
    })

    it('borra los caches de navegación y de datos del alumno', async () => {
        const { deleted } = installCaches(SW_CACHES)
        await clearClientCaches()
        expect(deleted.sort()).toEqual([CLIENT_DATA_CACHE, NAV_CACHE].sort())
    })

    it('NO borra el shell ni los estáticos (son assets, y sin ellos muere el fallback offline)', async () => {
        const { deleted } = installCaches(SW_CACHES)
        await clearClientCaches()
        expect(deleted).not.toContain(SHELL_CACHE)
        expect(deleted).not.toContain(STATIC_CACHE)
    })

    it('matchea por prefijo: una versión futura del cache también se purga', async () => {
        const { deleted } = installCaches(['eva-nav-v9', 'eva-client-data-v42', 'eva-static-v99'])
        await clearClientCaches()
        expect(deleted.sort()).toEqual(['eva-client-data-v42', 'eva-nav-v9'])
    })

    it('sin CacheStorage en el entorno resuelve igual, sin lanzar', async () => {
        expect((globalThis as { caches?: unknown }).caches).toBeUndefined()
        await expect(clearClientCaches()).resolves.toBeUndefined()
    })

    it('si caches.delete rechaza, no propaga la excepción', async () => {
        installCaches(SW_CACHES, async () => {
            throw new Error('QuotaExceededError')
        })
        await expect(clearClientCaches()).resolves.toBeUndefined()
    })
})

describe('sw.js ↔ clear-client-caches — los nombres reales caen del lado correcto del prefijo (W5.2)', () => {
    it('NAV_CACHE y CLIENT_DATA_CACHE (sw.js) empiezan por alguno de STUDENT_DATA_CACHE_PREFIXES', () => {
        expect(STUDENT_DATA_CACHE_PREFIXES.some((prefix) => NAV_CACHE.startsWith(prefix))).toBe(true)
        expect(STUDENT_DATA_CACHE_PREFIXES.some((prefix) => CLIENT_DATA_CACHE.startsWith(prefix))).toBe(true)
    })

    it('STATIC_CACHE y el shell (sw.js) NO empiezan por ningún prefijo de la purga', () => {
        expect(STUDENT_DATA_CACHE_PREFIXES.some((prefix) => STATIC_CACHE.startsWith(prefix))).toBe(false)
        expect(STUDENT_DATA_CACHE_PREFIXES.some((prefix) => SHELL_CACHE.startsWith(prefix))).toBe(false)
    })

    // La prueba de que este test MUERDE: un rename de NAV_CACHE en sw.js que no toque los
    // prefijos de la purga (clear-client-caches.ts) deja la relación de arriba en rojo. Se simula
    // el rename EN MEMORIA sobre el nombre YA EXTRAÍDO del source — sw.js real no se toca — y se
    // repite la MISMA aserción `startsWith` para demostrar que pasaría a `false`.
    it('un rename de NAV_CACHE sin tocar los prefijos rompe esta relación (demostración, no muta sw.js real)', () => {
        const renamedNavCache = NAV_CACHE.replace(/^eva-nav/, 'workout-nav')
        // Sanity: el reemplazo realmente cambió el nombre (si esto falla, NAV_CACHE ya no empieza
        // con "eva-nav" y hay que revisar el fixture antes de confiar en el resto del caso).
        expect(renamedNavCache).not.toBe(NAV_CACHE)
        expect(STUDENT_DATA_CACHE_PREFIXES.some((prefix) => renamedNavCache.startsWith(prefix))).toBe(false)
    })
})
