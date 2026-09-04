import { describe, expect, it } from 'vitest'
import { resolveNextProgramWorkout } from './profileProgramUtils'

// 2026-09-07 es LUNES (mondayBasedDayOfWeek === 1): la fecha exacta que un ciclo de 3 días
// (day_of_week 1/2/3, el ÍNDICE del ciclo) coincide numéricamente con el ISODOW de hoy.
const MONDAY = new Date('2026-09-07T12:00:00')

const cycleProgramOf3Days = {
    program_structure_type: 'cycle' as const,
    ab_mode: false,
    workout_plans: [
        { day_of_week: 1, title: 'Día 1', workout_blocks: [{ id: 'b1' }] },
        { day_of_week: 2, title: 'Día 2', workout_blocks: [{ id: 'b2' }] },
        { day_of_week: 3, title: 'Día 3', workout_blocks: [{ id: 'b3' }] },
    ],
}

const weeklyProgram = {
    program_structure_type: 'weekly' as const,
    ab_mode: false,
    workout_plans: [
        { day_of_week: 1, title: 'Tren superior', workout_blocks: [{ id: 'b1' }] },
        { day_of_week: 3, title: 'Piernas', workout_blocks: [{ id: 'b2' }] },
        { day_of_week: 5, title: 'Espalda', workout_blocks: [{ id: 'b3' }] },
    ],
}

describe('profileProgramUtils — resolveNextProgramWorkout (W4.6: "Hoy" no es coincidencia numérica en ciclo)', () => {
    it('un programa cycle de 3 días NO ilumina el día 1 un lunes', () => {
        const next = resolveNextProgramWorkout(cycleProgramOf3Days, MONDAY, null)
        expect(next).not.toBeNull()
        // El resolvedor sigue eligiendo el "próximo" plan del microciclo (día 1), pero el flag
        // de "Hoy" no puede salir de comparar el índice del ciclo con el ISODOW real.
        expect(next?.dayOfWeek).toBe(1)
        expect(next?.isToday).toBe(false)
    })

    it('un programa weekly SIGUE marcando el ISODOW de hoy (sin regresión)', () => {
        const next = resolveNextProgramWorkout(weeklyProgram, MONDAY, null)
        expect(next).not.toBeNull()
        expect(next?.dayOfWeek).toBe(1)
        expect(next?.isToday).toBe(true)
    })

    it('un programa weekly sin entreno hoy no marca "Hoy" en el próximo que sí cae más adelante', () => {
        // Lunes (todayDow=1): el próximo con block es el miércoles (day_of_week=3).
        const next = resolveNextProgramWorkout(weeklyProgram, MONDAY, null)
        expect(next?.title).toBe('Tren superior')
        // (mismo caso que arriba: hoy SÍ hay entreno el lunes, así que isToday=true)
        expect(next?.isToday).toBe(true)

        const weeklyWithoutMonday = {
            ...weeklyProgram,
            workout_plans: weeklyProgram.workout_plans.filter((p) => p.day_of_week !== 1),
        }
        const nextNoMonday = resolveNextProgramWorkout(weeklyWithoutMonday, MONDAY, null)
        expect(nextNoMonday?.dayOfWeek).toBe(3)
        expect(nextNoMonday?.isToday).toBe(false)
    })

    it('sin program_structure_type (legacy) se comporta como weekly: no rompe programas viejos', () => {
        const legacyProgram = {
            ab_mode: false,
            workout_plans: [{ day_of_week: 1, title: 'Legacy', workout_blocks: [{ id: 'b1' }] }],
        }
        const next = resolveNextProgramWorkout(legacyProgram, MONDAY, null)
        expect(next?.isToday).toBe(true)
    })
})
