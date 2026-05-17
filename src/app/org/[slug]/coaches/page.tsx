import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { getOrgBySlug, getOrgMembers } from '../_data/org.queries'
import { InviteCoachForm } from './_components/InviteCoachForm'
import { RemoveCoachButton } from './_components/RemoveCoachButton'
import { UserCheck, Clock, Crown, Shield, User } from 'lucide-react'

export const metadata: Metadata = { title: 'Coaches' }

interface Props {
    params: Promise<{ slug: string }>
}

const ROLE_ICONS = {
    org_owner: Crown,
    org_admin: Shield,
    coach: User,
}

const ROLE_LABELS = {
    org_owner: 'Propietario',
    org_admin: 'Admin',
    coach: 'Coach',
}

export default async function OrgCoachesPage({ params }: Props) {
    const { slug } = await params
    const org = await getOrgBySlug(slug)
    if (!org) redirect('/coach/dashboard')

    const isAdmin = org.myRole === 'org_owner' || org.myRole === 'org_admin'
    const members = await getOrgMembers(org.id)
    const active = members.filter(m => m.status === 'active')
    const invited = members.filter(m => m.status === 'invited')

    return (
        <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-bold">Coaches</h1>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        {active.length} / {org.seats_included} seats
                    </p>
                </div>
            </div>

            {/* Invite form — admins only */}
            {isAdmin && (
                <div className="rounded-xl border border-border bg-card p-4">
                    <h2 className="text-sm font-semibold mb-3">Invitar coach</h2>
                    <InviteCoachForm orgSlug={slug} />
                </div>
            )}

            {/* Active members */}
            {active.length > 0 && (
                <div className="rounded-xl border border-border bg-card divide-y divide-border">
                    <div className="px-4 py-3">
                        <h2 className="text-sm font-semibold flex items-center gap-1.5">
                            <UserCheck className="w-4 h-4 text-emerald-500" />
                            Activos ({active.length})
                        </h2>
                    </div>
                    {active.map(member => {
                        const RoleIcon = ROLE_ICONS[member.role as keyof typeof ROLE_ICONS] ?? User
                        return (
                            <div key={member.id} className="flex items-center gap-3 px-4 py-3">
                                <div className="w-9 h-9 rounded-full bg-violet-500/10 flex items-center justify-center text-violet-500 font-bold text-sm shrink-0">
                                    {member.coach?.full_name?.charAt(0)?.toUpperCase() ?? '?'}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium truncate">{member.coach?.full_name ?? '—'}</p>
                                    <p className="text-[11px] text-muted-foreground">{member.coach?.slug ?? ''}</p>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                        <RoleIcon className="w-3 h-3" />
                                        {ROLE_LABELS[member.role as keyof typeof ROLE_LABELS] ?? member.role}
                                    </span>
                                    {member.coach?.invite_code && (
                                        <span className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded">
                                            {member.coach.invite_code}
                                        </span>
                                    )}
                                    {isAdmin && member.role !== 'org_owner' && (
                                        <RemoveCoachButton orgSlug={slug} memberId={member.id} />
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}

            {/* Pending invites */}
            {invited.length > 0 && (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 divide-y divide-border">
                    <div className="px-4 py-3">
                        <h2 className="text-sm font-semibold flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                            <Clock className="w-4 h-4" />
                            Pendientes ({invited.length})
                        </h2>
                    </div>
                    {invited.map(member => (
                        <div key={member.id} className="flex items-center gap-3 px-4 py-3">
                            <div className="w-9 h-9 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-500 font-bold text-sm shrink-0">
                                {member.coach?.full_name?.charAt(0)?.toUpperCase() ?? '?'}
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium truncate">{member.coach?.full_name ?? '—'}</p>
                                <p className="text-[11px] text-muted-foreground">
                                    Invitado {member.invited_at ? new Date(member.invited_at).toLocaleDateString('es-CL') : ''}
                                </p>
                            </div>
                            {isAdmin && (
                                <RemoveCoachButton orgSlug={slug} memberId={member.id} label="Cancelar" />
                            )}
                        </div>
                    ))}
                </div>
            )}

            {active.length === 0 && invited.length === 0 && (
                <p className="text-center text-sm text-muted-foreground py-8">
                    Sin coaches. Invita al primero arriba.
                </p>
            )}
        </div>
    )
}
