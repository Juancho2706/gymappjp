'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
    Activity,
    ArrowRight,
    ClipboardList,
    Dumbbell,
    HeartPulse,
    PartyPopper,
    Palette,
    Salad,
    Smartphone,
    Sparkles,
    Trash2,
    UserPlus,
    type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { resolveHref, type OnboardingSignals, type OnboardingStepKey } from '@eva/onboarding'
import type { Persona } from '@eva/schemas'
import type { Json } from '@/lib/database.types'
import { cn } from '@/lib/utils'
import { BrandQuickCard } from '../../dashboard/_components/BrandQuickCard'
import { DemoStudentCard } from '../../dashboard/_components/DemoStudentCard'
import { PersonaNudgeCard } from '../../dashboard/_components/PersonaNudgeCard'
import { ViveTuAppButton } from '../../dashboard/_components/ViveTuAppButton'
import { deleteDemoStudentAction } from '../../dashboard/_actions/demo-student.actions'
import { persistOnboardingGuideAction } from '../../dashboard/_actions/onboarding-guide.actions'
import { postGuideEngagement } from '../../dashboard/_lib/onboarding-telemetry.client'
import { useOnboardingGuide } from '../../dashboard/_lib/use-onboarding-guide'
import type { CoachBrandDraft, DemoStudentSnapshot } from '../../dashboard/_data/dashboard.queries'
import { GUIDE_SEEN_AT_KEY } from '../_lib/guide-first-entry'
import {
    PERSONA_CHIP_LABEL,
    resolveStepViews,
    welcomeLines,
    withPrimeraFlag,
} from '../_lib/guide-view'
import { GuideProgressRing } from './GuideProgressRing'
import { GuideStepCard } from './GuideStepCard'

/**
 * «Tus primeros pasos» — la guía de inicio en su PANTALLA PROPIA (decisión del owner 22-08, que
 * manda sobre SPEC §Diseño v2 «guía arriba del dashboard»).
 *
 * Qué cambió y por qué: el dashboard del día 1 se ve LLENO —hero, KPIs, agenda— y la guía, metida
 * arriba, competía con todo eso. Acá tiene la pantalla entera: tarjetas grandes, un solo paso
 * destacado y el alumno de ejemplo al costado. El dashboard queda limpio y la píldora flotante
 * (`components/coach/GuidePill.tsx`) es el único rastro que queda ahí.
 *
 * La guía sigue siendo UNA sola aunque haya cambiado de casa: el estado (progreso, auto-tildado,
 * telemetría, confeti del aha) lo administra el MISMO `useOnboardingGuide` de siempre — server
 * gana, `emitted` evita re-emitir, escritura con debounce.
 */

/** Iconos por paso. El 3 cambia por persona: es el único paso que cambia de verdad entre ramas. */
const STEP_ICON: Record<OnboardingStepKey, LucideIcon> = {
    profile_branding: Palette,
    vive_tu_app: Smartphone,
    first_artifact: ClipboardList,
    first_client: UserPlus,
    aha: Sparkles,
}

const FIRST_ARTIFACT_ICON: Record<Persona, LucideIcon> = {
    strength: Dumbbell,
    nutrition: Salad,
    rehab: Activity,
    endurance: HeartPulse,
    other: ClipboardList,
}

/** Verbo del CTA por paso: el coach tiene que saber qué pasa al tocarlo. */
const STEP_CTA: Record<OnboardingStepKey, string> = {
    profile_branding: 'Abrir Mi Marca',
    vive_tu_app: 'Ver mi app',
    first_artifact: 'Empezar',
    first_client: 'Invitar',
    aha: 'Ver el panel',
}

export interface GuideScreenProps {
    coachId: string
    /** Nombre de pila para la cabecera («Tus primeros pasos, Ana»). */
    firstName: string
    /** `null` = el coach todavía no eligió especialidad (coach viejo, decisión D8). */
    persona: Persona | null
    demo: DemoStudentSnapshot | null
    brand: CoachBrandDraft
    needsBrand: boolean
    showsEvaBadge: boolean
    signals: OnboardingSignals
    initialGuide: Json
    /** `onboarding_guide.guide_seen_at`: si falta, esta pantalla lo estampa al montarse. */
    guideSeenAt: string | null
    /** `?bienvenida=1`: banda de dos líneas en vez del modal de bienvenida. */
    welcome: boolean
}

