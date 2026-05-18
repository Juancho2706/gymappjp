'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { isAdminEmail } from './admin-gate'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/lib/database.types'

export async function assertAdmin() {
    const supabase = await createAdminClient()
    const {
        data: { user },
        error,
    } = await supabase.auth.getUser()

    if (error || !user?.email || !isAdminEmail(user.email)) {
        throw new Error('Unauthorized: admin access required')
    }

    return { user, adminClient: createServiceRoleClient() }
}

export async function logAdminAction(
    adminClient: SupabaseClient<Database>,
    action: string,
    targetTable: string,
    targetId: string | null,
    payload?: unknown
) {
    const { data: userData } = await adminClient.auth.getUser()
    const email = userData.user?.email ?? 'unknown'

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
