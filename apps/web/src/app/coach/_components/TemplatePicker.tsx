'use client'

import { useId, useState, useTransition, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight, ChevronDown, Loader2, UserPlus } from 'lucide-react'
import type { OnboardingTemplate } from '@eva/onboarding'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { applyTemplateAction } from '../_actions/templates.actions'

/**
 * Vacíos «template-first» del coach nuevo (SPEC coach-onboarding-v2 §7).
 *
 * Patrón de los cuatro vacíos: **nombrar el valor + mostrar la forma del éxito + UNA acción +
 * un escape**. Nada de ilustración con botón genérico: el coach que entra por primera vez ve
 * las plantillas de SU mundo y a su alumno de ejemplo como sujeto («Empieza con Matías»).
 *
 * Todo el copy vive en el sitio que lo pinta; acá vive la MECÁNICA (elegir alumno, aplicar,
 * tolerar que el sembrador todavía no exista).
 */

export interface TemplatePickerClient {
    id: string
    name: string
    /** El alumno de ejemplo se rotula en el selector y es el destino por defecto. */
    isDemo?: boolean
}

interface TemplatePickerProps {
    templates: readonly OnboardingTemplate[]
    /** Alumnos activos a los que se puede aplicar (incluye el de ejemplo). */
    clients: readonly TemplatePickerClient[]
    /** Destino por defecto: el alumno de ejemplo cuando existe. */
    defaultClientId?: string | null
    /** «Alumno de ejemplo» · «Paciente de ejemplo» · «Atleta de ejemplo». */
    demoLabel: string
    /** Sustantivo de la persona («alumno» / «paciente» / «atleta») para el copy sin alumnos. */
    noun: string
}

/**
 * Tarjetas de plantilla + selector de destino. Sin alumnos todavía, la única acción posible es
 * invitar al primero: se dice, no se oculta el bloque.
 */
export function TemplatePicker({
    templates,
    clients,
    defaultClientId = null,
    demoLabel,
    noun,
}: TemplatePickerProps) {
    const router = useRouter()
    const selectId = useId()
    const [clientId, setClientId] = useState<string>(
        defaultClientId ?? clients.find((c) => c.isDemo)?.id ?? clients[0]?.id ?? '',
    )
    const [pendingId, setPendingId] = useState<string | null>(null)
    const [message, setMessage] = useState<{ tone: 'info' | 'error'; text: string } | null>(null)
    const [isPending, startTransition] = useTransition()

    if (templates.length === 0) return null

    const hasClients = clients.length > 0

    const apply = (templateId: string) => {
        if (!hasClients) {
            setMessage({
                tone: 'info',
                text: `Primero invita a tu primer ${noun}: la plantilla se aplica sobre alguien.`,
            })
            return
        }
        if (!clientId) {
            setMessage({ tone: 'error', text: 'Elige a quién aplicarla.' })
            return
        }
        setMessage(null)
        setPendingId(templateId)
        startTransition(async () => {
            const result = await applyTemplateAction({ templateId, clientId })
            setPendingId(null)
            if (result.ok) {
                setMessage({ tone: 'info', text: 'Plantilla aplicada. Ya puedes ajustarla.' })
                router.refresh()
                return
            }
            // `not_implemented` = el sembrador todavía no existe (W3 F3.1). No es un error del
            // coach ni rompe el vacío: se dice y las plantillas siguen a la vista.
            setMessage(
                result.reason === 'not_implemented'
                    ? { tone: 'info', text: 'Plantilla en preparación. Puedes empezar desde cero mientras tanto.' }
                    : { tone: 'error', text: result.error },
            )
        })
    }

    return (
        <div className="space-y-3">
            {hasClients ? (
                <div className="flex flex-wrap items-center gap-2">
                    <label htmlFor={selectId} className="text-[12.5px] font-bold text-strong">
                        Aplicar a
                    </label>
                    <div className="relative min-w-[180px] flex-1 sm:flex-none">
                        <select
                            id={selectId}
                            value={clientId}
                            onChange={(event) => setClientId(event.target.value)}
                            className="h-11 w-full cursor-pointer appearance-none rounded-control border-[1.5px] border-default bg-surface-card pl-3.5 pr-9 text-[14px] font-semibold text-strong outline-none transition-colors focus:border-[var(--brand)] focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)]"
                        >
                            {clients.map((client) => (
                                <option key={client.id} value={client.id}>
                                    {client.isDemo ? `${client.name} · ${demoLabel}` : client.name}
                                </option>
                            ))}
                        </select>
                        <ChevronDown
                            aria-hidden
                            className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-muted"
                        />
                    </div>
                </div>
            ) : (
                <Link
                    href="/coach/clients?invite=1"
                    className="inline-flex min-h-11 items-center gap-2 rounded-control border-[1.5px] border-default bg-surface-card px-3.5 text-[13.5px] font-bold text-strong transition-colors hover:bg-surface-sunken"
                >
                    <UserPlus className="size-4" aria-hidden />
                    Invita a tu primer {noun}
                </Link>
            )}

            <ul className="grid list-none grid-cols-1 gap-2.5 sm:grid-cols-2">
                {templates.map((template) => {
                    const busy = isPending && pendingId === template.id
                    return (
                        <li key={template.id}>
                            <button
                                type="button"
                                onClick={() => apply(template.id)}
                                disabled={isPending}
                                aria-busy={busy}
                                className={cn(
                                    'eva-press group flex min-h-11 w-full items-start gap-3 rounded-card border border-subtle bg-surface-card p-3.5 text-left transition-colors',
                                    'hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)]',
                                    'disabled:opacity-60',
                                )}
                            >
                                <span className="min-w-0 flex-1">
                                    <span className="block text-[14.5px] font-bold text-strong">
                                        {template.label}
                                    </span>
                                    <span className="mt-0.5 block text-[12.5px] leading-snug text-muted">
                                        {template.blurb}
                                    </span>
                                </span>
                                {busy ? (
                                    <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-muted" aria-hidden />
                                ) : (
                                    <ArrowRight
                                        className="mt-0.5 size-4 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5"
                                        aria-hidden
                                    />
                                )}
                            </button>
                        </li>
                    )
                })}
            </ul>

            <p
                role="status"
                aria-live="polite"
                className={cn(
                    'min-h-[18px] text-[12.5px] font-semibold',
                    message?.tone === 'error' ? 'text-[var(--danger-600)]' : 'text-muted',
                )}
            >
                {message?.text ?? ''}
            </p>
        </div>
    )
}

