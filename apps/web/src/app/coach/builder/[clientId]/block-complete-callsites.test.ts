import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { isBlockComplete, type BuilderBlock } from '@eva/plan-builder'

/**
 * W2.1 — los TRES guards de completitud del builder dan el MISMO veredicto.
 *
 * Hasta este tren la regla estaba copiada a mano en tres archivos (el sheet de bloque web, el
 * guardado web y el guardado RN) y ya habían divergido entre sí. Con el modo Segundos (D3) esa
 * divergencia dejaba de ser cosmética: en el guard viejo un bloque en modo tiempo caía a la rama
 * de fuerza clásica y el coach veía «Datos incompletos» sin poder guardar (falso positivo), o —al
 * revés— un bloque sin reps y sin segundos se guardaba igual (falso negativo).
 *
 * Los tres call sites son componentes pesados (uno de ellos una pantalla de React Native con
 * expo-router), así que montarlos no es el camino: lo que hay que probar es que **ninguno vuelve a
 * tener regla propia**. Por eso este archivo hace dos cosas complementarias:
 *   1. lee los tres fuentes y verifica que delegan en `isBlockComplete` y que no quedó ni un resto
 *      de la regla vieja (es lo que caza un futuro «lo arreglo acá nomás»);
 *   2. corre el MISMO fixture por la función compartida, que es —por (1)— literalmente el código
 *      que ejecutan los tres.
 *
 * La regla en sí (rangos, ramas por tipo) se fija en `packages/plan-builder/block-type-fields.test.ts`.
 */
const REPO = path.resolve(__dirname, '..', '..', '..', '..', '..', '..', '..')

const CALL_SITES = {
    'BlockEditSheet (sheet de bloque · web)': path.join(
        REPO, 'apps', 'web', 'src', 'app', 'coach', 'builder', '[clientId]', 'components', 'BlockEditSheet.tsx',
    ),
    'WeeklyPlanBuilder (guardado · web)': path.join(
        REPO, 'apps', 'web', 'src', 'app', 'coach', 'builder', '[clientId]', 'WeeklyPlanBuilder.tsx',
    ),
    'program-builder (guardado · RN)': path.join(
        REPO, 'apps', 'mobile', 'app', 'coach', 'program-builder.tsx',
    ),
} as const

/** Restos de la regla copiada: si alguno reaparece, el guard volvió a tener vida propia. */
const REGLA_VIEJA = [
    /\(b(?:lock)?\.reps_value \?\? 0\) > 0/,
    /!!?b(?:lock)?\.reps\?\.trim\(\)/,
    /\(b(?:lock)?\.duration_sec \?\? 0\) > 0/,
]

function source(file: string): string {
    return fs.readFileSync(file, 'utf8')
}

describe('W2.1 — los tres guards delegan en isBlockComplete', () => {
    for (const [label, file] of Object.entries(CALL_SITES)) {
        it(`${label} importa y llama a isBlockComplete`, () => {
            const src = source(file)
            expect(src).toMatch(/isBlockComplete[\s,}]/)
            expect(src).toMatch(/from '@eva\/plan-builder'/)
            expect(src).toMatch(/isBlockComplete\(/)
        })

        it(`${label} ya no tiene copia propia de la regla`, () => {
            const src = source(file)
            for (const resto of REGLA_VIEJA) expect(src).not.toMatch(resto)
        })
    }
})

/** Mismo bloque para los tres: una plancha con disco que el coach pasó a modo Segundos. */
function plancha(overrides: Partial<BuilderBlock> = {}): BuilderBlock {
    return {
        uid: 'blk-1',
        exercise_id: 'ex-1',
        exercise_name: 'Plancha frontal mantenida',
        muscle_group: 'Core',
        exercise_type: 'strength',
        sets: 3,
        reps: '8-12',
        target_weight_kg: '10',
        rest_time: '90s',
        ...overrides,
    }
}

describe('W2.1 — veredicto único para el fixture canónico', () => {
    it('modo Segundos con 30 s ⇒ completo (antes: «Datos incompletos» y el coach no podía guardar)', () => {
        expect(isBlockComplete(plancha({ reps_unit: 'sec', duration_sec: 30 }), 'strength')).toBe(true)
    })

    it('sin reps y sin segundos ⇒ incompleto', () => {
        expect(isBlockComplete(plancha({ reps: '', reps_unit: 'sec', duration_sec: null }), 'strength')).toBe(false)
    })

    it('3 segundos ⇒ incompleto · 30 segundos ⇒ completo', () => {
        expect(isBlockComplete(plancha({ reps_unit: 'sec', duration_sec: 3 }), 'strength')).toBe(false)
        expect(isBlockComplete(plancha({ reps_unit: 'sec', duration_sec: 30 }), 'strength')).toBe(true)
    })

    it('fuerza clásica sigue como siempre: series + reps', () => {
        expect(isBlockComplete(plancha(), 'strength')).toBe(true)
        expect(isBlockComplete(plancha({ reps: '' }), 'strength')).toBe(false)
    })
})

/**
 * W2.12 — el copy del error tiene que nombrar los segundos: con el modo tiempo encendido, un
 * «revisa series, repeticiones, duración o distancia» manda al coach a mirar justo donde no está
 * el problema.
 */
describe('W2.12 — copys del guardado incompleto', () => {
    it('web nombra «repeticiones o segundos»', () => {
        expect(source(CALL_SITES['WeeklyPlanBuilder (guardado · web)'])).toContain(
            'Hay ejercicios con datos incompletos (revisa series, repeticiones o segundos, duración o distancia).',
        )
    })

    it('RN nombra «series y reps o segundos»', () => {
        expect(source(CALL_SITES['program-builder (guardado · RN)'])).toContain(
            'faltan datos (series y reps o segundos, duración o distancia según el tipo).',
        )
    })
})
