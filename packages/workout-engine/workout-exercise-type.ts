/**
 * Resolución del tipo efectivo de un bloque + formateo compacto de la prescripción tipada.
 *
 * Motor PURO compartido web/mobile (sin React/Next/RN). Espejo de la lógica pura de
 * `apps/web/src/lib/workout-exercise-type.ts` — acá viven SOLO las funciones sin UI (el mapa
 * `EXERCISE_TYPE_META` con iconos lucide queda en web/mobile por ser presentación). Extraído para
 * que la ejecución polimórfica del alumno (cardio/movilidad/roller) comparta la resolución de tipo y
 * el formateo de objetivos sin drift (E2-10).
 *
 * Decisión #2 del PLAN (specs/movida-entrenamiento):
 *   effectiveExerciseType(block, exercise) =
 *     block.exercise_type_override ?? exercise.exercise_type ?? 'strength'.
 */

import type { IntervalConfig } from './workout-interval'
import { formatCardioReps, normalizeCardioRepsUnit } from './cardio-modality'

export type ExerciseType = 'strength' | 'cardio' | 'mobility' | 'roller'

export const EXERCISE_TYPES: readonly ExerciseType[] = ['strength', 'cardio', 'mobility', 'roller']

/** Etiquetas es-neutro de los tipos. */
export const EXERCISE_TYPE_LABEL: Record<ExerciseType, string> = {
    strength: 'Fuerza',
    cardio: 'Cardio',
    mobility: 'Movilidad',
    roller: 'Foam roller',
}

/** Etiquetas es-neutro del modo de lado (per_side/alternating). */
export const SIDE_LABEL: Record<string, string> = {
    per_side: 'Por lado',
    alternating: 'Alternado',
}

/**
 * Opciones del selector "Tipo de ejercicio" del formulario del coach (web + mobile).
 * Label descriptiva de los ejes que activa cada tipo en el builder / la app del alumno.
 * Fuente ÚNICA — antes vivía inline en el `ExerciseFormModal` web (E5-08).
 */
export const EXERCISE_TYPE_OPTIONS: readonly { value: ExerciseType; label: string }[] = [
    { value: 'strength', label: 'Fuerza (series × reps)' },
    { value: 'cardio', label: 'Cardio (duración / distancia / zona FC)' },
    { value: 'mobility', label: 'Movilidad (holds por lado)' },
    { value: 'roller', label: 'Foam roller (duración o pasadas)' },
]

/**
 * `workout_blocks.reps_unit` que marca el modo «fuerza por tiempo» (D3, specs/cuenta-atras-en-pantalla).
 * Vive acá porque es el eje del predicado `isStrengthTimeBlock`; el enum completo es
 * `REPS_UNIT_VALUES` de `@eva/schemas` (superset EXACTO del CHECK `workout_blocks_poly_check`).
 */
export const STRENGTH_TIME_REPS_UNIT = 'sec' as const

function asExerciseType(raw: string | null | undefined): ExerciseType | null {
    return raw && (EXERCISE_TYPES as readonly string[]).includes(raw) ? (raw as ExerciseType) : null
}

/** Subconjunto de un bloque necesario para detectar prescripción tipada. */
export interface TypedBlockFields {
    exercise_type_override?: string | null
    side_mode?: string | null
    reps_value?: number | null
    reps_unit?: string | null
    load_value?: number | null
    load_unit?: string | null
    distance_value?: number | null
    distance_unit?: string | null
    duration_sec?: number | null
    target_pace_sec_per_km?: number | null
    hr_zone?: number | null
    interval_config?: unknown
    sets?: number | null
    reps?: string | null
}

/**
 * Tipo efectivo del bloque: override del bloque > tipo del ejercicio > 'strength'.
 * Un bloque legacy (sin override, ejercicio sin tipo) SIEMPRE resuelve 'strength'.
 */
export function effectiveExerciseType(
    block: { exercise_type_override?: string | null } | null | undefined,
    exercise: { exercise_type?: string | null } | null | undefined,
): ExerciseType {
    return (
        asExerciseType(block?.exercise_type_override) ??
        asExerciseType(exercise?.exercise_type) ??
        'strength'
    )
}

/** ¿El bloque tiene prescripción tipada (más allá de sets×reps legacy)? */
export function hasTypedPrescription(block: TypedBlockFields): boolean {
    return (
        (block.duration_sec != null && block.duration_sec > 0) ||
        (block.distance_value != null && block.distance_value > 0) ||
        block.hr_zone != null ||
        block.target_pace_sec_per_km != null ||
        block.interval_config != null ||
        (block.reps_value != null && block.reps_unit != null && block.reps_unit !== 'reps')
    )
}

