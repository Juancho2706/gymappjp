/**
 * Derivación por-tipo del resumen post-entreno (bug CEO: el resumen sólo contaba FUERZA).
 *
 * Lógica PURA (sin React ni Next) que clasifica cada bloque de la sesión por su tipo efectivo
 * (`effectiveExerciseType`) y produce, en una sola pasada sobre los logs YA en memoria (cero
 * queries), todo lo que el overlay necesita:
 *
 *   - `strength`          → filas por ejercicio de fuerza (volumen, máx, series) — desglose + PRs.
 *   - `cardio`            → cardio con logs (tiempo/distancia/FC/rondas) para la sección no-fuerza.
 *   - `mobility`          → movilidad + roller con logs (series/hold) para la sección no-fuerza.
 *   - `strengthMuscleVolume` → volumen de fuerza (kg) por grupo muscular → barras "Músculos trabajados".
 *   - `muscleWork`        → trabajo por grupo para el MAPA muscular: fuerza (kg) + proxy de
 *                            movilidad/roller (para que sus zonas se ENCIENDAN). Cardio se EXCLUYE.
 *
 * Sin este helper, movilidad/roller (peso 0 ⇒ volumen 0) nunca encendían el mapa y cardio/movilidad
 * no aparecían en ningún lado; una sesión sólo de cardio/movilidad quedaba vacía.
 */

import { effectiveExerciseType } from '@/lib/workout-exercise-type'
import type { ExerciseType as WorkoutKind } from '@/domain/workout/types'

export interface SummaryExercise {
    id: string
    name: string
    muscle_group: string
    exercise_type?: string | null
}

export interface SummaryBlock {
    id: string
    exercises: SummaryExercise | SummaryExercise[] | null
    exercise_type_override?: string | null
    sets?: number | null
    duration_sec?: number | null
    distance_value?: number | null
    distance_unit?: string | null
    hr_zone?: number | null
    target_pace_sec_per_km?: number | null
}

export interface SummaryLogLike {
    block_id: string
    set_number: number
    weight_kg: number | null
    reps_done: number | null
    actual_duration_sec?: number | null
    actual_distance_m?: number | null
    actual_hold_sec?: number | null
    actual_avg_hr?: number | null
}

export interface StrengthExerciseRow {
    exerciseId: string
    name: string
    muscleGroup: string
    sets: SummaryLogLike[]
    totalVolume: number
    /** Máx peso levantado EXCLUYENDO bloques sustituidos (anti-PR-falso, AC-C5). */
    maxWeight: number
}

export interface CardioItem {
    blockId: string
    name: string
    /** Rondas/series completadas (nº de logs del bloque). */
    rounds: number
    /** Tiempo total registrado (s), o null si no se registró. */
    durationSec: number | null
    /** Distancia total registrada (m), o null si no se registró. */
    distanceM: number | null
    /** FC media registrada (bpm), o null. */
    avgHr: number | null
}

export interface MobilityItem {
    blockId: string
    name: string
    kind: 'mobility' | 'roller'
    /** Series/hold completados (nº de logs del bloque). */
    sets: number
    /** Tiempo total de hold registrado (s), o null. */
    holdSec: number | null
}

export interface SessionSummaryByKind {
    strength: StrengthExerciseRow[]
    cardio: CardioItem[]
    /** Movilidad + roller (el campo `kind` los distingue). */
    mobility: MobilityItem[]
    /** Volumen de fuerza (kg) por grupo muscular — barras kg. Orden desc por volumen. */
    strengthMuscleVolume: { group: string; vol: number }[]
    /** Trabajo por grupo para el mapa (fuerza kg + proxy movilidad/roller). Cardio excluido. Orden desc. */
    muscleWork: { group: string; vol: number }[]
    /** Distancia total de cardio (m) — hero adaptativo cuando no hubo fuerza. */
    totalCardioDistanceM: number
    /** Duración total de cardio registrada (s). */
    totalCardioDurationSec: number
}

const KIND_FALLBACK_NAME: Record<WorkoutKind, string> = {
    strength: 'Ejercicio',
    cardio: 'Cardio',
    mobility: 'Movilidad',
    roller: 'Foam roller',
}

/**
 * "Trabajo" que aporta al mapa una serie de movilidad/roller SIN hold registrado. Sirve sólo para
 * encender la zona (tier 1) — el mapa normaliza por intensidad relativa, no muestra este número.
 */
const MOBILITY_SET_WORK = 20

/**
 * Duración de una sesión (o de un bloque) en un formato EXPLÍCITO y no ambiguo para el resumen
 * post-entreno. El formato mm:ss anterior ("0:40") se leía de un vistazo como "40 minutos" cuando
 * eran 40 SEGUNDOS (bug de lectura reportado por el CEO). Formato:
 *   - `null`/`<= 0` → "—"
 *   - `< 60s`       → "menos de 1 min"
 *   - `< 1h`        → "X min"
 *   - `>= 1h`       → "X h YY min"
 * Pura y testeada (`session-summary.test.ts`).
 */
export function formatSessionDuration(totalSec: number | undefined | null): string {
    if (totalSec == null || totalSec <= 0) return '—'
    if (totalSec < 60) return 'menos de 1 min'
    const h = Math.floor(totalSec / 3600)
    const m = Math.floor((totalSec % 3600) / 60)
    if (h > 0) return `${h} h ${String(m).padStart(2, '0')} min`
    return `${m} min`
}

