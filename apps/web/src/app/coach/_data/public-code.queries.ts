import { createAdminClient } from '@/lib/supabase/server'
import { generateUniqueInviteCode } from '@/lib/coach/invite-code.server'
import { isValidInviteCode } from '@/lib/coach/invite-code'

export async function ensureCoachPublicCode(
    coachId: string,
    currentInviteCode: string | null | undefined,
    onboardingGuide: Record<string, unknown>
): Promise<{ inviteCode: string; generated: boolean }> {
    const normalized = currentInviteCode?.trim() ?? ''

    if (isValidInviteCode(normalized)) {
        return { inviteCode: normalized, generated: false }
    }

    const admin = await createAdminClient()
    const inviteCode = await generateUniqueInviteCode(admin)
    const nextOnboardingGuide = {
        ...onboardingGuide,
        invite_code_confirmed: false,
        invite_code_generated_at: new Date().toISOString(),
    }

    const { error } = await admin
        .from('coaches')
        .update({
            invite_code: inviteCode,
            onboarding_guide: nextOnboardingGuide,
        })
        .eq('id', coachId)

    if (error) {
        throw new Error('No se pudo generar el codigo publico del coach')
    }

    return { inviteCode, generated: true }
}
