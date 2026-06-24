'use client'

import { useState, useTransition } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { toast } from 'sonner'
import { Apple, ChevronDown, Lock, Sparkles, Save } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
    DOMAIN_ENABLED_KEY,
    normalizePreset,
    type FeatureDomain,
    type FeatureSection,
    type ModuleKey,
    type Preset,
    type SectionPrefs,
} from '@eva/feature-prefs'
import { MODULE_CATALOG } from '@eva/module-catalog'
import { Switch } from '@/components/ui/switch'
import { InfoTooltip } from '@/components/ui/info-tooltip'
import { cn } from '@/lib/utils'
import {
    setCoachFeaturePrefs,
    setTeamFeaturePrefs,
    type FeaturePrefsResult,
} from '@/app/coach/settings/_actions/feature-prefs.actions'

/**
 * Zona "Funciones" — el coach (standalone) o el owner/gestor (team) eligen QUE se muestra de cada
 * DOMINIO (Nutricion hoy; Ejercicios, Planes, etc. a futuro). Modelo
 * `visible = ENTITLED (billing) AND ENABLED (esta preferencia)`: este panel SOLO escribe la capa
 * ENABLED. La preferencia solo achica — nunca prende algo no entitled.
 *
 * Estructura POR AREA (un grupo por dominio): el panel itera `domains` y renderiza un
 * `<DomainFuncionesGroup>` por cada uno. Con UN solo dominio se muestra expandido; con varios cada
 * area es colapsable. El explainer Modulos-vs-Funciones se muestra UNA vez al final (no por dominio).
 *
 * UI por area (plan §4 / spec UI-UX), dentro de cada grupo:
 *  1. Selector de PRESET (1 pregunta, doble como onboarding, descartable).
 *  2. Master switch del dominio (key reservada `_enabled`).
 *  3. Expander "Ajustar secciones" -> toggles por seccion (skip core), con badge Base/Pro +
 *     InfoTooltip. Las secciones Pro sin entitlement van LOCKED con CTA a /coach/subscription#addons.
 *
 * Todos los writes son optimistas (estado local) + toast, y revierten el estado si la action falla.
 * Cada grupo escribe via setCoach/TeamFeaturePrefs con SU dominio. Targets >=44px, respeta
 * `useReducedMotion`.
 */

type ScopeName = 'coach' | 'team'

/** Config de una "area" (dominio) que renderiza el panel. Espejo de `DomainFuncionesConfig`. */
export interface DomainConfig {
    domain: FeatureDomain
    label: string
    sections: readonly FeatureSection[]
    preset: Preset
    sectionPrefs: SectionPrefs
    entitledByModule: Partial<Record<ModuleKey, boolean>>
}

interface FeaturePrefsPanelProps {
    scope: ScopeName
    /** Requerido cuando scope === 'team'. */
    teamId?: string
    /** Una entrada por dominio de `FEATURE_DOMAINS` (Nutricion hoy; extensible). */
    domains: DomainConfig[]
}

/** Iconos por dominio (fallback a Apple si llega un dominio nuevo sin entrada). */
const DOMAIN_ICONS: Partial<Record<FeatureDomain, LucideIcon>> = {
    nutrition: Apple,
}

const PRESET_OPTIONS: { value: Preset; label: string; hint: string }[] = [
    { value: 'basico', label: 'Básico', hint: 'Lo esencial: plan, macros y adherencia.' },
    { value: 'intermedio', label: 'Intermedio', hint: 'Suma micros, hábitos, recetas y más.' },
    { value: 'profesional', label: 'Profesional', hint: 'Todo, incluido lo de tus módulos Pro.' },
]

/** El preset define el estado por defecto de cada seccion toggleable (el catalogo lo declara en `presets`). */
function sectionsForPreset(toggleable: readonly FeatureSection[], preset: Preset): SectionPrefs {
    const out: SectionPrefs = {}
    for (const section of toggleable) {
        out[section.key] = section.presets[preset] === true
    }
    return out
}

