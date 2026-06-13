'use client'

import { AdminKpiCard } from '../../_components/AdminKpiCard'
import type { AddonMetrics } from '../_data/finanzas.queries'

/**
 * Métricas de adopción de add-ons (plan 05 / F6.3): MRR mensualizado, adopción por módulo y
 * churn. Sección read-only del panel /admin, junto a finanzas. Los montos los calcula el server
 * con las funciones del motor (`isAddonBillable`); el componente solo presenta.
 */

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

    return (
        <div className="space-y-4">
            <div>
                <h2 className="text-lg font-bold tracking-tight text-[--admin-text-1]">Add-ons</h2>
                <p className="text-xs text-[--admin-text-3]">
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
                <div className="rounded-lg border border-[--admin-border] bg-[--admin-bg-surface] p-4">
                    <h3 className="mb-3 text-xs font-medium uppercase tracking-widest text-[--admin-text-3]">
                        Adopción por módulo
                    </h3>
                    <ul className="space-y-3">
                        {adoptionByModule.map((row) => (
                            <li key={row.moduleKey} className="space-y-1">
                                <div className="flex items-center justify-between text-xs">
                                    <span className="text-[--admin-text-2]">{row.label}</span>
                                    <span className="font-mono tabular-nums text-[--admin-text-1]">
                                        {row.payingCoaches}
                                        {row.grantedCoaches > 0 && (
                                            <span className="ml-1 text-[--admin-text-3]">
                                                (+{row.grantedCoaches} cortesía)
                                            </span>
                                        )}
                                    </span>
                                </div>
                                <div className="h-1.5 w-full overflow-hidden rounded-full bg-[--admin-border]">
                                    <div
                                        className="h-full rounded-full bg-[--admin-accent]"
                                        style={{
                                            width: `${(row.payingCoaches / maxPaying) * 100}%`,
                                        }}
                                    />
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>

                {/* Churn de add-ons */}
                <div className="rounded-lg border border-[--admin-border] bg-[--admin-bg-surface] p-4">
                    <h3 className="mb-3 text-xs font-medium uppercase tracking-widest text-[--admin-text-3]">
                        Churn de add-ons (12 meses)
                    </h3>
                    {churnSeries.length === 0 ? (
                        <p className="py-10 text-center text-xs text-[--admin-text-3]">
                            Sin bajas registradas
                        </p>
                    ) : (
                        <ul className="space-y-2">
                            {churnSeries.map((row) => (
                                <li
                                    key={row.ym}
                                    className="flex items-center justify-between text-xs"
                                >
                                    <span className="text-[--admin-text-2]">{row.ym}</span>
                                    <span className="font-mono tabular-nums text-[--admin-red]">
                                        {row.cancelled}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    )
}
