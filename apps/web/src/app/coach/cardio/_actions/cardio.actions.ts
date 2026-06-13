'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { CardioProfileUpdateSchema } from '@eva/schemas'
import { resolvePreferredWorkspace } from '@/services/auth/workspace.service'
import { assertModule } from '@/services/entitlements.service'
import { saveCardioProfile } from '@/services/cardio-zones.service'

export type CardioProfileState = {
    error?: string
    success?: boolean
}

/**
 * Guarda el perfil cardio del alumno (birth_date / resting_hr / max_hr_override /
 * ref_5k_time_sec — M4). Gating server-side (AC7): assertModule('cardio') al tope,
 * por el workspace ACTIVO. Zod en server (además del form). Scope 3-vías en el service.
 */
export async function updateCardioProfileAction(
    _prev: CardioProfileState,
    formData: FormData
): Promise<CardioProfileState> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado.' }

    const workspace = await resolvePreferredWorkspace(supabase, user.id)
    if (workspace?.type === 'enterprise_coach') return { error: 'Modulo no habilitado: cardio' }
    const activeTeamId = workspace?.type === 'coach_team' ? workspace.teamId : null

    try {
        await assertModule(supabase, 'cardio', {
            teamId: activeTeamId,
            coachId: activeTeamId ? null : user.id,
        })
    } catch (e) {
        return { error: e instanceof Error ? e.message : 'Modulo no habilitado: cardio' }
    }

    const getField = (key: string) => {
        const val = formData.get(key)
        return val === null ? undefined : String(val)
    }

    const parsed = CardioProfileUpdateSchema.safeParse({
        clientId: formData.get('client_id'),
        birth_date: getField('birth_date') || null,
        resting_hr: getField('resting_hr'),
        max_hr_override: getField('max_hr_override'),
        ref_5k_time_sec: getField('ref_5k_time_sec'),
    })
    if (!parsed.success) {
        return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }
    }

    const { clientId, ...values } = parsed.data
    const { error } = await saveCardioProfile(
        supabase,
        clientId,
        { coachId: user.id, activeTeamId },
        values
    )
    if (error) return { error }

    revalidatePath('/coach/cardio')
    revalidatePath(`/coach/cardio/${clientId}`)
    revalidatePath(`/coach/clients/${clientId}`)
    return { success: true }
}
