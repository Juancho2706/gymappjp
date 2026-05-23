import Link from 'next/link'
import {
    AlertTriangle,
    ArrowRight,
    BadgeCheck,
    Building2,
    CheckCircle2,
    Clock3,
    Dumbbell,
    Palette,
    ShieldCheck,
    TrendingUp,
    UserCheck,
    Users,
} from 'lucide-react'
import type { OrgClient, OrgMember, OrgWithMembership } from '../../_data/org.queries'

type OrgStats = {
    totalCoaches: number
    pendingInvites: number
    totalClients: number
    activeClients: number
}

interface EnterpriseDashboardHomeProps {
    org: OrgWithMembership
    slug: string
    stats: OrgStats | null
    members: OrgMember[]
    clients: OrgClient[]
}

function percentage(value: number, total: number) {
    if (total <= 0) return 0
    return Math.round((value / total) * 100)
}

function initials(name: string | null | undefined) {
    return (name?.trim()?.charAt(0) || '?').toUpperCase()
}

export function EnterpriseDashboardHome({
    org,
    slug,
    stats,
    members,
    clients,
}: EnterpriseDashboardHomeProps) {
    const activeMembers = members.filter((member) => member.status === 'active')
    const pendingMembers = members.filter((member) => member.status === 'invited')
    const unassignedClients = clients.filter((client) => !client.coach_id)
    const inactiveClients = clients.filter((client) => client.is_active === false)
    const activeClients = stats?.activeClients ?? clients.filter((client) => client.is_active !== false).length
    const totalClients = stats?.totalClients ?? clients.length
    const totalCoaches = stats?.totalCoaches ?? activeMembers.length
    const activeRate = percentage(activeClients, totalClients)
    const seatRate = percentage(totalCoaches, org.seats_included)
    const healthScore = org.last_health_score ?? Math.max(42, Math.min(96, Math.round((activeRate + Math.min(seatRate, 100)) / 2)))
    const riskCount = unassignedClients.length + inactiveClients.length + pendingMembers.length

    const coachLoad = activeMembers
        .filter((member) => member.coach_id)
        .map((member) => {
            const assigned = clients.filter((client) => client.coach_id === member.coach_id).length
            return { member, assigned }
        })
        .sort((a, b) => b.assigned - a.assigned)
        .slice(0, 5)

    const actions = [
        {
            label: 'Asignar alumnos sin coach',
            detail: `${unassignedClients.length} alumnos esperan responsable`,
            href: `/org/${slug}/clients?view=unassigned`,
            severity: unassignedClients.length > 0 ? 'amber' : 'ok',
        },
        {
            label: 'Revisar alumnos inactivos',
            detail: `${inactiveClients.length} alumnos marcados como inactivos`,
            href: `/org/${slug}/clients?view=inactive`,
            severity: inactiveClients.length > 0 ? 'rose' : 'ok',
        },
        {
            label: 'Completar invitaciones pendientes',
            detail: `${pendingMembers.length} miembros todavia no ingresan`,
            href: `/org/${slug}/coaches`,
            severity: pendingMembers.length > 0 ? 'amber' : 'ok',
        },
        {
            label: 'Configurar white-label enterprise',
            detail: 'Prepara logo, colores y loader para coaches y alumnos',
            href: `/org/${slug}/brand`,
            severity: org.logo_url ? 'ok' : 'amber',
        },
    ]

    return (
        <div className="min-h-full bg-zinc-950 text-zinc-100">
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 md:px-8 md:py-8">
                <section className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-2xl shadow-black/20 md:p-7">
                    <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(245,158,11,0.18),transparent_32%),radial-gradient(circle_at_85%_0%,rgba(16,185,129,0.12),transparent_30%)]"
                    />
                    <div className="relative grid gap-6 lg:grid-cols-[1fr_360px] lg:items-end">
                        <div>
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-amber-300">
                                    <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
                                    Command center
                                </span>
                                <span className="rounded-full border border-zinc-700 bg-zinc-950/60 px-3 py-1 text-xs text-zinc-400">
                                    {org.plan} · {org.status}
                                </span>
                            </div>
                            <h1 className="mt-5 max-w-3xl text-3xl font-black tracking-tight text-white md:text-5xl">
                                {org.name}
                            </h1>
                            <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400 md:text-base">
                                Salud operacional, coaches, alumnos y marca enterprise en un solo lugar.
                            </p>
                        </div>

                        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
                            <div className="flex items-end justify-between">
                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Health score</p>
                                    <p className="mt-2 text-5xl font-black text-white">{healthScore}</p>
                                </div>
                                <div className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-emerald-300">
                                    <TrendingUp className="h-4 w-4" aria-hidden="true" />
                                    {activeRate}% activos
                                </div>
                            </div>
                            <div className="mt-4 h-2 overflow-hidden rounded-full bg-zinc-800">
                                <div
                                    className="h-full rounded-full bg-gradient-to-r from-amber-500 via-emerald-400 to-sky-400"
                                    style={{ width: `${Math.min(100, healthScore)}%` }}
                                />
                            </div>
                        </div>
                    </div>
                </section>

                <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {[
                        { label: 'Coaches activos', value: totalCoaches, helper: `${org.seats_included} seats incluidos`, icon: Users },
                        { label: 'Alumnos activos', value: activeClients, helper: `${totalClients} en el pool`, icon: UserCheck },
                        { label: 'Alumnos sin coach', value: unassignedClients.length, helper: 'requieren accion', icon: AlertTriangle },
                        { label: 'Riesgos abiertos', value: riskCount, helper: 'cola operacional', icon: Clock3 },
                    ].map(({ label, value, helper, icon: Icon }) => (
                        <div key={label} className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">{label}</p>
                                    <p className="mt-3 text-3xl font-black text-white">{value}</p>
                                </div>
                                <div className="rounded-lg border border-zinc-700 bg-zinc-950 p-2 text-amber-300">
                                    <Icon className="h-4 w-4" aria-hidden="true" />
                                </div>
                            </div>
                            <p className="mt-2 text-xs text-zinc-500">{helper}</p>
                        </div>
                    ))}
                </section>

                <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
                    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                            <div>
                                <h2 className="text-lg font-black text-white">Coach performance</h2>
                                <p className="mt-1 text-sm text-zinc-500">Carga actual por coach enterprise.</p>
                            </div>
                            <Link href={`/org/${slug}/coaches`} className="inline-flex items-center gap-2 text-sm font-semibold text-amber-300 hover:text-amber-200">
                                Ver coaches
                                <ArrowRight className="h-4 w-4" aria-hidden="true" />
                            </Link>
                        </div>

                        <div className="mt-5 overflow-hidden rounded-xl border border-zinc-800">
                            {coachLoad.length > 0 ? (
                                coachLoad.map(({ member, assigned }) => {
                                    const capacity = Math.min(100, percentage(assigned, Math.max(1, Math.ceil((totalClients || 1) / Math.max(1, totalCoaches)))))
                                    return (
                                        <div key={member.id} className="grid gap-3 border-b border-zinc-800 bg-zinc-950/40 p-4 last:border-b-0 md:grid-cols-[1fr_120px_160px] md:items-center">
                                            <div className="flex min-w-0 items-center gap-3">
                                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-400/10 text-sm font-black text-amber-300">
                                                    {initials(member.coach?.full_name)}
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="truncate text-sm font-bold text-zinc-100">{member.coach?.full_name ?? 'Coach enterprise'}</p>
                                                    <p className="truncate text-xs text-zinc-500">{member.coach?.slug ?? member.role}</p>
                                                </div>
                                            </div>
                                            <div>
                                                <p className="text-xs text-zinc-500">Alumnos</p>
                                                <p className="text-sm font-bold text-zinc-100">{assigned}</p>
                                            </div>
                                            <div>
                                                <div className="flex items-center justify-between text-xs text-zinc-500">
                                                    <span>Capacidad</span>
                                                    <span>{capacity}%</span>
                                                </div>
                                                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-800">
                                                    <div className="h-full rounded-full bg-amber-400" style={{ width: `${capacity}%` }} />
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })
                            ) : (
                                <div className="p-6 text-sm text-zinc-500">Aun no hay coaches activos con alumnos asignados.</div>
                            )}
                        </div>
                    </section>

                    <aside className="space-y-5">
                        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
                            <h2 className="text-lg font-black text-white">Action queue</h2>
                            <div className="mt-4 space-y-3">
                                {actions.map((action) => (
                                    <Link
                                        key={action.label}
                                        href={action.href}
                                        className="group flex gap-3 rounded-xl border border-zinc-800 bg-zinc-950/50 p-3 transition hover:border-amber-400/40 hover:bg-zinc-950"
                                    >
                                        <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                                            action.severity === 'ok' ? 'bg-emerald-400/10 text-emerald-300' :
                                            action.severity === 'rose' ? 'bg-rose-400/10 text-rose-300' :
                                            'bg-amber-400/10 text-amber-300'
                                        }`}>
                                            {action.severity === 'ok' ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className="block text-sm font-bold text-zinc-100">{action.label}</span>
                                            <span className="mt-0.5 block text-xs leading-5 text-zinc-500">{action.detail}</span>
                                        </span>
                                        <ArrowRight className="mt-2 h-4 w-4 shrink-0 text-zinc-600 transition group-hover:text-amber-300" aria-hidden="true" />
                                    </Link>
                                ))}
                            </div>
                        </section>

                        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
                            <div className="flex items-center gap-2">
                                <Palette className="h-4 w-4 text-amber-300" aria-hidden="true" />
                                <h2 className="text-lg font-black text-white">White-label</h2>
                            </div>
                            <p className="mt-2 text-sm leading-6 text-zinc-500">
                                La marca enterprise se aplicara a coaches creados por la empresa y alumnos asociados.
                            </p>
                            <div className="mt-4 flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950/50 p-3">
                                <div
                                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-black text-white"
                                    style={{ backgroundColor: org.primary_color ?? '#F59E0B' }}
                                >
                                    {initials(org.name)}
                                </div>
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-bold text-zinc-100">{org.name}</p>
                                    <p className="text-xs text-zinc-500">{org.logo_url ? 'Logo configurado' : 'Usando fallback de marca'}</p>
                                </div>
                            </div>
                            <Link href={`/org/${slug}/brand`} className="mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 text-sm font-bold text-zinc-950 transition hover:bg-amber-400">
                                Abrir Brand Center
                                <ArrowRight className="h-4 w-4" aria-hidden="true" />
                            </Link>
                        </section>
                    </aside>
                </div>

                <section className="grid gap-4 lg:grid-cols-3">
                    {[
                        { title: 'Pagos alumnos', copy: 'Control operacional de pagado, pendiente y vencido sin checkout in-app.', href: `/org/${slug}/payments`, icon: BadgeCheck },
                        { title: 'Reportes', copy: 'Reportes semanales, performance por coach y alumnos en riesgo.', href: `/org/${slug}/reports`, icon: TrendingUp },
                        { title: 'Team & Access', copy: 'Cuentas enterprise separadas, permisos y auditoria por usuario.', href: `/org/${slug}/team`, icon: ShieldCheck },
                    ].map(({ title, copy, href, icon: Icon }) => (
                        <Link key={title} href={href} className="group rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5 transition hover:border-amber-400/40">
                            <Icon className="h-5 w-5 text-amber-300" aria-hidden="true" />
                            <h3 className="mt-4 text-base font-black text-white">{title}</h3>
                            <p className="mt-2 text-sm leading-6 text-zinc-500">{copy}</p>
                            <span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-zinc-400 transition group-hover:text-amber-300">
                                Ver modulo
                                <ArrowRight className="h-4 w-4" aria-hidden="true" />
                            </span>
                        </Link>
                    ))}
                </section>

                <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
                    <div className="flex items-center gap-2">
                        <Dumbbell className="h-4 w-4 text-emerald-300" aria-hidden="true" />
                        <h2 className="text-lg font-black text-white">Student risk radar</h2>
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                        {[...unassignedClients, ...inactiveClients].slice(0, 6).map((client) => (
                            <Link
                                key={`${client.id}-${client.coach_id ?? 'none'}`}
                                href={`/org/${slug}/clients?q=${encodeURIComponent(client.email ?? client.full_name ?? '')}`}
                                className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950/50 p-3 transition hover:border-amber-400/40"
                            >
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rose-400/10 text-sm font-black text-rose-300">
                                    {initials(client.full_name)}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-bold text-zinc-100">{client.full_name ?? 'Alumno'}</p>
                                    <p className="truncate text-xs text-zinc-500">
                                        {!client.coach_id ? 'Sin coach asignado' : 'Alumno inactivo'}
                                    </p>
                                </div>
                            </Link>
                        ))}
                        {unassignedClients.length === 0 && inactiveClients.length === 0 && (
                            <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4 text-sm text-zinc-500">
                                Sin alumnos en riesgo basico con los datos actuales.
                            </div>
                        )}
                    </div>
                </section>
            </div>
        </div>
    )
}

