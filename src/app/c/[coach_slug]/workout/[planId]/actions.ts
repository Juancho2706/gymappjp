'use server'

import { createClient } from '@/lib/supabase/server'
import { createRawAdminClient } from '@/lib/supabase/admin-raw'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

const logSchema = z.object({
    block_id: z.string().uuid(),
    set_number: z.coerce.number().int().min(1),
    weight_kg: z.coerce.number().min(0).optional(),
    reps_done: z.coerce.number().int().min(0).optional(),
    rpe: z.coerce.number().min(1).max(10).optional(),
})

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
        return val
    }

    const raw = {
        block_id: formData.get('block_id') as string,
        set_number: formData.get('set_number') as string,
        weight_kg: getOptional('weight_kg'),
        reps_done: getOptional('reps_done'),
        rpe: getOptional('rpe'),
    }

    const parsed = logSchema.safeParse(raw)
    if (!parsed.success) {
        return { error: parsed.error.issues[0].message }
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado.' }

    const adminDb = await createRawAdminClient()

    // Only look for logs from TODAY to avoid updating previous weeks' entries
    const now = new Date()
    const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'America/Santiago' })
    const tomorrowStr = new Date(now.getTime() + 86400000).toLocaleDateString('en-CA', { timeZone: 'America/Santiago' })

    // Comprobar si ya existe un registro de HOY para actualizarlo
    const { data: existingRows } = await adminDb
        .from('workout_logs')
        .select('id')
        .eq('block_id', parsed.data.block_id)
        .eq('client_id', user.id)
        .eq('set_number', parsed.data.set_number)
        .gte('logged_at', `${todayStr}T00:00:00`)
        .lt('logged_at', `${tomorrowStr}T00:00:00`)
        .order('logged_at', { ascending: false })

    let dbError

    if (existingRows && existingRows.length > 0) {
        // Actualizamos el más reciente
        const targetId = existingRows[0].id
        const { error: updateError } = await adminDb
            .from('workout_logs')
            .update({
                weight_kg: parsed.data.weight_kg ?? null,
                reps_done: parsed.data.reps_done ?? null,
                rpe: parsed.data.rpe ?? null,
            })
            .eq('id', targetId)
        dbError = updateError

        // Si hay duplicados (por inserciones previas fallidas), los eliminamos (Self-healing)
        if (existingRows.length > 1) {
            const duplicateIds = existingRows.slice(1).map(r => r.id)
            await adminDb.from('workout_logs').delete().in('id', duplicateIds)
        }
    } else {
        const { error: insertError } = await adminDb.from('workout_logs').insert({
            block_id: parsed.data.block_id,
            client_id: user.id,
            set_number: parsed.data.set_number,
            weight_kg: parsed.data.weight_kg ?? null,
            reps_done: parsed.data.reps_done ?? null,
            rpe: parsed.data.rpe ?? null,
        })
        dbError = insertError
    }

    if (dbError) return { error: dbError.message }

    revalidatePath('/c', 'layout')
    revalidatePath(`/coach/clients/${user.id}`)
    return { success: true }
}
