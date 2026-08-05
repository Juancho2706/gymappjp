import Link from 'next/link'
import { Badge, type BadgeTone } from '@/components/ui/badge'
import { getAllCoachesBasic } from '../dashboard/_data/admin.queries'
import {
    getCouponsForAdmin,
    getRecentRedemptions,
    getCouponMetrics,
    type AdminCouponRow,
} from './_data/codigos.queries'
import { CouponMintForm } from './_components/CouponMintForm'
import { DeactivateButton } from './_components/DeactivateButton'
import { RevokeRedemptionButton } from './_components/RevokeRedemptionButton'

// Datos service-role siempre frescos (no cachear el catálogo de cupones).
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function discountLabel(c: AdminCouponRow): string {
    const val = c.discountType === 'percent' ? `${c.percentValue ?? 0}%` : `$${(c.amountOffClp ?? 0).toLocaleString('es-CL')}`
    const dur =
        c.duration === 'forever' ? 'de por vida' : c.duration === 'once' ? '1 ciclo' : `${c.durationInCycles ?? '?'} ciclos`
    return `${val} · ${c.fixedClpTarget} · ${dur}`
}

// El server corre en UTC: sin timeZone explícita, un canje de las 21:30 en Chile se mostraría al día
// siguiente. Formato fijo dd/MM/yy (+ HH:mm en canjes) para no depender del locale del runtime.
const DT_PARTS = new Intl.DateTimeFormat('es-CL', {
    timeZone: 'America/Santiago',
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
})

function parts(iso: string) {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return null
    return Object.fromEntries(DT_PARTS.formatToParts(d).map((p) => [p.type, p.value])) as Record<string, string>
}

function fmtDate(iso: string | null): string {
    if (!iso) return '—'
    const p = parts(iso)
    return p ? `${p.day}/${p.month}/${p.year}` : '—'
}

function fmtDateTime(iso: string | null): string {
    if (!iso) return '—'
    const p = parts(iso)
    return p ? `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}` : '—'
}

// El estado del CANJE no es el de un coach → Badge del DS directo (AdminStatusBadge mapea estados de
// coach). CHECK real de la tabla: active | expired | reverted.
const REDEMPTION_TONE: Record<string, BadgeTone> = {
    active: 'success',
    reverted: 'danger',
    revoked: 'danger',
    expired: 'neutral',
}
const REDEMPTION_LABEL: Record<string, string> = {
    active: 'vigente',
    reverted: 'revocado',
    revoked: 'revocado',
    expired: 'expirado',
}

const th = 'px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted'
const td = 'px-3 py-2 text-sm text-body'

