import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'

type DB = SupabaseClient<Database>

type Json = Database['public']['Tables']['org_audit_logs']['Row']['metadata']

export type OrgAuditEventInput = {
    orgId: string
    actorId: string
    action: string
    targetType?: string | null
    targetId?: string | null
    metadata?: Json
}

export function slugify(value: string): string {
    return value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 46)
}

export function generateTempPassword(): string {
    return `Eva${Math.random().toString(36).slice(2, 8)}${Math.floor(1000 + Math.random() * 9000)}!`
}

export async function generateUniqueCoachSlug(admin: DB, base: string): Promise<string> {
    const cleanBase = slugify(base) || 'coach'
    for (let attempt = 0; attempt < 12; attempt++) {
        const slug = attempt === 0 ? cleanBase : `${cleanBase}-${Math.random().toString(36).slice(2, 6)}`
        const { data } = await admin.from('coaches').select('id').eq('slug', slug).maybeSingle()
        if (!data) return slug
    }
    return `${cleanBase}-${Date.now().toString(36)}`
}

export type OrgAdminContext = {
    supabase: DB
    user: { id: string }
    org: { id: string; name: string; slug: string; seats_included: number; primary_color: string | null; logo_url: string | null }
    membership: { role: string }
}

export async function getOrgAdminContext(
    supabase: DB,
    userId: string,
    orgSlug: string,
    allowedRoles: string[] = ['org_owner', 'org_admin']
): Promise<{ error: string } | OrgAdminContext> {
    const { data: org } = await supabase
        .from('organizations')
        .select('id, name, slug, seats_included, primary_color, logo_url')
        .eq('slug', orgSlug)
        .is('deleted_at', null)
        .maybeSingle()
    if (!org) return { error: 'Organización no encontrada' }

    const { data: membership } = await supabase
        .from('organization_members')
        .select('role')
        .eq('org_id', org.id)
        .eq('user_id', userId)
        .in('role', allowedRoles)
        .eq('status', 'active')
        .is('deleted_at', null)
        .maybeSingle()
    if (!membership) return { error: 'Sin permisos de administrador' }

    return { supabase, user: { id: userId }, org, membership }
}

export async function writeOrgAuditEvent(db: DB, event: OrgAuditEventInput): Promise<{ error?: string }> {
    const { error } = await db.from('org_audit_logs').insert({
        org_id: event.orgId,
        actor_id: event.actorId,
        action: event.action,
        target_type: event.targetType ?? null,
        target_id: event.targetId ?? null,
        metadata: event.metadata ?? {},
    })

    if (error) {
        return { error: error.message }
    }

    return {}
}
