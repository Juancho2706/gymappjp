import { redirect } from 'next/navigation'
import { Building2, Dumbbell, GraduationCap, UserCog } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { listUserWorkspaces, setLastWorkspace, workspaceKey } from '@/services/auth/workspace.service'
import { selectWorkspaceAction } from './select.actions'
import { workspaceHome } from './workspace-home'

function iconFor(type: string) {
    if (type === 'enterprise_staff') return UserCog
    if (type === 'enterprise_coach') return Building2
    if (type === 'coach_standalone') return Dumbbell
    return GraduationCap
}

export default async function WorkspaceSelectPage() {
    const supabase = await createClient()
    // getClaims(): verificación local del JWT (ES256), sin /user. El proxy ya validó la sesión.
    const { data: __cl } = await supabase.auth.getClaims()
    const user = __cl?.claims?.sub ? { id: __cl.claims.sub as string } : null
    if (!user) redirect('/login')

    const workspaces = await listUserWorkspaces(supabase, user.id)
    if (workspaces.length === 0) redirect('/login')
    if (workspaces.length === 1) {
        await setLastWorkspace(supabase, workspaces[0])
        redirect(workspaceHome(workspaces[0]))
    }

    return (
        <div className="min-h-dvh bg-zinc-950 px-4 py-8 text-zinc-100">
            <main className="mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-2xl flex-col justify-center">
                <div className="mb-6">
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-300">EVA Workspace</p>
                    <h1 className="mt-2 text-3xl font-black tracking-tight text-white">Elige donde trabajar</h1>
                    <p className="mt-2 text-sm leading-6 text-zinc-500">
                        Tu email puede tener varios contextos. EVA separa datos, marca y permisos por workspace.
                    </p>
                </div>

                <div className="space-y-3">
                    {workspaces.map(workspace => {
                        const Icon = iconFor(workspace.type)
                        return (
                            <form key={workspaceKey(workspace)} action={selectWorkspaceAction}>
                                <input type="hidden" name="workspace_key" value={workspaceKey(workspace)} />
                                <button
                                    type="submit"
                                    className="flex w-full items-center gap-4 rounded-lg border border-zinc-800 bg-zinc-900/70 p-4 text-left transition hover:border-emerald-400/40 hover:bg-zinc-900"
                                >
                                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-emerald-400/10 text-emerald-300">
                                        <Icon className="h-5 w-5" aria-hidden="true" />
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-sm font-black text-white">{workspace.label}</span>
                                        <span className="mt-1 block text-xs text-zinc-500">{workspace.type.replace(/_/g, ' ')}</span>
                                    </span>
                                    <span className="text-sm font-bold text-emerald-300">Entrar</span>
                                </button>
                            </form>
                        )
                    })}
                </div>
            </main>
        </div>
    )
}
