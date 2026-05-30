import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { RevokeStaffButton } from './_components/RevokeStaffButton'
import {
    Activity,
    CheckCircle2,
    CircleDashed,
    Crown,
    Eye,
    KeyRound,
    LockKeyhole,
    Mail,
    ShieldCheck,
    UserCog,
    Users,
} from 'lucide-react'
import { getOrgBySlug, getOrgMembers } from '../_data/org.queries'

export const metadata: Metadata = { title: 'Team & Access' }

interface Props {
    params: Promise<{ slug: string }>
}

const ROLE_MATRIX = [
    {
        role: 'Owner',
        description: 'Control total de la organizacion.',
        permissions: ['Dashboard', 'Staff', 'Brand', 'Pagos', 'Reportes', 'Audit'],
        icon: Crown,
    },
    {
        role: 'Admin',
        description: 'Operacion diaria sin ownership final.',
        permissions: ['Dashboard', 'Coaches', 'Alumnos', 'Asignaciones', 'Reportes'],
        icon: ShieldCheck,
    },
    {
        role: 'Operations',
        description: 'Gestiona carga, alumnos y seguimiento.',
        permissions: ['Coaches', 'Alumnos', 'Asignaciones', 'Check-ins'],
        icon: Activity,
    },
    {
        role: 'Brand Manager',
        description: 'Publica white-label y controla identidad.',
        permissions: ['Brand', 'Preview', 'Publish'],
        icon: UserCog,
    },
    {
        role: 'Analyst',
        description: 'Lee reportes sin modificar operacion.',
        permissions: ['Dashboard', 'Reportes', 'Export'],
        icon: Eye,
    },
]

function roleLabel(role: string) {
    if (role === 'org_owner') return 'Owner'
    if (role === 'org_admin') return 'Admin'
    if (role === 'coach') return 'Coach linked'
    return role
}

function initials(name: string | null | undefined) {
    return (name?.trim()?.charAt(0) || '?').toUpperCase()
}

