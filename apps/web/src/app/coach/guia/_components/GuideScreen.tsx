'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight, PartyPopper, RotateCcw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
    nextStep,
    resolveHref,
    type OnboardingSignals,
    type OnboardingStepKey,
} from '@eva/onboarding'
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
import { guidePillRestorePayload, restoreGuidePillLocally } from '../_lib/guide-pill-restore'
import {
    PERSONA_CHIP_LABEL,
    resolveStepViews,
    stepAnchorId,
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
    useRefreshOnReturn()
    const { guideOff, restoring, restorePill } = useGuidePillRestore(vm, coachId, persona)

    const [line1, line2] = welcomeLines(persona, firstName)
    const views = resolveStepViews(vm.steps, vm.completed)
    const next = vm.ready ? nextStep(vm.persona, vm.completed) : null

    useWelcomeStepFocus(welcome, next?.key ?? null)

    return (
        <div className="mx-auto w-full max-w-[1100px] pb-14">
            {welcome && (
                /* Superficie de tarjeta + una barra de marca a la izquierda. Antes era
                   `bg-[var(--sport-100)]` con `text-[var(--sport-700)]`: en dark eso es un azul
                   translúcido con texto celeste encima y el owner no lo pudo leer (QA 22-08,
                   hallazgo 2). El acento de marca ahora es SOLO la barra; el texto usa los tokens
                   de siempre, que ya tienen contraste AA en los dos temas. La barra es un
                   elemento propio (no `border-l-*`) para no depender del orden en que Tailwind
                   emita `border-color` y `border-left-color`. */
                <section
                    aria-label="Bienvenida"
                    className="relative mb-6 overflow-hidden rounded-card border border-subtle bg-surface-card py-4 pl-5 pr-4 shadow-[var(--shadow-xs)] sm:pl-6 sm:pr-5"
                >
                    <span
                        aria-hidden="true"
                        className="absolute inset-y-0 left-0 w-1 bg-[var(--sport-500)]"
                    />
                    <p className="font-display text-[16px] font-extrabold tracking-[-0.02em] text-[var(--text-strong)]">
                        {line1}
                    </p>
                    <p className="mt-1 text-[13.5px] leading-relaxed text-[var(--text-muted)]">
                        {line2}
                    </p>
                    {next != null && (
                        /* El puente al trabajo: sin esto, elegir persona dejaba al coach mirando
                           una banda y cinco tarjetas iguales, sin saber por cuál empezar. */
                        <button
                            type="button"
                            onClick={() => {
                                focusStepCard(next.key, { focus: true })
                                void postGuideEngagement(next.key, {
                                    widget: 'guide_screen',
                                    action: 'welcome_start',
                                    step: next.key,
                                    persona: persona ?? 'sin_persona',
                                })
                            }}
                            className={cn(
                                'mt-3.5 inline-flex h-11 w-full touch-manipulation items-center justify-center gap-1.5 rounded-control px-4 text-[13.5px] font-bold sm:w-auto',
                                'bg-[var(--cta-fill)] text-[var(--text-on-sport)] motion-safe:transition-colors hover:bg-[color-mix(in_oklab,var(--cta-fill)_92%,#000)]',
                                'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)]'
                            )}
                        >
                            <span className="min-w-0 truncate">Empezar: {next.label}</span>
                            <ArrowRight className="size-4 shrink-0" aria-hidden="true" />
                        </button>
                    )}
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
                            // `flex-wrap` + `max-w-full`: a 390 px «Fuerza y acondicionamiento ·
                            // Cambiar en Mi panel» no entra en una línea y sin esto empujaba el
                            // ancho del documento (scroll horizontal). `min-h-11` = tap target.
                            className="mt-2.5 inline-flex min-h-11 max-w-full touch-manipulation flex-wrap items-center gap-x-1.5 rounded-pill border border-subtle bg-surface-card px-3 py-1.5 text-[12px] font-bold text-[var(--text-muted)] transition-colors hover:bg-surface-sunken hover:text-[var(--text-strong)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)]"
                        >
                            <span className="min-w-0">{PERSONA_CHIP_LABEL[persona]}</span>
                            <span className="min-w-0 text-[var(--text-subtle)]">· Cambiar en Mi panel</span>
                        </Link>
                    )}
                </div>
            </header>

            {persona === null && (
                <div className="mt-5">
                    <PersonaNudgeCard />
                </div>
            )}

            {/* Dos columnas recién en `xl` (1280), no en `lg` (1024): a 1024 con el menú
                expandido (248 px) la columna izquierda caía a ~360 px y la tarjeta «Tu marca en
                60 segundos» —que ya reparte su propio ancho en `md:grid-cols-[1fr_220px]`— se
                quedaba con ~55 px para el nombre y los colores. Con el riel debajo, a 1024 la
                guía usa el ancho completo y nada se aprieta. */}
            <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_330px] xl:items-start">
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

                                return (
                                    <GuideStepCard
                                        key={step.key}
                                        view={view}
                                        href={href}
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
                                                /* Tildado, el paso conserva la puerta de vuelta. */
                                                label={view.state === 'done' ? 'Verla otra vez' : 'Ver mi app'}
                                                /* El tilde del paso 2 llega por la señal del SERVIDOR
                                                   (`vive_tu_app_entered`) cuando el coach entró de
                                                   verdad: pedir el link ya no lo tilda. */
                                                onOpened={() => undefined}
                                                demoClientId={demoClientId}
                                                persona={persona}
                                            />
                                        )}
                                    </GuideStepCard>
                                )
                            })}
                        </ol>
                    )}

                    {vm.ready && (
                        <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
                            <Link
                                href="/coach/dashboard"
                                className="inline-flex min-h-11 touch-manipulation items-center gap-1.5 text-[13px] font-bold text-[var(--text-strong)] hover:underline"
                            >
                                Ir a mi panel
                                <ArrowRight className="size-4" />
                            </Link>
                            {guideOff ? (
                                /* La pantalla sigue siendo accesible por URL con la guía apagada
                                   (QA del owner 22-08) y acá está el camino de vuelta: sin él,
                                   «No mostrar» era de ida sola. */
                                <button
                                    type="button"
                                    onClick={restorePill}
                                    disabled={restoring}
                                    className="inline-flex min-h-11 touch-manipulation items-center gap-1.5 text-left text-[12.5px] font-semibold text-[var(--text-muted)] hover:text-[var(--text-strong)] disabled:opacity-60"
                                >
                                    <RotateCcw className="size-4 shrink-0" aria-hidden="true" />
                                    {restoring ? 'Activando…' : 'Volver a mostrar la píldora'}
                                </button>
                            ) : (
                                /* Único camino para apagar la píldora del panel: sin esto un coach
                                   que nunca termina la guía se queda con ella para siempre. */
                                <button
                                    type="button"
                                    onClick={vm.hide}
                                    className="min-h-11 touch-manipulation text-left text-[12.5px] font-semibold text-[var(--text-muted)] hover:text-[var(--text-strong)]"
                                >
                                    No mostrar la guía en mi panel
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {demo && (
                    <aside className="min-w-0 xl:sticky xl:top-4">
                        <DemoStudentCard
                            demo={demo}
                            persona={vm.persona}
                            openHref={withPrimeraFlag(resolveHref(vm.steps[2], { demoClientId }))}
                            /* Igual que en la tarjeta del paso: pedir el link ya no tilda nada. */
                            onViveTuAppOpened={() => undefined}
                        />
                    </aside>
                )}
            </div>
        </div>
    )
}

/**
 * Lleva la vista (y opcionalmente el foco) a la tarjeta de un paso.
 *
 * Hallazgo 1 del QA del owner (22-08): «elegí persona, me arma las cosas y me devuelve al INICIO
 * de la guía, no me lleva al siguiente paso». El aterrizaje ahora es EL PASO QUE SIGUE, no el
 * encabezado.
 *
 * `prefers-reduced-motion` manda: con la preferencia activa el salto es instantáneo (`auto`), sin
 * scroll animado. `scrollIntoView` no existe en jsdom, así que se comprueba antes de llamarlo.
 */
function focusStepCard(key: OnboardingStepKey, { focus }: { focus: boolean }): void {
    if (typeof document === 'undefined') return
    const el = document.getElementById(stepAnchorId(key))
    if (el == null) return

    const reduced =
        typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' })
    }
    if (focus) el.focus({ preventScroll: true })
}

/**
 * Primera entrada con `?bienvenida=1`: apenas la guía hidrata, la tarjeta del paso siguiente
 * queda centrada en pantalla. Solo SCROLL, no foco — robar el foco al montar le arruina la
 * lectura a quien usa lector de pantalla; el foco lo mueve el botón «Empezar», que es un gesto
 * del coach.
 *
 * Corre UNA sola vez por montaje (`doneRef`): si el auto-tildado adelanta el paso siguiente
 * mientras el coach lee, la pantalla no se le mueve debajo.
 */
function useWelcomeStepFocus(welcome: boolean, nextKey: OnboardingStepKey | null): void {
    const doneRef = useRef(false)

    useEffect(() => {
        if (!welcome || nextKey == null || doneRef.current) return
        doneRef.current = true
        focusStepCard(nextKey, { focus: false })
    }, [welcome, nextKey])
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
        void persistOnboardingGuideAction({ [GUIDE_SEEN_AT_KEY]: new Date().toISOString() }).catch(() => {
            // best-effort: sin red o respuesta no-RSC no rompe nada (EVA-NEXTJS-19)
        })
    }, [guideSeenAt])
}

