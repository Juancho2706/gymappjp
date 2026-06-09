import { redirect } from 'next/navigation'
import { Users, UserCheck, Crown } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { getCoachTeamOverview } from './_data/team.queries'

export const metadata = { title: 'Mi Equipo' }

function initialsOf(name: string): string {
    return name
        .split(' ')
        .map((s) => s[0])
        .filter(Boolean)
        .join('')
        .slice(0, 2)
        .toUpperCase()
}

export default async function CoachTeamPage() {
    const { userId, teams } = await getCoachTeamOverview()
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
                            <Badge variant={isOwner ? 'default' : 'secondary'} className="w-fit">
                                {isOwner ? 'Owner' : 'Miembro'}
                            </Badge>
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
                            <CardHeader>
                                <CardTitle className="text-base">Miembros ({team.activeMemberCount})</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <ul className="flex flex-col divide-y divide-border/50">
                                    {team.members.map((m) => {
                                        const isMemberOwner = m.coach_id === team.owner_coach_id
                                        return (
                                            <li key={m.id} className="flex items-center justify-between gap-4 py-3">
                                                <div className="flex min-w-0 items-center gap-3">
                                                    <Avatar size="default">
                                                        <AvatarFallback>{initialsOf(m.name)}</AvatarFallback>
                                                    </Avatar>
                                                    <div className="flex min-w-0 flex-col">
                                                        <span className="truncate font-semibold">
                                                            {m.name}
                                                            {m.coach_id === userId && (
                                                                <span className="font-normal text-muted-foreground"> (vos)</span>
                                                            )}
                                                        </span>
                                                        <span className="truncate text-xs text-muted-foreground">
                                                            {m.display_role || 'Coach'}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="flex shrink-0 items-center gap-2">
                                                    {isMemberOwner ? (
                                                        <Badge variant="default" className="gap-1">
                                                            <Crown className="h-3 w-3" />
                                                            Owner
                                                        </Badge>
                                                    ) : (
                                                        m.can_manage && <Badge variant="secondary">Gestor</Badge>
                                                    )}
                                                </div>
                                            </li>
                                        )
                                    })}
                                </ul>
                            </CardContent>
                        </Card>
                    </section>
                )
            })}
        </div>
    )
}
