'use client'

import { useRef, useState, useTransition, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Apple, Dumbbell, HeartPulse, PersonStanding, Sparkles, Trash2, UserPlus } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { PERSONA_COPY, PERSONA_TILE_ORDER, type Persona } from '@eva/schemas'
import { Button } from '@/components/ui/button'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { cn } from '@/lib/utils'
import {
    deleteDemoStudentAction,
    reseedDemoStudentAction,
    saveMiPanelPersonaAction,
} from '../_actions/mi-panel.actions'
import { DomainsCard, type MiPanelDomainRow } from './DomainsCard'
import type { BodycompClient } from '../_data/bodycomp-clients.queries'

/**
 * «Opciones › Funciones» (onboarding v2 TASKS F2.6; retitulada en la Ola de orden W3.1): la misma
 * pregunta del primer ingreso, pero reversible y sin gate — más las áreas del panel y el alumno
 * de ejemplo.
 *
 * Orden de la pantalla (W3.1, decisión 5A): especialidad › áreas › detalle de nutrición › guía ›
 * alumno de ejemplo. Los dos del medio son SERVER y llegan por el slot `afterDomains`; la tarjeta
 * de áreas vive aparte en `DomainsCard` porque el scope team también la monta.
 *
 * Una decisión de producto que se ve en el código: cambiar de especialidad NO reordena el panel
 * solo. El checkbox «Ordenar mi panel según mi especialidad» es explícito y arranca APAGADO: quien
 * ya ajustó sus áreas a mano no puede perderlas por cambiar una etiqueta.
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

export interface MiPanelClientProps {
    persona: Persona | null
    alsoOther: boolean
    domains: MiPanelDomainRow[]
    /** Alumnos del workspace activo — los usa el picker de Composición corporal. */
    bodycompClients: BodycompClient[]
    /** `true` = el coach ya tiene alumno de ejemplo sembrado. */
    hasDemo: boolean
    /**
     * Bloques SERVER que van entre las áreas y el alumno de ejemplo (W3.1: detalle de nutrición
     * + vuelta a la guía). Llegan como slot porque este componente es cliente y esos dos leen
     * datos del servidor: partirlos en dos islas rompería el orden de la pantalla.
     */
    afterDomains?: ReactNode
}

export function MiPanelClient({
    persona,
    alsoOther,
    domains,
    bodycompClients,
    hasDemo,
    afterDomains,
}: MiPanelClientProps) {
    return (
        <div className="space-y-5">
            <PersonaCard persona={persona} alsoOther={alsoOther} />
            <DomainsCard domains={domains} bodycompClients={bodycompClients} />
            {afterDomains}
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
