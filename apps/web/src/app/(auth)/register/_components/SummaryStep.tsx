'use client'

import { Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
    BILLING_CYCLE_CONFIG,
    getTierCapabilities,
    getTierMaxClients,
    studentCountLabel,
    TIER_CONFIG,
    type BillingCycle,
    type SaleTier,
} from '@/lib/constants'

export type SummaryStepProps = {
    tier: SaleTier
    billingCycle: BillingCycle
    /** Total del plan en CLP (los módulos van incluidos; no hay add-ons en el signup). */
    totalClp: number
    /** Ver `PlanStep`: con `?tier=free` el alta no imprime ni una cifra. */
    freeOnly: boolean
}

/** Paso 3 del alta: resumen antes de confirmar (o de ir al checkout). */
export function SummaryStep({ tier, billingCycle, totalClp, freeOnly }: SummaryStepProps) {
    const selectedTier = TIER_CONFIG[tier]
    const isFreeTier = tier === 'free'
    return (
        <>
            <div>
                <h1 className="font-display text-2xl font-black tracking-[-0.02em] text-text-strong">
                    {isFreeTier ? 'Tu plan gratuito' : 'Resumen antes de pagar'}
                </h1>
                <p className="mt-1 text-[13.5px] text-text-muted">
                    Revisa y confirma. {isFreeTier ? 'Sin tarjeta de crédito.' : 'El cobro ocurre en el checkout seguro.'}
                </p>
            </div>
            <section className="rounded-card border border-border-subtle bg-surface-card p-4 space-y-3">
                <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between">
                        <span className="text-text-muted">Plan</span>
                        <span className="font-semibold text-text-strong">
                            {freeOnly ? 'Plan gratuito' : selectedTier.label}
                        </span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-text-muted">Alumnos</span>
                        <span className="font-semibold text-text-strong">
                            {/* Con `?tier=free` el cupo se imprime con el plural correcto de
                                @eva/tiers («1 alumno», no «Hasta 1»). */}
                            {freeOnly
                                ? studentCountLabel(getTierMaxClients(tier))
                                : `Hasta ${selectedTier.maxClients}`}
                        </span>
                    </div>
                    {!isFreeTier && (
                        <div className="flex justify-between">
                            <span className="text-text-muted">Facturación</span>
                            <span className="font-semibold text-text-strong">{BILLING_CYCLE_CONFIG[billingCycle].label}</span>
                        </div>
                    )}
                    {/* Nutrición base (V2) incluida en todos los planes, Free incluido. */}
                    <div className="flex justify-between">
                        <span className="text-text-muted">Nutrición</span>
                        <span className="font-semibold text-[var(--success-600)]">Incluida</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-text-muted">Tu marca (white-label)</span>
                        <span className={cn('font-semibold', getTierCapabilities(tier).canUseBranding ? 'text-[var(--success-600)]' : 'text-[var(--warning-700)]')}>
                            {getTierCapabilities(tier).canUseBranding ? 'Incluida' : 'No incluida'}
                        </span>
                    </div>
                    {/* Pricing v2 (P3): los 4 módulos van incluidos en TODOS los planes,
                        Free incluido — el gate server ya los libera. */}
                    <div className="flex justify-between">
                        <span className="text-text-muted">Módulos profesionales (4)</span>
                        <span className="font-semibold text-[var(--success-600)]">Incluidos</span>
                    </div>
                    <div className="flex justify-between border-t border-border-default pt-2 mt-2">
                        <span className="text-text-muted">{isFreeTier ? 'Costo' : 'Total a pagar'}</span>
                        <span className="text-lg font-black text-text-strong">
                            {isFreeTier ? (
                                // `$0 — Gratis` lleva el signo peso: con `?tier=free` (el camino del
                                // sello de la app iOS) queda solo la palabra, sin cifra.
                                <span className="text-[var(--success-600)]">{freeOnly ? 'Gratis' : '$0 — Gratis'}</span>
                            ) : (
                                `$${totalClp.toLocaleString('es-CL')} CLP`
                            )}
                        </span>
                    </div>
                </div>
                {isFreeTier ? (
                    <div className="flex items-start gap-2 pt-1 text-xs text-text-muted">
                        <Sparkles className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[var(--success-500)]" />
                        <span>
                            {freeOnly
                                ? 'Sin tarjeta de crédito. Acceso inmediato. Puedes cambiar de plan cuando quieras desde tu cuenta.'
                                : 'Sin tarjeta de crédito. Acceso inmediato. Puedes hacer upgrade cuando quieras desde tu dashboard.'}
                        </span>
                    </div>
                ) : (
                    <p className="text-xs text-text-muted pt-1">
                        Al crear tu cuenta, te llevaremos directamente al checkout de MercadoPago para completar el pago.
                    </p>
                )}
            </section>
        </>
    )
}
