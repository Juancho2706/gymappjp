import type { LiveDiscountRow } from '../_data/finanzas.queries'

function clp(n: number) {
    return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)
}

/**
 * Descuentos vivos sobre la suscripcion base: quien paga menos que lista, con que codigo,
 * y hasta cuando. Server component (solo lectura, sin estado). F0 auditoria 08-05.
 */
export function LiveDiscountsSection({ rows }: { rows: LiveDiscountRow[] }) {
    if (rows.length === 0) return null
    const totalClp = rows.reduce((sum, r) => sum + (r.listMonthlyClp - r.netMonthlyClp), 0)
    return (
        <section className="rounded-xl border border-subtle bg-surface-card p-4">
            <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-strong">Descuentos vivos</h2>
                <span className="font-mono text-xs tabular-nums text-[var(--warning-500)]">
                    −{clp(totalClp)}/mes · {rows.length} {rows.length === 1 ? 'coach' : 'coaches'}
                </span>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-xs">
                    <thead>
                        <tr className="border-b border-subtle text-[10px] uppercase tracking-wider text-muted">
                            <th className="pb-2 pr-3 font-medium">Coach</th>
                            <th className="pb-2 pr-3 font-medium">Codigo</th>
                            <th className="pb-2 pr-3 font-medium">Descuento</th>
                            <th className="pb-2 pr-3 text-right font-medium">Lista</th>
                            <th className="pb-2 pr-3 text-right font-medium">Paga</th>
                            <th className="pb-2 font-medium">Vigencia</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((r) => (
                            <tr key={r.coachId} className="border-b border-subtle last:border-b-0">
                                <td className="py-2 pr-3 font-medium text-strong">{r.coachLabel}</td>
                                <td className="py-2 pr-3 font-mono text-body">{r.code ?? '—'}</td>
                                <td className="py-2 pr-3 font-mono text-[var(--warning-500)]">{r.discountLabel}</td>
                                <td className="py-2 pr-3 text-right font-mono tabular-nums text-muted line-through">{clp(r.listMonthlyClp)}</td>
                                <td className="py-2 pr-3 text-right font-mono tabular-nums text-strong">{clp(r.netMonthlyClp)}</td>
                                <td className="py-2 text-body">
                                    {r.remainingCycles === null ? 'forever' : `${r.remainingCycles} ciclos restantes`}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    )
}
