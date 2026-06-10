import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Users, UserCheck, Package } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { createClient } from '@/lib/supabase/server'
import { resolvePreferredWorkspace } from '@/services/auth/workspace.service'
import { getCoachTeamOverview } from './_data/team.queries'
import TeamMembersManager from './_components/TeamMembersManager'

export const metadata = { title: 'Mi Equipo' }

export default async function CoachTeamPage() {
    // Módulo EXCLUSIVO del contexto team: fuera de él, el módulo no existe (separación de flujos).
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')
    const workspace = await resolvePreferredWorkspace(supabase, user.id)
    if (workspace?.type !== 'coach_team') redirect('/coach/dashboard')

    const { userId, teams } = await getCoachTeamOverview(workspace.teamId)
    if (!userId) redirect('/login')

    if (teams.length === 0) {
        return (
            <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
                <h1 className="font-display text-2xl font-bold tracking-tight">Mi equipo</h1>
                <Card className="mt-6">
                    <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
                        <Users className="h-8 w-8 text-muted-foreground" />
                        <p className="text-sm font-semibold">No perteneces a ningún equipo</p>
                        <p className="text-xs text-muted-foreground">
                            Cuando te sumen a un pool de coaches, aparecerá acá.
                        </p>
                    </CardContent>
                </Card>
            </div>
        )
    }

    return (
        <div className="mx-auto max-w-3xl space-y-10 px-4 py-8 sm:px-6">
            {teams.map((team) => {
                const seatPct =
                    team.seat_limit > 0
                        ? Math.min(100, Math.round((team.activeMemberCount / team.seat_limit) * 100))
                        : 0
                const isOwner = team.owner_coach_id === userId
                return (
                    <section key={team.id} className="space-y-6">
                        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                                <h1 className="font-display text-2xl font-bold tracking-tight">{team.name}</h1>
                                <p className="text-sm text-muted-foreground">Pool compartido de coaches</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <Link
                                    href="/coach/settings/modules"
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                >
                                    <Package className="h-3.5 w-3.5" /> Módulos
                                </Link>
                                <Badge variant={isOwner ? 'default' : 'secondary'} className="w-fit">
                                    {isOwner ? 'Owner' : 'Miembro'}
                                </Badge>
                            </div>
                        </header>

                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <Card>
                                <CardContent className="flex flex-col gap-2 p-5">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                                            Cupos
                                        </span>
                                        <UserCheck className="h-4 w-4 text-primary" />
                                    </div>
                                    <span className="font-display text-3xl font-bold tracking-tight">
                                        {team.activeMemberCount}/{team.seat_limit}
                                    </span>
                                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                                        <div
                                            className="h-full rounded-full bg-primary transition-all duration-300"
                                            style={{ width: `${seatPct}%` }}
                                        />
                                    </div>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardContent className="flex flex-col gap-2 p-5">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                                            Alumnos del pool
                                        </span>
                                        <Users className="h-4 w-4 text-primary" />
                                    </div>
                                    <span className="font-display text-3xl font-bold tracking-tight">
                                        {team.poolClientCount}
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                        Visibles y editables por todo el equipo
                                    </span>
                                </CardContent>
                            </Card>
                        </div>

                        <Card>
                            <CardContent className="p-5">
                                <TeamMembersManager
                                    teamId={team.id}
                                    ownerCoachId={team.owner_coach_id}
                                    userId={userId}
                                    isManager={team.isManager}
                                    isOwner={team.isOwner}
                                    seatLimit={team.seat_limit}
                                    activeMemberCount={team.activeMemberCount}
                                    members={team.members}
                                />
                            </CardContent>
                        </Card>
                    </section>
                )
            })}
        </div>
    )
}
