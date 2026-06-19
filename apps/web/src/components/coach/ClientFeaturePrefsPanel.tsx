'use client'

import { useMemo, useState, useTransition } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { toast } from 'sonner'
import { Apple, ChevronDown, Lock, Sparkles, SlidersHorizontal } from 'lucide-react'
import {
    DOMAIN_ENABLED_KEY,
    FEATURE_DOMAINS,
    type FeatureDomain,
    type ModuleKey,
    type NutritionSectionKey,
    type SectionPrefs,
} from '@eva/feature-prefs'
import { MODULE_CATALOG } from '@eva/module-catalog'
import { InfoTooltip } from '@/components/ui/info-tooltip'
import { cn } from '@/lib/utils'
import {
    setClientFeaturePrefs,
    type FeaturePrefsResult,
} from '@/app/coach/settings/_actions/feature-prefs.actions'

/**
 * Panel de OVERRIDE por-alumno de la zona "Funciones" (capa mas especifica del modelo
 * `visible = ENTITLED (billing) AND ENABLED (preferencia)`, plan §4.2/§4.4). El coach lo usa
 * dentro de la ficha del alumno (Zona C) para forzar, SOLO para ESE alumno, que mostrar/ocultar
 * de Nutricion encima del default coach/team. Escribe UNICAMENTE `client_feature_prefs.sections`
 * (la RLS coach-owner/manager es el gate). NUNCA toca `enabled_modules` ni borra datos
 * `nutrition_*` — apagar = ocultar.
 *
 * UX tri-state por seccion: cada opcional es "Heredar" (sigue el default coach/team) /
 * "Mostrar" (forzar ON) / "Ocultar" (forzar OFF). "Heredar" = key AUSENTE del override; el chip
 * muestra el valor heredado entre parentesis. Las secciones core (plan/macros/adherencia) no se
 * listan (van siempre). Las secciones Pro sin entitlement van LOCKED (la pref solo achica:
 * forzar "Mostrar" sin entitlement no las prende). Tambien un tri-state para el master switch
 * del dominio ("Mostrar Nutricion").
 *
 * Optimista (estado local) + toast; revierte si la action falla. Cada cambio reescribe el
 * override completo (`sections` parcial) y hace upsert.
 */

type TriState = 'inherit' | 'show' | 'hide'

interface ClientFeaturePrefsPanelProps {
    clientId: string
    domain?: FeatureDomain
    /** Resultado del resolver SIN la capa del alumno (lo que se hereda de coach/team). */
    baseEffective: Record<NutritionSectionKey, boolean>
    /** Override crudo guardado (`client_feature_prefs.sections`). Key ausente => heredar. */
    override: SectionPrefs
    /** Entitlement por modulo (fail-closed) para LOCKear secciones Pro. */
    entitledByModule: Partial<Record<ModuleKey, boolean>>
    /** Valor heredado del master switch del dominio (base coach/team). */
    domainEnabledBase: boolean
    /** Override crudo del master switch (`undefined` => heredar). */
    domainEnabledOverride: boolean | undefined
    /** `true` si la base es el equipo (pool) — ajusta el copy del default. */
    useTeamBase?: boolean
}

function triFrom(value: boolean | undefined): TriState {
    if (value === undefined) return 'inherit'
    return value ? 'show' : 'hide'
}

/** Aplica un tri-state a una key del override: 'inherit' la borra; show/hide la setea. */
function applyTri(override: SectionPrefs, key: string, tri: TriState): SectionPrefs {
    const next: SectionPrefs = { ...override }
    if (tri === 'inherit') delete next[key]
    else next[key] = tri === 'show'
    return next
}