/**
 * Los DOS campos que definen el modo tiempo, en un solo lugar. Privado a propósito: el predicado
 * público es `isStrengthTimeBlock` (que además exige que el tipo efectivo sea `strength`); esta
 * mitad existe sólo para que la rama strength de `legacyRepsSummaryFor` —que ya recibe el tipo
 * resuelto— no tenga que volver a comparar `reps_unit === 'sec'` a mano (R3).
 */
function hasTimeModeFields(block: TypedBlockFields): boolean {
    return block.reps_unit === STRENGTH_TIME_REPS_UNIT && (block.duration_sec ?? 0) > 0
}

/**
 * Fuente ÚNICA del modo «fuerza por tiempo» (D3/R3): plancha, wall sit, hollow hold — fuerza con
 * carga, RIR y tempo, prescrita en SEGUNDOS en vez de reps. Nadie compara `reps_unit === 'sec'` a
 * mano; web y RN consumen este predicado.
 *
 * El **AND** es obligatorio, nunca un OR: en LIVE hay 2 bloques de fuerza con `duration_sec`
 * (600 y 120) y `reps_unit NULL` — residuo de un cambio de tipo. Con un OR esos 2 alumnos verían
 * una cuenta atrás de 10 min y de 2 min en un ejercicio de fuerza clásica. Test que congela el caso
 * (H8) en `workout-exercise-type.test.ts`.
 */
export function isStrengthTimeBlock(
    block: TypedBlockFields,
    exercise?: { exercise_type?: string | null } | null,
): boolean {
    return effectiveExerciseType(block, exercise) === 'strength' && hasTimeModeFields(block)
}

/** "90" → "90s" · "300" → "5min" · "75" → "1m15s". Compacto para chips/cards. */
export function compactDuration(totalSec: number): string {
    const sec = Math.max(0, Math.round(totalSec))
    if (sec < 60 || sec % 60 !== 0) {
        if (sec >= 60) {
            const m = Math.floor(sec / 60)
            const s = sec % 60
            return `${m}m${String(s).padStart(2, '0')}s`
        }
        return `${sec}s`
    }
    return `${sec / 60}min`
}

/** "5000 m" → "5km" · "400 m" → "400m" · "7.5 m" → "7.5m". */
export function compactDistance(value: number, unit: string | null | undefined): string {
    if (unit === 'km') return `${value}km`
    if (value >= 1000 && value % 100 === 0) return `${value / 1000}km`
    return `${value}m`
}

/** Sufijo del objetivo cuando el bloque es unilateral: "3 × 10/lado". Vacío en bilateral. */
export function sideSuffix(sideMode: string | null | undefined): string {
    return sideMode === 'per_side' || sideMode === 'alternating' ? '/lado' : ''
}

function truncate20(text: string): string {
    return text.length <= 20 ? text : `${text.slice(0, 19)}…`
}

/**
 * Resumen legacy corto (≤20 chars, es-neutro) para persistir en `reps` cuando el coach
 * prescribe con campos tipados (decisión #3, expand-contract). Espejo EXACTO de
 * `apps/web/src/lib/workout-exercise-type.ts` → fuente compartida web+mobile (E5-06/E5-07).
 * NO se usa para bloques strength con reps manual (ahí el texto del coach manda — "8-10").
 */
