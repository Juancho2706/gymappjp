'use client'

import { useState, useTransition } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { toast } from 'sonner'
import {
    ChevronDown,
    Lock,
    Sparkles,
    UtensilsCrossed,
} from 'lucide-react'
import {
    NUTRITION_SECTIONS,
    DOMAIN_ENABLED_KEY,
    normalizePreset,
    type ModuleKey,
    type NutritionSectionKey,
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
 * Zona "Funciones" — el coach (standalone) o el owner/gestor (team) eligen QUE se muestra del
 * dominio Nutricion. Modelo `visible = ENTITLED (billing) AND ENABLED (esta preferencia)`: este
 * panel SOLO escribe la capa ENABLED. La preferencia solo achica — nunca prende algo no entitled.
 *
 * UI (plan §4 / spec UI-UX):
 *  1. Selector de PRESET (1 pregunta, doble como onboarding, descartable).
 *  2. Master switch "Mostrar Nutricion" (key reservada `_enabled`).
 *  3. Expander "Ajustar secciones" -> toggles por seccion (skip core), con badge Base/Pro +
 *     InfoTooltip. Las secciones Pro sin entitlement van LOCKED con CTA a /coach/subscription#addons.
 *  4. Explainer Modulos vs Funciones.
 *
 * Todos los writes son optimistas (estado local) + toast, y revierten el estado si la action falla.
 * Targets >=44px, respeta `useReducedMotion`.
 */

const DOMAIN = 'nutrition' as const

type Scope = { scope: 'coach' } | { scope: 'team'; teamId: string }

interface FeaturePrefsPanelProps {
    scope: Scope['scope']
    /** Requerido cuando scope === 'team'. */
    teamId?: string
    initialPreset: Preset
    initialSections: SectionPrefs
    entitledByModule: Partial<Record<ModuleKey, boolean>>
}

/** Secciones opcionales (skip core) en orden de catalogo. */
const TOGGLEABLE_SECTIONS = NUTRITION_SECTIONS.filter((s) => !s.core)

const PRESET_OPTIONS: { value: Preset; label: string; hint: string }[] = [
    { value: 'basico', label: 'Basico', hint: 'Lo esencial: plan, macros y adherencia.' },
    { value: 'intermedio', label: 'Intermedio', hint: 'Suma micros, habitos, recetas y mas.' },
    { value: 'profesional', label: 'Profesional', hint: 'Todo, incluido lo de tus modulos Pro.' },
]

/** El preset define el estado por defecto de cada seccion (el catalogo lo declara en `presets`). */
function sectionsForPreset(preset: Preset): SectionPrefs {
    const out: SectionPrefs = {}
    for (const section of TOGGLEABLE_SECTIONS) {
        out[section.key] = section.presets[preset] === true
    }
    return out
}

export function FeaturePrefsPanel({
    scope,
    teamId,
    initialPreset,
    initialSections,
    entitledByModule,
}: FeaturePrefsPanelProps) {
    const reduceMotion = useReducedMotion()
    const [isPending, startTransition] = useTransition()

    const [preset, setPreset] = useState<Preset>(normalizePreset(initialPreset))
    const [sections, setSections] = useState<SectionPrefs>(initialSections)
    const [adjustOpen, setAdjustOpen] = useState(false)

    // `_enabled` ausente => dominio prendido (no rompe coaches backfilleados).
    const domainEnabled = sections[DOMAIN_ENABLED_KEY] ?? true

    /** Persiste el snapshot dado; revierte al previo si la action falla. */
    function persist(nextPreset: Preset, nextSections: SectionPrefs, prev: { preset: Preset; sections: SectionPrefs }) {
        startTransition(async () => {
            const result: FeaturePrefsResult =
                scope === 'team'
                    ? await setTeamFeaturePrefs({
                          teamId: teamId!,
                          domain: DOMAIN,
                          preset: nextPreset,
                          sections: nextSections as Record<NutritionSectionKey, boolean>,
                      })
                    : await setCoachFeaturePrefs({
                          domain: DOMAIN,
                          preset: nextPreset,
                          sections: nextSections as Record<NutritionSectionKey, boolean>,
                      })

            if ('error' in result) {
                // Revertir optimismo.
                setPreset(prev.preset)
                setSections(prev.sections)
                toast.error(result.error || 'No se pudo guardar.')
                return
            }
            toast.success('Funciones actualizadas.')
        })
    }

    function applyPreset(next: Preset) {
        if (next === preset) return
        const prev = { preset, sections }
        // Cambiar de preset re-siembra las secciones a su default del preset, preservando el
        // master switch (`_enabled`) — el preset es de secciones, no del dominio entero.
        const nextSections: SectionPrefs = {
            ...sectionsForPreset(next),
            [DOMAIN_ENABLED_KEY]: domainEnabled,
        }
        setPreset(next)
        setSections(nextSections)
        persist(next, nextSections, prev)
    }

    function toggleDomain(nextEnabled: boolean) {
        const prev = { preset, sections }
        const nextSections: SectionPrefs = { ...sections, [DOMAIN_ENABLED_KEY]: nextEnabled }
        setSections(nextSections)
        persist(preset, nextSections, prev)
    }

    function toggleSection(key: NutritionSectionKey, nextOn: boolean) {
        const prev = { preset, sections }
        const nextSections: SectionPrefs = { ...sections, [key]: nextOn }
        setSections(nextSections)
        persist(preset, nextSections, prev)
    }

    return (
        <div className={cn('space-y-5', isPending && 'pointer-events-none opacity-70')}>
            {/* 1. Selector de preset (onboarding-friendly) */}
            <div className="rounded-2xl border border-border bg-card p-4">
                <p className="text-sm font-semibold text-foreground">
                    ¿Que tan a fondo trabajas la nutricion?
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                    Elige un punto de partida. Puedes ajustar cada seccion despues.
                </p>
                <div className="mt-3 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Nivel de nutricion">
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
                                        : 'border-border bg-background text-muted-foreground hover:border-primary/30 hover:text-foreground',
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

            {/* 2. Master switch */}
            <div className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card p-4">
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <UtensilsCrossed className="h-4 w-4 shrink-0 text-primary" />
                        <p className="text-sm font-semibold text-foreground">Mostrar Nutricion</p>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                        Apaga esto si no usas el modulo de nutricion. Oculta el menu y su contenido
                        para ti y tus alumnos. No borra ningun dato.
                    </p>
                </div>
                <label className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center">
                    <span className="sr-only">Mostrar Nutricion</span>
                    <Switch
                        checked={domainEnabled}
                        onCheckedChange={toggleDomain}
                        disabled={isPending}
                    />
                </label>
            </div>

            {/* 3. Expander "Ajustar secciones" */}
            <div className="overflow-hidden rounded-2xl border border-border bg-card">
                <button
                    type="button"
                    onClick={() => setAdjustOpen((o) => !o)}
                    aria-expanded={adjustOpen}
                    disabled={!domainEnabled}
                    className={cn(
                        'flex min-h-[44px] w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors',
                        domainEnabled ? 'hover:bg-card/60' : 'cursor-not-allowed opacity-50',
                    )}
                >
                    <span className="text-sm font-semibold text-foreground">Ajustar secciones</span>
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
                            exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
                            transition={{ duration: reduceMotion ? 0 : 0.2, ease: 'easeOut' }}
                        >
                            <ul className="divide-y divide-border border-t border-border">
                                {TOGGLEABLE_SECTIONS.map((section) => {
                                    const isPro = section.requiresModule !== null
                                    const entitled = section.requiresModule
                                        ? entitledByModule[section.requiresModule] === true
                                        : true
                                    const locked = isPro && !entitled
                                    // wants = pref guardada ?? default del preset actual.
                                    const checked =
                                        (sections[section.key] ?? section.presets[preset]) === true

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
                                                    <InfoTooltip content={section.tooltip} />
                                                </div>
                                                {locked && (
                                                    <p className="mt-0.5 text-xs text-muted-foreground">
                                                        {MODULE_CATALOG[section.requiresModule!].label}
                                                    </p>
                                                )}
                                            </div>

                                            {locked ? (
                                                <a
                                                    href="/coach/subscription#addons"
                                                    className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/5 px-3 text-xs font-semibold text-primary transition-colors hover:bg-primary/10"
                                                >
                                                    <Lock className="h-3.5 w-3.5" /> Desbloquear con Nutricion Pro
                                                </a>
                                            ) : (
                                                <label className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center">
                                                    <span className="sr-only">{section.label}</span>
                                                    <Switch
                                                        checked={checked}
                                                        onCheckedChange={(v) =>
                                                            toggleSection(section.key, v)
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

            {/* 4. Explainer Modulos vs Funciones */}
            <p className="px-1 text-xs leading-relaxed text-muted-foreground">
                <span className="font-semibold text-foreground">Modulos</span> es lo que compraste
                (entitlements de pago). <span className="font-semibold text-foreground">Funciones</span>{' '}
                es lo que decides mostrar de eso. Apagar una funcion nunca cancela un modulo ni borra
                datos — solo la oculta.
            </p>
        </div>
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