/**
 * Vuelta a primer plano ⇒ la guía se relee del servidor.
 *
 * Es el equivalente web del listener de `AppState` de la app (docs/specs/vive-tu-app-directo §2).
 * Desde que «Vive tu app» entra DIRECTO en móvil, el gesto #1 para volver es «atrás»: sin esto el
 * navegador devuelve la guía cacheada (bfcache o Router Cache de Next) y el paso 2 aparece sin
 * tildar aunque el servidor ya haya escrito `vive_tu_app_entered`. El coach ve su trabajo perdido.
 *
 * `pageshow` con `persisted` cubre el bfcache (Safari/iOS, Chrome Android) y `visibilitychange`
 * cubre el cambio de pestaña/app. Una restauración de bfcache dispara los DOS: el guard de tiempo
 * deja UN refresh por retorno. No toca nada más: `router.refresh()` es idempotente y no pierde
 * estado del cliente.
 */
function useRefreshOnReturn(): void {
    const router = useRouter()

    useEffect(() => {
        if (typeof document === 'undefined') return
        let lastAt = 0
        const refreshOnce = () => {
            const now = Date.now()
            if (now - lastAt < 500) return
            lastAt = now
            router.refresh()
        }
        const onVisibility = () => {
            if (document.visibilityState !== 'visible') return
            refreshOnce()
        }
        const onPageShow = (event: PageTransitionEvent) => {
            if (!event.persisted) return
            refreshOnce()
        }

        document.addEventListener('visibilitychange', onVisibility)
        window.addEventListener('pageshow', onPageShow)
        return () => {
            document.removeEventListener('visibilitychange', onVisibility)
            window.removeEventListener('pageshow', onPageShow)
        }
    }, [router])
}