export function legacyRepsSummaryFor(block: TypedBlockFields, type: ExerciseType): string {
    const side = sideSuffix(block.side_mode)
    const interval = block.interval_config as IntervalConfig | null | undefined

    if (type === 'cardio') {
        if (interval) {
            const work = interval.work.distance_m != null
                ? compactDistance(interval.work.distance_m, 'm')
                : interval.work.duration_sec != null
                    ? compactDuration(interval.work.duration_sec)
                    : ''
            const zone = block.hr_zone != null ? ` @ Z${block.hr_zone}` : ''
            if (work) return truncate20(`${interval.repeats}×${work}${zone}`)
        }
        const zone = block.hr_zone != null ? ` Z${block.hr_zone}` : ''
        if (block.duration_sec != null && block.duration_sec > 0) {
            return truncate20(`${compactDuration(block.duration_sec)}${zone}`)
        }
        if (block.distance_value != null && block.distance_value > 0) {
            return truncate20(`${compactDistance(block.distance_value, block.distance_unit)}${zone}`)
        }
        // Bloque solo-conteo (saltos/pisos/reps): antes caía al literal 'cardio' y el objetivo
        // rep-based quedaba invisible en chips/resúmenes legacy.
        if (block.reps_value != null && block.reps_value > 0) {
            return truncate20(`${formatCardioReps(block.reps_value, normalizeCardioRepsUnit(block.reps_unit))}${zone}`)
        }
        if (zone) return truncate20(zone.trim())
        return 'cardio'
    }

    if (type === 'mobility') {
        if (block.duration_sec != null && block.duration_sec > 0) {
            return truncate20(`${compactDuration(block.duration_sec)}${side}`)
        }
        if (block.reps_value != null && block.reps_value > 0) {
            const unit = block.reps_unit === 'breaths' ? ' resp' : ''
            return truncate20(`${block.reps_value}${unit}${side}`)
        }
        return block.reps?.trim() || 'movilidad'
    }

    if (type === 'roller') {
        if (block.reps_value != null && block.reps_value > 0 && block.reps_unit === 'passes') {
            return truncate20(`${block.reps_value} pasadas${side}`)
        }
        if (block.duration_sec != null && block.duration_sec > 0) {
            return truncate20(`${compactDuration(block.duration_sec)}${side}`)
        }
        return block.reps?.trim() || 'roller'
    }

    // strength EN MODO TIEMPO (D3): el objetivo por segundos manda ANTES que el texto del coach.
    // Sin esta línea, un bloque que el coach pasó de Reps a Segundos seguiría arrastrando "8-12"
    // como espejo legacy (`workout_blocks.reps` es NOT NULL) por toda la app — chips, preview,
    // print, `target_reps_at_log` e historial.
    if (hasTimeModeFields(block)) {
        return truncate20(`${compactDuration(block.duration_sec as number)}${side}`)
    }

    // strength: el texto manual del coach manda; el resumen solo cubre distancia (farmer carry)
    if (block.reps?.trim()) return block.reps.trim()
    if (block.distance_value != null && block.distance_value > 0) {
        return truncate20(`${compactDistance(block.distance_value, block.distance_unit)}${side}`)
    }
    return '—'
}

/**
 * Resumen visible por tipo para chips del builder/preview ("4×400m @ Z4", "30s ×3 por lado").
 * Devuelve null para bloques sin prescripción tipada — el caller renderiza el legacy
 * "sets × reps" EXACTAMENTE como hoy (anti-regresión AC3). Espejo de la web (E5-06).
 */
export function typedBlockSummary(block: TypedBlockFields, type: ExerciseType): string | null {
    if (type === 'strength' && !hasTypedPrescription(block)) return null
    if (type === 'strength') {
        // Fuerza con eje extra (ej. farmer carry): sets × reps + distancia
        const parts: string[] = []
        if (block.sets && block.reps) parts.push(`${block.sets}×${block.reps}`)
        if (block.distance_value != null && block.distance_value > 0) {
            parts.push(compactDistance(block.distance_value, block.distance_unit) + sideSuffix(block.side_mode))
        }
        return parts.length ? parts.join(' · ') : null
    }

    const base = legacyRepsSummaryFor(block, type)
    if (type === 'mobility' && block.sets && block.sets > 1) {
        return `${base} ×${block.sets}`
    }
    if (type === 'cardio' && !block.interval_config && block.sets && block.sets > 1) {
        return `${block.sets}× ${base}`
    }
    return base
}

/**
 * Objetivo del header en modo tiempo: "3 × 30s" · "3 × 30s por lado" (D3).
 * `formatTypedObjective` no tiene rama strength y `typedBlockSummary` produce el chip corto
 * ("3×30s"); ésta es la forma larga con "×" espaciado que piden el header del ejecutor y la ficha.
 *
 * Convención tipográfica (R11): acá va `30s` SIN espacio, porque el objetivo es un texto corto de
 * chip/header. Las líneas largas de log y resumen usan `30 s` con espacio
 * (`formatStrengthTimeSetLine`, `logged-set-summary.ts`).
 */
export function formatStrengthTimeObjective(block: TypedBlockFields): string {
    const sets = block.sets && block.sets > 0 ? block.sets : 1
    const seconds = compactDuration(block.duration_sec ?? 0)
    const perSide = block.side_mode === 'per_side' || block.side_mode === 'alternating'
    return `${sets} × ${seconds}${perSide ? ' por lado' : ''}`
}

/**
 * Número del chip de progresión en es-neutro: `2.5 → "2,5"`, `2 → "2"`.
 *
 * Copia deliberada y mínima de `formatEsNumber` (`logged-set-summary.ts:46`): ese módulo IMPORTA de
 * éste (`sideRepsFromMetadata`, `ExerciseType`), así que importarlo de vuelta armaría un ciclo entre
 * los dos archivos del motor. El incremento de una progresión es un número chico (0,5–10): no
 * necesita separador de miles, que es justo lo único que `formatEsNumber` agrega de más.
 */
