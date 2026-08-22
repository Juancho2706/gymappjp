import type { SupabaseClient } from '@supabase/supabase-js'
import { computeIsak, type IsakRawInput } from '@eva/bodycomp'
import { computeItemMacros, type BuilderFood, type NutritionMacrosBasis } from '@eva/nutrition-v2'
import {
    finalItemScore,
    MOVEMENT_PROTOCOL_VERSION,
    summarizeAssessment,
    type MovementItemInput,
    type MovementPatternSlug,
} from '@eva/calc'
import { nextCustomSortOrder, slugifyAreaName } from '@eva/workout-engine'
import type { Database, Json } from '@/lib/database.types'
import type {
    BiaBlueprint,
    CheckInBlueprint,
    ExerciseRef,
    FoodRef,
    IntakeEntryBlueprint,
    LoggedSessionBlueprint,
    MovementAssessmentBlueprint,
    NutritionPlanBlueprint,
    ProgramBlueprint,
} from './demo-content/types'

/**
 * Escritores del alumno de ejemplo: blueprint (dato puro) → filas reales.
 *
 * Recibe SIEMPRE el cliente ADMIN (service_role). Es la única forma de sembrar: el trigger
 * `clients_guard_is_demo` fuerza `is_demo = false` para cualquier otro rol, así que un demo
 * escrito con el cliente del coach nacería como alumno REAL y le comería el cupo Free.
 *
 * Por qué NO pasa por `persistAndPublishDraft` (el camino del editor de nutrición V2): esa
 * ruta es un thin caller de `public.persist_and_publish_nutrition_plan_v2`, que exige
 * `auth.uid()` presente y revalida `can_manage_client` con ese uid (NUT-034). El sembrador
 * corre con `service_role`, donde `auth.uid()` es NULL: la RPC abortaría. Se escribe el árbol
 * V2 directo, con la MISMA forma de filas que emite el editor —los `snapshot_*` congelados
 * por `computeItemMacros`, el motor único— y el mismo orden raíz → versión → variantes →
 * franjas → items → porciones. Lo que se pierde acá es la transacción; por eso el borrado es
 * por inventario y `deleteDemoStudent` es idempotente.
 */

type DB = SupabaseClient<Database>

/**
 * Puerta cruda para las tablas de Nutrición V2, que NO están en `database.types.ts` (el archivo
 * se mantiene a mano y esas tablas nunca se agregaron). Interfaz estructural mínima en vez de
 * `any`: lo que se usa queda explícito y el resto del archivo sigue tipado.
 */
type RawResult<T> = { data: T | null; error: { message: string; code?: string } | null }
interface RawInsert extends PromiseLike<RawResult<null>> {
    select(columns: string): { single(): Promise<RawResult<{ id: string }>> }
}
interface RawTable {
    insert(rows: Record<string, unknown> | Record<string, unknown>[]): RawInsert
    update(values: Record<string, unknown>): {
        eq(column: string, value: unknown): PromiseLike<RawResult<null>>
    }
    delete(): { eq(column: string, value: unknown): PromiseLike<RawResult<null>> }
}
interface RawDb {
    from(table: string): RawTable
}

const rawDb = (db: DB): RawDb => db as unknown as RawDb

/** Zona operativa de EVA. Las columnas `date` se escriben en este calendario, no en UTC. */
const TZ = 'America/Santiago'
const DAY_MS = 86_400_000

export function isoDaysAgo(daysAgo: number, offsetMs = 0): string {
    return new Date(Date.now() - daysAgo * DAY_MS + offsetMs).toISOString()
}

export function dateDaysAgo(daysAgo: number): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(Date.now() - daysAgo * DAY_MS))
}

function chunk<T>(items: readonly T[], size: number): T[][] {
    const out: T[][] = []
    for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
    return out
}

// ── Catálogo: resolución por NOMBRE ──────────────────────────────────────────────────────────

export interface ResolvedExercises {
    /** `ExerciseRef` → ejercicio del catálogo. Los refs sin match no entran al mapa. */
    byRef: Map<ExerciseRef, { id: string; name: string }>
    /** Nombres preferidos que no existen en el catálogo (para el inventario y el log). */
    missing: string[]
}

/**
 * Resuelve referencias de ejercicio contra el catálogo del SISTEMA en una sola consulta por
 * nombre, más una por fallback de grupo/tipo. Nunca inventa un `exercise_id`.
 */
