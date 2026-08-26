import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// Corte fino declarativo de App Links (binario 1.1.3). El fix runtime vive en `+native-intent`;
// esto pinnea lo que la app RECLAMA antes de llegar al runtime:
//   - Android: solo la puerta del alumno (`/c/{coach}/login`), nunca el árbol completo.
//   - iOS: el árbol del alumno sale por `NOT`, pero el link pelado `/c/{coach}` sigue reclamado
//     porque iOS no evalúa el redirect server-side a `/login`.

const REPO_ROOT = path.resolve(__dirname, '../..')
const APP_JSON = path.join(REPO_ROOT, 'apps/mobile/app.json')
const AASA = path.join(REPO_ROOT, 'apps/web/public/.well-known/apple-app-site-association')
const STUDENT_TREE = path.join(REPO_ROOT, 'apps/web/src/app/c/[coach_slug]')

const MAIN_APP_ID = '5GKWMMZ46Q.cl.evaapp.eva'
const ENTERPRISE_APP_ID = '5GKWMMZ46Q.cl.evaapp.eva-enterprise'

interface IntentFilterData {
    scheme?: string
    host?: string
    path?: string
    pathPrefix?: string
    pathPattern?: string
}

interface IntentFilter {
    action: string
    autoVerify?: boolean
    data?: IntentFilterData[]
    category?: string[]
}

const appJson = JSON.parse(readFileSync(APP_JSON, 'utf8'))
const aasa = JSON.parse(readFileSync(AASA, 'utf8'))

const intentFilters: IntentFilter[] = appJson.expo.android.intentFilters
const allData = intentFilters.flatMap((filter) => filter.data ?? [])

const aasaDetails: { appID: string; paths: string[] }[] = aasa.applinks.details
const mainPaths = aasaDetails.find((detail) => detail.appID === MAIN_APP_ID)!.paths

/** Traduce un patrón de AASA (`*` = cualquier subcadena, `?` = un carácter) a regex de path completo. */
function aasaMatches(pattern: string, urlPath: string): boolean {
    const source = pattern
        .split('')
        .map((char) => {
            if (char === '*') return '.*'
            if (char === '?') return '.'
            return char.replace(/[.+^${}()|[\]\\]/g, '\\$&')
        })
        .join('')
    return new RegExp(`^${source}$`).test(urlPath)
}

/** iOS resuelve por PRIMERA coincidencia: si el patrón que matchea trae `NOT`, el link no es de la app. */
function aasaClaims(paths: string[], urlPath: string): boolean {
    for (const entry of paths) {
        const negated = entry.startsWith('NOT ')
        const pattern = negated ? entry.slice(4) : entry
        if (aasaMatches(pattern, urlPath)) return !negated
    }
    return false
}

/** Rutas reales del árbol web del alumno (directorios con algún `page.tsx` adentro). */
function studentRouteSegments(): string[] {
    const hasPage = (dir: string): boolean =>
        readdirSync(dir, { withFileTypes: true }).some(
            (entry) =>
                (entry.isFile() && entry.name === 'page.tsx') ||
                (entry.isDirectory() && hasPage(path.join(dir, entry.name))),
        )

    return readdirSync(STUDENT_TREE, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_'))
        .map((entry) => entry.name)
        .filter((name) => hasPage(path.join(STUDENT_TREE, name)))
}

describe('App Links Android — app.json solo reclama la puerta del alumno', () => {
    it('ningún intent filter reclama /invite/ (la ruta no existe en la web)', () => {
        expect(existsSync(path.join(REPO_ROOT, 'apps/web/src/app/invite'))).toBe(false)
        const invites = allData.filter((data) =>
            [data.path, data.pathPrefix, data.pathPattern].some((value) => value?.includes('/invite')),
        )
        expect(invites).toEqual([])
    })

    it('ningún intent filter usa pathPrefix /c/ (capturaba todo el árbol del alumno)', () => {
        expect(allData.filter((data) => data.pathPrefix === '/c/')).toEqual([])
        expect(allData.some((data) => data.pathPrefix?.startsWith('/c/'))).toBe(false)
    })

    it('ambos hosts reclaman /c/.*/login con autoVerify', () => {
        const hosts = intentFilters
            .filter((filter) => filter.data?.some((data) => data.pathPattern === '/c/.*/login'))
            .map((filter) => ({ host: filter.data![0].host, autoVerify: filter.autoVerify }))
        expect(hosts).toEqual([
            { host: 'eva-app.cl', autoVerify: true },
            { host: 'www.eva-app.cl', autoVerify: true },
        ])
    })

    it('/reset-password y /coach/subscription siguen reclamados en ambos hosts', () => {
        for (const claimed of ['/reset-password', '/coach/subscription']) {
            const hosts = allData.filter((data) => data.path === claimed).map((data) => data.host)
            expect(hosts).toEqual(['eva-app.cl', 'www.eva-app.cl'])
        }
    })
})

describe('App Links iOS — el AASA excluye el árbol del alumno pero conserva la puerta', () => {
    it('conserva /c/* al final y ya no reclama /invite/*', () => {
        expect(mainPaths).toContain('/c/*')
        expect(mainPaths.filter((entry) => entry.includes('/invite'))).toEqual([])
        expect(mainPaths.indexOf('/c/*')).toBeGreaterThan(mainPaths.indexOf('NOT /c/*/dashboard*'))
    })

    it('cada ruta del árbol del alumno (salvo login) tiene su NOT', () => {
        const negated = mainPaths.filter((entry) => entry.startsWith('NOT '))
        for (const segment of studentRouteSegments()) {
            if (segment === 'login') continue
            expect(
                negated.some((entry) => aasaMatches(entry.slice(4), `/c/ana-fit/${segment}`)),
                `falta un NOT para /c/*/${segment}`,
            ).toBe(true)
        }
    })

    it('resuelve: dashboard y compañía fuera, puerta y link pelado adentro', () => {
        expect(aasaClaims(mainPaths, '/c/ana-fit/dashboard')).toBe(false)
        expect(aasaClaims(mainPaths, '/c/ana-fit/perfil')).toBe(false)
        expect(aasaClaims(mainPaths, '/c/ana-fit/workout/123')).toBe(false)
        expect(aasaClaims(mainPaths, '/c/ana-fit/nutrition-v2/scanner')).toBe(false)
        expect(aasaClaims(mainPaths, '/c/ana-fit/login')).toBe(true)
        expect(aasaClaims(mainPaths, '/c/ana-fit')).toBe(true)
        expect(aasaClaims(mainPaths, '/reset-password')).toBe(true)
        expect(aasaClaims(mainPaths, '/coach/subscription')).toBe(true)
    })

    it('el appID enterprise queda intacto', () => {
        const enterprise = aasaDetails.find((detail) => detail.appID === ENTERPRISE_APP_ID)
        expect(enterprise?.paths).toEqual(['/org/*'])
    })
})
