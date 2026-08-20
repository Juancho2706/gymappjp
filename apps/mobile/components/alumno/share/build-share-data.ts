/**
 * Share Entreno (F2) — adaptador PURO sesión → datos del card.
 *
 * Toma exactamente lo que el resumen post-entreno ya tiene en memoria (bloques, logs, máximos
 * históricos, racha, branding) y produce el `WorkoutShareData` que consumen los stickers. CERO
 * queries nuevas y CERO lógica propia de derivación: reusa `summarizeSessionByKind` y replica la
 * MISMA detección de récords del overlay (`WorkoutSummaryOverlay.tsx:246-270`) para que el card no
 * pueda contradecir a la pantalla que lo abrió — un récord que el resumen no muestra y el card sí
 * (o al revés) sería el peor bug posible de esta feature.
 *
 * Sin React: es lógica pura y se puede testear en Node.
 */

import {
    summarizeSessionByKind,
    type StrengthExerciseRow,
    type SummaryBlock,
    type SummaryLogLike,
} from '@eva/workout-engine'
import { epleyOneRM } from '../../../lib/profile-analytics'
import { normalizeInviteCode, studentLoginUrl } from '../../../lib/student-links'
import type { CoachBranding } from '../../../lib/branding'
import type { WeeklyStreak } from '../workout/v3/weekly-streak'
import type { ShareExercise, ShareRecord, WorkoutShareData } from './share-types'

export interface BuildWorkoutShareDataInput {
    blocks: SummaryBlock[]
    logs: SummaryLogLike[]
    /** Bloques sustituidos → guard anti-PR-falso (idéntico al overlay). */
    substitutedBlockIds?: string[]
    /** Máximo histórico por ejercicio; `null`/ausente = sin historia ⇒ NO hay récord. */
    exerciseMaxes: Record<string, number>
    /**
     * Fecha del máximo histórico por ejercicio. El card de F2 no imprime la fecha del récord
     * anterior (`ShareRecord` no la lleva), pero el input la acepta para que el call site sea 1:1
     * con `WorkoutSummaryOverlayProps` y no haya que reordenar props si un preset futuro la usa.
     */
    exerciseMaxDates?: Record<string, string>
    planTitle: string
    contextLine?: string | null
    durationSec?: number | null
    weeklyStreak?: WeeklyStreak | null
    branding?: CoachBranding | null
    /** Día local `YYYY-MM-DD` (lo calcula el llamador con el reloj del device). */
    todayISO: string
    /**
     * `clients.id` del alumno que comparte — semilla de la atribución first-party (SPEC §Growth).
     * `null`/ausente (sesión sin cliente resuelto: offline, recuperación) ⇒ el link sale LIMPIO, sin
     * parámetros: un `ref` vacío no atribuye nada y sí ensucia el QR.
     */
    clientId?: string | null
}

/** Serie más pesada de un ejercicio, agrupada por (peso, reps) → '3×10 · 60 kg'. */
function topSetLabelFor(row: StrengthExerciseRow): string {
    // Agrupamos por combinación peso+reps para poder decir "3×10 · 60 kg" en vez de "1×10 · 60 kg"
    // repetido tres veces: la lectura natural del alumno es "hice 3 series de 10 con 60".
    const buckets = new Map<string, { weight: number; reps: number; count: number }>()
    for (const s of row.sets) {
        const weight = s.weight_kg ?? 0
        const reps = s.reps_done ?? 0
        const key = `${weight}|${reps}`
        const prev = buckets.get(key)
        if (prev) prev.count += 1
        else buckets.set(key, { weight, reps, count: 1 })
    }
    let top: { weight: number; reps: number; count: number } | null = null
    for (const b of buckets.values()) {
        // Más peso gana; a igual peso, más reps (la serie "más dura" del día).
        if (!top || b.weight > top.weight || (b.weight === top.weight && b.reps > top.reps)) top = b
    }
    if (!top || top.reps <= 0) return ''
    const base = `${top.count}×${top.reps}`
    // Peso 0 = ejercicio con peso corporal / sin registrar ⇒ el "· 0 kg" sería ruido y además
    // mentira (no levantó 0 kg: no registró peso).
    return top.weight > 0 ? `${base} · ${formatKg(top.weight)} kg` : base
}

/**
 * kg sin decimales inútiles: 60 → '60', 62.5 → '62,5' (coma decimal, es-CL).
 * Vive acá (y no en la capa RN) porque el adaptador YA construye strings de display (`topSetLabel`);
 * los stickers lo reexportan desde `sticker-kit` para no tener dos reglas de redondeo.
 */
export function formatKg(kg: number): string {
    const rounded = Math.round(kg * 10) / 10
    return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace('.', ',')
}

