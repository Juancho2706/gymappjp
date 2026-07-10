import { redirect } from 'next/navigation'
import { orgRoleCan } from '@/domain/org/permissions'
import Link from 'next/link'
import type { Metadata } from 'next'
import {
    AlertTriangle,
    ArrowRight,
    BadgeDollarSign,
    Building2,
    CalendarClock,
    CheckCircle2,
    CreditCard,
    Database,
    KeyRound,
    LockKeyhole,
    Palette,
    ReceiptText,
    ShieldCheck,
    Users,
} from 'lucide-react'
import { getOrgBySlug, getOrgInvoices, getOrgMembers } from '../_data/org.queries'
import { OrgSettingsForm } from './_components/OrgSettingsForm'
import { OrgInvoiceList } from './_components/OrgInvoiceList'
import { SettingsAccordion } from './_components/SettingsAccordion'

export const metadata: Metadata = { title: 'Admin' }

interface Props {
    params: Promise<{ slug: string }>
}

function statusTone(status: string) {
    if (status === 'active') return 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300'
    if (status === 'trial') return 'border-sky-400/25 bg-sky-400/10 text-sky-300'
    if (status === 'past_due') return 'border-amber-400/25 bg-amber-400/10 text-amber-300'
    return 'border-zinc-700 bg-zinc-900 text-zinc-400'
}

