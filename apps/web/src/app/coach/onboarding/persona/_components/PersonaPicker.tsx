'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useSearchParams } from 'next/navigation'
import { Apple, Dumbbell, HeartPulse, PersonStanding, Sparkles } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { PERSONA_COPY, PERSONA_TILE_ORDER, type Persona } from '@eva/schemas'
import { Button } from '@/components/ui/button'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { cn } from '@/lib/utils'
import { setCoachPersonaAction, type PersonaActionResult } from '../_actions/persona.actions'
import { BuildingPanel } from './BuildingPanel'

/**
 * Pantalla «¿A qué te dedicas?» — una sola pregunta, pantalla completa, primer ingreso
 * (SPEC coach-onboarding-v2 §1).
 *
 * Reglas de diseño que NO son negociables acá:
 *  - Sin «Saltar»: el escape es la quinta tarjeta («Otra cosa / todavía no lo tengo claro»), que
 *    dice qué pasa si la eliges. Una pregunta obligatoria sin escape se contesta al azar y
 *    envenena la segmentación.
 *  - La respuesta CAMBIA algo visible en menos de 5 s: por eso el CTA entra directo al
 *    interstitial «Armando tu panel» y de ahí al dashboard día 1.
 *  - La segunda pregunta es UNA línea inline, con «No» por defecto, y solo para las personas que
 *    la tienen (`PERSONA_COPY[persona].secondQuestion`).
 *
 * Accesibilidad: las 5 tarjetas son un `radiogroup` real (roving tabindex, flechas/Home/End,
 * `aria-checked`, foco visible con el anillo del DS). El error se anuncia por `role="alert"`.
 */

/** Ícono por persona. Lucide, nunca emojis. */
const PERSONA_ICONS: Record<Persona, LucideIcon> = {
    strength: Dumbbell,
    nutrition: Apple,
    rehab: PersonStanding,
    endurance: HeartPulse,
    other: Sparkles,
}

/**
 * Mínimo que se muestra el interstitial. Corre EN PARALELO con la action (no la demora): si el
 * trabajo real termina antes, el coach igual ve los tres pasos tildarse en vez de un flash.
 */
const MIN_BUILD_MS = 1200

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Cinturón contra la recarga: la elección vive en `sessionStorage` hasta que la action la guarda.
 * Una vuelta a la pantalla (recarga, back, un error de red) no puede dejar en blanco lo que el
 * coach ya contestó. `sessionStorage` y no `localStorage`: es un borrador de esta visita, no una
 * preferencia — el dato real vive en `coaches.persona`.
 */
const DRAFT_KEY = 'eva:persona-draft'

type PersonaDraft = { persona: Persona; alsoOther: boolean }

function readDraft(): PersonaDraft | null {
    try {
        const raw = sessionStorage.getItem(DRAFT_KEY)
        if (!raw) return null
        const parsed = JSON.parse(raw) as Partial<PersonaDraft>
        // La persona se valida contra el orden canónico: un borrador viejo con una rama que ya no
        // existe se descarta en vez de romper la pantalla.
        if (!parsed?.persona || !PERSONA_TILE_ORDER.includes(parsed.persona)) return null
        return { persona: parsed.persona, alsoOther: parsed.alsoOther === true }
    } catch {
        return null
    }
}

function writeDraft(draft: PersonaDraft | null) {
    try {
        if (draft) sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
        else sessionStorage.removeItem(DRAFT_KEY)
    } catch {
        // Storage bloqueado (modo privado, cookies de terceros): el borrador es un extra, no un
        // requisito — la pantalla sigue funcionando sin él.
    }
}