export async function resolveExercises(db: DB, refs: readonly ExerciseRef[]): Promise<ResolvedExercises> {
    const byRef = new Map<ExerciseRef, { id: string; name: string }>()
    const missing: string[] = []
    if (refs.length === 0) return { byRef, missing }

    const allNames = [...new Set(refs.flatMap((ref) => ref.names))]
    const { data } = await db
        .from('exercises')
        .select('id, name')
        .in('name', allNames)
        .is('coach_id', null)
        .is('org_id', null)
        .is('team_id', null)
        .is('deleted_at', null)

    const byName = new Map<string, { id: string; name: string }>()
    for (const row of data ?? []) byName.set(row.name, { id: row.id, name: row.name })

    const pendingFallback: ExerciseRef[] = []
    for (const ref of refs) {
        const hit = ref.names.map((name) => byName.get(name)).find((row) => row != null)
        if (hit != null) byRef.set(ref, hit)
        else pendingFallback.push(ref)
    }

    for (const ref of pendingFallback) {
        missing.push(ref.names[0] ?? '(sin nombre)')
        if (ref.fallbackMuscleGroup == null && ref.fallbackType == null) continue
        let query = db
            .from('exercises')
            .select('id, name')
            .is('coach_id', null)
            .is('org_id', null)
            .is('team_id', null)
            .is('deleted_at', null)
        if (ref.fallbackMuscleGroup != null) query = query.eq('muscle_group', ref.fallbackMuscleGroup)
        if (ref.fallbackType != null) query = query.eq('exercise_type', ref.fallbackType)
        const { data: alt } = await query.limit(1)
        const first = alt?.[0]
        if (first != null) byRef.set(ref, { id: first.id, name: first.name })
    }

    return { byRef, missing }
}

/** Alimento del catálogo global mapeado al contrato del motor de macros (`BuilderFood`). */
export async function resolveFoods(db: DB, refs: readonly FoodRef[]): Promise<{
    byRef: Map<FoodRef, BuilderFood>
    missing: string[]
}> {
    const byRef = new Map<FoodRef, BuilderFood>()
    const missing: string[] = []
    if (refs.length === 0) return { byRef, missing }

    const allNames = [...new Set(refs.flatMap((ref) => ref.names))]
    const { data } = await db
        .from('foods')
        .select(
            'id, name, brand, calories, protein_g, carbs_g, fats_g, fiber_g, serving_size, serving_unit, category, macros_basis',
        )
        .in('name', allNames)
        .is('coach_id', null)
        .is('org_id', null)

    const byName = new Map<string, BuilderFood>()
    for (const row of data ?? []) {
        byName.set(row.name, {
            id: row.id,
            name: row.name,
            brand: row.brand,
            calories: row.calories,
            proteinG: row.protein_g,
            carbsG: row.carbs_g,
            fatsG: row.fats_g,
            fiberG: row.fiber_g,
            servingSize: row.serving_size,
            servingUnit: row.serving_unit ?? 'g',
            category: row.category,
            media: null,
            macrosBasis: (row.macros_basis as NutritionMacrosBasis | null) ?? null,
        })
    }

    for (const ref of refs) {
        const hit = ref.names.map((name) => byName.get(name)).find((food) => food != null)
        if (hit != null) byRef.set(ref, hit)
        else missing.push(ref.names[0] ?? '(sin nombre)')
    }
    return { byRef, missing }
}

// ── Áreas del builder (F3.5) ─────────────────────────────────────────────────────────────────

export interface EnsuredAreas {
    /** slug → id, incluyendo las del sistema (para `areaSlug: 'main'`, `'mobility'`, …). */
    idBySlug: Map<string, string>
    /** Ids de las áreas que ESTE sembrado creó (el borrado solo toca estas). */
    createdIds: string[]
}

/**
 * Deja disponibles las áreas que pide el programa. Idempotente: si el coach ya tiene un área con
 * ese slug (porque re-sembró, o porque la creó a mano) se REUSA y no se anota como creada — así
 * `deleteDemoStudent` nunca borra un área que el coach hizo suya.
 */
export async function ensureCoachAreas(
    db: DB,
    coachId: string,
    areas: readonly { name: string; slug: string }[],
): Promise<EnsuredAreas> {
    const { data } = await db
        .from('workout_section_templates')
        .select('id, slug, sort_order, coach_id, is_system')
        .is('deleted_at', null)
        .or(`is_system.eq.true,and(coach_id.eq.${coachId},team_id.is.null)`)

    const existing = data ?? []
    const idBySlug = new Map<string, string>()
    for (const row of existing) idBySlug.set(row.slug, row.id)

    const createdIds: string[] = []
    let sortOrder = nextCustomSortOrder(existing.map((row) => ({ sort_order: row.sort_order })))

    for (const area of areas) {
        const slug = slugifyAreaName(area.name)
        if (idBySlug.has(slug)) continue
        const { data: inserted, error } = await db
            .from('workout_section_templates')
            .insert({ name: area.name, slug, sort_order: sortOrder, coach_id: coachId, team_id: null, is_system: false })
            .select('id')
            .single()
        if (error != null || inserted == null) continue
        idBySlug.set(slug, inserted.id)
        createdIds.push(inserted.id)
        sortOrder += 10
    }

    return { idBySlug, createdIds }
}