/**
 * Duración estilo RELOJ para tiles donde la precisión sub-minuto SÍ importa (tiempo de un bloque de
 * cardio, hold total de movilidad): "1:30" (mm:ss) y "1h 05" desde 1 hora. El hero "Duración" de la
 * sesión usa `formatSessionDuration` (explícita, sin segundos); estos tiles NO — un hold de 90 s
 * mostrado como "1 min" perdería el dato que el alumno registró.
 */
export function formatClockDuration(totalSec: number | undefined | null): string {
    if (totalSec == null || totalSec <= 0) return '—'
    const h = Math.floor(totalSec / 3600)
    const m = Math.floor((totalSec % 3600) / 60)
    const s = totalSec % 60
    if (h > 0) return `${h}h ${String(m).padStart(2, '0')}`
    return `${m}:${String(s).padStart(2, '0')}`
}

function normalizeExercise(ex: SummaryBlock['exercises']): SummaryExercise | null {
    if (Array.isArray(ex)) return ex[0] ?? null
    return ex ?? null
}

function sumNullable(nums: (number | null | undefined)[]): number {
    let acc = 0
    for (const n of nums) acc += n ?? 0
    return acc
}

export function summarizeSessionByKind(
    blocks: SummaryBlock[],
    logs: SummaryLogLike[],
    substitutedBlockIds: string[] = [],
): SessionSummaryByKind {
    const substituted = new Set(substitutedBlockIds)

    const strengthById = new Map<string, StrengthExerciseRow>()
    const cardio: CardioItem[] = []
    const mobility: MobilityItem[] = []
    const muscleWork = new Map<string, number>() // fuerza + proxy movilidad/roller (para el mapa)
    const strengthVol = new Map<string, number>() // sólo fuerza (para barras kg)

    for (const block of blocks) {
        const exercise = normalizeExercise(block.exercises)
        const blockLogs = logs.filter((l) => l.block_id === block.id)
        if (blockLogs.length === 0) continue

        const kind = effectiveExerciseType(block, exercise)
        const name = exercise?.name ?? KIND_FALLBACK_NAME[kind]

        if (kind === 'cardio') {
            const durations = blockLogs.map((l) => l.actual_duration_sec)
            const distances = blockLogs.map((l) => l.actual_distance_m)
            const hrs = blockLogs
                .map((l) => l.actual_avg_hr)
                .filter((h): h is number => h != null && h > 0)
            cardio.push({
                blockId: block.id,
                name,
                rounds: blockLogs.length,
                durationSec: durations.some((d) => d != null) ? sumNullable(durations) : null,
                distanceM: distances.some((d) => d != null) ? sumNullable(distances) : null,
                avgHr: hrs.length > 0 ? Math.round(sumNullable(hrs) / hrs.length) : null,
            })
            continue // cardio EXCLUIDO del mapa muscular
        }

        if (kind === 'mobility' || kind === 'roller') {
            const holds = blockLogs.map((l) => l.actual_hold_sec)
            const holdSec = holds.some((h) => h != null) ? sumNullable(holds) : null
            mobility.push({ blockId: block.id, name, kind, sets: blockLogs.length, holdSec })
            // Aporte al mapa: hold real si lo hay, si no proxy por serie completada → enciende la zona.
            const group = exercise?.muscle_group
            if (group) {
                const work = holdSec != null && holdSec > 0 ? holdSec : blockLogs.length * MOBILITY_SET_WORK
                muscleWork.set(group, (muscleWork.get(group) ?? 0) + work)
            }
            continue
        }

        // strength
        if (!exercise) continue
        const isSub = substituted.has(block.id)
        let addVol = 0
        let addMaxW = 0
        for (const l of blockLogs) {
            const w = l.weight_kg ?? 0
            const r = l.reps_done ?? 0
            addVol += w * r
            if (isSub) continue
            if (w > addMaxW) addMaxW = w
        }

        const prev = strengthById.get(exercise.id)
        if (prev) {
            prev.sets.push(...blockLogs)
            prev.totalVolume += addVol
            if (addMaxW > prev.maxWeight) prev.maxWeight = addMaxW
        } else {
            strengthById.set(exercise.id, {
                exerciseId: exercise.id,
                name: exercise.name,
                muscleGroup: exercise.muscle_group,
                sets: [...blockLogs],
                totalVolume: addVol,
                maxWeight: addMaxW,
            })
        }
        if (exercise.muscle_group) {
            strengthVol.set(exercise.muscle_group, (strengthVol.get(exercise.muscle_group) ?? 0) + addVol)
            muscleWork.set(exercise.muscle_group, (muscleWork.get(exercise.muscle_group) ?? 0) + addVol)
        }
    }

    const byVolDesc = (a: { vol: number }, b: { vol: number }) => b.vol - a.vol

    return {
        strength: [...strengthById.values()],
        cardio,
        mobility,
        strengthMuscleVolume: [...strengthVol.entries()]
            .map(([group, vol]) => ({ group, vol }))
            .sort(byVolDesc),
        muscleWork: [...muscleWork.entries()]
            .map(([group, vol]) => ({ group, vol }))
            .sort(byVolDesc),
        totalCardioDistanceM: cardio.reduce((a, c) => a + (c.distanceM ?? 0), 0),
        totalCardioDurationSec: cardio.reduce((a, c) => a + (c.durationSec ?? 0), 0),
    }
}
