'use client'

import { PackageOpen } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { AdminKpiCard } from '../../_components/AdminKpiCard'
import { AdminEmptyState } from '../../_components/AdminEmptyState'
import type { AddonMetrics } from '../_data/finanzas.queries'

/**
 * Métricas de adopción de add-ons (plan 05 / F6.3): MRR mensualizado, adopción por módulo y
 * churn. Sección read-only del panel /admin, junto a finanzas. Los montos los calcula el server
 * con las funciones del motor (`isAddonBillable`); el componente solo presenta.
 */

const AXIS_TICK = { fill: 'var(--text-muted)', fontSize: 10 }
const GRID_STROKE = 'var(--border-subtle)'

const TOOLTIP_STYLE = {
    contentStyle: {
        backgroundColor: 'var(--surface-card)',
        borderColor: 'var(--border-subtle)',
        borderRadius: 10,
        color: 'var(--text-strong)',
        fontSize: 12,
    },
    itemStyle: { color: 'var(--text-strong)' },
    labelStyle: { color: 'var(--text-muted)' },
}

const MONTHS_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** 'YYYY-MM' → 'ene 26'. Duplicado a propósito de FinanzasCharts: son dos componentes de cliente
 *  independientes y no hay barrel compartido en `_components` para helpers. */
function ymLabel(ym: string): string {
    const [year, month] = ym.split('-')
    const idx = Number(month) - 1
    if (!year || Number.isNaN(idx) || !MONTHS_ES[idx]) return ym
    return `${MONTHS_ES[idx]} ${year.slice(2)}`
}

function clp(n: number) {
    return new Intl.NumberFormat('es-CL', {
        style: 'currency',
        currency: 'CLP',
        maximumFractionDigits: 0,
    }).format(n)
}

export function AddonMetricsSection({ metrics }: { metrics: AddonMetrics }) {
    const { addonMrrClp, billableAddonCount, coachesWithAddons, adoptionByModule, churnSeries } =
        metrics
    const maxPaying = Math.max(1, ...adoptionByModule.map((r) => r.payingCoaches))
    // Sin una sola contratación ni cortesía la lista era un <ul> vacío colgando del título.
    const hasAdoption = adoptionByModule.some(
        (r) => r.payingCoaches > 0 || r.grantedCoaches > 0
    )
    const churnData = churnSeries.map((d) => ({ ...d, label: ymLabel(d.ym) }))

    return (
        <div className="space-y-4">
            <div>
                <h2 className="text-lg font-bold tracking-tight text-strong">Add-ons</h2>
                <p className="text-xs text-muted">
                    Módulos de pago self-service: MRR mensualizado, adopción y churn.
                </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <AdminKpiCard
                    label="MRR add-ons"
                    value={clp(addonMrrClp)}
                    tooltip="Ingreso mensual recurrente de add-ons. Suma el precio MENSUAL congelado de cada add-on pago facturable vivo. Las cortesías del CEO no cuentan."
                />
                <AdminKpiCard
                    label="ARR add-ons"
                    value={clp(addonMrrClp * 12)}
                    tooltip="MRR de add-ons proyectado a 12 meses."
                />
                <AdminKpiCard
                    label="Add-ons activos"
                    value={String(billableAddonCount)}
                    tooltip="Filas de add-ons pagos facturables vivas (active o cancel_pending sin cobrar)."
                />
                <AdminKpiCard
                    label="Coaches con add-ons"
                    value={String(coachesWithAddons)}
                    tooltip="Coaches con al menos un add-on pago facturable vivo."
                />
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {/* Adopción por módulo */}
                <div className="rounded-card border border-subtle bg-surface-card p-4 shadow-[var(--shadow-sm)]">
                    <h3 className="mb-3 text-xs font-medium uppercase tracking-widest text-muted">
                        Adopción por módulo
                    </h3>
                    {!hasAdoption ? (
                        <AdminEmptyState
                            icon={PackageOpen}
                            title="Nadie contrató add-ons todavía"
                            description="Ni pagos ni cortesías vivas. Al primer módulo contratado aparece el desglose por módulo."
                        />
                    ) : (
                        <ul className="space-y-3">
                            {adoptionByModule.map((row) => (
                                <li key={row.moduleKey} className="space-y-1">
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="text-body">{row.label}</span>
                                        <span className="font-mono tabular-nums text-strong">
                                            {row.payingCoaches}
                                            {row.grantedCoaches > 0 && (
                                                <span className="ml-1 text-muted">
                                                    (+{row.grantedCoaches} cortesía)
                                                </span>
                                            )}
                                        </span>
                                    </div>
                                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--border-subtle)]">
                                        <div
                                            className="h-full rounded-full bg-[var(--sport-500)]"
                                            style={{
                                                width: `${(row.payingCoaches / maxPaying) * 100}%`,
                                            }}
                                        />
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                {/* Churn de add-ons — mismo idiom que el churn de suscripciones (barras danger) */}
                <div className="rounded-card border border-subtle bg-surface-card p-4 shadow-[var(--shadow-sm)]">
                    <h3 className="mb-3 text-xs font-medium uppercase tracking-widest text-muted">
                        Churn de add-ons (12 meses)
                    </h3>
                    {churnData.length === 0 ? (
                        <p className="py-10 text-center text-xs text-muted">
                            Sin bajas registradas
                        </p>
                    ) : (
                        <ResponsiveContainer width="100%" height={200}>
                            <BarChart data={churnData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                                <XAxis dataKey="label" interval="preserveStartEnd" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                                <YAxis allowDecimals={false} tick={AXIS_TICK} axisLine={false} tickLine={false} width={30} />
                                <Tooltip {...TOOLTIP_STYLE} />
                                <Bar dataKey="cancelled" name="Bajas" fill="var(--danger-500)" fillOpacity={0.8} radius={[2, 2, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </div>
            </div>
        </div>
    )
}