// ── Programas de entrenamiento ───────────────────────────────────────────────────────────────

export interface WrittenProgram {
    programId: string
    planIds: string[]
    blockIds: string[]
    /** `BlockBlueprint.key` → id de la fila insertada (lo consumen los logs). */
    blockIdByKey: Map<string, string>
    /** `BlockBlueprint.key` → nombre del ejercicio resuelto (congelado en cada log). */
    exerciseNameByKey: Map<string, string>
    /** Ids de las áreas custom que este programa tuvo que crear (van al inventario). */
    createdAreaIds: string[]
    missingExercises: string[]
}

/**
 * Escribe un programa completo: `workout_programs` → `workout_plans` → `workout_blocks`.
 * `startDaysAgo` fija el arranque para que el panel muestre una semana en curso, no un programa
 * que empieza «mañana».
 */
export async function writeProgram(
    db: DB,
    input: {
        coachId: string
        clientId: string
        blueprint: ProgramBlueprint
        startDaysAgo: number
        isActive: boolean
    },
): Promise<WrittenProgram | { error: string }> {
    const { coachId, clientId, blueprint, startDaysAgo, isActive } = input

    const areas = await ensureCoachAreas(db, coachId, blueprint.requiredAreas ?? [])
    const refs = blueprint.plans.flatMap((plan) => plan.blocks.map((block) => block.exercise))
    const exercises = await resolveExercises(db, refs)

    const startDate = dateDaysAgo(startDaysAgo)
    const endDate = dateDaysAgo(startDaysAgo - blueprint.weeksToRepeat * 7)

    const { data: program, error: programError } = await db
        .from('workout_programs')
        .insert({
            client_id: clientId,
            coach_id: coachId,
            created_by_coach_id: coachId,
            last_edited_by_coach_id: coachId,
            name: blueprint.name,
            program_notes: blueprint.notes,
            weeks_to_repeat: blueprint.weeksToRepeat,
            duration_type: blueprint.durationType,
            program_structure_type: blueprint.programStructureType,
            program_phases: (blueprint.phases ?? []) as unknown as Json,
            start_date: startDate,
            end_date: endDate,
            is_active: isActive,
        })
        .select('id')
        .single()
    if (programError != null || program == null) {
        return { error: `workout_programs: ${programError?.message ?? 'sin fila'}` }
    }

    const planIds: string[] = []
    const blockIds: string[] = []
    const blockIdByKey = new Map<string, string>()
    const exerciseNameByKey = new Map<string, string>()

    for (const plan of blueprint.plans) {
        const { data: planRow, error: planError } = await db
            .from('workout_plans')
            .insert({
                client_id: clientId,
                coach_id: coachId,
                program_id: program.id,
                title: plan.title,
                group_name: plan.groupName ?? 'Programa de Entrenamiento',
                day_of_week: plan.dayOfWeek,
                week_variant: 'A',
                assigned_date: startDate,
            })
            .select('id')
            .single()
        if (planError != null || planRow == null) continue
        planIds.push(planRow.id)

        const usableBlocks = plan.blocks.filter((block) => exercises.byRef.has(block.exercise))
        if (usableBlocks.length === 0) continue

        const rows = usableBlocks.map((block) => ({
            plan_id: planRow.id,
            exercise_id: (exercises.byRef.get(block.exercise) as { id: string }).id,
            order_index: block.orderIndex,
            section: block.section,
            section_template_id: block.areaSlug != null ? (areas.idBySlug.get(block.areaSlug) ?? null) : null,
            sets: block.sets,
            reps: block.reps,
            rest_time: block.restTime ?? '90s',
            warmup_rest_time: block.warmupRestTime ?? null,
            tempo: block.tempo ?? null,
            rir: block.rir ?? null,
            instructions: block.instructions ?? null,
            notes: block.notes ?? null,
            superset_group: block.supersetGroup ?? null,
            exercise_type_override: block.exerciseTypeOverride ?? null,
            side_mode: block.sideMode ?? null,
            is_unilateral: block.isUnilateral ?? null,
            duration_sec: block.durationSec ?? null,
            distance_value: block.distanceValue ?? null,
            distance_unit: block.distanceUnit ?? null,
            reps_value: block.repsValue ?? null,
            reps_unit: block.repsUnit ?? null,
            hr_zone: block.hrZone ?? null,
            target_pace_sec_per_km: block.targetPaceSecPerKm ?? null,
            interval_config: (block.intervalConfig ?? null) as unknown as Json,
            progression_mode: block.progression?.mode ?? 'weekly_linear',
            progression_type: block.progression?.type ?? null,
            progression_value: block.progression?.value ?? null,
            target_weight_kg: block.progression?.targetWeightKg ?? null,
        }))

        const { data: inserted, error: blocksError } = await db
            .from('workout_blocks')
            .insert(rows)
            .select('id, order_index')
        if (blocksError != null || inserted == null) continue
        for (const block of usableBlocks) {
            const hit = inserted.find((row) => row.order_index === block.orderIndex)
            if (hit == null) continue
            blockIdByKey.set(block.key, hit.id)
            blockIds.push(hit.id)
            const resolved = exercises.byRef.get(block.exercise)
            if (resolved != null) exerciseNameByKey.set(block.key, resolved.name)
        }
    }

    return {
        programId: program.id,
        planIds,
        blockIds,
        blockIdByKey,
        exerciseNameByKey,
        createdAreaIds: areas.createdIds,
        missingExercises: [...new Set(exercises.missing)],
    }
}

