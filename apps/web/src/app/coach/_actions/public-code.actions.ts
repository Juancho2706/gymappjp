'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createRawAdminClient } from '@/lib/supabase/admin-raw'
import type { Json } from '@/lib/database.types'

export async function confirmCoachPublicCodeAction(): Promise<{ ok: true } | { ok: false; error: string }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'No autenticado' }

    // Write con admin client (mismo patrón que updateBrandSettingsAction). El write
    // user-scoped no estaba persistiendo el flag (el modal volvía en cada carga).
    // Se re-lee con el admin justo antes para mergear sin pisar otras keys del guide.
    const admin = await createRawAdminClient()

    const { data: coach } = await admin
        .from('coaches')
        .select('onboarding_guide')
        .eq('id', user.id)
        .maybeSingle()

    const existing =
        coach?.onboarding_guide != null &&
        typeof coach.onboarding_guide === 'object' &&
        !Array.isArray(coach.onboarding_guide)
            ? (coach.onboarding_guide as Record<string, unknown>)
            : {}

    const updated: Json = {
        ...existing,
        invite_code_confirmed: true,
        invite_code_confirmed_at: new Date().toISOString(),
    }

    const { error } = await admin
        .from('coaches')
        .update({ onboarding_guide: updated, updated_at: new Date().toISOString() })
        .eq('id', user.id)

    if (error) return { ok: false, error: error.message }

    revalidatePath('/coach/dashboard', 'layout')
    return { ok: true }
}
