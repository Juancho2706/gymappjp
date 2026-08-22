'use client'

import Link from 'next/link'
import { Check, PartyPopper, Rocket, Trash2, X } from 'lucide-react'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { resolveHref, type OnboardingStep } from '@eva/onboarding'
import type { Persona } from '@eva/schemas'
import { cn } from '@/lib/utils'
import { BrandQuickCard } from './_components/BrandQuickCard'
import { DemoStudentCard } from './_components/DemoStudentCard'
import { PersonaNudgeCard } from './_components/PersonaNudgeCard'
import { ViveTuAppButton } from './_components/ViveTuAppButton'
import { deleteDemoStudentAction } from './_actions/demo-student.actions'
import { postGuideEngagement } from './_lib/onboarding-telemetry.client'
import type { OnboardingGuideVm } from './_lib/use-onboarding-guide'
import type { CoachBrandDraft, DemoStudentSnapshot } from './_data/dashboard.queries'

/**
 * Guía de inicio v2 — 5 verbos por persona, ARRIBA del dashboard (SPEC coach-onboarding-v2 §6,
 * decisión D5=A).
 *
 * Qué cambió respecto del checklist v1:
 *  - Los pasos salen de `@eva/onboarding` (fuente ÚNICA web + RN), no de un array local: el paso 3
 *    es el que cambia de verdad entre ramas, así que un nutricionista ya no ve «crea tu primer
 *    programa», que nunca podría tildar.
 *  - Vive ARRIBA (antes del hero) hasta 5/5 u «Ocultar»; después baja a una tira al pie. En v1
 *    vivía al FINAL, debajo de KPIs vacíos que además felicitaban al coach nuevo.
 *  - Los pasos se tildan SOLOS con señales reales del servidor. No hay «marcar visto».
 *  - El paso 1 no manda a un paywall: se resuelve inline con «Tu marca en 60 segundos».
 *
 * El estado (progreso, posición, telemetría) lo administra `useOnboardingGuide` en el shell —
 * este archivo solo pinta y delega.
 */

interface GuideBlockProps {
    vm: OnboardingGuideVm
    /** `null` = el coach no eligió especialidad: se pinta la tarjeta que lo invita a elegirla. */
    persona: Persona | null
    demo: DemoStudentSnapshot | null
    brand: CoachBrandDraft
    needsBrand: boolean
    showsEvaBadge: boolean
}

export function CoachOnboardingChecklist({
    vm,
    persona,
    demo,
    brand,
    needsBrand,
    showsEvaBadge,
}: GuideBlockProps) {
    if (!vm.ready) {
        return (
            <div
                className="h-[136px] animate-pulse rounded-card border border-subtle bg-surface-sunken"
                aria-hidden
            />
        )
    }

    // 5/5 o «Ocultar»: la guía se fue al pie (`OnboardingGuideFooterStrip`).
    if (vm.atFoot) return null

    const demoClientId = demo?.clientId ?? null

    return (
        <div className="flex flex-col gap-3">
            {persona === null && <PersonaNudgeCard />}

            <section aria-label="Guía de inicio" className="rounded-card border border-subtle bg-surface-card p-4">
                <div className="flex items-center gap-2.5">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-control bg-[var(--sport-100)] text-[var(--sport-600)]">
                        <Rocket className="size-4" />
                    </span>
                    <h2 className="flex-1 text-[14.5px] font-extrabold text-[var(--text-strong)]">
                        Guía de inicio
                    </h2>
                    <span className="text-[12.5px] font-extrabold text-[var(--text-muted)]">
                        {vm.done}/{vm.total}
                    </span>
                </div>

                <div
                    className="mt-2.5 h-1.5 w-full overflow-hidden rounded-pill bg-[var(--track)]"
                    role="progressbar"
                    aria-valuenow={vm.done}
                    aria-valuemin={0}
                    aria-valuemax={vm.total}
                    aria-label="Progreso de la guía de inicio"
                >
                    <div
                        className="h-full rounded-pill bg-[var(--sport-500)] transition-[width] duration-300"
                        style={{ width: `${Math.round((vm.done / vm.total) * 100)}%` }}
                    />
                </div>

                <ol className="mt-3 flex flex-col gap-1">
                    {vm.steps.map((step, index) => (
                        <StepRow
                            key={step.key}
                            step={step}
                            index={index}
                            done={vm.completed[step.key]}
                            demoClientId={demoClientId}
                            persona={vm.persona}
                            onViveTuAppOpened={() => vm.markStepCompleted('vive_tu_app')}
                        />
                    ))}
                </ol>

                <button
                    type="button"
                    onClick={vm.sendToFoot}
                    className="mt-1 min-h-11 touch-manipulation pr-2 text-left text-[12px] font-bold text-[var(--text-muted)] hover:text-[var(--text-strong)]"
                >
                    Ocultar
                </button>
            </section>

            {needsBrand && (
                <BrandQuickCard
                    brand={brand}
                    showsEvaBadge={showsEvaBadge}
                    onSaved={() => vm.markStepCompleted('profile_branding')}
                />
            )}

            {demo && (
                <DemoStudentCard
                    demo={demo}
                    persona={vm.persona}
                    openHref={resolveHref(vm.steps[2], { demoClientId })}
                    onViveTuAppOpened={() => vm.markStepCompleted('vive_tu_app')}
                />
            )}
        </div>
    )
}

