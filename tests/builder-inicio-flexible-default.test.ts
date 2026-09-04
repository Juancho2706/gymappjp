/**
 * «Inicio flexible» nace APAGADO en los dos builders del coach (W4.5 · R2, en `weekly` y en
 * `cycle` — R13). Un programa YA guardado conserva su valor: solo el NULL/ausente cae al default.
 *
 * Por qué el test lee el SOURCE y no monta el componente: el default vive en el inicializador de
 * `useState` de dos pantallas de ~2 000 líneas (`WeeklyPlanBuilder.tsx` de web y la ruta
 * `app/coach/program-builder.tsx` de RN, que además arrastra expo-router + el catálogo + el
 * autosave del borrador). Montarlas para leer un booleano costaría un grafo de mocks más grande que
 * la propia regla, y el toggle no está expuesto en ningún módulo puro importable. Mismo recurso que
 * `tests/pwa-sw-navigation.test.ts`, que deriva los nombres de caché desde `apps/web/public/sw.js`.
 *
 * Deuda declarada: el hogar natural de esta guarda es una regla eslint local
 * (`tools/eslint-rules/`, precedente `store-plan-caption.mjs`), pero darla de alta toca
 * `eslint.config.mjs` + `tools/eslint-rules/index.mjs`, fuera del alcance de W4.5.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = path.resolve(__dirname, '..')
const read = (...segments: string[]) => readFileSync(path.resolve(repoRoot, ...segments), 'utf8')

const WEB_BUILDER = ['apps', 'web', 'src', 'app', 'coach', 'builder', '[clientId]', 'WeeklyPlanBuilder.tsx']
const RN_BUILDER = ['apps', 'mobile', 'app', 'coach', 'program-builder.tsx']

/** Toda línea que escribe el estado del toggle (init de `useState` + los `setStartDateFlexible`). */
function startDateFlexibleWrites(source: string): string[] {
    return source
        .split('\n')
        .filter((line) => /useState[^\n]*startDateFlexible|startDateFlexible,\s*setStartDateFlexible\]\s*=\s*useState|setStartDateFlexible\(/.test(line))
        .map((line) => line.trim())
}

describe('web · WeeklyPlanBuilder', () => {
    const source = read(...WEB_BUILDER)

    it('el estado inicial del toggle es false cuando el programa no trae valor guardado', () => {
        expect(source).toContain('useState<boolean>(initialProgram?.start_date_flexible ?? false)')
    })

    it('ningún camino deja el toggle encendido por default', () => {
        const writes = startDateFlexibleWrites(source)

        expect(writes.length).toBeGreaterThan(0)
        for (const line of writes) {
            expect(line).not.toMatch(/\?\?\s*true/)
            expect(line).not.toMatch(/useState(<boolean>)?\(true\)/)
            // un `setStartDateFlexible(true)` pelado (reset a programa nuevo) también enciende
            expect(line).not.toMatch(/setStartDateFlexible\(true\)/)
        }
    })

    it('un programa guardado con el toggle encendido lo conserva (el default solo cubre el NULL)', () => {
        // `?? false` (no `Boolean(...)` ni `=== true`): `true` guardado sobrevive, NULL cae al default.
        expect(source).toMatch(/initialProgram\?\.start_date_flexible \?\? false/)
        // y la hidratación desde la meta remota respeta el valor guardado sin default propio
        expect(source).toContain('if (meta.start_date_flexible != null) setStartDateFlexible(meta.start_date_flexible)')
    })
})

describe('RN · app/coach/program-builder', () => {
    const source = read(...RN_BUILDER)

    it('el estado inicial del toggle es false (programa nuevo)', () => {
        expect(source).toContain('const [startDateFlexible, setStartDateFlexible] = useState(false)')
        // el efecto de hidratación resetea a «programa nuevo» antes de leer nada: también apagado
        expect(source).toContain('setStartDateFlexible(false)')
    })

    it('ningún camino deja el toggle encendido por default (hidratar, plantilla, borrador)', () => {
        const writes = startDateFlexibleWrites(source)

        // init + reset de hidratación + programa guardado + carga de plantilla + recuperar borrador
        expect(writes.length).toBeGreaterThanOrEqual(5)
        for (const line of writes) {
            expect(line).not.toMatch(/\?\?\s*true/)
            expect(line).not.toMatch(/useState\(true\)/)
            expect(line).not.toMatch(/setStartDateFlexible\(true\)/)
        }
    })

    it('un programa guardado conserva su valor (el default solo cubre el NULL/ausente)', () => {
        expect(source).toContain('setStartDateFlexible(prog.start_date_flexible ?? false)')
        expect(source).toContain('if (prog.start_date_flexible != null) setStartDateFlexible(prog.start_date_flexible)')
        expect(source).toContain('setStartDateFlexible(d.startDateFlexible ?? false)')
    })
})
