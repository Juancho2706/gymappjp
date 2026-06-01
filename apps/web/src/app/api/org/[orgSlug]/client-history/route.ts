import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getOrgAdminContext } from '@/services/org/org.service'

export async function GET(
    request: Request,
    { params }: { params: Promise<{ orgSlug: string }> }
) {
    const { orgSlug } = await params
    const url = new URL(request.url)
    const clientId = url.searchParams.get('clientId')
    if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const context = await getOrgAdminContext(supabase, user.id, orgSlug)
    if ('error' in context) return NextResponse.json({ error: context.error }, { status: 403 })

    // Fetch audit events related to this client
    const { data: events } = await supabase
        .from('org_audit_logs')
        .select('action, created_at, metadata')
        .eq('org_id', context.org.id)
        .or(`target_id.eq.${clientId},metadata->>client_id.eq.${clientId}`)
        .in('action', ['client.assigned', 'client.reassigned', 'client.bulk_assigned', 'client.bulk_archived', 'client.bulk_reactivated'])
        .order('created_at', { ascending: false })
        .limit(20)

    return NextResponse.json({ events: events ?? [] })
}
