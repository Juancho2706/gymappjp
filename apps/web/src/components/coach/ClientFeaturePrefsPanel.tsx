'use client'

import { useMemo, useState, useTransition } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { toast } from 'sonner'
import { Apple, ChevronDown, Lock, Sparkles, SlidersHorizontal, RotateCcw, Save } from 'lucide-react'
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
import { Switch } from '@/components/ui/switch'
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
 * (la RLS coach-owner/manager es el gate). NUNCA toca `enabled_modules` ni borra datos.
 *
 * UX (compacto, draft + guardar): un switch por seccion (on=mostrar / off=ocultar) que arranca en
 * el valor EFECTIVO (heredado del coach/team si no hay override). Los cambios se acumulan en un
 * borrador local — NO se persiste por cada toggle (no re-renderiza la ficha a cada rato); se
 * commitea una sola vez con "Guardar configuracion". "Restaurar heredado" limpia los overrides
 * (vuelve a seguir el default). Auto-inherit: si un switch matchea el valor heredado, se quita del
 * override (minimo). Secciones Pro sin entitlement van LOCKED (la pref solo achica).
 */

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
    /** `true` si la base es el equipo (pool) — ajusta el copy del default. */
    useTeamBase?: boolean
}

export function ClientFeaturePrefsPanel({
    clientId,
    domain = 'nutrition',
    baseEffective,
    override,
    entitledByModule,
    domainEnabledBase,
    useTeamBase = false,
}: ClientFeaturePrefsPanelProps) {
    const reduceMotion = useReducedMotion()
    const [isPending, startTransition] = useTransition()
    const [open, setOpen] = useState(false)
    const [draft, setDraft] = useState<SectionPrefs>(override)
    const [saved, setSaved] = useState<SectionPrefs>(override)

    const toggleableSections = useMemo(
        () => FEATURE_DOMAINS[domain].filter((s) => !s.core),
        [domain],
    )
    const baseLabel = useTeamBase ? 'del equipo' : 'tuyo (coach)'
    const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(saved), [draft, saved])
    const overrideCount = Object.keys(draft).length

    /** Setea (o auto-inherita si matchea el default) una key del borrador. */
    function setKey(key: string, value: boolean, inheritedValue: boolean) {
        setDraft((d) => {
            const next = { ...d }
            if (value === inheritedValue) delete next[key]
            else next[key] = value
            return next
        })
    }

    function save() {
        startTransition(async () => {
            const result: FeaturePrefsResult = await setClientFeaturePrefs({
                clientId,
                domain,
                sections: draft as Record<string, boolean>,
            })
            if ('error' in result) {
                toast.error(result.error || 'No se pudo guardar.')
                return
            }
            setSaved(draft)
            toast.success('Funciones del alumno guardadas.')
        })
    }

    const domainEnabledEff = draft[DOMAIN_ENABLED_KEY] ?? domainEnabledBase

    return (
        <section className="overflow-hidden rounded-2xl border border-amber-500/40 bg-amber-500/[0.06] shadow-sm dark:border-amber-400/30 dark:bg-amber-400/[0.05]">
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                aria-expanded={open}
                className="flex min-h-[44px] w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-amber-500/10"
            >
                <span className="flex min-w-0 items-center gap-2.5">
                    <motion.span
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400"
                        animate={open || reduceMotion ? { scale: 1 } : { scale: [1, 1.1, 1] }}
                        transition={{ duration: 1.6, repeat: open || reduceMotion ? 0 : Infinity, ease: 'easeInOut' }}
                    >
                        <SlidersHorizontal className="h-4 w-4" />
                    </motion.span>
                    <span className="min-w-0">
                        <span className="flex items-center gap-1.5 text-xs font-black uppercase tracking-widest text-amber-700 dark:text-amber-400">
                            Funciones para este alumno
                            {overrideCount > 0 && (
                                <span className="rounded-full bg-amber-500/20 px-1.5 text-[9px] tabular-nums text-amber-700 dark:text-amber-300">
                                    {overrideCount}
                                </span>
                            )}
                        </span>
                        <span className="mt-0.5 block text-[10px] font-medium text-muted-foreground">
                            Sobrescribe el default {baseLabel} solo para este alumno
                        </span>
                    </span>
                </span>
                <ChevronDown
                    className={cn(
                        'h-4 w-4 shrink-0 text-amber-600/70 transition-transform dark:text-amber-400/70',
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
                        className="overflow-hidden border-t border-amber-500/20 dark:border-amber-400/20"
                    >
                        <div className="space-y-3 p-4">
                            {/* Master switch del dominio */}
                            <Row
                                label="Mostrar Nutrición"
                                hint="Apaga toda la nutrición de este alumno. No borra su historial."
                                icon={<Apple className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />}
                                checked={domainEnabledEff}
                                overridden={draft[DOMAIN_ENABLED_KEY] !== undefined}
                                disabled={isPending}
                                onChange={(v) => setKey(DOMAIN_ENABLED_KEY, v, domainEnabledBase)}
                            />

                            <div className="space-y-1.5">
                                {toggleableSections.map((section) => {
                                    const isPro = section.requiresModule !== null
                                    const entitled = section.requiresModule
                                        ? entitledByModule[section.requiresModule] === true
                                        : true
                                    const locked = isPro && !entitled
                                    const inherited = baseEffective[section.key] === true
                                    const checked = (draft[section.key] ?? inherited) === true

                                    if (locked) {
                                        return (
                                            <a
                                                key={section.key}
                                                href="/coach/subscription#addons"
                                                className="flex min-h-[40px] items-center justify-between gap-2 rounded-xl border border-border bg-background/60 px-3 py-2"
                                            >
                                                <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                                                    {section.label}
                                                    <SectionBadge isPro />
                                                </span>
                                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary">
                                                    <Lock className="h-3 w-3" /> {MODULE_CATALOG[section.requiresModule!].label}
                                                </span>
                                            </a>
                                        )
                                    }

                                    return (
                                        <div
                                            key={section.key}
                                            className="flex min-h-[40px] items-center justify-between gap-2 rounded-xl border border-border bg-background/60 px-3 py-2"
                                        >
                                            <span className="flex min-w-0 items-center gap-1.5">
                                                <span className="truncate text-sm text-foreground">{section.label}</span>
                                                <SectionBadge isPro={isPro} />
                                                <InfoTooltip content={section.tooltip} />
                                                {draft[section.key] !== undefined && (
                                                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" title="Personalizado para este alumno" />
                                                )}
                                            </span>
                                            <Switch
                                                checked={checked}
                                                disabled={isPending}
                                                onCheckedChange={(v) => setKey(section.key, v, inherited)}
                                                aria-label={`${section.label} para este alumno`}
                                            />
                                        </div>
                                    )
                                })}
                            </div>

                            {/* Footer: restaurar + guardar */}
                            <div className="flex items-center justify-between gap-2 pt-1">
                                <button
                                    type="button"
                                    onClick={() => setDraft({})}
                                    disabled={isPending || overrideCount === 0}
                                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-3 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
                                >
                                    <RotateCcw className="h-3.5 w-3.5" /> Restaurar heredado
                                </button>
                                <button
                                    type="button"
                                    onClick={save}
                                    disabled={isPending || !dirty}
                                    className={cn(
                                        'inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-4 text-xs font-bold transition-colors',
                                        dirty && !isPending
                                            ? 'bg-amber-500 text-white hover:bg-amber-600'
                                            : 'bg-muted text-muted-foreground',
                                    )}
                                >
                                    <Save className="h-3.5 w-3.5" /> {isPending ? 'Guardando…' : 'Guardar configuración'}
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </section>
    )
}

function Row({
    label,
    hint,
    icon,
    checked,
    overridden,
    disabled,
    onChange,
}: {
    label: string
    hint: string
    icon: React.ReactNode
    checked: boolean
    overridden: boolean
    disabled?: boolean
    onChange: (v: boolean) => void
}) {
    return (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background px-3 py-2.5">
            <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                    {icon}
                    {label}
                    {overridden && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" title="Personalizado" />}
                </span>
                <span className="mt-0.5 block text-[10px] text-muted-foreground">{hint}</span>
            </span>
            <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} aria-label={label} />
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
