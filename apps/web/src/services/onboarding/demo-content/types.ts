/**
 * Alumno de ejemplo del onboarding v2 — CONTRATOS del contenido (W3 F3.2/F3.3).
 *
 * Este archivo es TypeScript PURO: describe QUÉ se siembra, nunca CÓMO se escribe. Los cuatro
 * `demo-content/*.ts` solo exportan datos con esta forma y `demo-writers.ts` los traduce a filas.
 * Consecuencia buscada: revisar el contenido (D4: el socio revisa fuerza y running, la
 * nutricionista las pautas, el kine el screening) es leer un archivo de datos, no un seed.
 *
 * Regla dura del catálogo (SPEC §4, riesgo «seeds escriben en prod»): NINGÚN blueprint trae un
 * `exercise_id` ni un `food_id` literal. Se referencian por NOMBRE contra el catálogo del sistema
 * y el escritor los resuelve en el momento; si un nombre no existe, el bloque se omite y queda
 * anotado en el inventario. Un id inventado sería una FK rota en producción.
 */

/**
 * Referencia a un ejercicio del catálogo del SISTEMA (`exercises` con `coach_id/org_id/team_id`
 * NULL). `names` va en orden de preferencia: se usa el primero que exista. `fallback*` permite
 * degradar a «cualquier ejercicio del sistema de este grupo/tipo» antes que perder el bloque.
 */
export interface ExerciseRef {
    names: readonly string[]
    fallbackMuscleGroup?: string
    fallbackType?: 'strength' | 'cardio' | 'mobility' | 'roller'
}

/** Referencia a un alimento del catálogo V2 (`foods` global). Mismas reglas que `ExerciseRef`. */
export interface FoodRef {
    names: readonly string[]
}

/** Configuración de intervalos (`workout_blocks.interval_config`), forma de la Fase D de cardio. */
export interface IntervalConfigBlueprint {
    warmup_sec?: number
    cooldown_sec?: number
    repeats: number
    work: {
        distance_m?: number
        duration_sec?: number
        target?: { kind: 'hr_zone'; hr_zone: number }
    }
    recovery: { duration_sec?: number; distance_m?: number; mode?: string }
}

/**
 * Un bloque del builder. Espeja las columnas reales de `workout_blocks`; `section` es el CHECK
 * legado (`warmup | main | cooldown`) y `areaSlug` apunta al ÁREA del coach
 * (`workout_section_templates.slug`), que es lo que el builder pinta como encabezado.
 */
export interface BlockBlueprint {
    /** Clave estable dentro del blueprint: la usan los logs para colgarse del bloque correcto. */
    key: string
    exercise: ExerciseRef
    orderIndex: number
    section: 'warmup' | 'main' | 'cooldown'
    /** Slug del área (system o custom del coach). Sin match, el bloque queda sin área. */
    areaSlug?: string
    sets: number
    reps: string
    restTime?: string
    warmupRestTime?: string
    tempo?: string
    rir?: string
    instructions?: string
    notes?: string
    supersetGroup?: string
    exerciseTypeOverride?: 'strength' | 'cardio' | 'mobility' | 'roller'
    sideMode?: 'per_side'
    isUnilateral?: boolean
    durationSec?: number
    distanceValue?: number
    distanceUnit?: 'm' | 'km'
    repsValue?: number
    repsUnit?: string
    hrZone?: number
    targetPaceSecPerKm?: number
    intervalConfig?: IntervalConfigBlueprint
    progression?: {
        mode?: string
        type?: 'weight' | 'reps'
        value?: number
        targetWeightKg?: number
    }
}

/** Un día del programa (`workout_plans` + sus `workout_blocks`). */
export interface PlanBlueprint {
    title: string
    /** 1 = lunes … 7 = domingo (convención del builder, ver `seed-catalina-full-qa`). */
    dayOfWeek: number
    groupName?: string
    blocks: readonly BlockBlueprint[]
}

/** Fase del programa (`workout_programs.program_phases`). */
export interface ProgramPhaseBlueprint {
    name: string
    weeks: number
    color: string
}

