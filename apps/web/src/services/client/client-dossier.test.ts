import { describe, expect, it } from 'vitest'
import {
    buildClientDossier,
    deriveStatusLevel,
    type ClientDossierInput,
} from './client-dossier'

const GEN_ISO = '2026-07-02T12:00:00.000Z'

function baseInput(): ClientDossierInput {
    return {
        client: {
            full_name: 'Constanza Salgado',
            email: 'coni@example.cl',
            phone: '+56911112222',
            subscription_start_date: '2026-01-15',
            created_at: '2026-01-10T10:00:00.000Z',
            is_active: true,
        },
        activeProgram: {
            name: 'Hipertrofia 8 semanas',
            weeks_to_repeat: 8,
            workout_plans: [
                { title: 'Push', day_of_week: 1, workout_blocks: [{}, {}, {}] },
                { title: 'Pull', day_of_week: 3, workout_blocks: [{}, {}] },
                { title: 'Vacío', day_of_week: 5, workout_blocks: [] }, // se filtra (sin bloques)
            ],
        },
        activeNutritionPlanWithMeals: {
            name: 'Definición',
            daily_calories: 2100,
            protein_g: 180,
            carbs_g: 200,
            fats_g: 60,
            nutrition_meals: [{}, {}, {}, {}],
        },
        checkIns: [
            { created_at: '2026-06-30T09:00:00.000Z', weight: 68.0, energy_level: 8, notes: 'Bien', front_photo_url: 'https://signed/a.jpg' },
            { created_at: '2026-06-23T09:00:00.000Z', weight: 68.6, energy_level: 7, notes: null, front_photo_url: null },
            { created_at: '2026-06-16T09:00:00.000Z', weight: 69.2, energy_level: 6, notes: 'x'.repeat(300), front_photo_url: null },
            { created_at: '2026-06-09T09:00:00.000Z', weight: 70.0, energy_level: 5, notes: null, front_photo_url: null },
            { created_at: '2026-06-02T09:00:00.000Z', weight: 70.5, energy_level: 6, notes: null, front_photo_url: null },
        ],
        compliance: {
            workoutsThisWeek: 3,
            workoutsTarget: 4,
            nutritionCompliancePercent: 75,
            todayMealsDone: 3,
            todayMealsTotal: 4,
            currentStreak: 12,
            planCurrentWeek: 3,
            planTotalWeeks: 8,
            planDaysRemaining: 35,
            checkInCompliancePercent: 90,
        },
        personalRecords: [
            { exerciseName: 'Sentadilla', muscleGroup: 'Piernas', maxWeightKg: 100, repsAtMax: 5 },
            { exerciseName: 'Press banca', muscleGroup: 'Pecho', maxWeightKg: 70, repsAtMax: 6 },
            { exerciseName: 'Peso muerto', muscleGroup: 'Espalda', maxWeightKg: 120, repsAtMax: 3 },
        ],
        muscleVolumeByGroup: [
            { muscleGroup: 'Piernas', volume: 5000 },
            { muscleGroup: 'Pecho', volume: 3200 },
            { muscleGroup: 'Vacío', volume: 0 }, // se filtra (volumen 0)
        ],
        nutritionMonthlyAvgPct: 82,
        attentionScore: 18,
        profileLastActivityAt: '2026-06-30T09:00:00.000Z',
    }
}

describe('deriveStatusLevel', () => {
    it('usa los umbrales del War Room (50 / 25)', () => {
        expect(deriveStatusLevel(60)).toBe('urgente')
        expect(deriveStatusLevel(50)).toBe('urgente')
        expect(deriveStatusLevel(49)).toBe('atencion')
        expect(deriveStatusLevel(25)).toBe('atencion')
        expect(deriveStatusLevel(24)).toBe('aldia')
        expect(deriveStatusLevel(0)).toBe('aldia')
    })
})

