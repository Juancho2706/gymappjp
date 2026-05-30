import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import {
    Activity,
    AlertTriangle,
    CalendarClock,
    CheckCircle2,
    Download,
    FileText,
    Fingerprint,
    LockKeyhole,
    Search,
    ShieldCheck,
} from 'lucide-react'
import { orgRoleCan } from '@/domain/org/permissions'
import { getOrgAuditLogs, getOrgBySlug } from '../_data/org.queries'

export const metadata: Metadata = { title: 'Audit Log' }

interface Props {
    params: Promise<{ slug: string }>
}

function formatDate(value: string | null) {
    if (!value) return 'Sin fecha'
    return new Intl.DateTimeFormat('es-CL', {
        dateStyle: 'medium',
        timeStyle: 'short',
    }).format(new Date(value))
}

function actionTone(action: string) {
    if (action.includes('delete') || action.includes('remove') || action.includes('deactivate')) return 'border-red-400/25 bg-red-400/10 text-red-300'
    if (action.includes('assign') || action.includes('create') || action.includes('invite')) return 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300'
    if (action.includes('brand') || action.includes('publish')) return 'border-sky-400/25 bg-sky-400/10 text-sky-300'
    return 'border-zinc-700 bg-zinc-900 text-zinc-300'
}

function metadataSummary(metadata: unknown) {
    if (!metadata || typeof metadata !== 'object') return 'Sin metadata'
    const keys = Object.keys(metadata)
    if (keys.length === 0) return 'Metadata vacia'
    return keys.slice(0, 4).join(', ')
}

