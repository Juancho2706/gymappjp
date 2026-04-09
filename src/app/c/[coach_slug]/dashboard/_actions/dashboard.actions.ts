'use server'

import { createClient } from '@/lib/supabase/server'
import { createRawAdminClient } from '@/lib/supabase/admin-raw'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getTodayInSantiago } from '@/lib/date-utils'

const quickWeightSchema = z.object({
    weight: z.coerce.number().min(20).max(400),
    coach_slug: z.string().min(1),
})

export type QuickWeightState = { error?: string; success?: boolean }

/** §9 — log rápido de peso (solo peso; energía null). */
export async function quickLogWeightAction(_prev: QuickWeightState, formData: FormData): Promise<QuickWeightState> {
    const parsed = quickWeightSchema.safeParse({
        weight: formData.get('weight'),
        coach_slug: formData.get('coach_slug'),
    })
    if (!parsed.success) {
        return { error: parsed.error.issues[0]?.message ?? 'Dato inválido' }
    }

    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado.' }

    const { iso: todayIso } = getTodayInSantiago()
    const adminDb = await createRawAdminClient()
    const { error: insertError } = await adminDb.from('check_ins').insert({
        client_id: user.id,
        weight: parsed.data.weight,
        energy_level: null,
        notes: null,
        date: todayIso,
    })

    if (insertError) {
        return { error: insertError.message }
    }

    revalidatePath(`/c/${parsed.data.coach_slug}/dashboard`)
    revalidatePath(`/c/${parsed.data.coach_slug}/check-in`)
    revalidatePath('/c', 'layout')
    return { success: true }
}