function progressionNumber(value: number): string {
    if (!Number.isFinite(value)) return '?'
    const fixed = value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
    return fixed.replace('.', ',')
}

/** Bloque mínimo para el chip de progresión: los campos tipados + las 2 columnas de progresión. */
export interface ProgressionTagBlock extends TypedBlockFields {
    progression_type?: string | null
    progression_value?: number | null
}

/**
 * Chip/badge de sobrecarga progresiva, con la UNIDAD correcta (D4/R30):
 *   `+2,5 kg/sem` · `+5 seg/ses` · `+2 rep/ses`. Sin progresión ⇒ `null`.
 *
 * D4 remapea «+ Segundos» sobre el MISMO `progression_type = 'reps'` (sin columna nueva), así que la
 * unidad no se puede leer de la columna: se resuelve con `isStrengthTimeBlock`. Sin este formateador
 * los 6 consumidores (2 de ellos de cara al alumno: el ejecutor web y su espejo RN) anuncian una
 * plancha que sube 5 s por sesión como «+5 rep/ses».
 *
 * `progression_value` nulo imprime `?`, igual que hacen hoy el PDF y el chip del builder — es un
 * plan a medio configurar, no un error.
 *
 * ⚠ La progresión por segundos sigue siendo CARTEL, sin motor que suba el objetivo solo, igual que
 * «+ Reps» hoy (`computeEffectiveTarget` es no-op con `progression_type !== 'weight'`).
 */
export function formatProgressionTag(
    block: ProgressionTagBlock,
    exercise?: { exercise_type?: string | null } | null,
): string | null {
    if (!block.progression_type) return null
    const value = block.progression_value
    const n = value == null ? '?' : progressionNumber(value)
    if (block.progression_type === 'weight') return `+${n} kg/sem`
    return isStrengthTimeBlock(block, exercise) ? `+${n} seg/ses` : `+${n} rep/ses`
}

// ─────────────────────────────────────────────────────────────────────────────
// Lectura defensiva de los lados registrados (`workout_logs.metadata`)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Paridad EXACTA con el `->>` del SQL: la migración compara el TEXTO que devuelve
 * `metadata ->> 'left_reps'` contra este mismo regex, así que un JSON string `"10"` matchea y suma
 * igual que el número `10`. Cualquier otra cadena (`'abc'`, `'10.5'`, `'-1'`, `'99999'`) ⇒ descarte.
 */
const SIDE_REPS_TEXT_PATTERN = /^[0-9]{1,4}$/

/** Un lado válido: entero 0..9999, o su forma textual de 1 a 4 dígitos. Cualquier otra cosa ⇒ null. */
function sideRepsValue(raw: unknown): number | null {
    if (typeof raw === 'number') {
        // `1e30` es entero para JS pero desborda el rango del regex ⇒ fuera, igual que en SQL.
        return Number.isInteger(raw) && raw >= 0 && raw <= 9999 ? raw : null
    }
    if (typeof raw === 'string') return SIDE_REPS_TEXT_PATTERN.test(raw) ? Number(raw) : null
    return null
}

/**
 * Lee `{left_reps, right_reps}` del jsonb de un log de fuerza por lado (R27). Helper ÚNICO: nadie
 * castea ni suma el metadata a mano — un `"10" + "10"` en TS da `"1010"` y un `1.5` da `3`, mientras
 * el SQL resuelve cada caso con su regex, y esa divergencia no la caza ningún test.
 *
 * Devuelve los dos lados SÓLO si LOS DOS son válidos; en cualquier otro caso (uno solo presente,
 * decimal, negativo, `1e30`, otra cadena, objeto, ausente, `null`) devuelve `null` y el consumidor
 * cae a `reps_done` tal cual — es el `ELSE reps_done` del `CASE` de la migración.
 *
 * Vive acá (y no en `session-summary.ts`) porque ésta es la casa de `SIDE_LABEL`/`sideSuffix`, la
 * semántica de lado del motor; sale por el barrel igual que el resto del módulo.
 */
export function sideRepsFromMetadata(metadata: unknown): { left: number; right: number } | null {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null
    const raw = metadata as Record<string, unknown>
    const left = sideRepsValue(raw.left_reps)
    const right = sideRepsValue(raw.right_reps)
    if (left == null || right == null) return null
    return { left, right }
}
