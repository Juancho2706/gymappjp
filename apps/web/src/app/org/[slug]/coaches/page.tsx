import { redirect } from 'next/navigation'
import { orgRoleCan } from '@/domain/org/permissions'
import Link from 'next/link'
import type { Metadata } from 'next'
import {
    Activity,
    AlertTriangle,
    ArrowRight,
    Clock,
    Crown,
    QrCode,
    Shield,
    ShieldCheck,
    User,
    UserCheck,
    Users,
    Zap,
} from 'lucide-react'
import { getOrgBySlug, getOrgClients, getOrgMembers } from '../_data/org.queries'
import { CoachEnterpriseActions } from './_components/CoachEnterpriseActions'
import { CoachActionsMenu } from './_components/CoachActionsMenu'
import { CoachQRButton } from './_components/CoachQRButton'
import { CreateEnterpriseCoachForm } from './_components/CreateEnterpriseCoachForm'
import { InviteCoachForm } from './_components/InviteCoachForm'
import { RemoveCoachButton } from './_components/RemoveCoachButton'
import { RemoveCoachDialog } from './_components/RemoveCoachDialog'

export const metadata: Metadata = { title: 'Equipo' }

interface Props {
    params: Promise<{ slug: string }>
}

const ROLE_ICONS = {
    org_owner: Crown,
    org_admin: Shield,
    coach: User,
}

const ROLE_LABELS = {
    org_owner: 'Owner',
    org_admin: 'Admin enterprise',
    coach: 'Coach',
}

function initials(name: string | null | undefined) {
    return (name?.trim()?.charAt(0) || '?').toUpperCase()
}

function healthTone(score: number | null | undefined) {
    if (score == null) return 'border-zinc-700 bg-zinc-900 text-zinc-400'
    if (score >= 75) return 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300'
    if (score >= 45) return 'border-amber-400/25 bg-amber-400/10 text-amber-300'
    return 'border-red-400/25 bg-red-400/10 text-red-300'
}

function loadTone(count: number, targetLoad: number) {
    if (count === 0) return 'border-zinc-700 bg-zinc-900 text-zinc-400'
    if (count > targetLoad * 1.25) return 'border-red-400/25 bg-red-400/10 text-red-300'
    if (count > targetLoad) return 'border-amber-400/25 bg-amber-400/10 text-amber-300'
    return 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300'
}