/** Metadatos de FC de un bloque cardio, para colgarlos en `workout_logs.metadata.hr`. */
export interface HrCurve {
    samples: [number, number][]
    samplePeriodSec: number
    max: number
}

/**
 * Escribe las series registradas del alumno demo. Una fila por serie (modelo real de
 * `workout_logs`), con `plan_name_at_log` / `exercise_name_at_log` congelados como los escribe
 * el ejecutor.
 */
export async function writeWorkoutLogs(
    db: DB,
    input: {
        clientId: string
        blueprint: ProgramBlueprint
        blockIdByKey: Map<string, string>
        sessions: readonly LoggedSessionBlueprint[]
        hrCurves?: Record<string, HrCurve>
        exerciseNameByKey: Map<string, string>
    },
): Promise<{ ids: string[]; error: string | null }> {
    const { clientId, blueprint, blockIdByKey, sessions, hrCurves, exerciseNameByKey } = input

    const planTitleByKey = new Map<string, string>()
    const blockByKey = new Map<string, (typeof blueprint.plans)[number]['blocks'][number]>()
    for (const plan of blueprint.plans) {
        for (const block of plan.blocks) {
            planTitleByKey.set(block.key, plan.title)
            blockByKey.set(block.key, block)
        }
    }

    const rows: Record<string, unknown>[] = []
    for (const session of sessions) {
        let staggerMs = 0
        for (const entry of session.entries) {
            const blockId = blockIdByKey.get(entry.blockKey)
            const block = blockByKey.get(entry.blockKey)
            if (blockId == null || block == null) continue
            entry.sets.forEach((set, index) => {
                const base: Record<string, unknown> = {
                    block_id: blockId,
                    client_id: clientId,
                    set_number: index + 1,
                    logged_at: isoDaysAgo(session.daysAgo, staggerMs),
                    plan_name_at_log: planTitleByKey.get(entry.blockKey) ?? null,
                    exercise_name_at_log: exerciseNameByKey.get(entry.blockKey) ?? null,
                    target_reps_at_log: block.reps,
                    note: set.note ?? null,
                    rpe: set.rpe ?? null,
                }
                if (entry.kind === 'strength') {
                    rows.push({
                        ...base,
                        weight_kg: set.weightKg ?? null,
                        reps_done: set.repsDone ?? null,
                        rir: set.rir ?? null,
                        target_weight_at_log: block.progression?.targetWeightKg ?? null,
                    })
                } else if (entry.kind === 'cardio') {
                    const curve = hrCurves?.[entry.blockKey]
                    const zone = block.hrZone ?? null
                    rows.push({
                        ...base,
                        actual_duration_sec: set.durationSec ?? null,
                        actual_distance_m: set.distanceM ?? null,
                        actual_avg_hr: set.avgHr ?? null,
                        actual_pace_sec_per_km: set.paceSecPerKm ?? null,
                        metadata:
                            curve != null && set.avgHr != null
                                ? ({
                                      hr: {
                                          v: 1,
                                          source: 'health_import',
                                          avg: set.avgHr,
                                          max: curve.max,
                                          duration_sec: set.durationSec ?? 0,
                                          target_zone: zone,
                                          // Sin perfil de FC resuelto acá no se inventa clasificación por
                                          // zona: null es degradación honesta (contrato `HrMetadataV1`).
                                          zone_sec: null,
                                          in_target_sec: null,
                                          sample_period_sec: curve.samplePeriodSec,
                                          samples: curve.samples,
                                          hub_source: 'Alumno de ejemplo',
                                      },
                                  } as unknown as Json)
                                : null,
                    })
                } else {
                    rows.push({ ...base, actual_hold_sec: set.holdSec ?? null })
                }
                staggerMs += 45_000
            })
        }
    }

    const ids: string[] = []
    let firstError: string | null = null
    for (const part of chunk(rows, 200)) {
        const { data, error } = await db.from('workout_logs').insert(part as never).select('id')
        if (error != null && firstError == null) firstError = error.message
        for (const row of data ?? []) ids.push(row.id)
    }
    return { ids, error: firstError }
}

