'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { listUserWorkspaces, setLastWorkspace, workspaceKey } from '@/services/auth/workspace.service'
import { workspaceHome } from './workspace-home'

export async function selectWorkspaceAction(formData: FormData) {
    const selectedKey = String(formData.get('workspace_key') ?? '')
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const workspaces = await listUserWorkspaces(supabase, user.id)
    const workspace = workspaces.find(item => workspaceKey(item) === selectedKey)
    if (!workspace) redirect('/workspace/select')

    // Persist the choice. If the write fails (RLS / constraint / transient), DO NOT
    // redirect as if it succeeded: the stale preference (e.g. enterprise_coach) would
    // win on the next /coach/dashboard resolution and the user would silently "revert".
    const { error } = await setLastWorkspace(supabase, workspace)
    if (error) {
        const url = new URL('/workspace/select', 'https://placeholder.local')
        url.searchParams.set('error', 'persist_failed')
        redirect(url.pathname + url.search)
    }

    // F10: keep coaches.active_org_id in sync with the chosen workspace, then refresh the
    // session so the JWT auth hook (which reads active_org_id) re-issues claims for the
    // right org immediately — avoiding a window where the DB preference and the JWT disagree.
    if (workspace.type === 'coach_standalone' || workspace.type === 'enterprise_coach' || workspace.type === 'coach_team') {
        // team y standalone limpian active_org_id (org_id NULL); enterprise lo setea.
        const nextOrgId = workspace.type === 'enterprise_coach' ? workspace.orgId : null
        await createServiceRoleClient().from('coaches').update({ active_org_id: nextOrgId }).eq('id', user.id)
        await supabase.auth.refreshSession()
    }

    redirect(workspaceHome(workspace))
}