export function ClientFeaturePrefsPanel({
    clientId,
    domain = 'nutrition',
    baseEffective,
    override,
    entitledByModule,
    domainEnabledBase,
    domainEnabledOverride,
    useTeamBase = false,
}: ClientFeaturePrefsPanelProps) {
    const reduceMotion = useReducedMotion()
    const [isPending, startTransition] = useTransition()
    const [open, setOpen] = useState(false)
    const [sections, setSections] = useState<SectionPrefs>(override)

    const toggleableSections = useMemo(
        () => FEATURE_DOMAINS[domain].filter((s) => !s.core),
        [domain],
    )

    const baseLabel = useTeamBase ? 'del equipo' : 'tuyo (coach)'

    /** Persiste el override dado; revierte al previo si la action falla. */
    function persist(next: SectionPrefs, prev: SectionPrefs) {
        startTransition(async () => {
            const result: FeaturePrefsResult = await setClientFeaturePrefs({
                clientId,
                domain,
                sections: next as Record<string, boolean>,
            })
            if ('error' in result) {
                setSections(prev)
                toast.error(result.error || 'No se pudo guardar.')
                return
            }
            toast.success('Funciones del alumno actualizadas.')
        })
    }

    function setSectionTri(key: string, tri: TriState) {
        const prev = sections
        const next = applyTri(sections, key, tri)
        setSections(next)
        persist(next, prev)
    }

    const domainTri = triFrom(sections[DOMAIN_ENABLED_KEY] ?? domainEnabledOverride)

    function setDomainTri(tri: TriState) {
        const prev = sections
        const next = applyTri(sections, DOMAIN_ENABLED_KEY, tri)
        setSections(next)
        persist(next, prev)
    }

    return (
        <section className="overflow-hidden rounded-2xl border border-dashed border-border/60 bg-card/40 dark:border-white/10">
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                aria-expanded={open}
                className="flex min-h-[44px] w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-primary/5"
            >
                <span className="flex min-w-0 items-center gap-2">
                    <SlidersHorizontal className="h-3.5 w-3.5 shrink-0 text-primary" />
                    <span className="min-w-0">
                        <span className="block text-xs font-black uppercase tracking-widest text-primary">
                            Funciones para este alumno
                        </span>
                        <span className="mt-0.5 block text-[10px] font-medium text-muted-foreground">
                            Sobrescribe el default {baseLabel} solo para este alumno
                        </span>
                    </span>
                </span>
                <ChevronDown
                    className={cn(
                        'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
                        open && 'rotate-180',
                    )}
                />
            </button>

            <AnimatePresence initial={false}>
                {open && (
                    <motion.div
                        initial={reduceMotion ? false : { height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
                        transition={{ duration: reduceMotion ? 0 : 0.2, ease: 'easeOut' }}
                        className="overflow-hidden border-t border-border/40 dark:border-white/10"
                    >
                        <div
                            className={cn(
                                'space-y-4 p-5',
                                isPending && 'pointer-events-none opacity-70',
                            )}
                        >
                            <p className="rounded-xl border border-border/40 bg-background/60 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground dark:border-white/10">
                                <span className="font-semibold text-foreground">Heredar</span> sigue
                                el default {baseLabel}. <span className="font-semibold text-foreground">Mostrar</span> u{' '}
                                <span className="font-semibold text-foreground">Ocultar</span> fuerza
                                el valor solo para este alumno. Ocultar nunca borra datos ni cancela
                                un modulo — solo lo esconde de su app.
                            </p>

                            {/* Master switch del dominio (tri-state) */}
                            <div className="rounded-2xl border border-border bg-background p-4">
                                <div className="flex items-center gap-2">
                                    <Apple className="h-4 w-4 shrink-0 text-primary" />
                                    <p className="text-sm font-semibold text-foreground">
                                        Mostrar Nutricion
                                    </p>
                                </div>
                                <p className="mt-1 text-[11px] text-muted-foreground">
                                    Apaga toda la nutricion de la app de este alumno (menu y
                                    contenido). No borra su historial.
                                </p>
                                <div className="mt-3">
                                    <TriSegment
                                        value={domainTri}
                                        inheritedOn={domainEnabledBase}
                                        disabled={isPending}
                                        onChange={setDomainTri}
                                        ariaLabel="Mostrar Nutricion para este alumno"
                                    />
                                </div>
                            </div>

                            {/* Secciones opcionales (tri-state por seccion) */}
                            <ul className="space-y-2">
                                {toggleableSections.map((section) => {
                                    const isPro = section.requiresModule !== null
                                    const entitled = section.requiresModule
                                        ? entitledByModule[section.requiresModule] === true
                                        : true
                                    const locked = isPro && !entitled
                                    const inheritedOn = baseEffective[section.key] === true
                                    const tri = triFrom(sections[section.key])

                                    return (
                                        <li
                                            key={section.key}
                                            className="rounded-2xl border border-border bg-background p-3"
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex flex-wrap items-center gap-1.5">
                                                        <span className="text-sm font-medium text-foreground">
                                                            {section.label}
                                                        </span>
                                                        <SectionBadge isPro={isPro} />
                                                        <InfoTooltip content={section.tooltip} />
                                                    </div>
                                                    {locked && (
                                                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                                                            Requiere{' '}
                                                            {
                                                                MODULE_CATALOG[
                                                                    section.requiresModule!
                                                                ].label
                                                            }
                                                        </p>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="mt-2.5">
                                                {locked ? (
                                                    <a
                                                        href="/coach/subscription#addons"
                                                        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/5 px-3 text-xs font-semibold text-primary transition-colors hover:bg-primary/10"
                                                    >
                                                        <Lock className="h-3.5 w-3.5" /> Desbloquear con{' '}
                                                        {MODULE_CATALOG[section.requiresModule!].label}
                                                    </a>
                                                ) : (
                                                    <TriSegment
                                                        value={tri}
                                                        inheritedOn={inheritedOn}
                                                        disabled={isPending}
                                                        onChange={(v) => setSectionTri(section.key, v)}
                                                        ariaLabel={`${section.label} para este alumno`}
                                                    />
                                                )}
                                            </div>
                                        </li>
                                    )
                                })}
                            </ul>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </section>
    )
}

/** Segmento tri-state "Heredar / Mostrar / Ocultar". "Heredar" muestra el valor heredado. */
function TriSegment({
    value,
    inheritedOn,
    disabled,
    onChange,
    ariaLabel,
}: {
    value: TriState
    inheritedOn: boolean
    disabled?: boolean
    onChange: (v: TriState) => void
    ariaLabel: string
}) {
    const options: { value: TriState; label: string }[] = [
        { value: 'inherit', label: `Heredar (${inheritedOn ? 'visible' : 'oculto'})` },
        { value: 'show', label: 'Mostrar' },
        { value: 'hide', label: 'Ocultar' },
    ]
    return (
        <div
            role="radiogroup"
            aria-label={ariaLabel}
            className="grid grid-cols-3 gap-1.5 rounded-xl border border-border bg-card p-1"
        >
            {options.map((opt) => {
                const selected = value === opt.value
                return (
                    <button
                        key={opt.value}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        disabled={disabled}
                        onClick={() => onChange(opt.value)}
                        className={cn(
                            'flex min-h-[40px] items-center justify-center rounded-lg px-2 text-center text-[11px] font-semibold transition-all',
                            selected
                                ? opt.value === 'hide'
                                    ? 'bg-rose-500/15 text-rose-600 shadow-sm dark:text-rose-400'
                                    : opt.value === 'show'
                                      ? 'bg-emerald-500/15 text-emerald-600 shadow-sm dark:text-emerald-400'
                                      : 'bg-primary/10 text-foreground shadow-sm'
                                : 'text-muted-foreground hover:text-foreground',
                        )}
                    >
                        {opt.label}
                    </button>
                )
            })}
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