export function GuideScreen({
    coachId,
    firstName,
    persona,
    demo,
    brand,
    needsBrand,
    showsEvaBadge,
    signals,
    initialGuide,
    guideSeenAt,
    welcome,
}: GuideScreenProps) {
    const vm = useOnboardingGuide({ coachId, persona, initialGuide, signals })
    const demoClientId = demo?.clientId ?? null

    useGuideSeenStamp(guideSeenAt)

    const [line1, line2] = welcomeLines(persona, firstName)
    const views = resolveStepViews(vm.steps, vm.completed)

    return (
        <div className="mx-auto w-full max-w-[1100px] pb-14">
            {welcome && (
                <section
                    aria-label="Bienvenida"
                    className="mb-6 rounded-card border border-[var(--sport-200)] bg-[var(--sport-100)] px-4 py-3.5 sm:px-5"
                >
                    <p className="font-display text-[16px] font-extrabold tracking-[-0.02em] text-[var(--sport-700)]">
                        {line1}
                    </p>
                    <p className="mt-1 text-[13.5px] leading-relaxed text-[var(--sport-700)] opacity-90">
                        {line2}
                    </p>
                </section>
            )}

            <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-5">
                <GuideProgressRing done={vm.ready ? vm.done : 0} total={vm.total} />
                <div className="min-w-0 flex-1">
                    <h1 className="font-display text-[26px] font-black leading-[1.08] tracking-[-0.03em] text-[var(--text-strong)] sm:text-[32px]">
                        Tus primeros pasos, {firstName}
                    </h1>
                    <p className="mt-1.5 text-[13.5px] leading-relaxed text-[var(--text-muted)]">
                        Cinco pasos para dejar tu app andando hoy. Se tildan solos cuando el trabajo
                        está hecho: no hay nada que marcar a mano.
                    </p>
                    {persona !== null && (
                        <Link
                            href="/coach/settings/funciones"
                            className="mt-2.5 inline-flex min-h-9 touch-manipulation items-center gap-1.5 rounded-pill border border-subtle bg-surface-card px-3 text-[12px] font-bold text-[var(--text-muted)] transition-colors hover:bg-surface-sunken hover:text-[var(--text-strong)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)]"
                        >
                            {PERSONA_CHIP_LABEL[persona]}
                            <span className="text-[var(--text-subtle)]">· Cambiar en Mi panel</span>
                        </Link>
                    )}
                </div>
            </header>

            {persona === null && (
                <div className="mt-5">
                    <PersonaNudgeCard />
                </div>
            )}

            <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_330px] lg:items-start">
                <div className="min-w-0">
                    {vm.ready && vm.allDone && <GuideClosingCard hasDemo={demo !== null} />}

                    {!vm.ready ? (
                        <div className="flex flex-col gap-3" aria-hidden="true">
                            {[0, 1, 2, 3, 4].map((i) => (
                                <div
                                    key={i}
                                    className="h-[120px] animate-pulse rounded-card border border-subtle bg-surface-sunken"
                                />
                            ))}
                        </div>
                    ) : (
                        <ol className="flex flex-col gap-3">
                            {views.map((view) => {
                                const { step } = view
                                const resolved = resolveHref(step, { demoClientId })
                                const href =
                                    step.key === 'first_artifact' ? withPrimeraFlag(resolved) : resolved
                                const icon =
                                    step.key === 'first_artifact'
                                        ? FIRST_ARTIFACT_ICON[vm.persona]
                                        : STEP_ICON[step.key]

                                return (
                                    <GuideStepCard
                                        key={step.key}
                                        view={view}
                                        href={href}
                                        icon={icon}
                                        ctaLabel={STEP_CTA[step.key]}
                                        hint={
                                            step.key === 'aha'
                                                ? 'Este lo completa tu alumno: te avisamos en el panel apenas ocurra.'
                                                : undefined
                                        }
                                        onOpen={() =>
                                            void postGuideEngagement(step.key, {
                                                widget: 'guide_screen',
                                                action: 'step_open',
                                                step: step.key,
                                                persona: persona ?? 'sin_persona',
                                            })
                                        }
                                        block={
                                            step.key === 'profile_branding' && needsBrand ? (
                                                <BrandQuickCard
                                                    brand={brand}
                                                    showsEvaBadge={showsEvaBadge}
                                                    onSaved={() => vm.markStepCompleted('profile_branding')}
                                                />
                                            ) : undefined
                                        }
                                    >
                                        {step.key === 'vive_tu_app' && (
                                            <ViveTuAppButton
                                                label="Ver mi app"
                                                onOpened={() => vm.markStepCompleted('vive_tu_app')}
                                            />
                                        )}
                                    </GuideStepCard>
                                )
                            })}
                        </ol>
                    )}

                    {vm.ready && !vm.hidden && (
                        <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
                            <Link
                                href="/coach/dashboard"
                                className="inline-flex min-h-11 touch-manipulation items-center gap-1.5 text-[13px] font-bold text-[var(--text-strong)] hover:underline"
                            >
                                Ir a mi panel
                                <ArrowRight className="size-4" />
                            </Link>
                            {/* Único camino para apagar la píldora del panel: sin esto un coach que
                                nunca termina la guía se queda con ella para siempre. */}
                            <button
                                type="button"
                                onClick={vm.hide}
                                className="min-h-11 touch-manipulation text-left text-[12.5px] font-semibold text-[var(--text-muted)] hover:text-[var(--text-strong)]"
                            >
                                No mostrar la guía en mi panel
                            </button>
                        </div>
                    )}
                </div>

                {demo && (
                    <aside className="min-w-0 lg:sticky lg:top-4">
                        <DemoStudentCard
                            demo={demo}
                            persona={vm.persona}
                            openHref={withPrimeraFlag(resolveHref(vm.steps[2], { demoClientId }))}
                            onViveTuAppOpened={() => vm.markStepCompleted('vive_tu_app')}
                        />
                    </aside>
                )}
            </div>
        </div>
    )
}

