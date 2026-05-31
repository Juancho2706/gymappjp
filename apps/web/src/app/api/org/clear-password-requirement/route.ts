import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'

// POST /api/org/clear-password-requirement
// Clears requires_password_change from app_metadata after successful password update.
// Rate-limited by the fact that the user must be authenticated.
export async function POST() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const appMeta = user.app_metadata as { requires_password_change?: boolean }
    if (!appMeta?.requires_password_change) {
        return NextResponse.json({ ok: true }) // already cleared
    }

    const admin = createServiceRoleClient()
    const { error } = await admin.auth.admin.updateUserById(user.id, {
        app_metadata: { ...user.app_metadata, requires_password_change: false },
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true })
}
