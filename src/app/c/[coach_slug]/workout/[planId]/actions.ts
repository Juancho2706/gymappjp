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
    const raw = {
        block_id: formData.get('block_id') as string,
        set_number: formData.get('set_number') as string,
        weight_kg: formData.get('weight_kg') as string,
        reps_done: formData.get('reps_done') as string,
        rpe: formData.get('rpe') as string,
    }

    const parsed = logSchema.safeParse(raw)
    if (!parsed.success) {
        return { error: parsed.error.issues[0].message }
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado.' }

    const adminDb = await createRawAdminClient()
    const { error } = await adminDb.from('workout_logs').insert({
        block_id: parsed.data.block_id,
        client_id: user.id,
        set_number: parsed.data.set_number,
        weight_kg: parsed.data.weight_kg ?? null,
        reps_done: parsed.data.reps_done ?? null,
        rpe: parsed.data.rpe ?? null,
    })

    if (error) return { error: error.message }

    revalidatePath(`/c`)
    return { success: true }
}
