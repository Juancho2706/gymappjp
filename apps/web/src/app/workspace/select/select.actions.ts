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

    await setLastWorkspace(supabase, workspace)
    redirect(workspaceHome(workspace))
}