describe('buildClientDossier — mapeo completo', () => {
    const d = buildClientDossier(baseInput(), { generatedAtIso: GEN_ISO })

    it('propaga la fecha de generación tal cual (función pura, sin reloj)', () => {
        expect(d.generatedAtIso).toBe(GEN_ISO)
    })

    it('identidad', () => {
        expect(d.identity.fullName).toBe('Constanza Salgado')
        expect(d.identity.email).toBe('coni@example.cl')
        expect(d.identity.isActive).toBe(true)
        expect(d.identity.clientSinceIso).toBe('2026-01-15') // subscription_start_date gana
        expect(d.identity.streakDays).toBe(12)
        expect(d.identity.lastActivityIso).toBe('2026-06-30T09:00:00.000Z')
    })

    it('estado: nivel derivado del score', () => {
        expect(d.status.attentionScore).toBe(18)
        expect(d.status.level).toBe('aldia')
    })

    it('métricas: peso actual + delta, adherencia semanal, nutrición', () => {
        expect(d.metrics.currentWeightKg).toBe(68.0)
        expect(d.metrics.weightDeltaKg).toBe(-0.6) // 68.0 - 68.6
        expect(d.metrics.workoutsDone).toBe(3)
        expect(d.metrics.workoutsTarget).toBe(4)
        expect(d.metrics.adherenceWeeklyPct).toBe(75)
        expect(d.metrics.mealsDoneToday).toBe(3)
        expect(d.metrics.mealsTotalToday).toBe(4)
        expect(d.metrics.nutritionTodayPct).toBe(75)
        expect(d.metrics.nutritionAdherence30dPct).toBe(82)
        expect(d.metrics.checkInCompliancePct).toBe(90)
        expect(d.metrics.planCurrentWeek).toBe(3)
        expect(d.metrics.planTotalWeeks).toBe(8)
    })

    it('programa: solo días con bloques', () => {
        expect(d.program).not.toBeNull()
        expect(d.program!.name).toBe('Hipertrofia 8 semanas')
        expect(d.program!.totalWeeks).toBe(8)
        expect(d.program!.daysRemaining).toBe(35)
        expect(d.program!.days).toHaveLength(2) // "Vacío" filtrado
        expect(d.program!.days[0]).toEqual({ title: 'Push', dayOfWeek: 1, blockCount: 3 })
    })

    it('entrenamiento: PRs y volumen (volumen 0 filtrado)', () => {
        expect(d.training.personalRecords).toHaveLength(3)
        expect(d.training.personalRecords[0].exerciseName).toBe('Sentadilla')
        expect(d.training.muscleVolume).toHaveLength(2)
        expect(d.training.muscleVolume[0]).toEqual({ muscleGroup: 'Piernas', volume: 5000 })
    })

    it('nutrición: nombre, objetivos y nº de comidas (sin day-specific ⇒ por día)', () => {
        expect(d.nutrition).not.toBeNull()
        expect(d.nutrition!.planName).toBe('Definición')
        expect(d.nutrition!.goals).toEqual({ calories: 2100, protein: 180, carbs: 200, fats: 60 })
        expect(d.nutrition!.mealsTotal).toBe(4)
        expect(d.nutrition!.hasDaySpecificMeals).toBe(false)
    })

    it('nutrición: comidas day-specific ⇒ hasDaySpecificMeals=true y total del plan', () => {
        const input = baseInput()
        // Plan de días específicos: 2 comidas del lunes + 2 del miércoles + 1 de todos los días.
        input.activeNutritionPlanWithMeals = {
            name: 'Ciclado por día',
            daily_calories: 2000,
            protein_g: 160,
            carbs_g: 190,
            fats_g: 58,
            nutrition_meals: [
                { day_of_week: 1 },
                { day_of_week: 1 },
                { day_of_week: 3 },
                { day_of_week: 3 },
                { day_of_week: null },
            ],
        }
        const dd = buildClientDossier(input, { generatedAtIso: GEN_ISO })
        expect(dd.nutrition!.mealsTotal).toBe(5)
        expect(dd.nutrition!.hasDaySpecificMeals).toBe(true)
    })

    it('check-ins: orden DESC, delta encadenado y notas truncadas a ~200', () => {
        expect(d.checkIns).toHaveLength(5)
        expect(d.checkIns[0].dateIso).toBe('2026-06-30T09:00:00.000Z')
        expect(d.checkIns[0].weightDeltaKg).toBe(-0.6)
        // El más antiguo no tiene con qué comparar.
        expect(d.checkIns[4].weightDeltaKg).toBeNull()
        // Notas de 300 chars → truncadas con elipsis (≤ 200).
        const long = d.checkIns[2].notes!
        expect(long.length).toBeLessThanOrEqual(200)
        expect(long.endsWith('…')).toBe(true)
        // photoUrl preservada / null.
        expect(d.checkIns[0].photoUrl).toBe('https://signed/a.jpg')
        expect(d.checkIns[1].photoUrl).toBeNull()
    })
})