function StepRow({
    step,
    index,
    done,
    demoClientId,
    persona,
    onViveTuAppOpened,
}: {
    step: OnboardingStep
    index: number
    done: boolean
    demoClientId: string | null
    persona: Persona
    onViveTuAppOpened: () => void
}) {
    const href = resolveHref(step, { demoClientId })

    const body = (
        <>
            <span className="block text-[13.5px] font-bold leading-snug">{step.label}</span>
            <span className="mt-0.5 block text-[12px] leading-snug text-[var(--text-muted)]">
                {step.description}
            </span>
        </>
    )

    return (
        <li className="flex items-start gap-2.5 py-1">
            <span
                aria-hidden
                className={cn(
                    'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-black',
                    done
                        ? 'bg-[var(--sport-500)] text-white'
                        : 'border-2 border-[var(--border-subtle)] text-[var(--text-muted)]'
                )}
            >
                {done ? <Check className="size-3" /> : index + 1}
            </span>
            <div className={cn('min-w-0 flex-1', done && 'opacity-65')}>
                {href ? (
                    <Link
                        href={href}
                        onClick={() =>
                            void postGuideEngagement(step.key, {
                                widget: 'onboarding_checklist',
                                action: 'step_open',
                                step: step.key,
                                persona,
                            })
                        }
                        className="block text-[var(--text-strong)] hover:underline"
                    >
                        {body}
                    </Link>
                ) : (
                    <div className="text-[var(--text-strong)]">{body}</div>
                )}
                {/* El paso 2 no navega: lo dispara una acción (magic link del alumno de ejemplo). */}
                {step.key === 'vive_tu_app' && !done && (
                    <ViveTuAppButton
                        label="Ver mi app"
                        className="mt-1.5 h-9 px-3 text-[12.5px]"
                        onOpened={onViveTuAppOpened}
                    />
                )}
            </div>
        </li>
    )
}

/**
 * Tira de una línea al PIE del dashboard: aparece cuando la guía llegó a 5/5 o el coach la ocultó.
 * Mantiene a mano lo único que sigue siendo útil después: borrar el alumno de ejemplo.
 */
export function OnboardingGuideFooterStrip({
    vm,
    hasDemo,
}: {
    vm: OnboardingGuideVm
    hasDemo: boolean
}) {
    const router = useRouter()
    const [deleting, startDelete] = useTransition()
    const [demoGone, setDemoGone] = useState(false)

    if (!vm.ready || !vm.atFoot || vm.hidden) return null

    function removeDemo() {
        startDelete(async () => {
            const result = await deleteDemoStudentAction()
            if (!result.ok) {
                toast.error(result.error)
                return
            }
            setDemoGone(true)
            toast.success('Borramos el alumno de ejemplo.')
            router.refresh()
        })
    }

    return (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-control border border-[var(--success-500)]/30 bg-[var(--success-100)] px-3.5 py-2">
            <span className="flex shrink-0 text-[var(--success-600)]">
                {vm.allDone ? <PartyPopper className="size-4" /> : <Rocket className="size-4" />}
            </span>
            <span className="flex-1 text-[12.5px] font-bold text-[var(--success-700)]">
                {vm.allDone
                    ? `Guía de inicio completada ${vm.done}/${vm.total}`
                    : `Guía de inicio ${vm.done}/${vm.total}`}
            </span>
            {hasDemo && !demoGone && (
                <button
                    type="button"
                    onClick={removeDemo}
                    disabled={deleting}
                    className="inline-flex min-h-11 shrink-0 touch-manipulation items-center gap-1.5 px-1 text-[12px] font-extrabold text-[var(--success-700)] disabled:opacity-60"
                >
                    <Trash2 className="size-3.5" />
                    {deleting ? 'Borrando…' : 'Borrar ejemplo'}
                </button>
            )}
            <button
                type="button"
                onClick={vm.hide}
                aria-label="Ocultar la guía de inicio"
                className="inline-flex min-h-11 shrink-0 touch-manipulation items-center gap-1 px-1 text-[12px] font-extrabold text-[var(--success-700)]"
            >
                <X className="size-3.5" />
                Ocultar
            </button>
        </div>
    )
}