/** Check-ins del alumno demo. Quedan sin revisar: el coach los ve como pendientes reales. */
export async function writeCheckIns(
    db: DB,
    input: { clientId: string; checkIns: readonly CheckInBlueprint[] },
): Promise<{ ids: string[]; error: string | null }> {
    if (input.checkIns.length === 0) return { ids: [], error: null }
    const rows = input.checkIns.map((checkIn) => ({
        client_id: input.clientId,
        date: dateDaysAgo(checkIn.daysAgo),
        weight: checkIn.weight,
        energy_level: checkIn.energyLevel,
        notes: checkIn.notes,
        created_at: isoDaysAgo(checkIn.daysAgo),
    }))
    const { data, error } = await db.from('check_ins').insert(rows).select('id')
    return { ids: (data ?? []).map((row) => row.id), error: error?.message ?? null }
}

// ── Nutrición V2 ─────────────────────────────────────────────────────────────────────────────

export interface WrittenNutritionPlan {
    planId: string
    versionId: string
    missingFoods: string[]
    missingGroups: string[]
}

/**
 * Permisos del alumno espejo de `defaultPermissionsFor(strategy)` (draft-builder del editor web,
 * que vive en `app/` y no es importable desde `services/`). Mismo objeto que persiste el editor;
 * `conversion.ts` del paquete lleva la misma copia y por la misma razón.
 */
function defaultStudentPermissions(strategy: NutritionPlanBlueprint['strategy']): Record<string, unknown> {
    return {
        canRegisterFreely: strategy !== 'structured',
        canAdjustPrescribedQuantity: true,
        quantityAdjustmentPercent: null,
        canSubstitute: false,
        canMoveMealSlot: false,
        canSkipOptionalItems: true,
    }
}

