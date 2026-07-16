'use client'

import Link from 'next/link'
import Image from 'next/image'
import { CheckCircle2, ClipboardList, Info, Lock, Mail, UserRound, Wrench, Eye, EyeOff } from 'lucide-react'
import { SELF_SERVICE_ADDONS_ENABLED, type SubscriptionTier } from '@/lib/constants'
import { useCaptureModuleInterest } from '@/lib/posthog/events'
import { MODULE_CATALOG_KEYS, MODULE_CATALOG, type ModuleKey } from '@eva/module-catalog'

/**
 * Ilustración por módulo — assets del CEO en `/module-icons/` (mapea por MODULE_KEY;
 * `nutrition_exchanges` → nutrition-pro). Se apunta a la variante @2x para nitidez retina
 * en el tile de 46px (imagen estática, `unoptimized`).
 */
const MODULE_ICON_SRC: Record<ModuleKey, string> = {
    cardio: '/module-icons/cardio@2x.webp',
    movement_assessment: '/module-icons/movement@2x.webp',
    body_composition: '/module-icons/body-composition@2x.webp',
    nutrition_exchanges: '/module-icons/nutrition-pro@2x.webp',
}

/** Alcance de uso (kit: chip "Se configura en el plan" vs "Se usa con un alumno"). */
const PLAN_SCOPED_MODULES: ReadonlySet<ModuleKey> = new Set(['nutrition_exchanges'])

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
            {/* Comprar ≠ usar — banner info del kit */}
            <div className="flex items-start gap-2.5 rounded-control px-3.5 py-[11px]" style={{ background: 'var(--sport-100)' }}>
                <Info className="mt-0.5 h-[17px] w-[17px] shrink-0" style={{ color: 'var(--sport-600)' }} />
                <p className="text-[12.5px] font-semibold leading-normal" style={{ color: 'var(--sport-700)' }}>
                    Activa un módulo acá; usalo desde <b>Alumnos › Herramientas</b>. Cada uno se cobra aparte de tu plan.
                </p>
            </div>

            <ul className="space-y-3">
                {MODULE_CATALOG_KEYS.map((key) => {
                    const entry = MODULE_CATALOG[key]
                    const active = modules[key] === true
                    const inMaintenance = active && killedByOperator[key] === true
                    const moduleIconSrc = MODULE_ICON_SRC[key]
                    const planScoped = PLAN_SCOPED_MODULES.has(key)

                    return (
                        <li
                            key={key}
                            className="overflow-hidden rounded-card border border-subtle bg-surface-card p-4"
                        >
                            <div className="flex items-start gap-[13px]">
                                <span
                                    className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-[13px]"
                                    style={
                                        active
                                            ? { background: 'var(--sport-100)', color: 'var(--sport-600)' }
                                            : { background: 'var(--surface-sunken)', color: 'var(--text-subtle)' }
                                    }
                                >
                                    <Image
                                        src={moduleIconSrc}
                                        alt=""
                                        aria-hidden="true"
                                        width={30}
                                        height={30}
                                        unoptimized
                                        className={
                                            active
                                                ? 'h-[30px] w-[30px] object-contain'
                                                : 'h-[30px] w-[30px] object-contain opacity-70 grayscale'
                                        }
                                    />
                                </span>
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <p className="text-base font-bold text-strong">{entry.label}</p>
                                        {active ? (
                                            <span className="inline-flex shrink-0 items-center gap-1 rounded-pill px-2.5 py-1 text-xs font-bold" style={{ background: 'var(--success-100)', color: 'var(--success-700)' }}>
                                                <CheckCircle2 className="h-3.5 w-3.5" /> Activo
                                            </span>
                                        ) : (
                                            <span className="inline-flex shrink-0 items-center gap-1 rounded-pill bg-surface-sunken px-2.5 py-1 text-xs font-bold text-muted">
                                                <Lock className="h-3.5 w-3.5" /> De pago
                                            </span>
                                        )}
                                    </div>

                                    <p className="mt-1 text-[13px] leading-relaxed text-muted">
                                        {entry.pitch}
                                    </p>
                                </div>
                            </div>

                            {/* Superficies + alcance — chips pill del kit */}
                            <div className="mt-3 flex flex-wrap items-center gap-1.5">
                                <span className="inline-flex items-center gap-1.5 rounded-pill bg-surface-sunken px-2 py-[3px] text-[10.5px] font-bold text-muted">
                                    {planScoped ? (
                                        <ClipboardList className="h-[11px] w-[11px] shrink-0" />
                                    ) : (
                                        <UserRound className="h-[11px] w-[11px] shrink-0" />
                                    )}
                                    {planScoped ? 'Se configura en el plan' : 'Se usa con un alumno'}
                                </span>
                                {entry.surfaces.map((surface) => (
                                    <span
                                        key={surface}
                                        className="rounded-pill border border-subtle px-2 py-[3px] text-[10.5px] font-semibold text-subtle"
                                    >
                                        {surface}
                                    </span>
                                ))}
                            </div>

                            {active && (
                                <p className="mt-3 flex items-center gap-1.5 text-[12.5px] font-semibold" style={{ color: 'var(--success-700)' }}>
                                    <CheckCircle2 className="h-[15px] w-[15px] shrink-0" />
                                    Incluido en tu cuenta
                                </p>
                            )}

                            {inMaintenance && (
                                <p className="mt-3 flex items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--warning-600)' }}>
                                    <Wrench className="h-3.5 w-3.5 shrink-0" />
                                    Temporalmente en mantenimiento.
                                </p>
                            )}

                            {/* Cross-link a Funciones — solo Nutrición Pro tiene capa de visibilidad. */}
                            {active && key === 'nutrition_exchanges' && (
                                nutritionVisible ? (
                                    <p className="mt-3 flex items-center gap-1.5 text-xs" style={{ color: 'var(--success-700)' }}>
                                        <Eye className="h-3.5 w-3.5 shrink-0" />
                                        Visible para tus alumnos.
                                    </p>
                                ) : (
                                    <p className="mt-3 flex flex-wrap items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--warning-600)' }}>
                                        <EyeOff className="h-3.5 w-3.5 shrink-0" />
                                        Activo pero oculto.
                                        <Link
                                            href="/coach/settings/funciones"
                                            className="font-bold underline underline-offset-2 hover:no-underline"
                                        >
                                            Mostrar en Funciones →
                                        </Link>
                                    </p>
                                )
                            )}

                            {!active && (
                                <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-2">
                                    <ModuleCta
                                        moduleKey={key}
                                        scope={scope}
                                        isTeamManager={isTeamManager}
                                        tier={tier}
                                        onCapture={captureInterest}
                                    />
                                    {scope === 'standalone' && (
                                        <span className="ml-auto shrink-0 text-right">
                                            <span className="eva-metric block text-base text-strong">
                                                {clpFormatter.format(entry.priceClp)}
                                            </span>
                                            <span className="-mt-0.5 block text-[11px] text-subtle">/ mes</span>
                                        </span>
                                    )}
                                </div>
                            )}
                        </li>
                    )
                })}
            </ul>

            {scope === 'standalone' && (
                <p className="pt-1 text-center text-[11.5px] leading-relaxed text-subtle">
                    El cobro se prorratea al período. Gestiona bajas desde Suscripción.
                </p>
            )}
        </div>
    )
}

const CTA_LINK_CLASS =
    'inline-flex items-center gap-1.5 rounded-control bg-[var(--sport-500)] px-4 py-2 text-sm font-bold text-[var(--text-on-sport)] shadow-[var(--glow-sport)] transition-all hover:bg-[var(--cta-fill)] hover:-translate-y-0.5'

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
        return <p className="text-xs text-muted">Pídelo al owner de tu equipo.</p>
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
