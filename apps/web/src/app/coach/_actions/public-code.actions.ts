'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { Json } from '@/lib/database.types'

export async function confirmCoachPublicCodeAction(): Promise<{ ok: true } | { ok: false; error: string }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'No autenticado' }

    // Write user-scoped: pasa coaches_update_own (R3, auditoria 2026-06-11 — el "admin client"
    // anterior corria con la MISMA RLS del coach, no era bypass). El fix real del flag que no
    // persistia fue el re-read + merge justo antes del update, para no pisar otras keys del guide.
    const { data: coach } = await supabase
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

    const { error } = await supabase
        .from('coaches')
        .update({ onboarding_guide: updated, updated_at: new Date().toISOString() })
        .eq('id', user.id)

    if (error) return { ok: false, error: error.message }

    revalidatePath('/coach/dashboard', 'layout')
    return { ok: true }
}