/**
 * Estampa `onboarding_guide.guide_seen_at` la PRIMERA vez que el coach ve esta pantalla. Es lo
 * que hace que el redirect de primera entrada (`shouldRedirectToGuide`) ocurra una sola vez.
 *
 * Se dispara AL MONTAR, sin esperar: si el coach toca «Ir a mi panel» antes de que el sello
 * llegue, el dashboard lo devolvería a la guía y parecería un rebote. La otra escritura del jsonb
 * (`useOnboardingGuide`) tiene debounce de 450 ms, así que en la práctica el sello ya está cuando
 * ella hace su read-modify-write. En la carrera improbable en que no llegue, lo peor que pasa es
 * que el coach vea la guía una vez más — nunca se pierde progreso.
 */
function useGuideSeenStamp(guideSeenAt: string | null): void {
    const stampedRef = useRef(false)

    useEffect(() => {
        if (guideSeenAt != null && guideSeenAt !== '') return
        if (stampedRef.current) return
        stampedRef.current = true
        void persistOnboardingGuideAction({ [GUIDE_SEEN_AT_KEY]: new Date().toISOString() })
    }, [guideSeenAt])
}

/** Cierre de la guía: 5/5. El confeti ya lo lanzó el aha (uno solo, en `useOnboardingGuide`). */
function GuideClosingCard({ hasDemo }: { hasDemo: boolean }) {
    const router = useRouter()
    const [deleting, startDelete] = useTransition()
    const [demoGone, setDemoGone] = useState(false)

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
        <section
            aria-label="Guía completada"
            className="mb-4 rounded-card border border-[var(--success-500)]/30 bg-[var(--success-100)] p-4 sm:p-5"
        >
            <div className="flex items-start gap-3">
                <span
                    aria-hidden="true"
                    className="flex size-11 shrink-0 items-center justify-center rounded-control bg-[var(--success-500)]/15 text-[var(--success-600)]"
                >
                    <PartyPopper className="size-[22px]" />
                </span>
                <div className="min-w-0 flex-1">
                    <h2 className="font-display text-[18px] font-extrabold tracking-[-0.02em] text-[var(--success-700)]">
                        Listo: los cinco pasos están hechos
                    </h2>
                    <p className="mt-1 text-[13.5px] leading-relaxed text-[var(--success-700)] opacity-90">
                        Tu app está andando con tu marca y tu primer alumno ya la usó. De acá en
                        adelante, el panel es tu lugar de trabajo.
                    </p>
                    <div className="mt-3.5 flex flex-wrap items-center gap-2">
                        <Link
                            href="/coach/dashboard"
                            className={cn(
                                'inline-flex h-11 touch-manipulation items-center gap-1.5 rounded-control px-4 text-[13.5px] font-bold',
                                'bg-[var(--cta-fill)] text-[var(--text-on-sport)] motion-safe:transition-colors hover:bg-[color-mix(in_oklab,var(--cta-fill)_92%,#000)]',
                                'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)]'
                            )}
                        >
                            Ir a mi panel
                            <ArrowRight className="size-4" />
                        </Link>
                        {hasDemo && !demoGone && (
                            <button
                                type="button"
                                onClick={removeDemo}
                                disabled={deleting}
                                className="inline-flex h-11 touch-manipulation items-center gap-1.5 rounded-control px-3 text-[12.5px] font-extrabold text-[var(--success-700)] hover:bg-[var(--success-500)]/10 disabled:opacity-60"
                            >
                                <Trash2 className="size-4" />
                                {deleting ? 'Borrando…' : 'Borrar ejemplo'}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </section>
    )
}
