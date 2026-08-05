import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ExternalLink, Ticket } from 'lucide-react'
import { differenceInCalendarDays, format, formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { AdminStatusBadge } from '../../_components/AdminStatusBadge'
import { MODULE_LABELS, type ModuleKey } from '../../_components/module-labels'
import { getCoachDetail } from './_data/coach-detail.queries'
import { CoachDetailActions, CopyTextButton } from './_components/CoachDetailActions'

interface Props {
    params: Promise<{ id: string }>
}

function clp(n: number) {
    return new Intl.NumberFormat('es-CL', {
        style: 'currency',
        currency: 'CLP',
        maximumFractionDigits: 0,
    }).format(n)
}

function shortDate(iso: string) {
    return format(new Date(iso), 'dd/MM/yy', { locale: es })
}

const SOURCE_LABELS: Record<string, string> = {
    admin_grant: 'Cortesía',
    self_service: 'Pago',
}

export async function generateMetadata({ params }: Props) {
    const { id } = await params
    const detail = await getCoachDetail(id)
    if (!detail) return { title: 'Coach no encontrado' }
    return { title: detail.coach.brand_name || detail.coach.full_name || 'Coach' }
}

/** Tarjeta KPI de la ficha — markup simple, sin cliente (solo lectura). */
function KpiCard({ label, value, sub, valueClassName }: {
    label: string
    value: React.ReactNode
    sub?: React.ReactNode
    valueClassName?: string
}) {
    return (
        <div className="rounded-card border border-subtle bg-surface-card p-3">
            <p className="text-[10px] font-medium uppercase tracking-widest text-muted">{label}</p>
            <p className={`mt-1 text-lg font-bold tabular-nums text-strong ${valueClassName ?? ''}`}>{value}</p>
            {sub && <div className="mt-0.5 text-[11px] text-muted">{sub}</div>}
        </div>
    )
}

function TableShell({ title, count, children }: {
    title: string
    count: number
    children: React.ReactNode
}) {
    return (
        <section className="rounded-card border border-subtle bg-surface-card p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-strong">{title}</h2>
                <span className="text-[11px] text-muted">{count === 0 ? 'sin registros' : `últimos ${count}`}</span>
            </div>
            {children}
        </section>
    )
}

export default async function AdminCoachDetailPage({ params }: Props) {
    const { id } = await params
    const detail = await getCoachDetail(id)
    if (!detail) notFound()

    const { coach, email, clientCount, activeClientCount, listMonthlyClp, netMonthlyClp, coupon } = detail
    const displayName = coach.brand_name || coach.full_name || coach.slug

    const daysLeft = coach.current_period_end
        ? differenceInCalendarDays(new Date(coach.current_period_end), new Date())
        : null
    const expiryClass = daysLeft === null
        ? ''
        : daysLeft < 0
            ? 'text-muted'
            : daysLeft < 7
                ? 'text-[var(--danger-500)]'
                : daysLeft < 14
                    ? 'text-[var(--warning-500)]'
                    : 'text-strong'

    const discountLabel = coupon
        ? coupon.type === 'percent'
            ? `−${coupon.value}%`
            : `−${clp(coupon.value)}`
        : null

    return (
        <div className="space-y-6">
            {/* ── Header ── */}
            <header className="space-y-2">
                <Link
                    href="/admin/coaches"
                    className="inline-flex items-center gap-1 text-[11px] text-muted transition-colors hover:text-strong focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)]"
                >
                    <ArrowLeft className="h-3 w-3" /> Coaches
                </Link>
                <h1 className="text-2xl font-bold tracking-tight text-strong">{displayName}</h1>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-body">
                    <Link
                        href={`/c/${coach.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-mono text-[var(--sport-500)] hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)]"
                    >
                        /c/{coach.slug} <ExternalLink className="h-3 w-3" />
                    </Link>
                    {email ? (
                        <span className="inline-flex items-center gap-1">
                            <span className="font-mono text-[11px] text-body">{email}</span>
                            <CopyTextButton value={email} label="Copiar email" />
                        </span>
                    ) : (
                        <span className="text-muted">Sin email en Auth</span>
                    )}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                    <AdminStatusBadge value={coach.subscription_status} />
                    <AdminStatusBadge value={coach.subscription_tier} type="tier" />
                    <AdminStatusBadge value={coach.payment_provider} type="provider" />
                </div>
            </header>

            {/* ── KPIs ── */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <KpiCard
                    label="Paga real"
                    value={detail.isPaying ? `${clp(netMonthlyClp)}/mes` : '—'}
                    sub={!detail.isPaying
                        ? `No paga (${coach.payment_provider ?? 'sin gateway'} · ${coach.subscription_status})`
                        : coupon
                            ? (
                                <>
                                    <span className="font-mono">{coupon.code ?? 'cupón'}</span>
                                    {' · lista '}
                                    <span className="line-through">{clp(listMonthlyClp)}</span>
                                </>
                            )
                            : 'Precio de lista, sin cupón'}
                />
                <KpiCard
                    label="Alumnos"
                    value={`${activeClientCount}/${coach.max_clients}`}
                    sub={`${clientCount} en total`}
                />
                <KpiCard
                    label="Vence"
                    value={coach.current_period_end ? shortDate(coach.current_period_end) : '—'}
                    valueClassName={expiryClass}
                    sub={daysLeft === null
                        ? 'Sin fecha de vencimiento'
                        : daysLeft < 0
                            ? `Venció hace ${Math.abs(daysLeft)}d`
                            : `${daysLeft}d restantes`}
                />
                <KpiCard
                    label="Última actividad"
                    value={coach.last_active_at
                        ? formatDistanceToNow(new Date(coach.last_active_at), { addSuffix: true, locale: es })
                        : 'Nunca'}
                    valueClassName="text-base"
                    sub={`Alta ${shortDate(coach.created_at)}`}
                />
            </div>

            {/* ── Cupón vivo ── */}
            <section className="rounded-card border border-subtle bg-surface-card p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold text-strong">Cupón vivo</h2>
                    {/* El prefill del formulario por coach llega en F5 — el query param ya viaja. */}
                    <Link
                        href={`/admin/codigos?coach=${coach.id}`}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-subtle bg-surface-sunken px-3 py-1.5 text-xs text-body transition-colors hover:border-[var(--sport-500)] hover:text-[var(--sport-500)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)]"
                    >
                        <Ticket className="h-3.5 w-3.5" />
                        Crear cupón para este coach
                    </Link>
                </div>
                {coupon ? (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[520px] text-left text-xs">
                            <thead>
                                <tr className="border-b border-subtle text-[10px] uppercase tracking-wider text-muted">
                                    <th className="pb-2 pr-3 font-medium">Código</th>
                                    <th className="pb-2 pr-3 font-medium">Descuento</th>
                                    <th className="pb-2 pr-3 text-right font-medium">Lista</th>
                                    <th className="pb-2 pr-3 text-right font-medium">Paga</th>
                                    <th className="pb-2 font-medium">Vigencia</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td className="py-2 pr-3 font-mono text-strong">{coupon.code ?? '—'}</td>
                                    <td className="py-2 pr-3 font-mono text-[var(--warning-500)]">
                                        {discountLabel}
                                        <span className="ml-1 text-muted">({coupon.target})</span>
                                    </td>
                                    <td className="py-2 pr-3 text-right font-mono tabular-nums text-muted line-through">{clp(listMonthlyClp)}</td>
                                    <td className="py-2 pr-3 text-right font-mono tabular-nums text-strong">{clp(netMonthlyClp)}</td>
                                    <td className="py-2 text-body">
                                        {coupon.remainingCycles === null
                                            ? 'Forever'
                                            : `${coupon.remainingCycles} ciclos restantes`}
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <p className="text-xs text-muted">Sin cupón vivo — paga el precio de lista de su plan.</p>
                )}
            </section>

            {/* ── Add-ons ── */}
            {detail.addons.length > 0 && (
                <section className="rounded-card border border-subtle bg-surface-card p-4">
                    <h2 className="mb-3 text-sm font-semibold text-strong">Add-ons</h2>
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[460px] text-left text-xs">
                            <thead>
                                <tr className="border-b border-subtle text-[10px] uppercase tracking-wider text-muted">
                                    <th className="pb-2 pr-3 font-medium">Módulo</th>
                                    <th className="pb-2 pr-3 font-medium">Origen</th>
                                    <th className="pb-2 pr-3 font-medium">Estado</th>
                                    <th className="pb-2 text-right font-medium">Precio</th>
                                </tr>
                            </thead>
                            <tbody>
                                {detail.addons.map((a) => (
                                    <tr key={a.id} className="border-b border-subtle last:border-b-0">
                                        <td className="py-2 pr-3 font-medium text-strong">
                                            {MODULE_LABELS[a.moduleKey as ModuleKey] ?? a.moduleKey}
                                        </td>
                                        <td className="py-2 pr-3 text-body">{SOURCE_LABELS[a.source] ?? a.source}</td>
                                        <td className="py-2 pr-3 font-mono text-body">{a.status}</td>
                                        <td className="py-2 text-right font-mono tabular-nums text-strong">
                                            {a.priceClp > 0 ? clp(a.priceClp) : '—'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            )}

            {/* ── Cobros ── */}
            <TableShell title="Cobros" count={detail.charges.length}>
                {detail.charges.length === 0 ? (
                    <p className="text-xs text-muted">Sin cobros registrados para este coach.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[560px] text-left text-xs">
                            <thead>
                                <tr className="border-b border-subtle text-[10px] uppercase tracking-wider text-muted">
                                    <th className="pb-2 pr-3 font-medium">Fecha</th>
                                    <th className="pb-2 pr-3 text-right font-medium">Total</th>
                                    <th className="pb-2 pr-3 text-right font-medium">Descuento</th>
                                    <th className="pb-2 pr-3 font-medium">Cupón</th>
                                    <th className="pb-2 pr-3 font-medium">Tipo</th>
                                    <th className="pb-2 font-medium">Pasarela</th>
                                </tr>
                            </thead>
                            <tbody>
                                {detail.charges.map((c) => (
                                    <tr key={c.id} className="border-b border-subtle last:border-b-0">
                                        <td className="py-2 pr-3 font-mono tabular-nums text-body">{shortDate(c.chargedAt)}</td>
                                        <td className="py-2 pr-3 text-right font-mono tabular-nums text-strong">{clp(c.totalClp)}</td>
                                        <td className="py-2 pr-3 text-right font-mono tabular-nums text-[var(--warning-500)]">
                                            {c.discountClp > 0 ? `−${clp(c.discountClp)}` : '—'}
                                        </td>
                                        <td className="py-2 pr-3 font-mono text-body">{c.couponCode ?? '—'}</td>
                                        <td className="py-2 pr-3 text-body">{c.kind}</td>
                                        <td className="py-2 text-body">{c.provider}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </TableShell>

            {/* ── Eventos de suscripción ── */}
            <TableShell title="Eventos de suscripción" count={detail.events.length}>
                {detail.events.length === 0 ? (
                    <p className="text-xs text-muted">Sin eventos de pasarela registrados.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[520px] text-left text-xs">
                            <thead>
                                <tr className="border-b border-subtle text-[10px] uppercase tracking-wider text-muted">
                                    <th className="pb-2 pr-3 font-medium">Fecha</th>
                                    <th className="pb-2 pr-3 font-medium">Pasarela</th>
                                    <th className="pb-2 pr-3 font-medium">Estado</th>
                                    <th className="pb-2 font-medium">Evento</th>
                                </tr>
                            </thead>
                            <tbody>
                                {detail.events.map((ev) => (
                                    <tr key={ev.id} className="border-b border-subtle last:border-b-0">
                                        <td className="py-2 pr-3 font-mono tabular-nums text-body">
                                            {format(new Date(ev.createdAt), 'dd/MM/yy HH:mm', { locale: es })}
                                        </td>
                                        <td className="py-2 pr-3 text-body">{ev.provider}</td>
                                        <td className="py-2 pr-3 font-mono text-strong">{ev.providerStatus ?? '—'}</td>
                                        <td className="py-2 max-w-[220px] truncate font-mono text-[10px] text-muted" title={ev.providerEventId ?? ''}>
                                            {ev.providerEventId ?? '—'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </TableShell>

            {/* ── Auditoría ── */}
            <TableShell title="Auditoría de este coach" count={detail.auditLogs.length}>
                {detail.auditLogs.length === 0 ? (
                    <p className="text-xs text-muted">Sin acciones de admin sobre este coach.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[480px] text-left text-xs">
                            <thead>
                                <tr className="border-b border-subtle text-[10px] uppercase tracking-wider text-muted">
                                    <th className="pb-2 pr-3 font-medium">Fecha</th>
                                    <th className="pb-2 pr-3 font-medium">Admin</th>
                                    <th className="pb-2 font-medium">Acción</th>
                                </tr>
                            </thead>
                            <tbody>
                                {detail.auditLogs.map((log) => (
                                    <tr key={log.id} className="border-b border-subtle last:border-b-0">
                                        <td className="py-2 pr-3 font-mono tabular-nums text-body">
                                            {format(new Date(log.createdAt), 'dd/MM/yy HH:mm', { locale: es })}
                                        </td>
                                        <td className="py-2 pr-3 font-mono text-[11px] text-body">{log.adminEmail}</td>
                                        <td className="py-2 font-mono text-strong">{log.action}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </TableShell>

            {/* ── Acciones ── */}
            <CoachDetailActions
                coachId={coach.id}
                slug={coach.slug}
                clientCount={clientCount}
            />
        </div>
    )
}