export default async function OrgTeamPage({ params }: Props) {
    const { slug } = await params
    const org = await getOrgBySlug(slug)
    if (!org) redirect('/coach/dashboard')

    const members = await getOrgMembers(org.id)
    const enterpriseUsers = members.filter((member) => member.role !== 'coach')
    const linkedCoaches = members.filter((member) => member.role === 'coach')
    const pendingUsers = members.filter((member) => member.status === 'invited')

    return (
        <div className="min-h-full bg-zinc-950 text-zinc-100">
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 md:px-8 md:py-8">
                <section className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-2xl shadow-black/20 md:p-7">
                    <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(245,158,11,0.18),transparent_32%),radial-gradient(circle_at_88%_12%,rgba(14,165,233,0.10),transparent_28%)]"
                    />
                    <div className="relative grid gap-6 lg:grid-cols-[1fr_360px] lg:items-end">
                        <div>
                            <span className="inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-amber-300">
                                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                                Identity control plane
                            </span>
                            <h1 className="mt-3 max-w-3xl text-xl font-black tracking-tight text-white sm:text-3xl md:text-5xl">
                                Team & Access
                            </h1>
                            <p className="hidden sm:block mt-3 max-w-2xl text-sm leading-6 text-zinc-400 md:text-base">
                                Cuentas enterprise separadas de coaches y alumnos. Roles claros, permisos explicables y auditoria obligatoria para cada cambio sensible.
                            </p>
                        </div>

                        <div className="grid grid-cols-3 gap-2 rounded-2xl border border-zinc-800 bg-zinc-950/75 p-3">
                            {[
                                ['Enterprise', enterpriseUsers.length],
                                ['Coaches', linkedCoaches.length],
                                ['Pendientes', pendingUsers.length],
                            ].map(([label, value]) => (
                                <div key={label} className="rounded-xl bg-zinc-900 p-3 text-center">
                                    <p className="text-2xl font-black text-white">{value}</p>
                                    <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-500">{label}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                <section className="grid gap-5 xl:grid-cols-[1fr_420px]">
                    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
                        <div className="flex items-center gap-2">
                            <Users className="h-4 w-4 text-amber-300" aria-hidden="true" />
                            <h2 className="text-lg font-black text-white">Enterprise users</h2>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-zinc-500">
                            Esta lista representa operadores enterprise. Los coaches vinculados viven aparte y no obtienen acceso enterprise por defecto.
                        </p>

                        <div className="mt-5 overflow-hidden rounded-xl border border-zinc-800">
                            {enterpriseUsers.length > 0 ? (
                                enterpriseUsers.map((member) => {
                                    const displayName = member.coach?.full_name ?? (member.role === 'org_owner' ? 'Owner enterprise' : 'Admin enterprise')
                                    const isRevokable = member.role !== 'org_owner' && member.status !== 'revoked'
                                    const statusColor =
                                        member.status === 'active' ? 'text-emerald-300' :
                                        member.status === 'revoked' ? 'text-red-400' :
                                        'text-amber-300'
                                    return (
                                        <div key={member.id} className="grid gap-3 border-b border-zinc-800 bg-zinc-950/50 p-4 last:border-b-0 sm:grid-cols-[1fr_auto] sm:items-center lg:grid-cols-[1fr_120px_130px_auto] lg:items-center">
                                            <div className="flex min-w-0 items-center gap-3">
                                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-400/10 text-sm font-black text-amber-300">
                                                    {initials(displayName)}
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="truncate text-sm font-bold text-zinc-100">{displayName}</p>
                                                    <p className="truncate text-xs text-zinc-500">
                                                        {roleLabel(member.role)} · id {member.user_id.slice(0, 8)}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="hidden lg:block">
                                                <p className="text-xs text-zinc-500">Estado</p>
                                                <p className={`text-sm font-semibold ${statusColor}`}>
                                                    {member.status === 'active' ? 'Activo' :
                                                     member.status === 'revoked' ? 'Revocado' :
                                                     member.status === 'invited' ? 'Invitado' : member.status}
                                                </p>
                                            </div>
                                            <div className="hidden lg:flex items-center gap-1.5 rounded-full border border-zinc-700 px-2 py-1 text-xs font-semibold text-zinc-400 w-fit">
                                                <KeyRound className="h-3 w-3" aria-hidden="true" />
                                                MFA policy
                                            </div>
                                            <div className="flex items-center justify-end gap-2 sm:col-start-2 lg:col-start-auto">
                                                {/* Mobile-only status badge */}
                                                <span className={`lg:hidden text-xs font-semibold ${statusColor}`}>
                                                    {member.status === 'active' ? 'Activo' :
                                                     member.status === 'revoked' ? 'Revocado' :
                                                     member.status === 'invited' ? 'Invitado' : member.status}
                                                </span>
                                                {isRevokable && (
                                                    <RevokeStaffButton
                                                        orgSlug={slug}
                                                        memberId={member.id}
                                                        memberName={displayName}
                                                        memberRole={roleLabel(member.role)}
                                                    />
                                                )}
                                            </div>
                                        </div>
                                    )
                                })
                            ) : (
                                <div className="p-6 text-sm text-zinc-500">No hay staff enterprise adicional todavia.</div>
                            )}
                        </div>
                    </div>

                    <aside className="space-y-5">
                        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
                            <div className="flex items-center gap-2">
                                <LockKeyhole className="h-4 w-4 text-amber-300" aria-hidden="true" />
                                <h2 className="text-lg font-black text-white">Security posture</h2>
                            </div>
                            <div className="mt-4 space-y-3">
                                {[
                                    ['MFA required', 'Policy layer preparada'],
                                    ['Audit log', 'Obligatorio para mutations futuras'],
                                    ['Least privilege', 'Roles base antes de custom'],
                                    ['Coach isolation', 'Sin acceso enterprise automatico'],
                                ].map(([title, detail]) => (
                                    <div key={title} className="flex gap-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
                                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" aria-hidden="true" />
                                        <div>
                                            <p className="text-sm font-bold text-zinc-100">{title}</p>
                                            <p className="mt-0.5 text-xs leading-5 text-zinc-500">{detail}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>

                        <section className="rounded-2xl border border-amber-400/25 bg-amber-400/10 p-5">
                            <h2 className="text-lg font-black text-white">Estado de esta fase</h2>
                            <p className="mt-3 text-sm leading-6 text-amber-100/80">
                                Preview read-only listo. Crear usuarios, password temporal, permisos reales y audit events quedan para la fase de modelo RBAC.
                            </p>
                        </section>
                    </aside>
                </section>

                <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
                    <div className="flex items-center gap-2">
                        <CircleDashed className="h-4 w-4 text-sky-300" aria-hidden="true" />
                        <h2 className="text-lg font-black text-white">Role templates</h2>
                    </div>
                    <div className="mt-5 grid gap-3 lg:grid-cols-5">
                        {ROLE_MATRIX.map(({ role, description, permissions, icon: Icon }) => (
                            <div key={role} className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
                                <Icon className="h-5 w-5 text-amber-300" aria-hidden="true" />
                                <h3 className="mt-4 text-sm font-black text-white">{role}</h3>
                                <p className="mt-2 min-h-10 text-xs leading-5 text-zinc-500">{description}</p>
                                <div className="mt-4 flex flex-wrap gap-1.5">
                                    {permissions.map((permission) => (
                                        <span key={permission} className="rounded-full border border-zinc-700 px-2 py-1 text-[10px] font-semibold text-zinc-400">
                                            {permission}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            </div>
        </div>
    )
}