/** Escribe el árbol V2 completo y PUBLICA la versión 1. Ver la cabecera del archivo. */
export async function writeNutritionPlanV2(
    db: DB,
    input: { coachId: string; clientId: string; blueprint: NutritionPlanBlueprint },
): Promise<WrittenNutritionPlan | { error: string }> {
    const { coachId, clientId, blueprint } = input
    const raw = rawDb(db)

    const foodRefs = blueprint.dayVariants.flatMap((variant) =>
        variant.slots.flatMap((slot) => slot.items.map((item) => item.food)),
    )
    const foods = await resolveFoods(db, foodRefs)

    const groupCodes = [
        ...new Set(
            blueprint.dayVariants.flatMap((variant) =>
                variant.slots.flatMap((slot) => (slot.exchangeTargets ?? []).map((target) => target.groupCode)),
            ),
        ),
    ]
    const { data: groupRows } = await db
        .from('exchange_groups')
        .select('id, code, name, ref_calories, ref_protein_g, ref_carbs_g, ref_fats_g, composed_of, macros_confirmed')
        .in('code', groupCodes.length > 0 ? groupCodes : ['__none__'])
        .eq('is_system', true)
        .is('deleted_at', null)
    const groupByCode = new Map((groupRows ?? []).map((row) => [row.code, row]))
    const missingGroups = groupCodes.filter((code) => !groupByCode.has(code))

    const nowIso = new Date().toISOString()
    const { data: plan, error: planError } = await raw
        .from('nutrition_plans_v2')
        .insert({
            client_id: clientId,
            coach_id: coachId,
            name: blueprint.name,
            strategy: blueprint.strategy,
            lifecycle_status: 'active',
            created_by: coachId,
            updated_by: coachId,
        })
        .select('id')
        .single()
    if (planError != null || plan == null) {
        return { error: `nutrition_plans_v2: ${planError?.message ?? 'sin fila'}` }
    }

    const { data: version, error: versionError } = await raw
        .from('nutrition_plan_versions_v2')
        .insert({
            plan_id: plan.id,
            version_number: 1,
            status: 'published',
            strategy: blueprint.strategy,
            effective_from: dateDaysAgo(0),
            timezone: TZ,
            student_permissions: defaultStudentPermissions(blueprint.strategy),
            visible_notes: blueprint.visibleNotes,
            published_at: nowIso,
            published_by: coachId,
            created_by: coachId,
            updated_by: coachId,
        })
        .select('id')
        .single()
    if (versionError != null || version == null) {
        return { error: `nutrition_plan_versions_v2: ${versionError?.message ?? 'sin fila'}` }
    }

    for (const [variantIndex, variant] of blueprint.dayVariants.entries()) {
        const { data: variantRow, error: variantError } = await raw
            .from('nutrition_day_variants_v2')
            .insert({
                version_id: version.id,
                variant_key: variant.key,
                label: variant.label,
                day_of_week: null,
                is_default: variant.isDefault,
                target_calories: variant.targets.calories,
                target_protein_g: variant.targets.proteinG,
                target_carbs_g: variant.targets.carbsG,
                target_fats_g: variant.targets.fatsG,
                target_fiber_g: variant.targets.fiberG ?? null,
                target_water_ml: variant.targets.waterMl ?? null,
                order_index: variantIndex,
            })
            .select('id')
            .single()
        if (variantError != null || variantRow == null) {
            return { error: `nutrition_day_variants_v2: ${variantError?.message ?? 'sin fila'}` }
        }

        for (const [slotIndex, slot] of variant.slots.entries()) {
            const { data: slotRow, error: slotError } = await raw
                .from('nutrition_meal_slots_v2')
                .insert({
                    version_id: version.id,
                    day_variant_id: variantRow.id,
                    slot_code: slot.code,
                    name: slot.name,
                    start_time: slot.startTime,
                    end_time: slot.endTime,
                    slot_mode: 'anchor',
                    is_required: slot.required,
                    target_calories: slot.targets?.calories ?? null,
                    target_protein_g: slot.targets?.proteinG ?? null,
                    target_carbs_g: slot.targets?.carbsG ?? null,
                    target_fats_g: slot.targets?.fatsG ?? null,
                    instructions: slot.instructions ?? null,
                    order_index: slotIndex,
                })
                .select('id')
                .single()
            if (slotError != null || slotRow == null) {
                return { error: `nutrition_meal_slots_v2: ${slotError?.message ?? 'sin fila'}` }
            }

            const itemRows = slot.items
                .map((item, index) => {
                    const food = foods.byRef.get(item.food)
                    if (food == null) return null
                    const macros = computeItemMacros(food, item.quantity, item.unit)
                    return {
                        version_id: version.id,
                        meal_slot_id: slotRow.id,
                        food_id: food.id,
                        recipe_id: null,
                        custom_name: null,
                        quantity: item.quantity,
                        unit: item.unit,
                        minimum_quantity: null,
                        maximum_quantity: null,
                        is_optional: item.optional === true,
                        substitution_group_id: null,
                        notes: item.notes ?? null,
                        order_index: index,
                        snapshot_name: food.name,
                        snapshot_brand: food.brand,
                        snapshot_calories: macros.calories,
                        snapshot_protein_g: macros.proteinG,
                        snapshot_carbs_g: macros.carbsG,
                        snapshot_fats_g: macros.fatsG,
                        snapshot_fiber_g: macros.fiberG,
                    }
                })
                .filter((row): row is NonNullable<typeof row> => row != null)

            if (itemRows.length > 0) {
                const { error: itemsError } = await raw.from('nutrition_prescription_items_v2').insert(itemRows)
                if (itemsError != null) return { error: `nutrition_prescription_items_v2: ${itemsError.message}` }
            }

            const targetRows = (slot.exchangeTargets ?? [])
                .map((target, index) => {
                    const group = groupByCode.get(target.groupCode)
                    if (group == null) return null
                    // `snapshot_*` congelado al persistir: `exchange_groups` no está versionado, así
                    // que editar un grupo después NO puede mover una pauta ya publicada.
                    return {
                        version_id: version.id,
                        meal_slot_id: slotRow.id,
                        exchange_group_id: group.id,
                        portions: target.portions,
                        notes: target.notes ?? null,
                        order_index: index,
                        snapshot_group_code: group.code,
                        snapshot_group_name: group.name,
                        snapshot_ref_calories: group.ref_calories,
                        snapshot_ref_protein_g: group.ref_protein_g,
                        snapshot_ref_carbs_g: group.ref_carbs_g,
                        snapshot_ref_fats_g: group.ref_fats_g,
                        snapshot_composed_of: null,
                        snapshot_macros_confirmed: group.macros_confirmed,
                    }
                })
                .filter((row): row is NonNullable<typeof row> => row != null)

            if (targetRows.length > 0) {
                const { error: targetsError } = await raw
                    .from('nutrition_slot_exchange_targets_v2')
                    .insert(targetRows)
                if (targetsError != null) {
                    return { error: `nutrition_slot_exchange_targets_v2: ${targetsError.message}` }
                }
            }
        }
    }

    const { error: publishError } = await raw
        .from('nutrition_plans_v2')
        .update({ current_published_version_id: version.id, updated_at: nowIso })
        .eq('id', plan.id)
    if (publishError != null) return { error: `nutrition_plans_v2 (publish): ${publishError.message}` }

    return { planId: plan.id, versionId: version.id, missingFoods: foods.missing, missingGroups }
}