/** Un programa completo (`workout_programs` + días + bloques). */
export interface ProgramBlueprint {
    name: string
    notes: string
    weeksToRepeat: number
    programStructureType: 'weekly'
    durationType: 'weeks'
    phases?: readonly ProgramPhaseBlueprint[]
    /** Áreas custom que este programa necesita en el builder del coach (F3.5). */
    requiredAreas?: readonly { name: string; slug: string }[]
    plans: readonly PlanBlueprint[]
}

/** Una serie registrada por el alumno demo. Los campos varían según el tipo de bloque. */
export interface LoggedSetBlueprint {
    /** Fuerza. */
    weightKg?: number
    repsDone?: number
    rir?: number
    /** Cardio. */
    durationSec?: number
    distanceM?: number
    avgHr?: number
    paceSecPerKm?: number
    /** Isométricos. */
    holdSec?: number
    rpe?: number
    note?: string
}

/** Sesión del alumno demo: N series sobre bloques del programa, hace `daysAgo` días. */
export interface LoggedSessionBlueprint {
    daysAgo: number
    entries: readonly {
        blockKey: string
        kind: 'strength' | 'cardio' | 'hold'
        sets: readonly LoggedSetBlueprint[]
    }[]
}

/** Check-in del alumno demo (`check_ins`). */
export interface CheckInBlueprint {
    daysAgo: number
    weight: number
    energyLevel: number
    notes: string
}

// ── Nutrición V2 ─────────────────────────────────────────────────────────────────────────────

/** Item prescrito de una franja (`nutrition_prescription_items_v2`). */
export interface ItemBlueprint {
    food: FoodRef
    quantity: number
    unit: 'g' | 'ml' | 'un'
    notes?: string
    optional?: boolean
}

/** Target de porciones de una franja (`nutrition_slot_exchange_targets_v2`), por código de grupo. */
export interface ExchangeTargetBlueprint {
    groupCode: string
    portions: number
    notes?: string
}

/** Franja / tiempo de comida (`nutrition_meal_slots_v2`). */
export interface SlotBlueprint {
    code: string
    name: string
    startTime: string
    endTime: string
    required: boolean
    instructions?: string
    targets?: { calories?: number; proteinG?: number; carbsG?: number; fatsG?: number }
    items: readonly ItemBlueprint[]
    exchangeTargets?: readonly ExchangeTargetBlueprint[]
}

/** Variante de día (`nutrition_day_variants_v2`). El demo usa una sola: el día base. */
export interface DayVariantBlueprint {
    key: string
    label: string
    isDefault: boolean
    targets: {
        calories: number
        proteinG: number
        carbsG: number
        fatsG: number
        fiberG?: number
        waterMl?: number
    }
    slots: readonly SlotBlueprint[]
}

/** Plan V2 completo (`nutrition_plans_v2` + versión publicada + su árbol). */
export interface NutritionPlanBlueprint {
    name: string
    strategy: 'structured' | 'hybrid' | 'flexible'
    visibleNotes: string
    dayVariants: readonly DayVariantBlueprint[]
}

// ── Screening de movimiento ──────────────────────────────────────────────────────────────────

/** Un patrón del screening de 7 (`movement_assessment_items`). */
export interface MovementItemBlueprint {
    pattern: string
    isPerSide: boolean
    scoreLeft?: number
    scoreRight?: number
    scoreSingle?: number
    pain: boolean
    clearingPositive?: boolean | null
    comment?: string
}

/** Screening completo del demo de rehabilitación. */
export interface MovementAssessmentBlueprint {
    notes: string
    items: readonly MovementItemBlueprint[]
}

// ── Composición corporal ─────────────────────────────────────────────────────────────────────

/** Medición BIA (`body_composition_measurements` con `method = 'bia'`). */
export interface BiaBlueprint {
    daysAgo: number
    deviceBrand: string
    deviceModel: string
    weightKg: number
    heightCm: number
    notes: string
    metrics: Record<string, number>
}

/**
 * Registro de ingesta del alumno demo (`nutrition_intake_entries`).
 * `mealSlot` usa el vocabulario del CHECK de la tabla, no el `slot_code` del plan.
 */
export interface IntakeEntryBlueprint {
    daysAgo: number
    food: FoodRef
    quantity: number
    unit: 'g' | 'ml' | 'un'
    mealSlot: 'breakfast' | 'morning_snack' | 'lunch' | 'afternoon_snack' | 'dinner' | 'other'
}
