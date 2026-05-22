'use client'

import { useState } from 'react'
import { Users, Plus, Mail, CheckCircle2, Clock, AlertCircle, MoreHorizontal } from 'lucide-react'
import { useDemoState, useDemoActions } from '../../_providers/DemoStateProvider'

const STATUS_CONFIG = {
    active: { label: 'Activo', color: 'text-emerald-500', bg: 'bg-emerald-500/10', icon: CheckCircle2 },
    invited: { label: 'Invitado', color: 'text-amber-500', bg: 'bg-amber-500/10', icon: Clock },
    pending: { label: 'Pendiente', color: 'text-muted-foreground', bg: 'bg-muted', icon: AlertCircle },
}

const ROLE_LABELS: Record<string, string> = {
    org_owner: 'Dueño',
    org_admin: 'Admin',
    coach: 'Coach',
}

export default function CoachesPage() {
    const { coaches, stats, org } = useDemoState()
    const actions = useDemoActions()
    const [showInviteForm, setShowInviteForm] = useState(false)
    const [inviteEmail, setInviteEmail] = useState('')

    const activeCoaches = coaches.filter(c => c.status === 'active')
    const invitedCoaches = coaches.filter(c => c.status === 'invited')
    const pendingCoaches = coaches.filter(c => c.status === 'pending')

    function handleInvite(e: React.FormEvent) {
        e.preventDefault()
        if (!inviteEmail.trim()) return
        actions.inviteCoach(inviteEmail)
        setInviteEmail('')
        setShowInviteForm(false)
    }

    return (
        <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-bold">Coaches</h1>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        {stats.totalCoaches} activos · {org.seats_included} seats incluidos
                    </p>
                </div>
                <button
                    onClick={() => setShowInviteForm(v => !v)}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-white transition-colors hover:opacity-90"
                    style={{ backgroundColor: '#0D9488' }}
                >
                    <Plus className="w-4 h-4" />
                    Invitar coach
                </button>
            </div>

            {/* Invite form */}
            {showInviteForm && (
                <div className="rounded-xl border border-teal-500/30 bg-teal-500/5 p-4">
                    <h3 className="text-sm font-semibold mb-3">Invitar coach por email</h3>
                    <form onSubmit={handleInvite} className="flex gap-2">
                        <input
                            type="email"
                            placeholder="coach@movida.cl"
                            value={inviteEmail}
                            onChange={e => setInviteEmail(e.target.value)}
                            className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/50"
                        />
                        <button
                            type="submit"
                            className="rounded-lg px-4 py-2 text-sm font-medium text-white"
                            style={{ backgroundColor: '#0D9488' }}
                        >
                            Enviar
                        </button>
                        <button
                            type="button"
                            onClick={() => setShowInviteForm(false)}
                            className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent"
                        >
                            Cancelar
                        </button>
                    </form>
                </div>
            )}

            {/* Seat usage bar */}
            <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Seats usados</span>
                    <span className="text-sm text-muted-foreground">{stats.totalCoaches} / {org.seats_included}</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                        className="h-full rounded-full"
                        style={{ width: `${(stats.totalCoaches / org.seats_included) * 100}%`, backgroundColor: '#0D9488' }}
                    />
                </div>
            </div>

            {/* Active coaches */}
            <CoachGroup title="Activos" coaches={activeCoaches} />
            {invitedCoaches.length > 0 && <CoachGroup title="Invitados (pendiente de aceptar)" coaches={invitedCoaches} />}
            {pendingCoaches.length > 0 && <CoachGroup title="Pendientes" coaches={pendingCoaches} />}
        </div>
    )
}

function CoachGroup({ title, coaches }: { title: string; coaches: ReturnType<typeof useDemoState>['coaches'] }) {
    return (
        <div>
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{title} ({coaches.length})</h2>
            <div className="rounded-xl border border-border bg-card divide-y divide-border">
                {coaches.map(coach => {
                    const statusConf = STATUS_CONFIG[coach.status]
                    const StatusIcon = statusConf.icon
                    return (
                        <div key={coach.id} className="flex items-center gap-3 p-4">
                            <div
                                className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
                                style={{ backgroundColor: '#0D9488' }}
                            >
                                {coach.full_name.charAt(0).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <p className="text-sm font-medium">{coach.full_name}</p>
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-500/10 text-violet-500 font-medium">
                                        {ROLE_LABELS[coach.role] ?? coach.role}
                                    </span>
                                </div>
                                <p className="text-[11px] text-muted-foreground">{coach.specialty}</p>
                                <p className="text-[11px] text-muted-foreground">{coach.email}</p>
                            </div>
                            <div className="hidden sm:flex flex-col items-end gap-1 shrink-0">
                                {coach.status === 'active' && (
                                    <div className="text-right">
                                        <span className="text-sm font-semibold">{coach.clients_count}</span>
                                        <p className="text-[10px] text-muted-foreground">alumnos</p>
                                    </div>
                                )}
                                <span className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium ${statusConf.bg} ${statusConf.color}`}>
                                    <StatusIcon className="w-2.5 h-2.5" />
                                    {statusConf.label}
                                </span>
                                {coach.invite_code && (
                                    <span className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                                        {coach.invite_code}
                                    </span>
                                )}
                            </div>
                            <button className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent">
                                <MoreHorizontal className="w-4 h-4" />
                            </button>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
