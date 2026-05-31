'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'

/**
 * Clears the `requires_mfa_setup` app_metadata flag after successful TOTP enrollment.
 * Must be called server-side (service role needed to update app_metadata).
 */
export async function clearMfaRequirementAction(): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'No autenticado.' }

    // Verify user actually has a verified TOTP factor before clearing the flag
    const { data: factors } = await supabase.auth.mfa.listFactors()
    const hasVerifiedTotp = factors?.totp?.some(f => f.status === 'verified')
    if (!hasVerifiedTotp) return { success: false, error: 'MFA no verificado.' }

    const admin = createServiceRoleClient()
    const { error } = await admin.auth.admin.updateUserById(user.id, {
        app_metadata: { requires_mfa_setup: false },
    })

    if (error) return { success: false, error: error.message }
    return { success: true }
}