export function PersonaPicker() {
    const [selected, setSelected] = useState<Persona | null>(null)
    const [alsoOther, setAlsoOther] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [building, setBuilding] = useState(false)
    const [, startTransition] = useTransition()
    // `?welcome=free&eid=`: espejo del alta por Google que el gate de persona trajo hasta acá;
    // la action lo reenvía a la guía, donde se dispara (RegistrationMirror).
    const searchParams = useSearchParams()
    const registrationEid = searchParams.get('welcome') === 'free' ? searchParams.get('eid') : null
    const registrationPh = searchParams.get('ph') === 'srv' ? ('srv' as const) : undefined
    const tileRefs = useRef<Array<HTMLButtonElement | null>>([])

    const selectedIndex = selected ? PERSONA_TILE_ORDER.indexOf(selected) : -1
    const secondQuestion = selected ? PERSONA_COPY[selected].secondQuestion : null

    // La pantalla es un takeover: el foco entra en la primera tarjeta para que quien navega por
    // teclado no arranque en el sidebar que quedó detrás del overlay. El borrador se lee ACÁ y no
    // en el `useState` para no desincronizar el HTML del servidor con la hidratación.
    useEffect(() => {
        const draft = readDraft()
        if (!draft) {
            tileRefs.current[0]?.focus()
            return
        }
        setSelected(draft.persona)
        setAlsoOther(draft.alsoOther)
        tileRefs.current[PERSONA_TILE_ORDER.indexOf(draft.persona)]?.focus()
    }, [])

    function choose(persona: Persona) {
        setSelected(persona)
        setError(null)
        // Cambiar de rama reinicia la segunda pregunta a su default («No»): la respuesta anterior
        // era sobre otra pregunta.
        setAlsoOther(false)
        writeDraft({ persona, alsoOther: false })
    }

    function chooseAlsoOther(value: boolean) {
        setAlsoOther(value)
        if (selected) writeDraft({ persona: selected, alsoOther: value })
    }

    /** Flechas = mover foco Y selección (comportamiento canónico de un radiogroup). */
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

    function submit() {
        if (!selected) {
            setError('Elige una opción para continuar.')
            tileRefs.current[0]?.focus()
            return
        }
        setError(null)
        setBuilding(true)
        startTransition(async () => {
            const [result] = await Promise.all([
                setCoachPersonaAction({
                    persona: selected,
                    alsoOther,
                    registration: registrationEid
                        ? { welcome: 'free', eid: registrationEid, ph: registrationPh }
                        : undefined,
                }),
                sleep(MIN_BUILD_MS),
            ])
            // En éxito la action redirige (Next navega y este valor llega `undefined`): solo se
            // vuelve a la pantalla cuando algo falló de verdad.
            const settled = result as PersonaActionResult | undefined
            if (settled && settled.ok === false) {
                setError(settled.error)
                setBuilding(false)
                return
            }
            // Guardado: el borrador ya no representa nada pendiente.
            writeDraft(null)
        })
    }

    if (building) {
        return <BuildingPanel />
    }

    return (
        <div className="mx-auto w-full max-w-3xl">
            <p className="font-ui text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--sport-600)]">
                Primer ingreso · 1 pregunta
            </p>
            <h1
                id="persona-title"
                className="mt-2 font-display text-3xl font-black tracking-[-0.03em] text-strong sm:text-4xl"
            >
                ¿A qué te dedicas?
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">
                Con esto te dejamos el panel listo con lo que usas y sin lo que no. Puedes cambiarlo
                después en Opciones.
            </p>

            <div
                role="radiogroup"
                aria-label="¿A qué te dedicas?"
                className="mt-7 grid grid-cols-1 gap-3 sm:grid-cols-2"
            >
                {PERSONA_TILE_ORDER.map((persona, index) => {
                    const copy = PERSONA_COPY[persona]
                    const Icon = PERSONA_ICONS[persona]
                    const isSelected = selected === persona
                    // El escape va último y a ancho doble con borde punteado: se lee como salida,
                    // no como una quinta especialidad.
                    const isEscape = persona === 'other'
                    return (
                        <button
                            key={persona}
                            type="button"
                            role="radio"
                            aria-checked={isSelected}
                            tabIndex={selectedIndex === -1 ? (index === 0 ? 0 : -1) : isSelected ? 0 : -1}
                            ref={(node) => {
                                tileRefs.current[index] = node
                            }}
                            onClick={() => choose(persona)}
                            onKeyDown={(event) => onTileKeyDown(event, index)}
                            className={cn(
                                'group flex min-h-[92px] items-start gap-3.5 rounded-card border bg-surface-card p-4 text-left transition-all',
                                'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)]',
                                isEscape ? 'border-dashed sm:col-span-2' : '',
                                isSelected
                                    ? 'border-[var(--sport-500)] bg-[var(--sport-100)] shadow-[var(--shadow-sm)]'
                                    : 'border-subtle hover:border-[var(--sport-300)] hover:shadow-[var(--shadow-sm)]',
                            )}
                        >
                            <span
                                className={cn(
                                    'flex h-11 w-11 shrink-0 items-center justify-center rounded-control',
                                    isSelected
                                        ? 'bg-[var(--sport-500)] text-[var(--text-on-sport)]'
                                        : 'bg-surface-sunken text-[var(--sport-600)]',
                                )}
                            >
                                <Icon className="h-5 w-5" aria-hidden="true" />
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block font-ui text-[15px] font-bold leading-snug text-strong">
                                    {copy.tileTitle}
                                </span>
                                <span className="mt-1 block text-[13px] leading-relaxed text-muted">
                                    {copy.tileSubtitle}
                                </span>
                            </span>
                        </button>
                    )
                })}
            </div>

            {/* Segunda pregunta inline (una línea, default «No»). */}
            {secondQuestion && (
                <div className="mt-4 flex flex-col gap-3 rounded-card border border-subtle bg-surface-card p-4 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm font-semibold text-strong">{secondQuestion}</p>
                    <SegmentedControl
                        aria-label={secondQuestion}
                        className="sm:w-[180px]"
                        size="sm"
                        options={[
                            { value: 'si', label: 'Sí' },
                            { value: 'no', label: 'No' },
                        ]}
                        value={alsoOther ? 'si' : 'no'}
                        onChange={(value) => chooseAlsoOther(value === 'si')}
                    />
                </div>
            )}

            {error && (
                <p role="alert" className="mt-4 text-sm font-semibold text-[var(--danger-600)]">
                    {error}
                </p>
            )}

            <Button type="button" variant="sport" size="md" className="mt-6 w-full sm:w-auto" onClick={submit}>
                Armar mi panel
            </Button>

            <p className="mt-4 text-xs leading-relaxed text-subtle">
                Lo puedes cambiar cuando quieras en Opciones › Mi panel. Nada se borra.
            </p>
        </div>
    )
}
