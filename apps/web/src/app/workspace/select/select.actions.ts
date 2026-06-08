'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
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

    redirect(workspaceHome(workspace))
}