/**
 * «Volver a mostrar la píldora» — el reverso de «No mostrar la guía en mi panel».
 *
 * `useOnboardingGuide` sabe apagar la guía pero no prenderla: es el dueño del estado del
 * DASHBOARD y ahí nunca hizo falta. Como el estado apagado vive en dos lados (el jsonb del
 * servidor y el espejo de `localStorage`), acá se limpian los dos y se pide un `refresh()` para
 * que el layout —que es quien monta la píldora— vuelva a leer la fila del coach.
 *
 * `restored` es optimista y local a esta pantalla: el hook conserva su `hidden` hasta que el
 * refresh traiga el jsonb nuevo, y sin esto el botón se quedaría diciendo «Volver a mostrar»
 * después de haberlo hecho.
 */
function useGuidePillRestore(
    vm: ReturnType<typeof useOnboardingGuide>,
    coachId: string,
    persona: Persona | null,
): { guideOff: boolean; restoring: boolean; restorePill: () => void } {
    const router = useRouter()
    const [restored, setRestored] = useState(false)
    const [restoring, startRestore] = useTransition()

    // `atFoot` es `allDone || dismissed`: con 5/5 la guía no está APAGADA, está terminada, y
    // ofrecer «volver a mostrar la píldora» ahí sería mentir (la píldora se apaga sola al
    // completarse y no hay nada que reactivar).
    const guideOff = !restored && (vm.hidden || (vm.atFoot && !vm.allDone))

    const restorePill = useCallback(() => {
        startRestore(async () => {
            const result = await persistOnboardingGuideAction(guidePillRestorePayload())
            if (!result.ok) {
                toast.error('No pudimos reactivar la guía', { description: result.error })
                return
            }
            restoreGuidePillLocally(coachId)
            setRestored(true)
            void postGuideEngagement('profile_branding', {
                widget: 'guide_screen',
                action: 'pill_restore',
                persona: persona ?? 'sin_persona',
            })
            toast.success('Listo: la guía vuelve a tu panel.')
            router.refresh()
        })
    }, [coachId, persona, router])

    return { guideOff, restoring, restorePill }
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