export default async function OrgAuditPage({ params }: Props) {
    const { slug } = await params
    const org = await getOrgBySlug(slug)
    if (!org) redirect('/coach/dashboard')

    const auditLogs = await getOrgAuditLogs(org.id)
    const uniqueActors = new Set(auditLogs.map((log) => log.actor_id)).size
    const targetTypes = [...new Set(auditLogs.map((log) => log.target_type).filter(Boolean))]
    const lastEventAt = auditLogs[0]?.created_at ?? null
    const canExportAudit = orgRoleCan(org.myRole, 'org.audit.export')

    return (
        <div className="min-h-full bg-zinc-950 text-zinc-100">
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 md:px-8 md:py-8">
                <section className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-2xl shadow-black/20 md:p-7">
                    <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(244,63,94,0.17),transparent_30%),radial-gradient(circle_at_88%_10%,rgba(14,165,233,0.11),transparent_28%)]"
                    />
                    <div className="relative grid gap-6 lg:grid-cols-[1fr_430px] lg:items-end">
                        <div>
                            <span className="inline-flex items-center gap-2 rounded-full border border-rose-400/30 bg-rose-400/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-rose-300">
                                <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                                Security evidence
                            </span>
                            <h1 className="mt-3 max-w-3xl text-xl font-black tracking-tight text-white sm:text-3xl md:text-5xl">
                                Audit Log
                            </h1>
                            <p className="hidden sm:block mt-3 max-w-2xl text-sm leading-6 text-zinc-400 md:text-base">
                                Historial read-only de acciones enterprise sensibles. Sirve para soporte, seguridad, compliance y confianza B2B.
                            </p>
                            {canExportAudit ? (
                                <a
                                    href={`/org/${slug}/audit/export`}
                                    className="mt-5 inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-rose-400 px-4 text-sm font-black text-zinc-950 transition hover:bg-rose-300"
                                >
                                    <Download className="h-4 w-4" aria-hidden="true" />
                                    Export CSV
                                </a>
                            ) : (
                                <p className="mt-5 inline-flex min-h-10 items-center rounded-xl border border-zinc-800 bg-zinc-950 px-4 text-sm font-bold text-zinc-500">
                                    Export requiere permiso `org.audit.export`
                                </p>
                            )}
                        </div>

                        <div className="grid grid-cols-2 gap-2 rounded-2xl border border-zinc-800 bg-zinc-950/75 p-3 md:grid-cols-4">
                            {[
                                ['Eventos', auditLogs.length],
                                ['Actores', uniqueActors],
                                ['Targets', targetTypes.length],
                                ['Export', canExportAudit ? 'CSV' : 'No'],
                            ].map(([label, value]) => (
                                <div key={label} className="rounded-xl bg-zinc-900 p-3 text-center">
                                    <p className="text-2xl font-black text-white">{value}</p>
                                    <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-500">{label}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                <section className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
                    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
                        <div className="flex items-center gap-2">
                            <Activity className="h-4 w-4 text-rose-300" aria-hidden="true" />
                            <h2 className="text-lg font-black text-white">Timeline</h2>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-zinc-500">
                            Muestra los ultimos 50 eventos guardados en `org_audit_logs`.
                        </p>

                        <div className="mt-5 overflow-hidden rounded-xl border border-zinc-800">
                            {auditLogs.length > 0 ? (
                                auditLogs.map((log) => (
                                    <div key={log.id} className="grid gap-3 border-b border-zinc-800 bg-zinc-950/50 p-4 last:border-b-0 lg:grid-cols-[1fr_170px_170px] lg:items-center">
                                        <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className={`rounded-full border px-2 py-1 text-xs font-bold ${actionTone(log.action)}`}>
                                                    {log.action}
                                                </span>
                                                {log.target_type && (
                                                    <span className="rounded-full border border-zinc-700 px-2 py-1 text-xs font-semibold text-zinc-400">
                                                        {log.target_type}
                                                    </span>
                                                )}
                                            </div>
                                            <p className="mt-3 truncate text-sm font-bold text-zinc-100">
                                                {log.target_id ?? 'Evento sin target especifico'}
                                            </p>
                                            <p className="mt-1 truncate text-xs text-zinc-500">
                                                Metadata: {metadataSummary(log.metadata)}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-zinc-500">Actor</p>
                                            <p className="mt-1 truncate font-mono text-xs text-zinc-300">{log.actor_id}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-zinc-500">Fecha</p>
                                            <p className="mt-1 text-sm font-bold text-zinc-100">{formatDate(log.created_at)}</p>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="p-6 text-sm text-zinc-500">
                                    No hay eventos todavia. Las mutations enterprise futuras deben empezar escribiendo aqui.
                                </div>
                            )}
                        </div>
                    </div>

                    <aside className="space-y-5">
                        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
                            <div className="flex items-center gap-2">
                                <ShieldCheck className="h-4 w-4 text-emerald-300" aria-hidden="true" />
                                <h2 className="text-lg font-black text-white">Estado del modelo</h2>
                            </div>
                            <div className="mt-4 space-y-3">
                                {[
                                    ['Tabla existente', 'org_audit_logs con RLS activo.'],
                                    ['Lectura restringida', 'Owner/Admin por policy actual.'],
                                    ['Append-only intent', 'Sin UI para editar o borrar eventos.'],
                                    ['Checksums futuro', 'Tabla preparada para evidencia semanal.'],
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

                        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
                            <div className="flex items-center gap-2">
                                <Search className="h-4 w-4 text-sky-300" aria-hidden="true" />
                                <h2 className="text-lg font-black text-white">Filtros futuros</h2>
                            </div>
                            <div className="mt-4 flex flex-wrap gap-2">
                                {['Actor', 'Action', 'Target', 'Fecha', 'Export'].map((filter) => (
                                    <span key={filter} className="rounded-full border border-zinc-700 px-2 py-1 text-xs font-semibold text-zinc-400">
                                        {filter}
                                    </span>
                                ))}
                            </div>
                            <p className="mt-4 text-sm leading-6 text-zinc-500">
                                Busqueda avanzada queda pendiente. Export CSV ya exige permiso dedicado y escribe `audit.exported`.
                            </p>
                        </section>
                    </aside>
                </section>

                <section className="grid gap-3 md:grid-cols-4">
                    {[
                        [Fingerprint, 'Evidencia', 'Cada evento debe probar actor, accion, target y tenant.'],
                        [LockKeyhole, 'Tamper resistance', 'Sin UPDATE/DELETE desde UI; checksums por ventana.'],
                        [CalendarClock, 'Retencion', `Ultimo evento: ${formatDate(lastEventAt)}.`],
                        [Download, 'Export controlado', 'CSV solo con permiso dedicado y audit event propio.'],
                    ].map(([Icon, title, detail]) => (
                        <div key={title as string} className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
                            <Icon className="h-5 w-5 text-rose-300" aria-hidden="true" />
                            <h3 className="mt-4 text-sm font-black text-white">{title as string}</h3>
                            <p className="mt-2 text-xs leading-5 text-zinc-500">{detail as string}</p>
                        </div>
                    ))}
                </section>

                <section className="rounded-2xl border border-amber-400/25 bg-amber-400/10 p-5">
                    <div className="flex gap-3">
                        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-200" aria-hidden="true" />
                        <div>
                            <h2 className="text-sm font-black text-white">Politica de export</h2>
                            <p className="mt-2 text-sm leading-6 text-amber-100/80">
                                CSV es owner-only por `org.audit.export`. La descarga es fail-closed: si no se puede escribir `audit.exported`, no se entrega el archivo.
                            </p>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    )
}