export default async function CodigosPage({
    searchParams,
}: {
    searchParams: Promise<{ coach?: string }>
}) {
    const params = await searchParams
    // Prefill desde la ficha del coach (/admin/coaches/[id] → ?coach=<uuid>). Un valor basura no debe
    // llegar al <select> como opción fantasma.
    const prefillCoachId = params.coach && UUID_RE.test(params.coach) ? params.coach : ''

    const [coupons, redemptions, metrics, coaches] = await Promise.all([
        getCouponsForAdmin(),
        getRecentRedemptions(50),
        getCouponMetrics(),
        getAllCoachesBasic(),
    ])

    return (
        <div className="space-y-6 p-4 md:p-6">
            <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border border-subtle bg-surface-sunken p-3">
                    <p className="text-[11px] uppercase tracking-wide text-muted">Canjes vivos</p>
                    <p className="text-xl font-semibold text-strong">{metrics.activeRedemptions}</p>
                </div>
                <div className="rounded-lg border border-subtle bg-surface-sunken p-3">
                    <p className="text-[11px] uppercase tracking-wide text-muted">Canjes totales</p>
                    <p className="text-xl font-semibold text-strong">{metrics.totalRedemptions}</p>
                </div>
                <div className="rounded-lg border border-subtle bg-surface-sunken p-3">
                    <p className="text-[11px] uppercase tracking-wide text-muted">Descuento otorgado</p>
                    <p className="text-xl font-semibold text-strong">${metrics.totalDiscountGivenClp.toLocaleString('es-CL')}</p>
                </div>
            </div>
            <div>
                <h1 className="text-lg font-semibold text-strong">Códigos de descuento</h1>
                <p className="text-xs text-muted">
                    Cupones para coaches. El descuento se aplica server-side en el cobro (drift-safe). Reversa = desactivar
                    (vigentes honran su término).
                </p>
            </div>

            <CouponMintForm coaches={coaches} defaultCoachId={prefillCoachId} />

            <div className="overflow-x-auto rounded-lg border border-subtle">
                <table className="w-full border-collapse">
                    <thead className="bg-surface-sunken">
                        <tr>
                            <th className={th}>Código</th>
                            <th className={th}>Descuento</th>
                            <th className={th}>Canjes</th>
                            <th className={th}>Por cuenta</th>
                            <th className={th}>Expira</th>
                            <th className={th}>Creado</th>
                            <th className={th}>Estado</th>
                            <th className={th}></th>
                        </tr>
                    </thead>
                    <tbody>
                        {coupons.length === 0 && (
                            <tr>
                                <td className={td} colSpan={8}>
                                    Aún no hay códigos. Crea el primero arriba.
                                </td>
                            </tr>
                        )}
                        {coupons.map((c) => (
                            <tr key={c.codeId} className="border-t border-subtle">
                                <td className={`${td} font-mono text-strong`}>
                                    {c.codeDisplay ?? c.codeNormalized}
                                    {c.firstTimeOnly && <span className="ml-2 text-[10px] text-muted">1ª vez</span>}
                                    {c.restrictedToCoachId && <span className="ml-2 text-[10px] text-muted">partner</span>}
                                </td>
                                <td className={td}>{discountLabel(c)}</td>
                                <td className={td}>
                                    {c.redeemedCount}
                                    {c.maxRedemptions != null ? ` / ${c.maxRedemptions}` : ''}
                                </td>
                                <td className={td}>{c.perAccountLimit}</td>
                                <td className={`${td} whitespace-nowrap`}>
                                    {c.expiresAt ? fmtDate(c.expiresAt) : <span className="text-muted">sin límite</span>}
                                </td>
                                <td className={`${td} whitespace-nowrap`}>{fmtDate(c.createdAt)}</td>
                                <td className={td}>
                                    {c.active ? (
                                        <span className="text-[var(--success-500)]">activo</span>
                                    ) : (
                                        <span className="text-muted">inactivo</span>
                                    )}
                                </td>
                                <td className={`${td} text-right`}>{c.active && <DeactivateButton codeId={c.codeId} />}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div>
                <h2 className="mb-2 text-sm font-semibold text-strong">Canjes recientes</h2>
                <div className="overflow-x-auto rounded-lg border border-subtle">
                    <table className="w-full border-collapse">
                        <thead className="bg-surface-sunken">
                            <tr>
                                <th className={th}>Código</th>
                                <th className={th}>Coach</th>
                                <th className={th}>Descuento</th>
                                <th className={th}>Estado</th>
                                <th className={th}>Fecha</th>
                                <th className={th}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {redemptions.length === 0 && (
                                <tr>
                                    <td className={td} colSpan={6}>
                                        Sin canjes todavía.
                                    </td>
                                </tr>
                            )}
                            {redemptions.map((r) => (
                                <tr key={r.redemptionId} className="border-t border-subtle">
                                    <td className={`${td} font-mono text-strong`}>{r.couponCode ?? '—'}</td>
                                    <td className={td}>
                                        {r.coachId ? (
                                            <Link
                                                href={`/admin/coaches/${r.coachId}`}
                                                className="text-body underline-offset-2 transition-colors hover:text-[var(--sport-500)] hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)]"
                                            >
                                                {r.coachName ?? r.coachSlug ?? 'ver ficha'}
                                            </Link>
                                        ) : (
                                            (r.coachName ?? r.coachSlug ?? '—')
                                        )}
                                    </td>
                                    <td className={`${td} whitespace-nowrap`}>
                                        <span className="text-strong">{r.discountLabel ?? '—'}</span>
                                        {r.discountClp != null && r.discountClp > 0 && (
                                            <span className="ml-2 text-xs text-muted">
                                                −${r.discountClp.toLocaleString('es-CL')}
                                            </span>
                                        )}
                                    </td>
                                    <td className={td}>
                                        <Badge tone={REDEMPTION_TONE[r.status] ?? 'neutral'} variant="soft" size="sm">
                                            {REDEMPTION_LABEL[r.status] ?? r.status}
                                        </Badge>
                                    </td>
                                    <td className={`${td} whitespace-nowrap`}>{fmtDateTime(r.redeemedAt)}</td>
                                    <td className={`${td} text-right`}>
                                        {r.status === 'active' && (
                                            <RevokeRedemptionButton
                                                redemptionId={r.redemptionId}
                                                coachName={r.coachName}
                                                listPriceClp={r.listPriceClp}
                                                netPriceClp={r.netPriceClp}
                                            />
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}