export function FeaturePrefsPanel({ scope, teamId, domains }: FeaturePrefsPanelProps) {
    const single = domains.length === 1

    return (
        <div className="space-y-5">
            {domains.map((d) => (
                <DomainFuncionesGroup
                    key={d.domain}
                    scope={scope}
                    teamId={teamId}
                    config={d}
                    defaultOpen={single}
                    collapsible={!single}
                />
            ))}

            {/* Explainer Modulos vs Funciones — UNA vez para todo el panel. */}
            <p className="px-1 text-xs leading-relaxed text-muted-foreground">
                <span className="font-semibold text-foreground">Módulos</span> es lo que compraste
                (entitlements de pago). <span className="font-semibold text-foreground">Funciones</span>{' '}
                es lo que decides mostrar de eso. Apagar una función nunca cancela un módulo ni borra
                datos — solo la oculta.
            </p>
        </div>
    )
}

interface DomainFuncionesGroupProps {
    scope: ScopeName
    teamId?: string
    config: DomainConfig
    /** Estado inicial del area (expandida con un solo dominio). */
    defaultOpen: boolean
    /** `true` => el header del area colapsa/expande (con varios dominios). */
    collapsible: boolean
}

/**
 * UNA area del panel: cabecera con icono + label del dominio, y dentro los controles del dominio
 * (preset + master switch + ajustar secciones). Cada area mantiene su propio estado optimista y
 * escribe con SU `domain`.
 */
