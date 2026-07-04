'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { WorkoutLogSetSchema } from '@eva/schemas'
import { getTodayInSantiago, getSantiagoUtcBoundsForDay } from '@/lib/date-utils'

export type LogState = {
    error?: string
    success?: boolean
    /**
     * Código de clase de error para que el flush de la cola offline decida reintentar vs DESCARTAR.
     * `invalid_block` = el block_id no existe (huérfano de reseed / FK 23503) → descartar, no reintentar.
     */
    code?: 'invalid_block' | 'unauthenticated' | 'validation' | 'db'
}

export async function logSetAction(
    _prev: LogState,
    formData: FormData
): Promise<LogState> {
    const getOptional = (key: string) => {
        const val = formData.get(key)
        if (val === null || val === '') return undefined
        return String(val).replace(',', '.')
    }

    // Nota (quick-win E2-6): texto libre — leída CRUDA, jamás por getOptional (que hace
    // replace(',', '.') y corrompería el texto). '' → undefined para no pisar con vacío.
    const noteRaw = formData.get('note')
    const note = noteRaw === null || String(noteRaw).trim() === '' ? undefined : String(noteRaw)

    // Sustitución de máquina ocupada (Fase L · C): texto/uuid — leídos CRUDOS (no por getOptional).
    // Sólo llegan cuando el bloque tenía sustitución activa; una serie normal no envía estas keys.
    const rawText = (key: string) => {
        const v = formData.get(key)
        return v === null || String(v).trim() === '' ? undefined : String(v).trim()
    }
    const substituted_exercise_id = rawText('substituted_exercise_id')
    const substituted_exercise_name = rawText('substituted_exercise_name')
    const substitution_reason = rawText('substitution_reason')

    const raw = {
        block_id: formData.get('block_id') as string,
        set_number: formData.get('set_number') as string,
        weight_kg: getOptional('weight_kg'),
        reps_done: getOptional('reps_done'),
        rpe: getOptional('rpe'),
        rir: getOptional('rir'),
        note,
        // Espejo polimórfico (M3): solo llegan desde las variantes cardio/movilidad/roller
        // del LogSetForm — un log strength de hoy no envía estas keys (AC4 sin regresión).
        actual_duration_sec: getOptional('actual_duration_sec'),
        actual_distance_m: getOptional('actual_distance_m'),
        actual_pace_sec_per_km: getOptional('actual_pace_sec_per_km'),
        actual_hold_sec: getOptional('actual_hold_sec'),
        actual_avg_hr: getOptional('actual_avg_hr'),
        // Sustitución (Fase L · C): NO sobreescriben exercise_id (AC-C7) — columnas dedicadas.
        substituted_exercise_id,
        substituted_exercise_name,
        substitution_reason,
    }

    const parsed = WorkoutLogSetSchema.safeParse(raw)
    if (!parsed.success) {
        return { error: parsed.error.issues[0].message, code: 'validation' }
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado.', code: 'unauthenticated' }

    // R3 (auditoria 2026-06-11): todas las operaciones son sobre workout_logs propios del alumno
    // (client_manage_logs) → cliente user-scoped. RLS ademas acota el DELETE de duplicados.
    const { iso: todayStr } = getTodayInSantiago()
    const { startIso: startTs, endIso: endTs } = getSantiagoUtcBoundsForDay(todayStr)

    const { data: existingRows } = await supabase
        .from('workout_logs')
        .select('id')
        .eq('block_id', parsed.data.block_id)
        .eq('client_id', user.id)
        .eq('set_number', parsed.data.set_number)
        .gte('logged_at', startTs)
        .lt('logged_at', endTs)
        .order('logged_at', { ascending: false })

    let dbError

    const payloadValues = {
        weight_kg: parsed.data.weight_kg ?? null,
        reps_done: parsed.data.reps_done ?? null,
        rpe: parsed.data.rpe ?? null,
        rir: parsed.data.rir ?? null,
        note: parsed.data.note ?? null,
        actual_duration_sec: parsed.data.actual_duration_sec ?? null,
        actual_distance_m: parsed.data.actual_distance_m ?? null,
        actual_pace_sec_per_km: parsed.data.actual_pace_sec_per_km ?? null,
        actual_hold_sec: parsed.data.actual_hold_sec ?? null,
        actual_avg_hr: parsed.data.actual_avg_hr ?? null,
        // Sustitución de máquina ocupada (Fase L · C, DC-1): visible para el coach en la ficha.
        // Snapshot del nombre → sobrevive al hard-delete del ejercicio. exercise_id NO se toca.
        substituted_exercise_id: parsed.data.substituted_exercise_id ?? null,
        substituted_exercise_name: parsed.data.substituted_exercise_name ?? null,
        substitution_reason: parsed.data.substitution_reason ?? null,
    }

    if (existingRows && existingRows.length > 0) {
        const targetId = existingRows[0].id
        const { error: updateError } = await supabase
            .from('workout_logs')
            .update(payloadValues)
            .eq('id', targetId)
        dbError = updateError

        if (existingRows.length > 1) {
            const duplicateIds = existingRows.slice(1).map(r => r.id)
            await supabase.from('workout_logs').delete().in('id', duplicateIds)
        }
    } else {
        const { error: insertError } = await supabase.from('workout_logs').insert({
            block_id: parsed.data.block_id,
            client_id: user.id,
            set_number: parsed.data.set_number,
            ...payloadValues,
        })
        dbError = insertError
    }

    if (dbError) {
        // FK 23503 = el block_id no existe (bloque borrado/recreado por reseed): huérfano → el flush
        // debe DESCARTARLO, no reintentar en loop. (PostgrestError expone .code de Postgres.)
        const pgCode = (dbError as { code?: string }).code
        if (pgCode === '23503') return { error: 'El bloque ya no existe.', code: 'invalid_block' }
        return { error: dbError.message, code: 'db' }
    }

    // Sin revalidatePath por serie: la UI del exec es optimista + write-through y el resumen usa
    // sessionLogs en memoria. Revalidar el layout entero en cada serie devolvía payload RSC del
    // layout → parpadeo + salto de scroll (multiplicado N veces por el flush de la cola). Next 16
    // con dynamic=0 (staleTime 0) re-fetchea al navegar, así que coach/dashboard ven fresco igual;
    // el flush offline mantiene su router.refresh() al reconectar. La invalidación explícita ocurre
    // UNA vez al FINALIZAR (revalidateWorkoutViewAction), no por serie.
    return { success: true }
}

/**
 * Invalidación explícita de la vista de ejecución + dashboard, invocada UNA vez al FINALIZAR el
 * entreno (informe forense 2026-07-04, Fix C). Complementa (no sustituye) la frescura al reentrar
 * que garantiza el `router.refresh()` de montaje del cliente: evita que una entrada stale del cache
 * de ruta se reutilice en una navegación posterior. No revalida por serie (eso causaba parpadeo).
 */
export async function revalidateWorkoutViewAction(coachSlug: string, planId: string): Promise<void> {
    revalidatePath(`/c/${coachSlug}/workout/${planId}`)
    revalidatePath(`/c/${coachSlug}/dashboard`)
}