/**
 * Registros de comida del alumno demo (`nutrition_intake_entries`).
 *
 * `source` es la columna LEGADA con su CHECK propio (`offplan | quickadd | recent | copy`); la
 * semántica V2 vive en `intake_source_v2`. El demo registra a mano, así que va `manual` en V2 y
 * `offplan` en la legada — nunca `prescription`, porque eso implicaría un `prescription_item_id`
 * que este seed no engancha item por item.
 */
export async function writeIntakeEntries(
    db: DB,
    input: { clientId: string; entries: readonly IntakeEntryBlueprint[] },
): Promise<{ ids: string[]; error: string | null }> {
    if (input.entries.length === 0) return { ids: [], error: null }
    const foods = await resolveFoods(db, input.entries.map((entry) => entry.food))
    const rows = input.entries
        .map((entry) => {
            const food = foods.byRef.get(entry.food)
            if (food == null) return null
            const occurredAt = isoDaysAgo(entry.daysAgo)
            return {
                client_id: input.clientId,
                food_id: food.id,
                custom_name: null,
                log_date: dateDaysAgo(entry.daysAgo),
                quantity: entry.quantity,
                unit: entry.unit,
                source: 'offplan',
                meal_slot: entry.mealSlot,
                capture_method: 'manual',
                intake_source_v2: 'manual',
                capture_method_v2: 'manual',
                meal_slot_v2: entry.mealSlot,
                actor_role: 'student',
                actor_user_id: input.clientId,
                entry_status: 'active',
                occurred_at: occurredAt,
                timezone: TZ,
                created_at: occurredAt,
            }
        })
        .filter((row): row is NonNullable<typeof row> => row != null)
    if (rows.length === 0) return { ids: [], error: 'ningún alimento del registro se pudo resolver' }
    const { data, error } = await db.from('nutrition_intake_entries').insert(rows as never).select('id')
    return { ids: (data ?? []).map((row) => row.id), error: error?.message ?? null }
}

// ── Composición corporal ─────────────────────────────────────────────────────────────────────

export async function writeBia(
    db: DB,
    input: { coachId: string; clientId: string; blueprint: BiaBlueprint },
): Promise<{ id: string | null; error: string | null }> {
    const { coachId, clientId, blueprint } = input
    const { data, error } = await db
        .from('body_composition_measurements')
        .insert({
            client_id: clientId,
            coach_id: coachId,
            created_by: coachId,
            team_id: null,
            org_id: null,
            method: 'bia',
            measured_at: isoDaysAgo(blueprint.daysAgo),
            device_brand: blueprint.deviceBrand,
            device_model: blueprint.deviceModel,
            weight_kg: blueprint.weightKg,
            height_cm: blueprint.heightCm,
            equation_used: null,
            raw_input: {} as Json,
            metrics: blueprint.metrics as unknown as Json,
            measurement_conditions: { fasted: true } as unknown as Json,
            notes: blueprint.notes,
            source: 'manual',
            is_validated: false,
        })
        .select('id')
        .single()
    return { id: data?.id ?? null, error: error?.message ?? null }
}

/**
 * ISAK: las métricas NO se escriben a mano. Se pasan las medidas crudas por `computeIsak`
 * (@eva/bodycomp) — el mismo motor que corre en el módulo — y se persiste su resultado.
 */