describe('buildClientDossier — empty-states (nunca crashea con null)', () => {
    it('sin check-ins, sin programa, sin nutrición', () => {
        const d = buildClientDossier(
            {
                client: {
                    full_name: 'Alumno Nuevo',
                    email: 'nuevo@example.cl',
                    phone: null,
                    subscription_start_date: null,
                    created_at: '2026-07-01T10:00:00.000Z',
                    is_active: false,
                },
                // Todo lo demás ausente / null.
                activeProgram: null,
                activeNutritionPlanWithMeals: null,
                checkIns: null,
                compliance: null,
                personalRecords: null,
                muscleVolumeByGroup: null,
                nutritionMonthlyAvgPct: null,
                attentionScore: null,
                profileLastActivityAt: null,
            },
            { generatedAtIso: GEN_ISO }
        )

        expect(d.identity.fullName).toBe('Alumno Nuevo')
        expect(d.identity.isActive).toBe(false)
        expect(d.identity.clientSinceIso).toBe('2026-07-01T10:00:00.000Z') // cae a created_at
        expect(d.identity.streakDays).toBe(0)
        expect(d.status.attentionScore).toBe(0)
        expect(d.status.level).toBe('aldia')
        expect(d.program).toBeNull()
        expect(d.nutrition).toBeNull()
        expect(d.checkIns).toEqual([])
        expect(d.training.personalRecords).toEqual([])
        expect(d.training.muscleVolume).toEqual([])
        // Métricas con pisos seguros (nunca divide por 0).
        expect(d.metrics.currentWeightKg).toBeNull()
        expect(d.metrics.weightDeltaKg).toBeNull()
        expect(d.metrics.workoutsTarget).toBe(1)
        expect(d.metrics.mealsTotalToday).toBe(1)
        expect(d.metrics.adherenceWeeklyPct).toBe(0)
        expect(d.metrics.nutritionAdherence30dPct).toBeNull()
    })

    it('capea check-ins a los 30 más recientes y reporta el total real', () => {
        const input = baseInput()
        // 35 check-ins semanales DESC (el más reciente primero).
        input.checkIns = Array.from({ length: 35 }, (_, i) => ({
            created_at: new Date(Date.UTC(2026, 5, 30) - i * 7 * 86400000).toISOString(),
            weight: 70 - i * 0.1,
            energy_level: 7,
            notes: null,
            front_photo_url: null,
        }))
        const d = buildClientDossier(input, { generatedAtIso: GEN_ISO })
        expect(d.checkIns).toHaveLength(30)
        expect(d.checkInsTotal).toBe(35)
        // El slice conserva los MÁS RECIENTES ⇒ peso actual intacto.
        expect(d.checkIns[0].dateIso).toBe('2026-06-30T00:00:00.000Z')
        expect(d.metrics.currentWeightKg).toBe(70)
    })

    it('programa A/B: lista SOLO los días de la variante efectiva', () => {
        const input = baseInput()
        input.activeProgram = {
            name: 'Fuerza A/B',
            weeks_to_repeat: 8,
            workout_plans: [
                { title: 'Push A', day_of_week: 1, week_variant: 'A', workout_blocks: [{}, {}] },
                { title: 'Pull A', day_of_week: 3, week_variant: 'A', workout_blocks: [{}] },
                { title: 'Legs A', day_of_week: 5, week_variant: 'A', workout_blocks: [{}] },
                { title: 'Push B', day_of_week: 1, week_variant: 'B', workout_blocks: [{}] },
                { title: 'Pull B', day_of_week: 3, week_variant: 'B', workout_blocks: [{}] },
                { title: 'Legs B', day_of_week: 5, week_variant: 'B', workout_blocks: [{}] },
            ],
        }
        input.programEffectiveWeekVariant = 'A'
        input.programAbMode = true
        const d = buildClientDossier(input, { generatedAtIso: GEN_ISO })
        expect(d.program!.days.map((x) => x.title)).toEqual(['Push A', 'Pull A', 'Legs A'])
    })

    it('sin dato de variante (callers legacy) no filtra días', () => {
        const input = baseInput()
        input.activeProgram = {
            name: 'Fuerza A/B',
            weeks_to_repeat: 8,
            workout_plans: [
                { title: 'Push A', week_variant: 'A', workout_blocks: [{}] },
                { title: 'Push B', week_variant: 'B', workout_blocks: [{}] },
            ],
        }
        const d = buildClientDossier(input, { generatedAtIso: GEN_ISO })
        expect(d.program!.days).toHaveLength(2)
    })

    it('programa presente pero todos los días sin bloques ⇒ days vacío', () => {
        const input = baseInput()
        input.activeProgram = {
            name: 'Sin bloques',
            weeks_to_repeat: 4,
            workout_plans: [
                { title: 'A', day_of_week: 1, workout_blocks: [] },
                { title: 'B', day_of_week: 2, workout_blocks: null },
            ],
        }
        const d = buildClientDossier(input, { generatedAtIso: GEN_ISO })
        expect(d.program).not.toBeNull()
        expect(d.program!.days).toEqual([])
    })
})
