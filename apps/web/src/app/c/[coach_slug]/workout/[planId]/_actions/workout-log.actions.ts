'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { WorkoutLogSetSchema } from '@eva/schemas'
import { getTodayInSantiago, getSantiagoUtcBoundsForDay } from '@/lib/date-utils'

export type LogState = {
    error?: string
    success?: boolean
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

    const raw = {
        block_id: formData.get('block_id') as string,
        set_number: formData.get('set_number') as string,
        weight_kg: getOptional('weight_kg'),
        reps_done: getOptional('reps_done'),
        rpe: getOptional('rpe'),
        rir: getOptional('rir'),
        // Espejo polimórfico (M3): solo llegan desde las variantes cardio/movilidad/roller
        // del LogSetForm — un log strength de hoy no envía estas keys (AC4 sin regresión).
        actual_duration_sec: getOptional('actual_duration_sec'),
        actual_distance_m: getOptional('actual_distance_m'),
        actual_pace_sec_per_km: getOptional('actual_pace_sec_per_km'),
        actual_hold_sec: getOptional('actual_hold_sec'),
        actual_avg_hr: getOptional('actual_avg_hr'),
    }

    const parsed = WorkoutLogSetSchema.safeParse(raw)
    if (!parsed.success) {
        return { error: parsed.error.issues[0].message }
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado.' }

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
        actual_duration_sec: parsed.data.actual_duration_sec ?? null,
        actual_distance_m: parsed.data.actual_distance_m ?? null,
        actual_pace_sec_per_km: parsed.data.actual_pace_sec_per_km ?? null,
        actual_hold_sec: parsed.data.actual_hold_sec ?? null,
        actual_avg_hr: parsed.data.actual_avg_hr ?? null,
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

    if (dbError) return { error: dbError.message }

    revalidatePath('/c', 'layout')
    revalidatePath(`/coach/clients/${user.id}`)
    return { success: true }
}