export default async function OrgCoachesPage({ params }: Props) {
    const { slug } = await params
    const org = await getOrgBySlug(slug)
    if (!org) redirect('/coach/dashboard')
    if (!orgRoleCan(org.myRole, 'org.coaches.view')) redirect(`/org/${slug}`)

    const isAdmin = orgRoleCan(org.myRole, 'org.coaches.invite')
    const [members, clients] = await Promise.all([
        getOrgMembers(org.id),
        getOrgClients(org.id),
    ])

    const activeMembers = members.filter(member => member.status === 'active')
    const pendingMembers = members.filter(member => member.status === 'invited')
    const activeCoaches = activeMembers.filter(member => member.role === 'coach' && member.coach_id && member.coach)
    const enterpriseStaff = activeMembers.filter(member => member.role !== 'coach')
    const activeClients = clients.filter(client => client.is_active !== false)
    const unassignedClients = activeClients.filter(client => !client.coach_id)
    const clientCountByCoach = clients.reduce<Record<string, number>>((acc, client) => {
        if (!client.coach_id || client.is_active === false) return acc
        acc[client.coach_id] = (acc[client.coach_id] ?? 0) + 1
        return acc
    }, {})
    const targetLoad = Math.max(1, Math.ceil(activeClients.length / Math.max(1, activeCoaches.length)))
    const overloadedCoaches = activeCoaches.filter(member => (clientCountByCoach[member.coach_id!] ?? 0) > targetLoad * 1.25)
    const emptyCoaches = activeCoaches.filter(member => (clientCountByCoach[member.coach_id!] ?? 0) === 0)
    const usedSeats = activeMembers.length
    const seatUsage = Math.round((usedSeats / Math.max(1, org.seats_included)) * 100)
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? ''

    return (
        <div className="min-h-full bg-zinc-950 text-zinc-100">
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 md:px-8 md:py-8">
                <section className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-2xl shadow-black/20 md:p-7">
                    <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_16%_0%,rgba(168,85,247,0.18),transparent_32%),radial-gradient(circle_at_86%_10%,rgba(14,165,233,0.12),transparent_30%)]"
                    />
                    <div className="relative grid gap-6 xl:grid-cols-[1fr_460px] xl:items-end">
                        <div>
                            <span className="inline-flex items-center gap-2 rounded-full border border-violet-400/30 bg-violet-400/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-violet-300">
                                <Users className="h-3.5 w-3.5" aria-hidden="true" />
                                Equipo enterprise
                            </span>
                            <h1 className="mt-3 max-w-3xl text-xl font-black tracking-tight text-white sm:text-3xl md:text-5xl">
                                Coaches, staff y capacidad
                            </h1>
                            <p className="hidden sm:block mt-3 max-w-2xl text-sm leading-6 text-zinc-400 md:text-base">
                                Controla quien opera con alumnos, quien administra la plataforma y donde se esta cargando de mas el equipo.
                            </p>
                            <div className="mt-5 flex flex-wrap gap-2">
                                <Link
                                    href={`/org/${slug}/team`}
                                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-zinc-700 px-4 text-sm font-bold text-zinc-200 transition hover:bg-zinc-800"
                                >
                                    <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                                    Ver staff enterprise
                                </Link>
                                <Link
                                    href={`/org/${slug}/assignments`}
                                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-violet-400 px-4 text-sm font-black text-zinc-950 transition hover:bg-violet-300"
                                >
                                    Revisar asignaciones
                                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                                </Link>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 rounded-2xl border border-zinc-800 bg-zinc-950/75 p-3 md:grid-cols-4">
                            {[
                                ['Coaches', activeCoaches.length],
                                ['Staff', enterpriseStaff.length],
                                ['Seats', `${usedSeats}/${org.seats_included}`],
                                ['Sin coach', unassignedClients.length],
                            ].map(([label, value]) => (
                                <div key={label} className="rounded-xl bg-zinc-900 p-3 text-center">
                                    <p className="text-2xl font-black text-white">{value}</p>
                                    <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-500">{label}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                <section className="grid gap-3 md:grid-cols-4">
                    {([
                        [Activity, 'Uso seats', `${seatUsage}%`, `${Math.max(0, org.seats_included - usedSeats)} disponibles`],
                        [AlertTriangle, 'Sobrecarga', overloadedCoaches.length, 'coaches sobre target'],
                        [Zap, 'Sin carga', emptyCoaches.length, 'coaches sin alumnos activos'],
                        [Clock, 'Pendientes', pendingMembers.length, 'invitaciones abiertas'],
                    ] as const).map(([Icon, title, value, detail]) => (
                        <div key={title as string} className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
                            <div className="flex items-center justify-between gap-3">
                                <Icon className="h-5 w-5 text-violet-300" aria-hidden="true" />
                                <p className="text-2xl font-black text-white">{value as string | number}</p>
                            </div>
                            <h2 className="mt-4 text-sm font-black text-white">{title as string}</h2>
                            <p className="mt-1 text-xs leading-5 text-zinc-500">{detail as string}</p>
                        </div>
                    ))}
                </section>

                {isAdmin && (
                    <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
                        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
                            <div className="flex items-center gap-2">
                                <UserCheck className="h-4 w-4 text-emerald-300" aria-hidden="true" />
                                <h2 className="text-lg font-black text-white">Crear cuenta enterprise</h2>
                            </div>
                            <p className="mt-2 text-sm leading-6 text-zinc-500">
                                Coach crea app de coach gestionada por la empresa. Admin crea staff enterprise sin acceso al coach dashboard.
                            </p>
                            <div className="mt-5">
                                <CreateEnterpriseCoachForm orgSlug={slug} />
                            </div>
                        </div>

                        <div className="rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/40 p-5">
                            <div className="flex items-center gap-2">
                                <QrCode className="h-4 w-4 text-sky-300" aria-hidden="true" />
                                <h2 className="text-lg font-black text-white">Vincular coach existente</h2>
                            </div>
                            <p className="mt-2 text-sm leading-6 text-zinc-500">
                                Flujo secundario para migrar un coach EVA que ya existe. Mantener controlado para no mezclar billing standalone sin revisar.
                            </p>
                            <details className="mt-5 rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
                                <summary className="cursor-pointer text-sm font-bold text-zinc-200">
                                    Abrir formulario
                                </summary>
                                <div className="mt-4">
                                    <InviteCoachForm orgSlug={slug} />
                                </div>
                            </details>
                        </div>
                    </section>
                )}

                <section className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
                    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <h2 className="text-lg font-black text-white">Coaches operativos</h2>
                                <p className="mt-1 text-sm text-zinc-500">Cuentas que atienden alumnos y heredan white-label enterprise.</p>
                            </div>
                            <span className="rounded-full border border-zinc-700 px-3 py-1 text-xs font-bold text-zinc-400">
                                Target {targetLoad} alumnos activos/coach
                            </span>
                        </div>

                        <div className="mt-5 overflow-hidden rounded-xl border border-zinc-800">
                            {activeCoaches.length > 0 ? (
                                activeCoaches.map(member => {
                                    const coachId = member.coach_id!
                                    const assigned = clientCountByCoach[coachId] ?? 0
                                    const RoleIcon = ROLE_ICONS[member.role as keyof typeof ROLE_ICONS] ?? User
                                    const otherCoaches = activeCoaches
                                        .filter(item => item.coach_id && item.coach_id !== coachId)
                                        .map(item => ({ id: item.coach_id!, name: item.coach?.full_name ?? 'Coach' }))

                                    return (
                                        <div key={member.id} className="flex items-center gap-3 border-b border-zinc-800 bg-zinc-950/50 p-3 last:border-b-0 lg:grid lg:gap-4 lg:grid-cols-[1fr_110px_110px_1.1fr] lg:items-center lg:p-4">
                                            <div className="flex min-w-0 flex-1 items-center gap-3">
                                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-400/10 text-sm font-black text-violet-300 lg:h-11 lg:w-11">
                                                    {initials(member.coach?.full_name)}
                                                </div>
                                                <div className="min-w-0">
                                                    <Link
                                                        href={`/org/${slug}/coaches/${coachId}`}
                                                        className="block truncate text-sm font-black text-white transition hover:text-violet-300"
                                                    >
                                                        {member.coach?.full_name ?? 'Coach sin nombre'}
                                                    </Link>
                                                    {/* Mobile: inline stats */}
                                                    <p className="lg:hidden mt-0.5 truncate text-xs text-zinc-500">
                                                        <span className={loadTone(assigned, targetLoad).includes('emerald') ? 'text-emerald-400' : loadTone(assigned, targetLoad).includes('amber') ? 'text-amber-400' : 'text-red-400'}>
                                                            {assigned} alumnos
                                                        </span>
                                                        {' · '}
                                                        <span>{member.last_health_score != null ? `${member.last_health_score}%` : 'N/D'}</span>
                                                    </p>
                                                    <p className="hidden lg:block mt-1 truncate text-xs text-zinc-500">{member.coach?.slug ?? 'Sin slug'}</p>
                                                </div>
                                            </div>

                                            <div className="hidden lg:block">
                                                <p className="text-xs text-zinc-500">Alumnos</p>
                                                <span className={`mt-1 inline-flex rounded-full border px-2 py-1 text-xs font-black ${loadTone(assigned, targetLoad)}`}>
                                                    {assigned}
                                                </span>
                                            </div>

                                            <div className="hidden lg:block">
                                                <p className="text-xs text-zinc-500">Health</p>
                                                <span className={`mt-1 inline-flex rounded-full border px-2 py-1 text-xs font-black ${healthTone(member.last_health_score)}`}>
                                                    {member.last_health_score != null ? `${member.last_health_score}%` : 'N/D'}
                                                </span>
                                            </div>

                                            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 lg:justify-end">
                                                {/* Mobile: ⋯ contextual menu replaces all inline actions */}
                                                <CoachActionsMenu
                                                    orgSlug={slug}
                                                    memberId={member.id}
                                                    coachId={coachId}
                                                    coachName={member.coach?.full_name ?? 'Coach'}
                                                    role={member.role}
                                                    clientCount={assigned}
                                                    otherCoaches={otherCoaches}
                                                    inviteCode={member.coach?.invite_code ?? null}
                                                    canManageRole={isAdmin}
                                                    coachSlug={member.coach?.slug ?? undefined}
                                                />

                                                {/* Desktop: inline actions (hidden on mobile) */}
                                                <span className="hidden lg:inline-flex items-center gap-1 rounded-full border border-zinc-700 px-2 py-1 text-xs font-semibold text-zinc-400">
                                                    <RoleIcon className="h-3 w-3" aria-hidden="true" />
                                                    {ROLE_LABELS[member.role as keyof typeof ROLE_LABELS] ?? member.role}
                                                </span>
                                                {member.coach?.invite_code && (
                                                    <span className="hidden lg:inline-flex items-center gap-1">
                                                        <span className="rounded-md bg-zinc-800 px-2 py-1 font-mono text-[10px] text-zinc-300">
                                                            {member.coach.invite_code}
                                                        </span>
                                                        <CoachQRButton
                                                            inviteCode={member.coach.invite_code}
                                                            coachName={member.coach.full_name ?? 'Coach'}
                                                            siteUrl={siteUrl}
                                                        />
                                                    </span>
                                                )}
                                                {isAdmin && (
                                                    <span className="hidden lg:inline-flex items-center gap-2">
                                                        <CoachEnterpriseActions
                                                            orgSlug={slug}
                                                            memberId={member.id}
                                                            coachId={coachId}
                                                            role={member.role}
                                                            canManageRole={org.myRole === 'org_owner'}
                                                        />
                                                        {member.role !== 'org_owner' && (
                                                            <RemoveCoachDialog
                                                                orgSlug={slug}
                                                                memberId={member.id}
                                                                coachId={coachId}
                                                                coachName={member.coach?.full_name ?? 'Coach'}
                                                                clientCount={assigned}
                                                                otherCoaches={otherCoaches}
                                                            />
                                                        )}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    )
                                })
                            ) : (
                                <div className="p-6 text-sm text-zinc-500">Sin coaches activos. Crea el primero arriba.</div>
                            )}
                        </div>
                    </div>

                    <aside className="space-y-5">
                        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
                            <div className="flex items-center gap-2">
                                <ShieldCheck className="h-4 w-4 text-sky-300" aria-hidden="true" />
                                <h2 className="text-lg font-black text-white">Staff enterprise</h2>
                            </div>
                            <p className="mt-2 text-sm leading-6 text-zinc-500">
                                Usuarios que administran la plataforma enterprise. No son coaches ni alumnos.
                            </p>
                            <div className="mt-4 space-y-3">
                                {enterpriseStaff.map(member => {
                                    const RoleIcon = ROLE_ICONS[member.role as keyof typeof ROLE_ICONS] ?? Shield
                                    const displayName = member.coach?.full_name ?? (member.role === 'org_owner' ? 'Owner enterprise' : 'Admin enterprise')
                                    return (
                                        <div key={member.id} className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
                                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-400/10 text-sm font-black text-sky-300">
                                                {initials(displayName)}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate text-sm font-bold text-zinc-100">{displayName}</p>
                                                <p className="mt-0.5 text-xs text-zinc-500">{ROLE_LABELS[member.role as keyof typeof ROLE_LABELS] ?? member.role}</p>
                                            </div>
                                            <RoleIcon className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden="true" />
                                            {isAdmin && member.role !== 'org_owner' && (
                                                <RemoveCoachButton orgSlug={slug} memberId={member.id} label="Suspender" />
                                            )}
                                        </div>
                                    )
                                })}
                                {enterpriseStaff.length === 0 && (
                                    <p className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 text-sm text-zinc-500">
                                        Sin staff enterprise activo.
                                    </p>
                                )}
                            </div>
                        </section>

                        {pendingMembers.length > 0 && (
                            <section className="rounded-2xl border border-amber-400/25 bg-amber-400/10 p-5">
                                <div className="flex items-center gap-2">
                                    <Clock className="h-4 w-4 text-amber-200" aria-hidden="true" />
                                    <h2 className="text-lg font-black text-white">Pendientes</h2>
                                </div>
                                <div className="mt-4 space-y-2">
                                    {pendingMembers.map(member => (
                                        <div key={member.id} className="flex items-center justify-between gap-3 rounded-xl border border-amber-400/20 bg-zinc-950/40 p-3">
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-bold text-white">{member.coach?.full_name ?? 'Invitacion pendiente'}</p>
                                                <p className="text-xs text-amber-100/70">
                                                    {member.invited_at ? new Date(member.invited_at).toLocaleDateString('es-CL') : 'Sin fecha'}
                                                </p>
                                            </div>
                                            {isAdmin && <RemoveCoachButton orgSlug={slug} memberId={member.id} label="Cancelar" />}
                                        </div>
                                    ))}
                                </div>
                            </section>
                        )}

                        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
                            <h2 className="text-lg font-black text-white">Guardrails</h2>
                            <div className="mt-4 space-y-3">
                                {[
                                    ['Staff separado', 'Admins enterprise no crean app coach ni billing propio.'],
                                    ['Brand heredado', 'Coaches enterprise usan white-label de la empresa.'],
                                    ['Audit obligatorio', 'Cambios de rol, password y remocion quedan auditados.'],
                                ].map(([title, detail]) => (
                                    <div key={title} className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
                                        <p className="text-sm font-bold text-zinc-100">{title}</p>
                                        <p className="mt-1 text-xs leading-5 text-zinc-500">{detail}</p>
                                    </div>
                                ))}
                            </div>
                        </section>
                    </aside>
                </section>
            </div>
        </div>
    )
}
