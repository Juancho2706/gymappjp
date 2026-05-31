import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import Image from 'next/image'
import {
    ArrowRight,
    BadgeCheck,
    CheckCircle2,
    ClipboardList,
    Dumbbell,
    FileText,
    KeyRound,
    Megaphone,
    Package,
    Palette,
    Salad,
    ShieldCheck,
    TrendingUp,
    UserCheck,
    Users,
} from 'lucide-react'
import { getOrgAuditLogs, getOrgBySlug, getOrgClients, getOrgMembers, getOrgStats } from '../_data/org.queries'
import { orgRoleCan } from '@/domain/org/permissions'
import { ProofPackPdfButton } from './_components/ProofPackPdfButton'

export const metadata: Metadata = { title: 'Proof Pack' }

interface Props {
    params: Promise<{ slug: string }>
}

function pct(value: number, total: number) {
    if (total <= 0) return 0
    return Math.round((value / total) * 100)
}

const CAPABILITIES = [
    { label: 'Dashboard command center', icon: TrendingUp },
    { label: 'Multi-coach management', icon: Users },
    { label: 'Asignaciones alumno-coach', icon: UserCheck },
    { label: 'Pagos operacionales', icon: BadgeCheck },
    { label: 'Brand Studio white-label', icon: Palette },
    { label: 'Audit log exportable', icon: FileText },
    { label: 'Programas de entrenamiento', icon: Dumbbell },
    { label: 'Biblioteca nutricional', icon: Salad },
    { label: 'Check-in monitoring', icon: ClipboardList },
    { label: 'Novedades enterprise', icon: Megaphone },
    { label: 'RBAC por rol', icon: ShieldCheck },
    { label: 'MFA enforcement', icon: KeyRound },
]

