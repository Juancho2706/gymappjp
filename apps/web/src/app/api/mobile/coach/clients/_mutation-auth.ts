import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import type { Database } from '@/lib/database.types'
import { resolvePreferredWorkspace } from '@/services/auth/workspace.service'

export const mobileClientWorkspaceSchema = z.object({
    kind: z.enum(['standalone', 'team_owner', 'team_member', 'enterprise']),
    teamId: z.string().uuid().nullable().optional(),
    orgId: z.string().uuid().nullable().optional(),
})

type RequestedWorkspace = z.infer<typeof mobileClientWorkspaceSchema>
type ClientMutationScope =
    | { type: 'standalone' }
    | { type: 'team'; teamId: string }
    | { type: 'enterprise'; orgId: string }

export type MobileClientMutationContext = {
    admin: ReturnType<typeof createServiceRoleClient>
    /** Cliente request-scoped para dominios sensibles que deben conservar RLS como techo. */
    userDb: SupabaseClient<Database>
    userId: string
    scope: ClientMutationScope
}

type Resolution = { error: NextResponse } | MobileClientMutationContext

function bearerToken(request: NextRequest): string | null {
    const match = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)
    return match?.[1]?.trim() || null
}

async function resolveExplicitScope(
    admin: ReturnType<typeof createServiceRoleClient>,
    userId: string,
    requested: RequestedWorkspace,
): Promise<ClientMutationScope | null> {
    if (requested.kind === 'standalone') {
        if (requested.teamId || requested.orgId) return null
        const { data: coach } = await admin
            .from('coaches')
            .select('id, subscription_status')
            .eq('id', userId)
            .maybeSingle()
        if (!coach || coach.subscription_status === 'org_managed' || coach.subscription_status === 'team_managed') return null
        return { type: 'standalone' }
    }

    if (requested.kind === 'team_owner' || requested.kind === 'team_member') {
        if (!requested.teamId || requested.orgId) return null
        const [{ data: membership }, { data: team }] = await Promise.all([
            admin
                .from('team_members')
                .select('id')
                .eq('team_id', requested.teamId)
                .eq('coach_id', userId)
                .eq('status', 'active')
                .is('deleted_at', null)
                .maybeSingle(),
            admin
                .from('teams')
                .select('owner_coach_id')
                .eq('id', requested.teamId)
                .is('deleted_at', null)
                .is('suspended_at', null)
                .maybeSingle(),
        ])
        if (!membership || !team) return null
        const canonicalKind = team.owner_coach_id === userId ? 'team_owner' : 'team_member'
        if (canonicalKind !== requested.kind) return null
        return { type: 'team', teamId: requested.teamId }
    }

    if (!requested.orgId || requested.teamId) return null
    const { data: membership } = await admin
        .from('organization_members')
        .select('id')
        .eq('org_id', requested.orgId)
        .eq('user_id', userId)
        .eq('coach_id', userId)
        .eq('role', 'coach')
        .eq('status', 'active')
        .is('deleted_at', null)
        .maybeSingle()
    return membership ? { type: 'enterprise', orgId: requested.orgId } : null
}

export async function resolveMobileClientMutationContext(
    request: NextRequest,
    rawWorkspace: unknown,
): Promise<Resolution> {
    const token = bearerToken(request)
    if (!token) return { error: NextResponse.json({ error: 'Unauthorized', code: 'MISSING_TOKEN' }, { status: 401 }) }

    const admin = createServiceRoleClient()
    const { data, error } = await admin.auth.getUser(token)
    if (error || !data.user) {
        return { error: NextResponse.json({ error: 'Unauthorized', code: 'INVALID_TOKEN' }, { status: 401 }) }
    }

    let scope: ClientMutationScope | null = null
    if (rawWorkspace !== undefined) {
        const parsed = mobileClientWorkspaceSchema.safeParse(rawWorkspace)
        if (!parsed.success) {
            return { error: NextResponse.json({ error: 'Workspace invalido.', code: 'WORKSPACE_VALIDATION_ERROR' }, { status: 400 }) }
        }
        scope = await resolveExplicitScope(admin, data.user.id, parsed.data)
    } else {
        const workspace = await resolvePreferredWorkspace(admin, data.user.id)
        if (workspace?.type === 'coach_standalone') scope = { type: 'standalone' }
        else if (workspace?.type === 'coach_team') scope = { type: 'team', teamId: workspace.teamId }
        else if (workspace?.type === 'enterprise_coach') scope = { type: 'enterprise', orgId: workspace.orgId }
    }

    if (!scope) {
        return {
            error: NextResponse.json({
                error: 'Workspace no autorizado.',
                code: rawWorkspace === undefined ? 'WORKSPACE_NOT_ALLOWED' : 'WORKSPACE_MISMATCH',
            }, { status: 403 }),
        }
    }
    const userDb = createSupabaseClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            global: { headers: { Authorization: `Bearer ${token}` } },
            auth: { persistSession: false, autoRefreshToken: false },
        },
    )
    return { admin, userDb, userId: data.user.id, scope }
}

export function applyMobileClientScope(query: any, ctx: MobileClientMutationContext) {
    if (ctx.scope.type === 'team') return query.eq('team_id', ctx.scope.teamId).is('org_id', null)
    if (ctx.scope.type === 'enterprise') {
        // `mobileContextOwnsClient` ya validó la asignación activa. No repetir `coach_id = userId`:
        // en enterprise la reasignación canónica vive en `coach_client_assignments` y la fila
        // `clients.coach_id` puede conservar al creador original.
        return query.eq('org_id', ctx.scope.orgId).is('team_id', null)
    }
    return query.eq('coach_id', ctx.userId).is('org_id', null).is('team_id', null)
}

export async function mobileContextOwnsClient(
    ctx: MobileClientMutationContext,
    clientId: string,
): Promise<boolean> {
    if (ctx.scope.type === 'enterprise') {
        const [{ data: client, error: clientError }, { data: assignment, error: assignmentError }] = await Promise.all([
            ctx.admin
                .from('clients')
                .select('id')
                .eq('id', clientId)
                .eq('org_id', ctx.scope.orgId)
                .is('team_id', null)
                .maybeSingle(),
            ctx.admin
                .from('coach_client_assignments')
                .select('id')
                .eq('org_id', ctx.scope.orgId)
                .eq('client_id', clientId)
                .eq('coach_id', ctx.userId)
                .is('deleted_at', null)
                .maybeSingle(),
        ])
        return !clientError && !assignmentError && Boolean(client && assignment)
    }
    const { data } = await applyMobileClientScope(
        ctx.admin.from('clients').select('id').eq('id', clientId),
        ctx,
    ).maybeSingle()
    return Boolean(data)
}