export function buildWorkoutShareData(input: BuildWorkoutShareDataInput): WorkoutShareData {
    const {
        blocks,
        logs,
        substitutedBlockIds = [],
        exerciseMaxes,
        planTitle,
        contextLine = null,
        durationSec = null,
        weeklyStreak = null,
        branding = null,
        todayISO,
        clientId = null,
    } = input

    const session = summarizeSessionByKind(blocks, logs, substitutedBlockIds)

    // Totales: los MISMOS tres reduce del overlay (WorkoutSummaryOverlay.tsx:286-288) sobre los logs
    // crudos — cuentan TODO lo registrado (fuerza, cardio, movilidad), no solo la fuerza del desglose.
    const completedSets = logs.length
    const totalReps = logs.reduce((acc, l) => acc + (l.reps_done || 0), 0)
    const totalVolumeKg = logs.reduce((acc, l) => acc + (l.weight_kg || 0) * (l.reps_done || 0), 0)

    // Récords: detección idéntica a `detectedPRs` del overlay (:246-270). `historicMax == null` =
    // primera vez que se registra el ejercicio ⇒ NO es récord (si no, todo estreno sería PR).
    const records: ShareRecord[] = session.strength
        .filter((ex) => {
            const historicMax = exerciseMaxes[ex.exerciseId]
            return historicMax != null && ex.maxWeight > historicMax
        })
        .map((ex) => {
            const setAtMax = ex.sets.reduce((best, cur) => {
                const cw = cur.weight_kg ?? 0
                const bw = best.weight_kg ?? 0
                return cw > bw ? cur : best
            }, ex.sets[0])
            const repsAtMax = setAtMax?.reps_done ?? 1
            const prevKg = exerciseMaxes[ex.exerciseId]!
            const pct = prevKg > 0 ? Math.round(((ex.maxWeight - prevKg) / prevKg) * 1000) / 10 : 100
            return {
                exerciseId: ex.exerciseId,
                exerciseName: ex.name,
                weightKg: ex.maxWeight,
                pct,
                oneRmEstKg: Math.round(epleyOneRM(ex.maxWeight, Math.max(1, repsAtMax)) * 10) / 10,
            }
        })

    // Cruce por `exerciseId`, NUNCA por nombre: dos ejercicios distintos que se llaman igual en la
    // misma sesión (variantes del catálogo, un ejercicio propio del coach homónimo de uno global)
    // se llevaban ambos la ★ del set-list aunque el récord fuera de uno solo.
    const recordIds = new Set(records.map((r) => r.exerciseId))
    const exercises: ShareExercise[] = session.strength.map((row) => ({
        exerciseId: row.exerciseId,
        name: row.name,
        setsCount: row.sets.length,
        topSetLabel: topSetLabelFor(row),
        isRecord: recordIds.has(row.exerciseId),
    }))

    const inviteCode = normalizeInviteCode(branding?.inviteCode)

    /**
     * Link de invitación del coach + atribución first-party (SPEC §Growth, F6.1).
     *
     * `?ref={clientId}&src=share_card` es lo que `/join/[código]` va a leer para saber QUIÉN trajo al
     * alumno nuevo — sin SDK de atribución (Branch/AppsFlyer descartados: el alta ocurre en la web).
     *
     * El `k={preset}` del SPEC NO viaja acá A PROPÓSITO: esta URL es la que se hornea en el QR, y el
     * QR se rasteriza junto con la captura del canvas. El alumno puede cambiar de preset DESPUÉS de
     * que el mini/preview ya se pintó, así que un `card_kind` incrustado en el QR mentiría en cuanto
     * cambie de estilo. El link con `k` lo arma F5 al copiar al portapapeles, que sí ocurre en el
     * momento de compartir y conoce el preset final.
     */
    const inviteUrl = inviteCode
        ? clientId
            ? `${studentLoginUrl(inviteCode)}?ref=${encodeURIComponent(clientId)}&src=share_card`
            : studentLoginUrl(inviteCode)
        : null

    return {
        title: planTitle,
        contextLine,
        dateISO: todayISO,
        durationSec: durationSec ?? null,
        totalVolumeKg,
        completedSets,
        totalReps,
        records,
        // CRUDO a propósito: `muscleGroupsToRegionIntensity` normaliza por su cuenta y los chips
        // necesitan el volumen por grupo, no la intensidad ya colapsada a 9 regiones.
        muscles: session.muscleWork,
        exercises,
        // Sin señal (semana sin nada planificado ni hecho) la racha diría "Sin sesiones esta semana"
        // JUSTO al terminar de entrenar — absurdo. Preferimos ocultar el chip.
        streakCopy: weeklyStreak?.hasSignal ? weeklyStreak.copy : null,
        brand: {
            name: branding?.displayName?.trim() || 'EVA',
            logoUrl: branding?.logoUrl ?? null,
            // Color de marca CRUDO (no `theme.primary`): el canvas del card es siempre oscuro y la
            // rampa sport se deriva de la marca exacta, igual que en el resumen (sport-500 verbatim).
            accent: branding?.primaryColor || '#2680FF',
            instagramHandle: branding?.instagramHandle?.trim() || null,
        },
        inviteUrl,
    }
}