function DomainFuncionesGroup({
    scope,
    teamId,
    config,
    defaultOpen,
    collapsible,
}: DomainFuncionesGroupProps) {
    const reduceMotion = useReducedMotion()
    const [isPending, startTransition] = useTransition()

    const [preset, setPreset] = useState<Preset>(normalizePreset(config.preset))
    const [sections, setSections] = useState<SectionPrefs>(config.sectionPrefs)
    const [saved, setSaved] = useState<{ preset: Preset; sections: SectionPrefs }>({
        preset: normalizePreset(config.preset),
        sections: config.sectionPrefs,
    })
    const [adjustOpen, setAdjustOpen] = useState(false)
    const [areaOpen, setAreaOpen] = useState(defaultOpen)

    const Icon = DOMAIN_ICONS[config.domain] ?? Apple
    const toggleableSections = config.sections.filter((s) => !s.core)

    // `_enabled` ausente => dominio prendido (no rompe coaches backfilleados).
    const domainEnabled = sections[DOMAIN_ENABLED_KEY] ?? true
    const dirty =
        preset !== saved.preset || JSON.stringify(sections) !== JSON.stringify(saved.sections)

    // Los cambios son SOLO borrador local (no persisten por toggle -> no re-renderiza a cada rato).
    // Se commitean UNA vez con "Guardar configuracion".
    function applyPreset(next: Preset) {
        if (next === preset) return
        // Cambiar de preset re-siembra las secciones a su default, preservando el master switch.
        setPreset(next)
        setSections({
            ...sectionsForPreset(toggleableSections, next),
            [DOMAIN_ENABLED_KEY]: domainEnabled,
        })
    }

    function toggleDomain(nextEnabled: boolean) {
        setSections((s) => ({ ...s, [DOMAIN_ENABLED_KEY]: nextEnabled }))
    }

    function toggleSection(key: string, nextOn: boolean) {
        setSections((s) => ({ ...s, [key]: nextOn }))
    }

    /** Commit del borrador (una sola escritura). En error NO revierte (el coach reintenta). */
    function save() {
        startTransition(async () => {
            const result: FeaturePrefsResult =
                scope === 'team'
                    ? await setTeamFeaturePrefs({
                          teamId: teamId!,
                          domain: config.domain,
                          preset,
                          sections: sections as Record<string, boolean>,
                      })
                    : await setCoachFeaturePrefs({
                          domain: config.domain,
                          preset,
                          sections: sections as Record<string, boolean>,
                      })
            if ('error' in result) {
                toast.error(result.error || 'No se pudo guardar.')
                return
            }
            setSaved({ preset, sections })
            toast.success('Funciones guardadas.')
        })
    }

    function discard() {
        setPreset(saved.preset)
        setSections(saved.sections)
    }

    return (
        <section className="overflow-hidden rounded-2xl border border-border bg-card">
            {/* Cabecera del area (dominio). Colapsable solo con varios dominios. */}
            {collapsible ? (
                <button
                    type="button"
                    onClick={() => setAreaOpen((o) => !o)}
                    aria-expanded={areaOpen}
                    className="flex min-h-[44px] w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-card/60"
                >
                    <span className="flex items-center gap-2">
                        <Icon className="h-4 w-4 shrink-0 text-primary" />
                        <span className="text-sm font-semibold text-foreground">{config.label}</span>
                    </span>
                    <ChevronDown
                        className={cn(
                            'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
                            areaOpen && 'rotate-180',
                        )}
                    />
                </button>
            ) : (
                <div className="flex items-center gap-2 px-4 py-3">
                    <Icon className="h-4 w-4 shrink-0 text-primary" />
                    <span className="text-sm font-semibold text-foreground">{config.label}</span>
                </div>
            )}

            <AnimatePresence initial={false}>
                {areaOpen && (
                    <motion.div
                        initial={reduceMotion || defaultOpen ? false : { height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
                        transition={{ duration: reduceMotion ? 0 : 0.2, ease: 'easeOut' }}
                    >
                        <div
                            className={cn(
                                'space-y-4 border-t border-border p-4',
                                isPending && 'pointer-events-none opacity-70',
                            )}
                        >
                            {/* 1. Selector de preset (onboarding-friendly) */}
                            <div className="rounded-2xl border border-border bg-background p-4">
                                <p className="text-sm font-semibold text-foreground">
                                    ¿Qué tan a fondo trabajas {config.label.toLowerCase()}?
                                </p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                    Elige un punto de partida. Puedes ajustar cada sección después.
                                </p>
                                <div
                                    className="mt-3 grid grid-cols-3 gap-2"
                                    role="radiogroup"
                                    aria-label={`Nivel de ${config.label.toLowerCase()}`}
                                >
                                    {PRESET_OPTIONS.map((opt) => {
                                        const selected = preset === opt.value
                                        return (
                                            <button
                                                key={opt.value}
                                                type="button"
                                                role="radio"
                                                aria-checked={selected}
                                                onClick={() => applyPreset(opt.value)}
                                                disabled={isPending}
                                                className={cn(
                                                    'flex min-h-[44px] flex-col items-center justify-center rounded-xl border px-2 py-2.5 text-center transition-all',
                                                    selected
                                                        ? 'border-primary bg-primary/10 text-foreground shadow-sm'
                                                        : 'border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground',
                                                )}
                                            >
                                                <span className="text-sm font-semibold">{opt.label}</span>
                                            </button>
                                        )
                                    })}
                                </div>
                                <p className="mt-2.5 text-xs text-muted-foreground">
                                    {PRESET_OPTIONS.find((o) => o.value === preset)?.hint}
                                </p>
                            </div>

                            {/* 2. Master switch del dominio */}
                            <div className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-background p-4">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        <Icon className="h-4 w-4 shrink-0 text-primary" />
                                        <p className="text-sm font-semibold text-foreground">
                                            Mostrar {config.label}
                                        </p>
                                    </div>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        Apaga esto si no usas el módulo. Oculta el menú y su contenido
                                        para ti y tus alumnos. No borra ningún dato.
                                    </p>
                                </div>
                                <label className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center">
                                    <span className="sr-only">Mostrar {config.label}</span>
                                    <Switch
                                        checked={domainEnabled}
                                        onCheckedChange={toggleDomain}
                                        disabled={isPending}
                                    />
                                </label>
                            </div>

                            {/* 3. Expander "Ajustar secciones" */}
                            <div className="overflow-hidden rounded-2xl border border-border bg-background">
                                <button
                                    type="button"
                                    onClick={() => setAdjustOpen((o) => !o)}
                                    aria-expanded={adjustOpen}
                                    disabled={!domainEnabled}
                                    className={cn(
                                        'flex min-h-[44px] w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors',
                                        domainEnabled
                                            ? 'hover:bg-card/60'
                                            : 'cursor-not-allowed opacity-50',
                                    )}
                                >
                                    <span className="text-sm font-semibold text-foreground">
                                        Ajustar secciones
                                    </span>
                                    <ChevronDown
                                        className={cn(
                                            'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
                                            adjustOpen && 'rotate-180',
                                        )}
                                    />
                                </button>

                                <AnimatePresence initial={false}>
                                    {adjustOpen && domainEnabled && (
                                        <motion.div
                                            initial={reduceMotion ? false : { height: 0, opacity: 0 }}
                                            animate={{ height: 'auto', opacity: 1 }}
                                            exit={
                                                reduceMotion
                                                    ? { opacity: 0 }
                                                    : { height: 0, opacity: 0 }
                                            }
                                            transition={{ duration: reduceMotion ? 0 : 0.2, ease: 'easeOut' }}
                                        >
                                            <ul className="divide-y divide-border border-t border-border">
                                                {toggleableSections.map((section) => {
                                                    const isPro = section.requiresModule !== null
                                                    const entitled = section.requiresModule
                                                        ? config.entitledByModule[
                                                              section.requiresModule
                                                          ] === true
                                                        : true
                                                    const locked = isPro && !entitled
                                                    // wants = pref guardada ?? default del preset actual.
                                                    const checked =
                                                        (sections[section.key] ??
                                                            section.presets[preset]) === true

                                                    return (
                                                        <li
                                                            key={section.key}
                                                            className="flex items-center justify-between gap-4 px-4 py-3"
                                                        >
                                                            <div className="min-w-0 flex-1">
                                                                <div className="flex items-center gap-1.5">
                                                                    <span className="text-sm font-medium text-foreground">
                                                                        {section.label}
                                                                    </span>
                                                                    <SectionBadge isPro={isPro} />
                                                                    <InfoTooltip
                                                                        content={section.tooltip}
                                                                    />
                                                                </div>
                                                                {locked && (
                                                                    <p className="mt-0.5 text-xs text-muted-foreground">
                                                                        {
                                                                            MODULE_CATALOG[
                                                                                section.requiresModule!
                                                                            ].label
                                                                        }
                                                                    </p>
                                                                )}
                                                            </div>

                                                            {locked ? (
                                                                <a
                                                                    href="/coach/subscription#addons"
                                                                    className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/5 px-3 text-xs font-semibold text-primary transition-colors hover:bg-primary/10"
                                                                >
                                                                    <Lock className="h-3.5 w-3.5" />{' '}
                                                                    Desbloquear con{' '}
                                                                    {
                                                                        MODULE_CATALOG[
                                                                            section.requiresModule!
                                                                        ].label
                                                                    }
                                                                </a>
                                                            ) : (
                                                                <label className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center">
                                                                    <span className="sr-only">
                                                                        {section.label}
                                                                    </span>
                                                                    <Switch
                                                                        checked={checked}
                                                                        onCheckedChange={(v) =>
                                                                            toggleSection(
                                                                                section.key,
                                                                                v,
                                                                            )
                                                                        }
                                                                        disabled={isPending}
                                                                    />
                                                                </label>
                                                            )}
                                                        </li>
                                                    )
                                                })}
                                            </ul>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>

                            {/* Footer: descartar + guardar (borrador, una sola escritura) */}
                            <div className="flex items-center justify-end gap-2 pt-1">
                                {dirty && (
                                    <button
                                        type="button"
                                        onClick={discard}
                                        disabled={isPending}
                                        className="inline-flex min-h-[40px] items-center rounded-xl px-3 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
                                    >
                                        Descartar
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={save}
                                    disabled={isPending || !dirty}
                                    className={cn(
                                        'inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-4 text-xs font-bold transition-colors',
                                        dirty && !isPending
                                            ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                                            : 'bg-muted text-muted-foreground',
                                    )}
                                >
                                    <Save className="h-3.5 w-3.5" />{' '}
                                    {isPending ? 'Guardando…' : 'Guardar configuración'}
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </section>
    )
}

function SectionBadge({ isPro }: { isPro: boolean }) {
    if (isPro) {
        return (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                <Sparkles className="h-2.5 w-2.5" /> Pro
            </span>
        )
    }
    return (
        <span className="inline-flex items-center rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            Base
        </span>
    )
}
