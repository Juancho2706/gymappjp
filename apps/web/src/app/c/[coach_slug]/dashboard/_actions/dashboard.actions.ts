'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { QuickWeightSchema } from '@eva/schemas'
import { getTodayInSantiago } from '@/lib/date-utils'
import { STUDENT_ACCESS_COPY } from '@/lib/student-access'
import { resolveStudentAccessForClient } from '@/lib/student-access.server'
import { getExercisePRHistory, type ExercisePRDetail } from '../_data/dashboard.queries'

export type QuickWeightState = { error?: string; success?: boolean; code?: 'coach_paused' }

/** §9 — log rápido de peso (solo peso; energía null). */
export async function quickLogWeightAction(_prev: QuickWeightState, formData: FormData): Promise<QuickWeightState> {
    const parsed = QuickWeightSchema.safeParse({
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

    // Gate de suscripcion del coach: post-gracia (readonly) el alumno no registra peso.
    const access = await resolveStudentAccessForClient(supabase, user.id)
    if (access.state === 'readonly') {
        return { error: STUDENT_ACCESS_COPY.pausedWriteError, code: 'coach_paused' }
    }

    const { iso: todayIso } = getTodayInSantiago()
    const { error: insertError } = await supabase.from('check_ins').insert({
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

/**
 * On-demand: historial de un lift para el `PRDetailSheet` (card RSC → sheet cliente pide la data
 * al tap). `clientId` sale SIEMPRE de la sesión (`auth.getUser()`), nunca del cliente — solo el
 * `exerciseId` viaja. READ-ONLY, sin revalidate.
 */
export async function getExercisePRHistoryAction(exerciseId: string): Promise<ExercisePRDetail | null> {
    if (typeof exerciseId !== 'string' || exerciseId.length === 0) return null
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) return null
    return getExercisePRHistory(user.id, exerciseId)
}
