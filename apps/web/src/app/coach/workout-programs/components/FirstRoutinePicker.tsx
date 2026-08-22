'use client'

import { useId, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight, ChevronDown, Loader2, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import type { OnboardingTemplate } from '@eva/onboarding'
import { cn } from '@/lib/utils'
import { applyTemplateAction } from '../../_actions/templates.actions'
import type { TemplatePickerClient } from '../../_components/TemplatePicker'

/**
 * Entrada de la tarea guiada «Primera rutina» (W4 F4.2, SPEC coach-onboarding-v2 §7).
 *
 * Es el hermano navegante de `coach/_components/TemplatePicker`: mismo catálogo, mismo selector
 * de destino, misma acción server (`applyTemplateAction`, que valida sesión + allowlist + acceso
 * al alumno). Lo que cambia es el FINAL: el genérico se queda en la página y refresca; este lleva
 * al coach al lienzo con la plantilla ya aplicada (`?programId=…&primera=1`), que es lo que pide
 * la tarea guiada — el coach nunca ve un builder en blanco.
 *
 * Si el sembrado falla, no se traga el paso: se dice en un toast y se abre el builder igual, en
 * blanco. Perder la plantilla es molesto; perder el paso 3 de la guía es peor.
 */
export function FirstRoutinePicker({
    templates,
    clients,
    defaultClientId = null,
    demoLabel,
    noun,
}: {
    templates: readonly OnboardingTemplate[]
    clients: readonly TemplatePickerClient[]
    defaultClientId?: string | null
    demoLabel: string
    noun: string
}) {
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

    const openBuilder = (programId?: string) => {
        const query = programId ? `?programId=${encodeURIComponent(programId)}&primera=1` : '?primera=1'
        router.push(`/coach/builder/${clientId}${query}`)
    }

    const apply = (templateId: string) => {
        if (!hasClients) {
            setMessage({
                tone: 'info',
                text: `Primero invita a tu primer ${noun}: la rutina se arma sobre alguien.`,
            })
            return
        }
        if (!clientId) {
            setMessage({ tone: 'error', text: 'Elige a quién armársela.' })
            return
        }
        setMessage(null)
        setPendingId(templateId)
        startTransition(async () => {
            const result = await applyTemplateAction({ templateId, clientId })
            setPendingId(null)
            if (result.ok) {
                openBuilder(result.programId)
                return
            }
            if (result.reason === 'not_implemented' || result.reason === 'error') {
                // Amable y sin callejón: el lienzo se abre igual, vacío.
                toast.warning('No pudimos precargar esa plantilla. Abrimos el lienzo en blanco.')
                openBuilder()
                return
            }
            setMessage({ tone: 'error', text: result.error })
        })
    }

    return (
        <div className="space-y-3">
            {hasClients ? (
                <div className="flex flex-wrap items-center gap-2">
                    <label htmlFor={selectId} className="text-[12.5px] font-bold text-strong">
                        Armársela a
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