export async function writeIsak(
    db: DB,
    input: { coachId: string; clientId: string; raw: IsakRawInput; daysAgo: number; notes: string },
): Promise<{ id: string | null; error: string | null }> {
    const { coachId, clientId, raw, daysAgo, notes } = input
    const result = computeIsak(raw)
    const { data, error } = await db
        .from('body_composition_measurements')
        .insert({
            client_id: clientId,
            coach_id: coachId,
            created_by: coachId,
            team_id: null,
            org_id: null,
            method: 'isak',
            measured_at: isoDaysAgo(daysAgo),
            weight_kg: raw.weightKg,
            height_cm: raw.heightCm,
            equation_used: result.equationUsed,
            raw_input: raw as unknown as Json,
            metrics: {
                fractionation: {
                    adipose: { kg: result.fractionation.adipose.kg, pct: result.fractionation.adipose.pct },
                    muscle: { kg: result.fractionation.muscle.kg, pct: result.fractionation.muscle.pct },
                    bone: { kg: result.fractionation.bone.kg, pct: result.fractionation.bone.pct },
                    residual: { kg: result.fractionation.residual.kg, pct: result.fractionation.residual.pct },
                    skin: { kg: result.fractionation.skin.kg, pct: result.fractionation.skin.pct },
                    predictedMassKg: result.fractionation.predictedMassKg,
                    measuredWeightKg: result.fractionation.measuredWeightKg,
                    massDifferenceKg: result.fractionation.massDifferenceKg,
                },
                somatotype: result.somatotype,
                bodyFat: result.bodyFat,
                equationUsed: result.equationUsed,
            } as unknown as Json,
            measurement_conditions: {} as Json,
            notes,
            source: 'manual',
            is_validated: false,
        })
        .select('id')
        .single()
    return { id: data?.id ?? null, error: error?.message ?? null }
}

// ── Screening de movimiento ──────────────────────────────────────────────────────────────────

export interface WrittenAssessment {
    assessmentId: string
    itemIds: string[]
}

/**
 * Escribe el screening de 7 patrones. El compuesto, el dolor, la asimetría y la banda de
 * prioridad los deriva `summarizeAssessment` (@eva/calc) de los puntajes crudos: acá no se
 * escribe ningún resumen a mano.
 */
export async function writeMovementAssessment(
    db: DB,
    input: { coachId: string; clientId: string; blueprint: MovementAssessmentBlueprint; daysAgo: number },
): Promise<WrittenAssessment | { error: string }> {
    const { coachId, clientId, blueprint, daysAgo } = input

    const domainItems: MovementItemInput[] = blueprint.items.map((item) => ({
        pattern: item.pattern as MovementPatternSlug,
        isPerSide: item.isPerSide,
        scoreLeft: item.scoreLeft ?? null,
        scoreRight: item.scoreRight ?? null,
        scoreSingle: item.scoreSingle ?? null,
        pain: item.pain,
        clearingPositive: item.clearingPositive ?? null,
    }))
    const summary = summarizeAssessment(domainItems)
    const measuredAt = isoDaysAgo(daysAgo)

    const { data: assessment, error } = await db
        .from('movement_assessments')
        .insert({
            client_id: clientId,
            coach_id: coachId,
            last_edited_by: coachId,
            team_id: null,
            status: 'final',
            protocol_version: MOVEMENT_PROTOCOL_VERSION,
            assessed_at: measuredAt,
            composite_score: summary.composite,
            has_pain: summary.hasPain,
            has_asymmetry: summary.hasAsymmetry,
            risk_band: summary.band,
            consent_confirmed_at: measuredAt,
            notes: blueprint.notes,
        })
        .select('id')
        .single()
    if (error != null || assessment == null) {
        return { error: `movement_assessments: ${error?.message ?? 'sin fila'}` }
    }

    const itemRows = blueprint.items.map((item, index) => ({
        assessment_id: assessment.id,
        pattern: item.pattern,
        is_per_side: item.isPerSide,
        score_left: item.scoreLeft ?? null,
        score_right: item.scoreRight ?? null,
        score_single: item.scoreSingle ?? null,
        pain: item.pain,
        clearing_positive: item.clearingPositive ?? null,
        // El puntaje final lo decide el dominio (`finalItemScore`), no el blueprint: dolor o
        // descarte positivo fuerzan 0 y los por-lado toman el mínimo L/R.
        final_score: finalItemScore(domainItems[index] as MovementItemInput),
        comment: item.comment ?? null,
    }))

    const { data: items } = await db.from('movement_assessment_items').insert(itemRows).select('id')
    return { assessmentId: assessment.id, itemIds: (items ?? []).map((row) => row.id) }
}