function formatDate(value: string | null) {
    if (!value) return 'No definido'
    return new Date(value).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default async function OrgSettingsPage({ params }: Props) {
    const { slug } = await params
    const org = await getOrgBySlug(slug)
    if (!org) redirect('/coach/dashboard')

    const isAdmin = orgRoleCan(org.myRole, 'org.settings.edit')
    const [invoices, members] = await Promise.all([
        getOrgInvoices(org.id),
        getOrgMembers(org.id),
    ])

    const activeMembers = members.filter(member => member.status === 'active')
    const enterpriseUsers = activeMembers.filter(member => member.role !== 'coach')
    const activeCoaches = activeMembers.filter(member => member.role === 'coach' && member.coach_id)
    const usedSeats = activeCoaches.length
    const seatUsage = Math.round((usedSeats / Math.max(1, org.seats_included)) * 100)
    const latestInvoice = invoices[0] ?? null
    const hasBillingRisk = latestInvoice?.status === 'overdue' || latestInvoice?.status === 'pending'
    // Server component renders once per request; Date.now() is deterministic here.
    // eslint-disable-next-line react-hooks/purity
    const trialEndsSoon = org.trial_ends_at ? new Date(org.trial_ends_at).getTime() - Date.now() < 1000 * 60 * 60 * 24 * 14 : false

    const guardrails = [
        'Cuentas enterprise separadas de coaches y alumnos.',
        'Coaches enterprise no manejan billing ni marca propia del negocio.',
        'White-label publicado afecta coaches enterprise y alumnos enterprise.',
        'Cambios sensibles deben quedar auditados antes de automatizar bulk actions.',
    ]

    return (
        <div className="min-h-full bg-zinc-950 text-zinc-100">
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 md:px-8 md:py-8">
                <section className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-2xl shadow-black/20 md:p-7">
                    <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_16%_0%,rgba(59,130,246,0.16),transparent_32%),radial-gradient(circle_at_86%_12%,rgba(16,185,129,0.12),transparent_30%)]"
                    />
                    <div className="relative grid gap-6 xl:grid-cols-[1fr_440px] xl:items-end">
                        <div>
                            <span className="inline-flex items-center gap-2 rounded-full border border-sky-400/30 bg-sky-400/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-sky-300">
                                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                                Seguridad y Admin
                            </span>
                            <h1 className="mt-3 max-w-3xl text-xl font-black tracking-tight text-white sm:text-3xl md:text-5xl">
                                Admin center enterprise
                            </h1>
                            <p className="hidden sm:block mt-3 max-w-2xl text-sm leading-6 text-zinc-400 md:text-base">
                                Datos de negocio, seats, billing manual y controles que protegen el flujo enterprise sin mezclarlo con coach standalone.
                            </p>
                            <div className="mt-5 flex flex-wrap gap-2">
                                <Link
                                    href={`/org/${slug}/team`}
                                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-sky-400 px-4 text-sm font-black text-zinc-950 transition hover:bg-sky-300"
                                >
                                    Revisar accesos
                                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                                </Link>
                                <Link
                                    href={`/org/${slug}/audit`}
                                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-zinc-700 px-4 text-sm font-bold text-zinc-200 transition hover:bg-zinc-800"
                                >
                                    <Database className="h-4 w-4" aria-hidden="true" />
                                    Ver auditoria
                                </Link>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 rounded-2xl border border-zinc-800 bg-zinc-950/75 p-3 md:grid-cols-4">
                            {[
                                ['Plan', org.plan],
                                ['Estado', org.status],
                                ['Seats', `${usedSeats}/${org.seats_included}`],
                                ['Staff', enterpriseUsers.length],
                            ].map(([label, value]) => (
                                <div key={label} className="rounded-xl bg-zinc-900 p-3 text-center">
                                    <p className="truncate text-lg font-black text-white">{value}</p>
                                    <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-500">{label}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                <section className="grid gap-3 md:grid-cols-4">
                    {[
                        [Building2, 'Organizacion', org.slug, 'slug publico enterprise'],
                        [Users, 'Uso seats', `${seatUsage}%`, `${Math.max(0, org.seats_included - usedSeats)} disponibles`],
                        [CreditCard, 'Billing', org.billing_cycle ?? 'manual', latestInvoice ? `ultima: ${latestInvoice.status}` : 'sin facturas'],
                        [CalendarClock, 'Trial', formatDate(org.trial_ends_at), trialEndsSoon ? 'revisar cierre' : 'estado controlado'],
                    ].map(([Icon, title, value, detail]) => (
                        <div key={title as string} className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
                            <div className="flex items-center justify-between gap-3">
                                <Icon className="h-5 w-5 text-sky-300" aria-hidden="true" />
                                <p className="truncate text-right text-lg font-black text-white">{value as string}</p>
                            </div>
                            <h2 className="mt-4 text-sm font-black text-white">{title as string}</h2>
                            <p className="mt-1 text-xs leading-5 text-zinc-500">{detail as string}</p>
                        </div>
                    ))}
                </section>

                <section className="grid gap-5 xl:grid-cols-[1fr_420px]">
                    <div className="space-y-5">
                        <SettingsAccordion title="Datos del negocio" icon={<Building2 className="h-4 w-4 text-sky-300" />} defaultOpen={true}>
                            <p className="mt-2 text-sm leading-6 text-zinc-500">
                                Identidad administrativa de la organizacion. La marca publica vive en Marca, pero este resumen ayuda a soporte, ventas y onboarding.
                            </p>

                            <div className="mt-5 grid gap-3 md:grid-cols-2">
                                {[
                                    ['Nombre', org.name],
                                    ['Slug', org.slug],
                                    ['Moneda', org.currency],
                                    ['Creada', formatDate(org.created_at)],
                                    ['Plan', org.plan],
                                    ['Billing cycle', org.billing_cycle ?? 'manual'],
                                ].map(([label, value]) => (
                                    <div key={label} className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
                                        <p className="text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">{label}</p>
                                        <p className="mt-2 truncate text-sm font-bold text-zinc-100">{value}</p>
                                    </div>
                                ))}
                            </div>
                        </SettingsAccordion>

                        {isAdmin ? (
                            <SettingsAccordion title="Ajustes rápidos de marca" icon={<Palette className="h-4 w-4 text-emerald-300" />}>
                                <p className="text-sm leading-6 text-zinc-500 mb-4">
                                    Cambios basicos. El publish avanzado y el preview cross-platform se controlan desde Marca.
                                </p>
                                <OrgSettingsForm orgSlug={slug} defaultName={org.name} defaultColor={org.primary_color ?? ''} currentLogoUrl={org.logo_url} defaultCoachCapacity={org.default_coach_capacity} />
                            </SettingsAccordion>
                        ) : (
                            <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 text-sm text-zinc-500">
                                Solo owner/admin pueden editar configuracion.
                            </section>
                        )}
                    </div>

                    <aside className="space-y-5">
                        <SettingsAccordion title="Billing enterprise" icon={<BadgeDollarSign className="h-4 w-4 text-emerald-300" />}>
                            <div className="flex items-center gap-2 mb-3">
                                <span className={`rounded-full border px-2 py-1 text-xs font-bold ${statusTone(org.status)}`}>
                                    {org.status}
                                </span>
                            </div>
                            <p className="text-sm leading-6 text-zinc-500 mb-4">
                                Por ahora EVA Enterprise no cobra dentro de la app. Esta zona mantiene trazabilidad comercial y facturas manuales.
                            </p>
                            <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
                                {hasBillingRisk ? (
                                    <div className="flex items-start gap-3">
                                        <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-300" aria-hidden="true" />
                                        <div>
                                            <p className="text-sm font-black text-amber-200">Billing requiere revision</p>
                                            <p className="mt-1 text-xs leading-5 text-zinc-500">Hay factura pendiente o vencida.</p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex items-start gap-3">
                                        <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-300" aria-hidden="true" />
                                        <div>
                                            <p className="text-sm font-black text-emerald-200">Sin bloqueo de cobro in-app</p>
                                            <p className="mt-1 text-xs leading-5 text-zinc-500">Modelo manual listo para pre-revenue.</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div className="mt-4">
                                <div className="mb-2 flex items-center gap-2">
                                    <ReceiptText className="h-4 w-4 text-zinc-400" aria-hidden="true" />
                                    <p className="text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">Historial</p>
                                </div>
                                <OrgInvoiceList invoices={invoices} />
                            </div>
                        </SettingsAccordion>

                        <SettingsAccordion title="Seats y plan" icon={<Users className="h-4 w-4 text-amber-300" />}>

                            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                                <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 text-center">
                                    <p className="text-2xl font-black text-white">{usedSeats}</p>
                                    <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.1em] text-zinc-500">Usados</p>
                                </div>
                                <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 text-center">
                                    <p className="text-2xl font-black text-white">{org.seats_included}</p>
                                    <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.1em] text-zinc-500">Incluidos</p>
                                </div>
                                <div className={`rounded-xl border p-3 text-center col-span-2 sm:col-span-1 ${
                                    Math.max(0, org.seats_included - usedSeats) === 0
                                        ? 'border-red-400/25 bg-red-400/10'
                                        : seatUsage >= 80
                                            ? 'border-amber-400/25 bg-amber-400/10'
                                            : 'border-emerald-400/25 bg-emerald-400/10'
                                }`}>
                                    <p className={`text-2xl font-black ${
                                        Math.max(0, org.seats_included - usedSeats) === 0 ? 'text-red-300' :
                                        seatUsage >= 80 ? 'text-amber-300' : 'text-emerald-300'
                                    }`}>{Math.max(0, org.seats_included - usedSeats)}</p>
                                    <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.1em] text-zinc-500">Disponibles</p>
                                </div>
                            </div>

                            {/* No in-app billing — contact flow */}
                            <div className="mt-4 rounded-xl border border-zinc-700 bg-zinc-950/60 p-4">
                                <p className="text-sm font-semibold text-zinc-200">¿Necesitas más seats o cambiar de plan?</p>
                                <p className="mt-1 text-xs text-zinc-500">
                                    El billing enterprise es manual. Contacta a EVA para ajustar tu plan sin interrumpir el servicio.
                                </p>
                                <div className="mt-3 flex flex-wrap gap-2">
                                    <a
                                        href="mailto:hola@eva-app.cl?subject=Cambio%20de%20plan%20enterprise%20-%20{org.name}&body=Organización%3A%20{org.slug}%0APlan%20actual%3A%20{org.plan}%0ASeats%20actuales%3A%20{org.seats_included}%0ASolicitud%3A%20"
                                        className="inline-flex items-center gap-2 rounded-lg bg-amber-400 px-3 py-2 text-xs font-bold text-zinc-950 hover:bg-amber-300 transition-colors"
                                    >
                                        Contactar por email
                                    </a>
                                    <span className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-2 text-xs font-semibold text-zinc-400">
                                        Plan actual: <span className="capitalize text-zinc-200">{org.plan}</span>
                                    </span>
                                </div>
                            </div>
                        </SettingsAccordion>

                        <SettingsAccordion title="Guardrails" icon={<LockKeyhole className="h-4 w-4 text-sky-300" />}>
                            <div className="space-y-3">
                                {guardrails.map(item => (
                                    <div key={item} className="flex items-start gap-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
                                        <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" aria-hidden="true" />
                                        <p className="text-sm leading-5 text-zinc-400">{item}</p>
                                    </div>
                                ))}
                            </div>
                        </SettingsAccordion>
                    </aside>
                </section>
            </div>
        </div>
    )
}
