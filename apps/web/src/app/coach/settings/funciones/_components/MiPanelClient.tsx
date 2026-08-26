'use client'

import { useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Apple, Dumbbell, HeartPulse, PersonStanding, Ruler, Sparkles, Trash2, UserPlus } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { PERSONA_COPY, PERSONA_TILE_ORDER, type Persona } from '@eva/schemas'
import type { FeatureDomain } from '@eva/feature-prefs'
import { Button } from '@/components/ui/button'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import {
    deleteDemoStudentAction,
    reseedDemoStudentAction,
    saveMiPanelPersonaAction,
    setMiPanelDomainAction,
} from '../_actions/mi-panel.actions'

/**
 * «Opciones › Mi panel» (onboarding v2, TASKS F2.6): la misma pregunta del primer ingreso, pero
 * reversible y sin gate — más el master switch de cada dominio y el alumno de ejemplo.
 *
 * Dos decisiones de producto que se ven en el código:
 *  - Cambiar de especialidad NO reordena el panel solo. El checkbox «Ordenar mi panel según mi
 *    especialidad» es explícito y arranca APAGADO: quien ya ajustó sus dominios a mano no puede
 *    perderlos por cambiar una etiqueta.
 *  - Apagar un dominio oculta su menú y su contenido, no borra nada. El copy lo dice.
 *
 * Los iconos se resuelven ACÁ por key: `funciones.queries.ts` (que tiene los mismos en
 * `DOMAIN_META`) importa service-role y no puede cruzar al bundle del cliente.
 */

const PERSONA_ICONS: Record<Persona, LucideIcon> = {
    strength: Dumbbell,
    nutrition: Apple,
    rehab: PersonStanding,
    endurance: HeartPulse,
    other: Sparkles,
}

const DOMAIN_ICONS: Record<FeatureDomain, LucideIcon> = {
    nutrition: Apple,
    training: Dumbbell,
    cardio: HeartPulse,
    movement: PersonStanding,
    bodycomp: Ruler,
}

export interface MiPanelDomainRow {
    domain: FeatureDomain
    label: string
    description: string
    enabled: boolean
}

export interface MiPanelClientProps {
    persona: Persona | null
    alsoOther: boolean
    domains: MiPanelDomainRow[]
    /** `true` = el coach ya tiene alumno de ejemplo sembrado. */
    hasDemo: boolean
}

export function MiPanelClient({ persona, alsoOther, domains, hasDemo }: MiPanelClientProps) {
    return (
        <div className="space-y-5">
            <PersonaCard persona={persona} alsoOther={alsoOther} />
            <DomainsCard domains={domains} />
            <DemoCard persona={persona} hasDemo={hasDemo} />
        </div>
    )
}

// ── 1. Especialidad ──────────────────────────────────────────────────────────────────────────

function PersonaCard({ persona, alsoOther }: { persona: Persona | null; alsoOther: boolean }) {
    const [selected, setSelected] = useState<Persona | null>(persona)
    const [also, setAlso] = useState(alsoOther)
    const [reorder, setReorder] = useState(false)
    const [isPending, startTransition] = useTransition()
    const tileRefs = useRef<Array<HTMLButtonElement | null>>([])

    const selectedIndex = selected ? PERSONA_TILE_ORDER.indexOf(selected) : -1
    const secondQuestion = selected ? PERSONA_COPY[selected].secondQuestion : null
    const dirty = selected !== persona || also !== alsoOther || reorder

    function choose(next: Persona) {
        setSelected(next)
        if (next !== selected) setAlso(false)
    }

    function onTileKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
        const total = PERSONA_TILE_ORDER.length
        let next: number | null = null
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % total
        else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index - 1 + total) % total
        else if (event.key === 'Home') next = 0
        else if (event.key === 'End') next = total - 1
        if (next == null) return
        event.preventDefault()
        choose(PERSONA_TILE_ORDER[next])
        tileRefs.current[next]?.focus()
    }

    function save() {
        if (!selected) return
        startTransition(async () => {
            const result = await saveMiPanelPersonaAction({
                persona: selected,
                alsoOther: also,
                reorderPanel: reorder,
            })
            if (!result.ok) {
                toast.error(result.error)
                return
            }
            setReorder(false)
            toast.success(result.message)
        })
    }

    return (
        <section className="rounded-2xl border border-subtle bg-surface-card p-4">
            <h2 className="text-sm font-semibold text-strong">Tu especialidad</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted">
                Con esto ordenamos tu panel. Cambiarla no borra nada de lo que ya tienes.
            </p>

            <div
                role="radiogroup"
                aria-label="Tu especialidad"
                className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2"
            >
                {PERSONA_TILE_ORDER.map((option, index) => {
                    const Icon = PERSONA_ICONS[option]
                    const isSelected = selected === option
                    return (
                        <button
                            key={option}
                            type="button"
                            role="radio"
                            aria-checked={isSelected}
                            tabIndex={selectedIndex === -1 ? (index === 0 ? 0 : -1) : isSelected ? 0 : -1}
                            ref={(node) => {
                                tileRefs.current[index] = node
                            }}
                            disabled={isPending}
                            onClick={() => choose(option)}
                            onKeyDown={(event) => onTileKeyDown(event, index)}
                            className={cn(
                                'flex min-h-[44px] items-center gap-2.5 rounded-control border px-3 py-2.5 text-left transition-all',
                                'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)]',
                                option === 'other' && 'border-dashed sm:col-span-2',
                                isSelected
                                    ? 'border-[var(--sport-500)] bg-[var(--sport-100)]'
                                    : 'border-subtle hover:border-[var(--sport-300)]',
                                isPending && 'opacity-70',
                            )}
                        >
                            <Icon
                                className={cn(
                                    'h-4 w-4 shrink-0',
                                    isSelected ? 'text-[var(--sport-600)]' : 'text-muted',
                                )}
                                aria-hidden="true"
                            />
                            <span className="min-w-0 text-[13px] font-semibold leading-snug text-strong">
                                {PERSONA_COPY[option].tileTitle}
                            </span>
                        </button>
                    )
                })}
            </div>

            {secondQuestion && (
                <div className="mt-3 flex flex-col gap-2.5 rounded-control border border-subtle bg-background p-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-[13px] font-semibold text-strong">{secondQuestion}</p>
                    <SegmentedControl
                        aria-label={secondQuestion}
                        className="sm:w-[160px]"
                        size="sm"
                        options={[
                            { value: 'si', label: 'Sí' },
                            { value: 'no', label: 'No' },
                        ]}
                        value={also ? 'si' : 'no'}
                        onChange={(value) => setAlso(value === 'si')}
                    />
                </div>
            )}

            <label className="mt-3 flex cursor-pointer items-start gap-2.5 text-[13px] leading-relaxed text-body">
                <input
                    type="checkbox"
                    checked={reorder}
                    disabled={isPending}
                    onChange={(event) => setReorder(event.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--sport-600)]"
                />
                <span>
                    <span className="font-semibold text-strong">
                        Ordenar mi panel según mi especialidad
                    </span>
                    <span className="mt-0.5 block text-muted">
                        Prende y apaga las áreas de abajo por ti. Si ya las ajustaste a mano,
                        déjalo sin marcar.
                    </span>
                </span>
            </label>

            <Button
                type="button"
                variant="default"
                size="sm"
                className="mt-3"
                disabled={!selected || !dirty || isPending}
                onClick={save}
            >
                Guardar especialidad
            </Button>
        </section>
    )
}

