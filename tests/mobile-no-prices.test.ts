import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Guard de compliance de tiendas (embudo-free-pro W5.5, decisión cerrada del owner 21-08).
 *
 * La app iOS no puede mostrar un precio, un link de compra ni un tier ajeno: la venta vive en
 * correo y web (guideline 3.1.1; Android solo admite UNA línea sin link). El riesgo real no es que
 * alguien escriba «$29.990» a mano — es que una pantalla importe el catálogo entero y pinte
 * `TIER_CONFIG.pro.monthlyPriceClp` «para informar». Por eso `apps/mobile/lib/coach-tiers.ts` dejó
 * de re-exportar `TIER_CONFIG` y este test barre el árbol: la regla se rompe en CI, no en review.
 *
 * Si algún día mobile necesita un precio, la conversación es de producto (IAP / gatillos del SPEC),
 * no de un `expect` que se afloja.
 */

const MOBILE_ROOT = join(__dirname, '..', 'apps', 'mobile')

const SKIP_DIRS = new Set([
    'node_modules',
    '.expo',
    '.expo-shared',
    'android',
    'ios',
    'dist',
    'build',
    'coverage',
    '__tests__',
    '__mocks__',
])

const CODE_EXT = /\.tsx?$/

/** Patrones prohibidos. `label` es lo que lee quien rompa el test. */
const FORBIDDEN: { pattern: RegExp; label: string }[] = [
    { pattern: /monthlyPriceClp/, label: 'monthlyPriceClp (precio del catálogo)' },
    { pattern: /yearlyPriceClp/, label: 'yearlyPriceClp (precio del catálogo)' },
    { pattern: /\$29\.990/, label: '$29.990 (precio literal de Pro)' },
    { pattern: /(?<!\d)29990(?!\d)/, label: '29990 (precio de Pro sin formatear)' },
    // `\b` para no cazar rutas legítimas («/mesociclo»); «$29.990/mes» y «/mes.» sí caen.
    { pattern: /\/mes\b/, label: '«/mes» (sufijo de precio)' },
]

function listCodeFiles(dir: string): string[] {
    const out: string[] = []
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry)
        // `statSync` en vez de withFileTypes: el árbol de mobile tiene symlinks de pnpm.
        const st = statSync(full)
        if (st.isDirectory()) {
            if (SKIP_DIRS.has(entry)) continue
            out.push(...listCodeFiles(full))
            continue
        }
        // Los propios tests del móvil pueden nombrar el patrón al afirmar que NO está.
        if (!CODE_EXT.test(entry) || /\.test\.tsx?$/.test(entry)) continue
        out.push(full)
    }
    return out
}

describe('apps/mobile no habla de plata (compliance App Store 3.1.1)', () => {
    const files = listCodeFiles(MOBILE_ROOT)

    it('el barrido encuentra el árbol de mobile (si esto falla, el guard estaba mirando al vacío)', () => {
        expect(files.length).toBeGreaterThan(100)
        expect(files.some((f) => f.endsWith(`lib${sep}coach-tiers.ts`))).toBe(true)
    })

    it.each(FORBIDDEN)('ningún archivo contiene $label', ({ pattern }) => {
        const hits: string[] = []
        for (const file of files) {
            const src = readFileSync(file, 'utf-8')
            if (!pattern.test(src)) continue
            const line = src.split('\n').findIndex((l) => pattern.test(l)) + 1
            hits.push(`${relative(MOBILE_ROOT, file).split(sep).join('/')}:${line}`)
        }
        expect(hits, `precio filtrado a la app móvil en:\n  ${hits.join('\n  ')}`).toEqual([])
    })

    it('coach-tiers no re-exporta el catálogo entero (TIER_CONFIG arrastra precios)', () => {
        const src = readFileSync(join(MOBILE_ROOT, 'lib', 'coach-tiers.ts'), 'utf-8')
        // El nombre puede aparecer en los comentarios que explican por qué NO está; lo que se
        // prohíbe es importarlo o exportarlo.
        const code = src.replace(/^\s*(\/\/|\*|\/\*).*$/gm, '')
        expect(code).not.toMatch(/\bTIER_CONFIG\b/)
        expect(code).toMatch(/\bgetTierMaxClients\b/)
    })
})
