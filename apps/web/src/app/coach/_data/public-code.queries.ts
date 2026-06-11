import { createClient } from '@/lib/supabase/server'
import { generateUniqueInviteCode } from '@/lib/coach/invite-code.server'
import { isValidInviteCode } from '@/lib/coach/invite-code'

/**
 * Garantiza que el coach LOGUEADO tenga invite_code valido (se llama desde el layout de /coach
 * con el id de la sesion). Corre user-scoped (R3, auditoria 2026-06-11): el SELECT de unicidad
 * pasa porque coaches tiene SELECT publico, y el UPDATE pasa coaches_update_own — el "admin
 * client" anterior corria con la misma RLS del coach, no aportaba bypass alguno.
 */
export async function ensureCoachPublicCode(
    coachId: string,
    currentInviteCode: string | null | undefined,
    onboardingGuide: Record<string, unknown>
): Promise<{ inviteCode: string; generated: boolean }> {
    const normalized = currentInviteCode?.trim() ?? ''

    if (isValidInviteCode(normalized)) {
        return { inviteCode: normalized, generated: false }
    }

    const supabase = await createClient()
    const inviteCode = await generateUniqueInviteCode(supabase)
    const nextOnboardingGuide = {
        ...onboardingGuide,
        invite_code_confirmed: false,
        invite_code_generated_at: new Date().toISOString(),
    }

    // .select() + maybeSingle: un UPDATE filtrado por RLS retorna 0 filas SIN error — si coachId
    // no fuera el coach de la sesion devolveriamos un codigo no persistido. Hacemos eso fatal.
    const { data: updated, error } = await supabase
        .from('coaches')
        .update({
            invite_code: inviteCode,
            onboarding_guide: nextOnboardingGuide,
        })
        .eq('id', coachId)
        .select('id')
        .maybeSingle()

    if (error || !updated) {
        throw new Error('No se pudo generar el codigo publico del coach')
    }

    return { inviteCode, generated: true }
}
