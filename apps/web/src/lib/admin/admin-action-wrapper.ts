'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { isAllowedAdminEmail, isAdminMfaEnforced } from './admin-gate'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/lib/database.types'

export async function assertAdmin() {
    // Solo lee la sesion de cookies para el gate — el cliente anon normal basta
    // (el antiguo createAdminClient con service key + cookies era superficie innecesaria).
    const supabase = await createClient()
    const {
        data: { user },
        error,
    } = await supabase.auth.getUser()

    if (error || !user?.email || !(await isAllowedAdminEmail(user.email))) {
        throw new Error('Unauthorized: admin access required')
    }

    // Defensa en profundidad del MFA (F4 08-05): las server actions son endpoints POST que
    // no pasan por el redirect del proxy — una sesion password-only (aal1) de un admin con
    // TOTP verificado NO puede mutar nada. Si aun no enrolo (nextLevel aal1) se permite:
    // el proxy ya lo tiene atrapado en /admin/setup-mfa y bloquearlo aqui impediria el alta.
    if (isAdminMfaEnforced()) {
        const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
        if (aal && aal.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') {
            throw new Error('Unauthorized: MFA verification required')
        }
    }

    return { user, adminClient: createServiceRoleClient() }
}

export async function logAdminAction(
    adminClient: SupabaseClient<Database>,
    action: string,
    targetTable: string,
    targetId: string | null,
    payload?: unknown,
    actorEmail?: string | null
) {
    // adminClient es service-role (sin sesión) -> getUser() devuelve null y el log quedaba como
    // 'unknown'. Preferir el email del admin resuelto por assertAdmin (trazabilidad real).
    let email = actorEmail ?? undefined
    if (!email) {
        const { data: userData } = await adminClient.auth.getUser()
        email = userData.user?.email ?? 'unknown'
    }

    // Fire-and-forget audit log — don't block the action on logging failures
    try {
        await adminClient.from('admin_audit_logs').insert({
            admin_email: email,
            action,
            target_table: targetTable,
            target_id: targetId,
            payload: payload ? (payload as Json) : null,
        })
    } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[admin-audit] failed to log action:', err)
    }
}
