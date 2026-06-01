import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import {
    AlertTriangle,
    Archive,
    CheckCircle2,
    Database,
    Download,
    FileText,
    Fingerprint,
    KeyRound,
    LockKeyhole,
    Scale,
    ShieldCheck,
    Users,
} from 'lucide-react'
import { orgRoleCan } from '@/domain/org/permissions'
import { getOrgAuditLogs, getOrgBySlug, getOrgInvoices, getOrgMembers } from '../_data/org.queries'

export const metadata: Metadata = { title: 'Trust Center' }

interface Props {
    params: Promise<{ slug: string }>
}

function formatDate(value: string | null) {
    if (!value) return 'Sin eventos'
    return new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

export default async function OrgTrustCenterPage({ params }: Props) {
    const { slug } = await params
    const org = await getOrgBySlug(slug)
    if (!org) redirect('/coach/dashboard')

    const [members, auditLogs, invoices] = await Promise.all([
        getOrgMembers(org.id),
        getOrgAuditLogs(org.id, {}, 12),
        getOrgInvoices(org.id),
    ])

    const activeStaff = members.filter(member => member.status === 'active' && member.role !== 'coach')
    const activeCoaches = members.filter(member => member.status === 'active' && member.role === 'coach')
    const canExportAudit = orgRoleCan(org.myRole, 'org.audit.export')
    const canExportReports = orgRoleCan(org.myRole, 'org.reports.export')
    const canExportPayments = orgRoleCan(org.myRole, 'org.payments.export')
    const latestAuditAt = auditLogs[0]?.created_at ?? null
    const latestInvoice = invoices[0] ?? null

    const posture = [
        ['Tenant isolation', 'Org data scoped by `org_id` + RLS + server guards.', true],
        ['RBAC', `Rol actual: ${org.myRole.replace('_', ' ')}. Permisos calculados server-side.`, true],
        ['MFA posture', 'Owner/admin MFA enforcement existe; policy real por rol queda post-MVP.', true],
        ['Audit trail', `Ultimo evento: ${formatDate(latestAuditAt)}.`, auditLogs.length > 0],
        ['Exports', 'Audit, pagos y reportes CSV son fail-closed con audit event.', true],
        ['Retention', 'Purge endpoint existe; retention/data map legal queda documentado antes de venta avanzada.', false],
    ] as const

    const exportRows = [
        ['Audit CSV', canExportAudit, `/org/${slug}/audit/export?limit=1000`, 'audit.exported'],
        ['Pagos CSV', canExportPayments, `/org/${slug}/payments/export?status=all`, 'client_payments.exported'],
        ['Reporte semanal CSV', canExportReports, `/org/${slug}/reports/export`, 'report.exported'],
    ] as const

    return (
        <div className="min-h-full bg-zinc-950 text-zinc-100">
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 md:px-8 md:py-8">
                <section className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-2xl shadow-black/20 md:p-7">
                    <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(14,165,233,0.16),transparent_32%),radial-gradient(circle_at_86%_12%,rgba(16,185,129,0.12),transparent_30%)]"
                    />
                    <div className="relative grid gap-6 xl:grid-cols-[1fr_430px] xl:items-end">
                        <div>
                            <span className="inline-flex items-center gap-2 rounded-full border border-sky-400/30 bg-sky-400/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-sky-300">
                                <Fingerprint className="h-3.5 w-3.5" aria-hidden="true" />
                                Trust Center Lite
                            </span>
                            <h1 className="mt-3 max-w-3xl text-xl font-black tracking-tight text-white sm:text-3xl md:text-5xl">
                                Evidencia operativa y seguridad
                            </h1>
                            <p className="hidden sm:block mt-3 max-w-2xl text-sm leading-6 text-zinc-400 md:text-base">
                                Vista read-only para owner/admin: permisos, MFA, audit, exports, billing manual y postura de datos sin pagar herramientas externas.
                            </p>
                        </div>

                        <div className="grid grid-cols-2 gap-2 rounded-2xl border border-zinc-800 bg-zinc-950/75 p-3 md:grid-cols-4">
                            {[
                                ['Staff', activeStaff.length],
                                ['Coaches', activeCoaches.length],
                                ['Audit', auditLogs.length],
                                ['Billing', latestInvoice?.status ?? 'manual'],
                            ].map(([label, value]) => (
                                <div key={label} className="rounded-xl bg-zinc-900 p-3 text-center">
                                    <p className="truncate text-lg font-black text-white">{value}</p>
                                    <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-500">{label}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                <section className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
                    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
                        <div className="flex items-center gap-2">
                            <ShieldCheck className="h-4 w-4 text-emerald-300" aria-hidden="true" />
                            <h2 className="text-lg font-black text-white">Security posture</h2>
                        </div>
                        <div className="mt-5 grid gap-3 md:grid-cols-2">
                            {posture.map(([title, detail, ok]) => (
                                <div key={title} className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
                                    <div className="flex items-start gap-3">
                                        {ok ? (
                                            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" aria-hidden="true" />
                                        ) : (
                                            <Archive className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" />
                                        )}
                                        <div>
                                            <p className="text-sm font-black text-white">{title}</p>
                                            <p className="mt-1 text-xs leading-5 text-zinc-500">{detail}</p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <aside className="space-y-5">
                        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
                            <div className="flex items-center gap-2">
                                <Download className="h-4 w-4 text-sky-300" aria-hidden="true" />
                                <h2 className="text-lg font-black text-white">Exports controlados</h2>
                            </div>
                            <div className="mt-4 space-y-2">
                                {exportRows.map(([label, allowed, href, auditAction]) => (
                                    <div key={label} className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-bold text-zinc-100">{label}</p>
                                            <p className="mt-1 truncate text-xs text-zinc-500">{auditAction}</p>
                                        </div>
                                        {allowed ? (
                                            <a href={href} className="shrink-0 rounded-lg bg-sky-400 px-3 py-1.5 text-xs font-black text-zinc-950 hover:bg-sky-300">
                                                Exportar
                                            </a>
                                        ) : (
                                            <span className="shrink-0 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-bold text-zinc-500">
                                                Sin permiso
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </section>

                        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
                            <div className="flex items-center gap-2">
                                <Database className="h-4 w-4 text-amber-300" aria-hidden="true" />
                                <h2 className="text-lg font-black text-white">Datos sensibles</h2>
                            </div>
                            <div className="mt-4 space-y-3">
                                {[
                                    [Users, 'Alumnos', 'Datos operativos, entrenamiento, nutricion y pagos manuales.'],
                                    [LockKeyhole, 'Check-ins', 'Fotos/progreso: bucket privado + signed URLs queda pendiente antes de vender salud avanzada.'],
                                    [KeyRound, 'Accesos', 'Staff enterprise separado de coach/alumno; roles con least privilege.'],
                                    [FileText, 'Audit', 'Eventos sensibles append-only desde UI; checksum semanal disponible por endpoint/script.'],
                                ].map(([Icon, title, detail]) => (
                                    <div key={title as string} className="flex gap-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
                                        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" />
                                        <div>
                                            <p className="text-sm font-bold text-zinc-100">{title as string}</p>
                                            <p className="mt-0.5 text-xs leading-5 text-zinc-500">{detail as string}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>
                    </aside>
                </section>

                {/* Ley 21.719 Compliance Checklist — deadline 2026-12-01 */}
                <section className="rounded-2xl border border-amber-400/20 bg-zinc-900/70 p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                        <div className="flex items-center gap-2">
                            <Scale className="h-4 w-4 text-amber-300" aria-hidden="true" />
                            <h2 className="text-lg font-black text-white">Ley 21.719 — Protección de datos Chile</h2>
                        </div>
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-xs font-bold text-amber-300">
                            <AlertTriangle className="h-3 w-3" />
                            Deadline 2026-12-01
                        </span>
                    </div>
                    <p className="text-xs text-zinc-500 mb-4">
                        La Ley 21.719 entra en vigencia el 1 de diciembre de 2026. Datos de salud/fitness/nutrición/fotos pueden requerir mayor cuidado operativo. Completar antes del deadline.
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2">
                        {[
                            { label: 'Inventario de datos personales', detail: 'Mapear email, teléfono, fotos progreso, peso, nutrición, workouts por contexto.', done: false, priority: 'high' },
                            { label: 'Responsable de datos definido', detail: 'Aclarar si EVA es responsable o procesador por contrato enterprise. TOS actualizado.', done: false, priority: 'high' },
                            { label: 'Legal copy enterprise revisado', detail: 'Revisar lenguaje de pagos, datos sensibles y roles antes de mostrar a clientes.', done: false, priority: 'high' },
                            { label: 'Retención y borrado definidos', detail: 'Política de retention/export/delete por tipo de dato. Plazo razonable documentado.', done: false, priority: 'medium' },
                            { label: 'Acceso a fotos y progreso auditado', detail: 'Verificar que check-in photos solo acceden coach+alumno. Bucket `checkins` es público.', done: false, priority: 'medium' },
                            { label: 'Derechos ARCO operacionales', detail: 'Acceso, rectificación, cancelación, oposición. Definir cómo responder solicitudes.', done: false, priority: 'medium' },
                            { label: 'Consentimiento explícito documentado', detail: 'Registro de cuándo y cómo cada alumno/coach consintió el tratamiento de datos.', done: false, priority: 'low' },
                            { label: 'Checklist completo pre-prod', detail: 'Revisión final antes de operar con clientes de pago. No lanzar antes de completar los ítems high.', done: false, priority: 'low' },
                        ].map(({ label, detail, done, priority }) => (
                            <div key={label} className={`flex items-start gap-3 rounded-xl border p-3 ${
                                done
                                    ? 'border-emerald-400/15 bg-emerald-400/5'
                                    : priority === 'high'
                                    ? 'border-amber-400/20 bg-amber-400/5'
                                    : 'border-zinc-800 bg-zinc-950/40'
                            }`}>
                                <div className={`mt-0.5 shrink-0 ${done ? 'text-emerald-400' : priority === 'high' ? 'text-amber-400' : 'text-zinc-600'}`}>
                                    {done ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                                </div>
                                <div>
                                    <p className="text-xs font-bold text-zinc-200">{label}</p>
                                    <p className="mt-0.5 text-[11px] leading-4 text-zinc-500">{detail}</p>
                                    {!done && (
                                        <span className={`mt-1 inline-block text-[10px] font-bold uppercase tracking-[0.08em] ${
                                            priority === 'high' ? 'text-amber-400' : priority === 'medium' ? 'text-zinc-500' : 'text-zinc-700'
                                        }`}>
                                            {priority === 'high' ? '● P0' : priority === 'medium' ? '○ P1' : '○ P2'}
                                        </span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            </div>
        </div>
    )
}
