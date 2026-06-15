'use client'

import type { CoachAddonDetailRow } from '../_data/finanzas.queries'

/**
 * Detalle de add-ons por coach (monitoreo del lanzamiento). Tabla read-only para detectar
 * "bypass" o problemas: filas con `flag` se resaltan y se ordenan primero. Marca cuentas de
 * prueba. El cálculo (anomalías, etiqueta del coach) lo hace el server; el componente presenta.
 */

function clp(n: number) {
    return new Intl.NumberFormat('es-CL', {
        style: 'currency',
        currency: 'CLP',
        maximumFractionDigits: 0,
    }).format(n)
}

function shortDate(iso: string | null) {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: '2-digit' })
}

const STATUS_LABEL: Record<string, string> = {
    active: 'Activo',
    cancel_pending: 'Baja en curso',
}

export function AddonsByCoachSection({ rows }: { rows: CoachAddonDetailRow[] }) {
    // Anomalías primero, luego por coach.
    const sorted = [...rows].sort((a, b) => {
        if (!!a.flag !== !!b.flag) return a.flag ? -1 : 1
        return a.coachLabel.localeCompare(b.coachLabel)
    })
    const anomalies = rows.filter((r) => r.flag).length

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <h2 className="text-lg font-bold tracking-tight text-[--admin-text-1]">
                        Add-ons por coach
                    </h2>
                    <p className="text-xs text-[--admin-text-3]">
                        Quién tiene cada módulo, su origen y si hay evidencia de cobro — para detectar
                        bypass o problemas. Incluye cuentas de prueba (marcadas).
                    </p>
                </div>
                {anomalies > 0 && (
                    <span className="rounded-full bg-[--admin-red]/15 px-2.5 py-1 text-xs font-semibold text-[--admin-red]">
                        {anomalies} a revisar
                    </span>
                )}
            </div>

            {rows.length === 0 ? (
                <p className="rounded-lg border border-[--admin-border] bg-[--admin-bg-surface] px-4 py-10 text-center text-xs text-[--admin-text-3]">
                    Sin add-ons activos todavía.
                </p>
            ) : (
                <div className="overflow-x-auto rounded-lg border border-[--admin-border] bg-[--admin-bg-surface]">
                    <table className="w-full min-w-[780px] text-xs">
                        <thead>
                            <tr className="border-b border-[--admin-border] text-left text-[--admin-text-3]">
                                <th className="px-3 py-2 font-medium">Coach</th>
                                <th className="px-3 py-2 font-medium">Módulo</th>
                                <th className="px-3 py-2 font-medium">Origen</th>
                                <th className="px-3 py-2 font-medium">Estado</th>
                                <th className="px-3 py-2 text-right font-medium">Precio/mes</th>
                                <th className="px-3 py-2 font-medium">Primer cobro</th>
                                <th className="px-3 py-2 font-medium">Alerta</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sorted.map((r) => (
                                <tr
                                    key={`${r.coachId}-${r.moduleKey}`}
                                    className={`border-b border-[--admin-border] last:border-0 ${
                                        r.flag ? 'bg-[--admin-red]/5' : ''
                                    }`}
                                >
                                    <td className="px-3 py-2 text-[--admin-text-1]">
                                        <span className="font-medium">{r.coachLabel}</span>
                                        {r.isTest && (
                                            <span className="ml-1.5 rounded bg-[--admin-border] px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[--admin-text-3]">
                                                prueba
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-3 py-2 text-[--admin-text-2]">{r.moduleLabel}</td>
                                    <td className="px-3 py-2">
                                        {r.source === 'admin_grant' ? (
                                            <span className="text-[--admin-text-3]">Cortesía</span>
                                        ) : (
                                            <span className="text-[--admin-text-2]">Pago</span>
                                        )}
                                    </td>
                                    <td className="px-3 py-2 text-[--admin-text-2]">
                                        {STATUS_LABEL[r.status] ?? r.status}
                                    </td>
                                    <td className="px-3 py-2 text-right font-mono tabular-nums text-[--admin-text-2]">
                                        {r.source === 'admin_grant' ? '—' : clp(r.priceClp)}
                                    </td>
                                    <td className="px-3 py-2 font-mono tabular-nums text-[--admin-text-3]">
                                        {shortDate(r.firstChargedAt)}
                                    </td>
                                    <td className="px-3 py-2">
                                        {r.flag ? (
                                            <span className="font-medium text-[--admin-red]">⚠ {r.flag}</span>
                                        ) : (
                                            <span className="text-[--admin-text-3]">—</span>
                                        )}
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