// ── 2. Dominios ──────────────────────────────────────────────────────────────────────────────

function DomainsCard({ domains }: { domains: MiPanelDomainRow[] }) {
    const [state, setState] = useState<Record<string, boolean>>(() =>
        Object.fromEntries(domains.map((d) => [d.domain, d.enabled])),
    )
    const [isPending, startTransition] = useTransition()

    function toggle(domain: FeatureDomain, next: boolean) {
        const previous = state[domain] ?? true
        setState((current) => ({ ...current, [domain]: next }))
        startTransition(async () => {
            const result = await setMiPanelDomainAction({ domain, enabled: next })
            if (!result.ok) {
                // Revertir: el switch no puede quedar mostrando algo que la base no guardó.
                setState((current) => ({ ...current, [domain]: previous }))
                toast.error(result.error)
                return
            }
            toast.success(result.message)
        })
    }

    return (
        <section className="rounded-2xl border border-subtle bg-surface-card p-4">
            <h2 className="text-sm font-semibold text-strong">Qué se ve en tu panel</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted">
                Apaga lo que no uses: se oculta del menú, para ti y para tus alumnos. No se borra
                ningún dato y lo puedes volver a prender cuando quieras.
            </p>

            <ul className="mt-3 space-y-2">
                {domains.map((row) => {
                    const Icon = DOMAIN_ICONS[row.domain]
                    const enabled = state[row.domain] ?? true
                    return (
                        <li
                            key={row.domain}
                            className="flex items-center justify-between gap-4 rounded-control border border-subtle bg-background p-3"
                        >
                            <div className="flex min-w-0 items-start gap-2.5">
                                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--sport-600)]" aria-hidden="true" />
                                <div className="min-w-0">
                                    <p className="text-[13px] font-semibold text-strong">{row.label}</p>
                                    <p className="mt-0.5 text-xs leading-relaxed text-muted">
                                        {row.description}
                                    </p>
                                </div>
                            </div>
                            <label className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center">
                                <span className="sr-only">Mostrar {row.label}</span>
                                <Switch
                                    checked={enabled}
                                    disabled={isPending}
                                    onCheckedChange={(next) => toggle(row.domain, next)}
                                />
                            </label>
                        </li>
                    )
                })}
            </ul>
        </section>
    )
}

// ── 3. Alumno de ejemplo ─────────────────────────────────────────────────────────────────────

function DemoCard({ persona, hasDemo }: { persona: Persona | null; hasDemo: boolean }) {
    const [isPending, startTransition] = useTransition()
    const demoName = persona ? PERSONA_COPY[persona].demoName : null

    function run(action: () => Promise<{ ok: true; message: string } | { ok: false; error: string }>) {
        startTransition(async () => {
            const result = await action()
            if (!result.ok) {
                toast.error(result.error)
                return
            }
            toast.success(result.message)
        })
    }

    return (
        <section className="rounded-2xl border border-subtle bg-surface-card p-4">
            <h2 className="text-sm font-semibold text-strong">Alumno de ejemplo</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted">
                {demoName
                    ? `${demoName} es un alumno de mentira para que pruebes tu app sin gastar cupo. No cuenta para tu plan ni recibe correos.`
                    : 'Tu especialidad no trae alumno de ejemplo. Elige otra si quieres uno para probar.'}
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
                <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={isPending || demoName == null}
                    onClick={() => run(reseedDemoStudentAction)}
                >
                    <UserPlus className="h-4 w-4" aria-hidden="true" />
                    Volver a sembrar el alumno de ejemplo
                </Button>
                <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={isPending || !hasDemo}
                    onClick={() => run(deleteDemoStudentAction)}
                >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    Borrar alumno de ejemplo
                </Button>
            </div>
        </section>
    )
}