/**
 * La UNA acción del vacío cuando no hay plantillas que aplicar (screening, zonas): link con
 * forma de CTA `sport` del DS. Se mantiene como `<Link>` para conservar la navegación nativa.
 */
export function TemplateFirstCta({
    href,
    children,
    icon,
}: {
    href: string
    children: ReactNode
    icon?: ReactNode
}) {
    return (
        <Link
            href={href}
            className="eva-press inline-flex min-h-11 w-fit items-center gap-2 rounded-control bg-[var(--cta-fill)] px-4 text-[14px] font-bold text-[var(--text-on-sport)] shadow-[var(--shadow-sm)] transition-opacity hover:opacity-90"
        >
            {icon}
            {children}
        </Link>
    )
}

interface TemplateFirstEmptyStateProps {
    /** Línea corta de contexto sobre el título (mayúsculas, sin punto). */
    eyebrow: string
    /** Nombra el VALOR y la forma del éxito, no la ausencia de datos. */
    title: string
    description: string
    /** El alumno de ejemplo como sujeto: «Empieza con Matías». `null` = no hay demo sembrado. */
    subject?: string | null
    /** La UNA acción: normalmente el `TemplatePicker`. */
    children?: ReactNode
    /** El escape: empezar desde cero, o el paso previo cuando no hay a quién aplicarle nada. */
    escape?: { href: string; label: string }
}

/** Marco común de los cuatro vacíos template-first. Solo estructura + tokens del DS. */
export function TemplateFirstEmptyState({
    eyebrow,
    title,
    description,
    subject = null,
    children,
    escape,
}: TemplateFirstEmptyStateProps) {
    return (
        <Card padding="lg" className="gap-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted">{eyebrow}</p>
            <h2 className="mt-1 font-display text-[19px] font-extrabold tracking-[-0.02em] text-strong md:text-[22px]">
                {title}
            </h2>
            <p className="mt-1.5 max-w-[56ch] text-[13.5px] leading-relaxed text-muted">{description}</p>
            {subject ? (
                <p className="mt-2.5 inline-flex w-fit items-center rounded-pill bg-sport-100 px-2.5 py-1 text-[12px] font-bold text-sport-700">
                    {subject}
                </p>
            ) : null}
            {children ? <div className="mt-4">{children}</div> : null}
            {escape ? (
                <Link
                    href={escape.href}
                    className="mt-3 inline-flex min-h-11 w-fit items-center gap-1.5 text-[13px] font-bold text-strong underline underline-offset-4 transition-colors hover:text-sport-600"
                >
                    {escape.label}
                </Link>
            ) : null}
        </Card>
    )
}
