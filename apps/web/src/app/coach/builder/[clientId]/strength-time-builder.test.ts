import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { formatStrengthTimeObjectiveLong, formatStrengthTimeSetLine } from '@eva/workout-engine'
import {
    formatStrengthTimeObjective,
    isStrengthTimeBlock,
    legacyRepsSummaryFor,
    typedBlockSummary,
} from '@/lib/workout-exercise-type'
import type { BuilderBlock } from './types'

const REPO = path.resolve(__dirname, '..', '..', '..', '..', '..', '..', '..')
const WEEKLY_PLAN_BUILDER = path.join(
    REPO, 'apps', 'web', 'src', 'app', 'coach', 'builder', '[clientId]', 'WeeklyPlanBuilder.tsx',
)

/** Plancha con disco prescrita en segundos, tal como la deja el segmented «Reps | Segundos». */
function plancha(over: Partial<BuilderBlock> = {}): BuilderBlock {
    return {
        uid: 'blk-1',
        exercise_id: 'ex-99',
        exercise_name: 'Plancha frontal mantenida',
        muscle_group: 'Core',
        exercise_type: 'strength',
        sets: 3,
        reps: '8-12',
        target_weight_kg: '10',
        rest_time: '90s',
        duration_sec: 30,
        reps_unit: 'sec',
        ...over,
    }
}

/** Lo que `legacyRepsSummaryFor` espera del builder: distancia y carga ya parseadas a número. */
function summaryInput(block: BuilderBlock) {
    return { ...block, distance_value: null, load_value: null }
}

/**
 * W2.2 — el espejo legacy que el guardado web escribe en `workout_blocks.reps`.
 *
 * `reps` es NOT NULL (Zod exige `min(1)`) y es lo que leen la app vieja del alumno, los chips, el
 * print, el historial y `target_reps_at_log`. En fuerza clásica manda el texto del coach; en modo
 * tiempo tiene que mandar el reloj, o un bloque que el coach pasó a Segundos sigue anunciando
 * «8-12» en todas esas superficies.
 *
 * El mapper del guardado (`mapDays`) vive inline dentro de `handleSave`, así que no es importable
 * sin montar el builder entero: el test ataca las dos mitades por separado —la condición exacta que
 * quedó escrita en el fuente y el contrato del motor que esa condición invoca—, que juntas son la
 * línea completa. El equivalente RN, que sí es un módulo puro, se prueba de punta a punta en
 * `tests/mobile/plan-builder-serialize.test.ts`.
 */
describe('W2.2 — espejo `reps` en el guardado web', () => {
    it('el mapper gatea el espejo con `isStrengthTimeBlock`, no con el tipo del bloque', () => {
        const src = fs.readFileSync(WEEKLY_PLAN_BUILDER, 'utf8')

        expect(src).toContain('const strengthTime = isStrengthTimeBlock(summaryInput, { exercise_type: b.exercise_type })')
        expect(src).toContain("const reps = type === 'strength' && !strengthTime")
        expect(src).toContain('legacyRepsSummaryFor(summaryInput, type)')
    })

    it('el motor devuelve «30s» para el bloque en modo tiempo y «30s/lado» por lado', () => {
        expect(isStrengthTimeBlock(summaryInput(plancha()), { exercise_type: 'strength' })).toBe(true)
        expect(legacyRepsSummaryFor(summaryInput(plancha()), 'strength')).toBe('30s')
        expect(legacyRepsSummaryFor(summaryInput(plancha({ side_mode: 'per_side' })), 'strength')).toBe('30s/lado')
    })

    it('fuerza clásica sigue con el texto del coach (el espejo NO se enciende)', () => {
        const clasico = plancha({ duration_sec: null, reps_unit: null })
        expect(isStrengthTimeBlock(summaryInput(clasico), { exercise_type: 'strength' })).toBe(false)
        expect(legacyRepsSummaryFor(summaryInput(clasico), 'strength')).toBe('8-12')
    })

    it('un `duration_sec` suelto sin `reps_unit: sec` no enciende el espejo (AND de R3)', () => {
        const residuo = plancha({ reps_unit: null })
        expect(isStrengthTimeBlock(summaryInput(residuo), { exercise_type: 'strength' })).toBe(false)
        expect(legacyRepsSummaryFor(summaryInput(residuo), 'strength')).toBe('8-12')
    })
})

/**
 * W2.14 — convención tipográfica única (R11). En el repo convivían las dos formas
 * (`workout-exercise-type.ts` sin espacio vs `logged-set-summary.ts` con espacio) y el mockup manda:
 * **`30s` pegado** en chips de ≤ 20 caracteres, **`30 s` con espacio** en líneas largas de ficha,
 * preview, print y log. Este test fija las formas canónicas que exporta el motor para que ninguna
 * superficie invente una tercera.
 */
describe('W2.14 — convención tipográfica del modo tiempo', () => {
    it('chip corto: «30s» pegado, y el objetivo compacto «3 × 30s» entra en 20 caracteres', () => {
        expect(legacyRepsSummaryFor(summaryInput(plancha()), 'strength')).toBe('30s')
        // `typedBlockSummary` imprime el `reps` CRUDO (`${sets}×${reps}`), así que da «3×30s» recién
        // con el espejo de W2.2 escrito. En memoria, mientras el coach tipea, `reps` sigue con el
        // texto viejo («8-12») a propósito —borrarlo lo dejaría en «Datos incompletos»—, de modo que
        // las superficies del builder tienen que pedir el objetivo por `formatStrengthTimeObjective`
        // y no por este resumen.
        expect(typedBlockSummary(summaryInput(plancha({ reps: '30s' })), 'strength')).toBe('3×30s')
        expect(typedBlockSummary(summaryInput(plancha()), 'strength')).toBe('3×8-12')

        const objetivo = formatStrengthTimeObjective(summaryInput(plancha()))
        expect(objetivo).toBe('3 × 30s')
        expect(objetivo.length).toBeLessThanOrEqual(20)
        expect(formatStrengthTimeObjective(summaryInput(plancha({ side_mode: 'per_side' })))).toBe('3 × 30s por lado')
    })

    it('línea larga de prescripción: «3 × 30 s» con espacio', () => {
        expect(formatStrengthTimeObjectiveLong(summaryInput(plancha()))).toBe('3 × 30 s')
        expect(formatStrengthTimeObjectiveLong(summaryInput(plancha({ side_mode: 'per_side' })))).toBe('3 × 30 s por lado')
    })

    it('línea de log: «10 kg × 30 s» y «10 kg × 30 s por lado»', () => {
        expect(formatStrengthTimeSetLine({ weight_kg: 10, actual_hold_sec: 30 })).toBe('10 kg × 30 s')
        expect(formatStrengthTimeSetLine({
            weight_kg: 10,
            actual_hold_sec: 60,
            metadata: { left_sec: 30, right_sec: 30 },
        })).toBe('10 kg × 30 s por lado')
    })

    it('sin peso la línea es sólo el hold, y sin hold no hay línea', () => {
        expect(formatStrengthTimeSetLine({ actual_hold_sec: 30 })).toBe('30 s')
        expect(formatStrengthTimeSetLine({ weight_kg: 10 })).toBeNull()
    })

    it('ninguna forma mezcla las dos convenciones', () => {
        expect(formatStrengthTimeObjective(summaryInput(plancha()))).not.toContain(' s')
        expect(formatStrengthTimeObjectiveLong(summaryInput(plancha()))).not.toMatch(/\ds\b/)
        expect(formatStrengthTimeSetLine({ weight_kg: 10, actual_hold_sec: 30 })).not.toMatch(/\ds\b/)
    })
})