export default async function OrgProofPackPage({ params }: Props) {
    const { slug } = await params
    const org = await getOrgBySlug(slug)
    if (!org) redirect('/coach/dashboard')
    if (!orgRoleCan(org.myRole, 'org.dashboard.view')) redirect(`/org/${slug}`)

    const [stats, members, clients, auditLogs] = await Promise.all([
        getOrgStats(org.id),
        getOrgMembers(org.id),
        getOrgClients(org.id),
        getOrgAuditLogs(org.id, {}, 50),
    ])

    const activeMembers = members.filter(m => m.status === 'active')
    const activeCoaches = activeMembers.filter(m => m.role === 'coach').length
    const activeStaff = activeMembers.filter(m => m.role !== 'coach').length
    const activeClients = clients.filter(c => c.is_active !== false).length
    const assignedClients = clients.filter(c => c.is_active !== false && c.coach_id).length
    const assignmentRate = pct(assignedClients, activeClients)
    const healthScore = org.last_health_score ?? 0

    const pdfMetrics = [
        { label: 'Alumnos activos', value: String(activeClients) },
        { label: 'Coaches enterprise', value: String(activeCoaches) },
        { label: 'Salud operacional', value: `${healthScore}/100` },
        { label: 'Tasa de asignación', value: `${assignmentRate}%` },
        { label: 'Eventos auditados', value: String(auditLogs.length) },
        { label: 'Staff enterprise', value: String(activeStaff) },
    ]

    return (
        <div className="min-h-full bg-zinc-950 text-zinc-100">
            <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-5 md:px-8 md:py-8">

                {/* Hero: org branding */}
                <section className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl shadow-black/20 md:p-10">
                    <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0"
                        style={{
                            background: `radial-gradient(circle at 20% 0%, ${org.primary_color ?? '#F59E0B'}28, transparent 40%), radial-gradient(circle at 85% 10%, rgba(245,158,11,0.12), transparent 30%)`,
                        }}
                    />
                    <div className="relative flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex items-start gap-4">
                            {org.logo_url ? (
                                <Image
                                    src={org.logo_url}
                                    alt={`${org.name} logo`}
                                    width={64}
                                    height={64}
                                    className="h-16 w-16 rounded-xl object-contain bg-zinc-800 p-1 shrink-0"
                                />
                            ) : (
                                <div
                                    className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl text-xl font-black text-white"
                                    style={{ backgroundColor: org.primary_color ?? '#F59E0B' }}
                                >
                                    {org.name.charAt(0).toUpperCase()}
                                </div>
                            )}
                            <div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-xs font-bold text-amber-300">
                                        <Package className="h-3 w-3" />
                                        {org.plan.toUpperCase()}
                                    </span>
                                    <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1 text-xs font-bold text-emerald-300">
                                        {org.status}
                                    </span>
                                </div>
                                <h1 className="mt-2 text-2xl font-black tracking-tight text-white md:text-4xl">
                                    {org.name}
                                </h1>
                                <p className="mt-1 text-sm text-zinc-400">
                                    EVA Enterprise · {org.slug}
                                </p>
                            </div>
                        </div>
                        <div className="shrink-0">
                            <ProofPackPdfButton
                                orgName={org.name}
                                orgSlug={org.slug}
                                primaryColor={org.primary_color}
                                logoUrl={org.logo_url}
                                plan={org.plan}
                                metrics={pdfMetrics}
                                capabilities={CAPABILITIES.map(c => c.label)}
                                activeClients={activeClients}
                                activeCoaches={activeCoaches}
                                auditCount={auditLogs.length}
                            />
                        </div>
                    </div>
                </section>

                {/* Key metrics */}
                <section className="grid grid-cols-2 gap-3 md:grid-cols-3">
                    {pdfMetrics.map(({ label, value }) => (
                        <div key={label} className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4 text-center">
                            <p className="text-2xl font-black text-white">{value}</p>
                            <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-500">{label}</p>
                        </div>
                    ))}
                </section>

                {/* Platform capabilities */}
                <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
                    <h2 className="text-lg font-black text-white mb-4">Capacidades habilitadas</h2>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {CAPABILITIES.map(({ label, icon: Icon }) => (
                            <div key={label} className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950/60 px-4 py-2.5">
                                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-300" />
                                <Icon className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                                <span className="text-sm text-zinc-200">{label}</span>
                            </div>
                        ))}
                    </div>
                </section>

                {/* Security posture */}
                <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
                    <div className="flex items-center gap-2 mb-4">
                        <ShieldCheck className="h-4 w-4 text-amber-300" />
                        <h2 className="text-lg font-black text-white">Seguridad y confianza</h2>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                        {[
                            ['Tenant isolation', 'Datos aislados por org_id + Row Level Security en todas las tablas'],
                            ['RBAC granular', 'Roles owner / admin / ops / analyst / brand_manager con permisos por recurso'],
                            ['MFA enforcement', 'Administradores con TOTP obligatorio antes de acceder al panel'],
                            ['Audit log', `${auditLogs.length} eventos auditados con checksum SHA-256 exportable`],
                            ['First-login security', 'Staff creado con flag de cambio de contraseña obligatorio en primer acceso'],
                            ['Server-side auth', 'Toda mutation pasa por guards server-side; UI no es autorización'],
                        ].map(([title, detail]) => (
                            <div key={title} className="flex items-start gap-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
                                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                                <div>
                                    <p className="text-sm font-bold text-zinc-100">{title}</p>
                                    <p className="mt-0.5 text-xs leading-5 text-zinc-500">{detail}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                {/* Actions */}
                <div className="flex flex-wrap gap-3">
                    <Link
                        href={`/org/${slug}/trust`}
                        className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 px-4 py-2.5 text-sm font-semibold text-zinc-300 hover:bg-zinc-800 transition-colors"
                    >
                        <ShieldCheck className="h-4 w-4" />
                        Ver Trust Center completo
                        <ArrowRight className="h-4 w-4" />
                    </Link>
                    <Link
                        href={`/org/${slug}/reports`}
                        className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 px-4 py-2.5 text-sm font-semibold text-zinc-300 hover:bg-zinc-800 transition-colors"
                    >
                        <TrendingUp className="h-4 w-4" />
                        Ver reportes operacionales
                        <ArrowRight className="h-4 w-4" />
                    </Link>
                </div>

            </div>
        </div>
    )
}
