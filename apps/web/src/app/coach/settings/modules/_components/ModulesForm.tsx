'use client'

import Link from 'next/link'
import Image from 'next/image'
import { CheckCircle2, ClipboardList, Info, Lock, UserRound, Wrench, Eye, EyeOff, ArrowRight } from 'lucide-react'
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

/**
 * Settings > Módulos — catálogo read-only de las herramientas profesionales.
 *
 * Decisión CEO 2026-07-17: los 4 módulos vienen INCLUIDOS con cualquier plan pago
 * (starter/pro/elite y equivalentes team/enterprise). Ya no se compran, activan ni
 * desactivan por separado — esta página dejó de ser superficie de venta de add-ons.
 * Coach pago: cada módulo muestra "Incluido en tu plan". Coach free: upsell único de
 * UPGRADE de suscripción (patrón existente de /coach/subscription, sin checkout nuevo).
 */
export function ModulesForm({
    modules,
    killedByOperator,
    scope,
    hasPaidPlan,
    nutritionVisible,
}: {
    modules: Record<ModuleKey, boolean>
    killedByOperator: Record<ModuleKey, boolean>
    scope: 'team' | 'standalone'
    /** ¿Plan pago con acceso efectivo? Decide "Incluido en tu plan" vs upsell de upgrade. */
    hasPaidPlan: boolean
    /** ¿Está visible el dominio Nutrición? Solo aplica a `nutrition_exchanges` (cross-link a Funciones). */
    nutritionVisible: boolean
}) {
    return (
        <div className="space-y-4">
            {/* Incluido ≠ configurar — banner info del kit */}
            <div className="flex items-start gap-2.5 rounded-control px-3.5 py-[11px]" style={{ background: 'var(--sport-100)' }}>
                <Info className="mt-0.5 h-[17px] w-[17px] shrink-0" style={{ color: 'var(--sport-600)' }} />
                <p className="text-[12.5px] font-semibold leading-normal" style={{ color: 'var(--sport-700)' }}>
                    {hasPaidPlan
                        ? <>Estos módulos vienen incluidos en tu plan. Úsalos desde <b>Alumnos › Herramientas</b>.</>
                        : <>Los módulos vienen incluidos en cualquier plan pago. En el plan Free no están disponibles.</>}
                </p>
            </div>

            <ul className="space-y-3">
                {MODULE_CATALOG_KEYS.map((key) => {
                    const entry = MODULE_CATALOG[key]
                    // Incluido = plan pago (todos) o entitlement puntual ya activo (ej. cortesía).
                    const included = hasPaidPlan || modules[key] === true
                    const inMaintenance = included && killedByOperator[key] === true
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
                                        included
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
                                            included
                                                ? 'h-[30px] w-[30px] object-contain'
                                                : 'h-[30px] w-[30px] object-contain opacity-70 grayscale'
                                        }
                                    />
                                </span>
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <p className="text-base font-bold text-strong">{entry.label}</p>
                                        {included ? (
                                            <span className="inline-flex shrink-0 items-center gap-1 rounded-pill px-2.5 py-1 text-xs font-bold" style={{ background: 'var(--success-100)', color: 'var(--success-700)' }}>
                                                <CheckCircle2 className="h-3.5 w-3.5" /> Incluido
                                            </span>
                                        ) : (
                                            <span className="inline-flex shrink-0 items-center gap-1 rounded-pill bg-surface-sunken px-2.5 py-1 text-xs font-bold text-muted">
                                                <Lock className="h-3.5 w-3.5" /> Con plan pago
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

                            {included && (
                                <p className="mt-3 flex items-center gap-1.5 text-[12.5px] font-semibold" style={{ color: 'var(--success-700)' }}>
                                    <CheckCircle2 className="h-[15px] w-[15px] shrink-0" />
                                    Incluido en tu plan
                                </p>
                            )}

                            {inMaintenance && (
                                <p className="mt-3 flex items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--warning-600)' }}>
                                    <Wrench className="h-3.5 w-3.5 shrink-0" />
                                    Temporalmente en mantenimiento.
                                </p>
                            )}

                            {/* Cross-link a Funciones — solo Nutrición Pro tiene capa de visibilidad. */}
                            {included && key === 'nutrition_exchanges' && (
                                nutritionVisible ? (
                                    <p className="mt-3 flex items-center gap-1.5 text-xs" style={{ color: 'var(--success-700)' }}>
                                        <Eye className="h-3.5 w-3.5 shrink-0" />
                                        Visible para tus alumnos.
                                    </p>
                                ) : (
                                    <p className="mt-3 flex flex-wrap items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--warning-600)' }}>
                                        <EyeOff className="h-3.5 w-3.5 shrink-0" />
                                        Incluido pero oculto.
                                        <Link
                                            href="/coach/settings/funciones"
                                            className="font-bold underline underline-offset-2 hover:no-underline"
                                        >
                                            Mostrar en Funciones →
                                        </Link>
                                    </p>
                                )
                            )}
                        </li>
                    )
                })}
            </ul>

            {/* Upsell ÚNICO de upgrade (coach free standalone) — reusa el flujo de /coach/subscription. */}
            {!hasPaidPlan && scope === 'standalone' && (
                <div className="rounded-card border border-subtle bg-surface-card p-4">
                    <p className="text-sm font-bold text-strong">Incluidos en todos los planes pagos</p>
                    <p className="mt-1 text-[13px] leading-relaxed text-muted">
                        Al pasar a un plan pago, estos 4 módulos se activan automáticamente en tu cuenta.
                    </p>
                    <Link
                        href="/coach/subscription"
                        className="mt-3 inline-flex items-center gap-1.5 rounded-control bg-[var(--sport-500)] px-4 py-2 text-sm font-bold text-[var(--text-on-sport)] shadow-[var(--glow-sport)] transition-all hover:bg-[var(--cta-fill)] hover:-translate-y-0.5"
                    >
                        Ver planes <ArrowRight className="h-4 w-4" />
                    </Link>
                </div>
            )}
        </div>
    )
}
