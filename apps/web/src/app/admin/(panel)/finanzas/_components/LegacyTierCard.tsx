// Card "Legacy (grandfather)" — dashboard de extinción del grandfather (plan 04, D4 / mejora #5).
// Muestra cuántas cuentas growth/scale quedan por status/ciclo. Cuando llegue a 0 reales (excluyendo
// placeholders team_managed/org_managed), se puede planear matar el union legacy.

interface LegacyTierRow {
    subscription_tier: string
    subscription_status: string
    billing_cycle: string | null
    total: number
}

const STATUS_LABELS: Record<string, string> = {
    active: 'Activo',
    trialing: 'Trial',
    canceled: 'Cancelado',
    pending_payment: 'Pago pendiente',
    expired: 'Expirado',
    past_due: 'Cobro fallido',
    paused: 'Suspendido',
    team_managed: 'Gestionada (team)',
    org_managed: 'Gestionada (org)',
}

const CYCLE_LABELS: Record<string, string> = {
    monthly: 'Mensual',
    quarterly: 'Trimestral',
    annual: 'Anual',
}

function statusLabel(s: string) {
    return STATUS_LABELS[s] ?? s
}

function cycleLabel(c: string | null) {
    if (!c) return '—'
    return CYCLE_LABELS[c] ?? c
}

export function LegacyTierCard({ rows }: { rows: LegacyTierRow[] }) {
    const total = rows.reduce((sum, r) => sum + r.total, 0)

    return (
        <div className="rounded-lg border border-[--admin-border] bg-[--admin-bg-surface] overflow-hidden">
            <div className="flex items-center justify-between border-b border-[--admin-border] px-4 py-3">
                <div>
                    <h3 className="text-xs font-medium uppercase tracking-widest text-[--admin-text-3]">
                        Legacy (grandfather)
                    </h3>
                    <p className="mt-0.5 text-[11px] text-[--admin-text-3]">
                        Cuentas growth/scale restantes (fuera de venta). Incluye placeholders gestionados.
                    </p>
                </div>
                <span className="font-mono text-sm tabular-nums text-[--admin-text-1]">{total}</span>
            </div>

            {rows.length === 0 ? (
                <p className="px-4 py-8 text-center text-xs text-[--admin-text-3]">
                    Sin cuentas legacy — el grandfather se extinguió.
                </p>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[420px]">
                        <thead className="border-b border-[--admin-border]">
                            <tr>
                                <th className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-widest text-[--admin-text-3]">Tier</th>
                                <th className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-widest text-[--admin-text-3]">Estado</th>
                                <th className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-widest text-[--admin-text-3]">Ciclo</th>
                                <th className="px-3 py-2 text-right text-[11px] font-medium uppercase tracking-widest text-[--admin-text-3]">Cuentas</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[--admin-border]">
                            {rows.map((r, i) => (
                                <tr key={`${r.subscription_tier}-${r.subscription_status}-${r.billing_cycle}-${i}`} className="hover:bg-[--admin-bg-elevated] transition-colors">
                                    <td className="px-3 py-2.5">
                                        <span className="font-mono text-xs uppercase text-[--admin-text-2]">{r.subscription_tier}</span>
                                    </td>
                                    <td className="px-3 py-2.5">
                                        <span className="text-xs text-[--admin-text-1]">{statusLabel(r.subscription_status)}</span>
                                    </td>
                                    <td className="px-3 py-2.5">
                                        <span className="text-xs text-[--admin-text-2]">{cycleLabel(r.billing_cycle)}</span>
                                    </td>
                                    <td className="px-3 py-2.5 text-right">
                                        <span className="font-mono text-xs tabular-nums text-[--admin-text-1]">{r.total}</span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}
