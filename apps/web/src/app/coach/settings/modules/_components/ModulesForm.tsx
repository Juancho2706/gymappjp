'use client'

import Link from 'next/link'
import { CheckCircle2, Lock, Mail, Wrench, Eye, EyeOff } from 'lucide-react'
import { SELF_SERVICE_ADDONS_ENABLED, type SubscriptionTier } from '@/lib/constants'
import { useCaptureModuleInterest } from '@/lib/posthog/events'
import { MODULE_CATALOG_KEYS, MODULE_CATALOG, type ModuleKey } from '@eva/module-catalog'

/** Precio de lista en CLP (es-CL: punto como separador de miles, sin decimales). */
const clpFormatter = new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
})

const MAILTO_STANDALONE =
    'mailto:contacto@eva-app.cl?subject=Quiero%20activar%20un%20m%C3%B3dulo'
const MAILTO_TEAM =
    'mailto:contacto@eva-app.cl?subject=M%C3%B3dulos%20para%20mi%20equipo'

/**
 * Settings > Módulos — CATÁLOGO READ-ONLY (compra-only, plan estrategia 03 / F1.2).
 * Ya no hay switches ni guardado: el coach NO se auto-activa módulos (la escritura quedó
 * SOLO en service-role — override admin del CEO). Por cada módulo: badge Activo/De pago,
 * pitch + superficies (copy canónico en @eva/module-catalog) y CTA por contexto. Cada click
 * de CTA captura `module_interest_cta_clicked` (telemetría de intención, PostHog ya gated
 * por consentimiento de cookies). Anti-hostigamiento: 1 de las 2 únicas superficies de venta.
 */
export function ModulesForm({
    modules,
    killedByOperator,
    isTeamManager,
    scope,
    tier,
    nutritionVisible,
}: {
    modules: Record<ModuleKey, boolean>
    killedByOperator: Record<ModuleKey, boolean>
    isTeamManager: boolean
    scope: 'team' | 'standalone'
    tier: SubscriptionTier
    /** ¿Está visible el dominio Nutrición? Solo aplica a `nutrition_exchanges` (cross-link a Funciones). */
    nutritionVisible: boolean
}) {
    const captureInterest = useCaptureModuleInterest()

    return (
        <div className="space-y-4">
            <ul className="space-y-3">
                {MODULE_CATALOG_KEYS.map((key) => {
                    const entry = MODULE_CATALOG[key]
                    const active = modules[key] === true
                    const inMaintenance = active && killedByOperator[key] === true

                    return (
                        <li
                            key={key}
                            className="overflow-hidden rounded-2xl border border-border bg-card p-4"
                        >
                            <div className="flex items-start justify-between gap-3">
                                <p className="font-semibold text-foreground">{entry.label}</p>
                                {active ? (
                                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                                        <CheckCircle2 className="h-3.5 w-3.5" /> Activo
                                    </span>
                                ) : (
                                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                                        <Lock className="h-3.5 w-3.5" /> De pago
                                    </span>
                                )}
                            </div>

                            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                                {entry.pitch}
                            </p>

                            <ul className="mt-3 space-y-1">
                                {entry.surfaces.map((surface) => (
                                    <li
                                        key={surface}
                                        className="flex items-start gap-2 text-xs text-muted-foreground"
                                    >
                                        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/60" />
                                        <span>{surface}</span>
                                    </li>
                                ))}
                            </ul>

                            {inMaintenance && (
                                <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                                    <Wrench className="h-3.5 w-3.5 shrink-0" />
                                    Temporalmente en mantenimiento.
                                </p>
                            )}

                            {/* Cross-link a Funciones — solo Nutrición Pro tiene capa de visibilidad. */}
                            {active && key === 'nutrition_exchanges' && (
                                nutritionVisible ? (
                                    <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                                        <Eye className="h-3.5 w-3.5 shrink-0" />
                                        Visible para tus alumnos.
                                    </p>
                                ) : (
                                    <p className="mt-3 flex flex-wrap items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                                        <EyeOff className="h-3.5 w-3.5 shrink-0" />
                                        Activo pero oculto.
                                        <Link
                                            href="/coach/settings/funciones"
                                            className="font-semibold underline underline-offset-2 hover:no-underline"
                                        >
                                            Mostrar en Funciones →
                                        </Link>
                                    </p>
                                )
                            )}

                            {!active && (
                                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                                    {scope === 'standalone' && (
                                        <span className="text-sm font-extrabold text-foreground">
                                            {clpFormatter.format(entry.priceClp)}
                                            <span className="text-xs font-normal text-muted-foreground"> / mes</span>
                                        </span>
                                    )}
                                    <ModuleCta
                                        moduleKey={key}
                                        scope={scope}
                                        isTeamManager={isTeamManager}
                                        tier={tier}
                                        onCapture={captureInterest}
                                    />
                                </div>
                            )}
                        </li>
                    )
                })}
            </ul>
        </div>
    )
}

const CTA_LINK_CLASS =
    'inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-lg transition-all hover:opacity-90 hover:-translate-y-0.5'

function ModuleCta({
    moduleKey,
    scope,
    isTeamManager,
    tier,
    onCapture,
}: {
    moduleKey: ModuleKey
    scope: 'team' | 'standalone'
    isTeamManager: boolean
    tier: SubscriptionTier
    onCapture: (
        moduleKey: string,
        ctaContext: 'standalone_mailto' | 'team_manager_mailto' | 'self_service',
        tier: SubscriptionTier
    ) => void
}) {
    // Team — miembro sin gestión: sin link, solo guía hacia el owner.
    if (scope === 'team' && !isTeamManager) {
        return <p className="text-xs text-muted-foreground">Pídelo al owner de tu equipo.</p>
    }

    // Team — gestor (owner / co-gestor): mailto conversacional.
    if (scope === 'team') {
        return (
            <a
                href={MAILTO_TEAM}
                className={CTA_LINK_CLASS}
                onClick={() => onCapture(moduleKey, 'team_manager_mailto', tier)}
            >
                <Mail className="h-4 w-4" /> Conversemos — contacto@eva-app.cl
            </a>
        )
    }

    // Standalone — CTA final self-service (plan 05) gated por SELF_SERVICE_ADDONS_ENABLED.
    if (SELF_SERVICE_ADDONS_ENABLED) {
        return (
            <a
                href="/coach/subscription#addons"
                className={CTA_LINK_CLASS}
                onClick={() => onCapture(moduleKey, 'self_service', tier)}
            >
                <Lock className="h-4 w-4" /> Desbloquear
            </a>
        )
    }

    // Standalone — CTA interino (mailto) mientras self-service está OFF (D4).
    return (
        <a
            href={MAILTO_STANDALONE}
            className={CTA_LINK_CLASS}
            onClick={() => onCapture(moduleKey, 'standalone_mailto', tier)}
        >
            <Mail className="h-4 w-4" /> Desbloquear — escríbenos a contacto@eva-app.cl
        </a>
    )
}
