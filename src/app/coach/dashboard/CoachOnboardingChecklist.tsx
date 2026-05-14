'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, Circle, Copy, ExternalLink, Monitor, Smartphone, Sparkles, X } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { toast } from 'sonner'
import confetti from 'canvas-confetti'
import { motion } from 'framer-motion'
import { GlassCard } from '@/components/ui/glass-card'
import { Button, buttonVariants } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import type { Json } from '@/lib/database.types'
import { getTierCapabilities, type SubscriptionTier } from '@/lib/constants'
import { COACH_NUTRITION_ONBOARDING_STEPS } from '@/app/coach/nutrition-plans/_components/nutrition-onboarding-shared'
import { brandTourSeenStorageKey, BRAND_TOUR_SEEN_CHANGED_EVENT } from '@/lib/coach-brand-tour'
import { persistOnboardingGuideAction } from './_actions/onboarding-guide.actions'
import { OnboardingCompactLoopStrip } from './_components/onboarding/OnboardingCompactLoopStrip'
import { OnboardingStepsJumpNav } from './_components/onboarding/OnboardingStepsJumpNav'
import { OnboardingStepsVignetteCarousel } from './_components/onboarding/OnboardingStepsVignetteCarousel'
import { OnboardingThreeSlot } from './_components/onboarding/OnboardingThreeSlot'
import { postGuideEngagement } from './_lib/onboarding-telemetry.client'

type StepKey = 'profile_branding' | 'first_client' | 'first_plan' | 'first_checkin'

type PersistedState = {
    completed: Partial<Record<StepKey, boolean>>
    ahaMomentSent?: boolean
    dismissed?: boolean
}

/** Por coach: evita que dismiss/completado de otra cuenta en el mismo browser oculte la guía aquí. */
function onboardingGuideStorageKey(coachId: string) {
    return `eva:coach-onboarding:v1:${coachId}`
}

/** Evita doble confetti (p. ej. Strict Mode dev) en la misma sesión de navegador. */
function confetti100SessionKey(coachId: string) {
    return `eva:coach-onboarding-100-confetti-fired:${coachId}`
}

function readPersistedState(coachId: string): PersistedState {
    try {
        const raw = localStorage.getItem(onboardingGuideStorageKey(coachId))
        if (!raw) return { completed: {} }
        return JSON.parse(raw) as PersistedState
    } catch {
        return { completed: {} }
    }
}

function writePersistedState(coachId: string, state: PersistedState) {
    localStorage.setItem(onboardingGuideStorageKey(coachId), JSON.stringify(state))
}

function normalizeGuideFromJson(raw: Json | undefined | null): PersistedState {
    if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
        return { completed: {} }
    }
    const o = raw as Record<string, unknown>
    const completed: Partial<Record<StepKey, boolean>> = {}
    const cr = o.completed
    if (cr && typeof cr === 'object' && !Array.isArray(cr)) {
        const keys: StepKey[] = ['profile_branding', 'first_client', 'first_plan', 'first_checkin']
        for (const k of keys) {
            const v = (cr as Record<string, unknown>)[k]
            if (typeof v === 'boolean') {
                completed[k] = v
            }
        }
    }
    return {
        completed,
        dismissed: o.dismissed === true,
        ahaMomentSent: o.ahaMomentSent === true,
    }
}

function persistedStateHasActivity(p: PersistedState): boolean {
    if (p.dismissed) return true
    if (p.ahaMomentSent) return true
    return Object.keys(p.completed).length > 0
}

async function emitOnboardingEvent(
    stepKey: StepKey,
    eventType: 'step_completed' | 'step_reopened' | 'aha_moment',
    metadata?: Record<string, string | number | boolean>
) {
    await fetch('/api/coach/onboarding-events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stepKey, eventType, metadata }),
    })
}

export function CoachOnboardingChecklist({
    coachId,
    coachSlug,
    absoluteStudentAppUrl,
    initialOnboardingGuide,
    totalClients,
    activePlans,
    hasStudentSignal30d,
    subscriptionTier,
    hasCoachLogo,
}: {
    coachId: string
    coachSlug: string
    absoluteStudentAppUrl: string
    initialOnboardingGuide: Json
    totalClients: number
    activePlans: number
    hasStudentSignal30d: boolean
    subscriptionTier: SubscriptionTier
    hasCoachLogo: boolean
}) {
    const [ready, setReady] = useState(false)
    const [dismissed, setDismissed] = useState(false)
    const [manualCompleted, setManualCompleted] = useState<Partial<Record<StepKey, boolean>>>({})
    const [brandTourSeen, setBrandTourSeen] = useState(false)
    const isFree = subscriptionTier === 'free'
    const previousStateRef = useRef<Partial<Record<StepKey, boolean>>>({})
    const ahaRef = useRef(false)
    const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    /** Evita re-hidratar el checklist en cada re-render del padre con el mismo JSON por referencia distinta. */
    const initialOnboardingGuideKey = useMemo(
        () => JSON.stringify(initialOnboardingGuide ?? null),
        [initialOnboardingGuide]
    )

    useEffect(() => {
        const fromServer = normalizeGuideFromJson(initialOnboardingGuide)
        const ls = readPersistedState(coachId)

        if (persistedStateHasActivity(fromServer)) {
            const mergedDismissed = fromServer.dismissed === true || ls.dismissed === true
            const merged: PersistedState = {
                completed: fromServer.completed ?? {},
                dismissed: mergedDismissed,
                ahaMomentSent: fromServer.ahaMomentSent === true,
            }
            setManualCompleted(merged.completed ?? {})
            setDismissed(mergedDismissed)
            ahaRef.current = Boolean(merged.ahaMomentSent)
            writePersistedState(coachId, merged)
            setReady(true)
            return
        }

        setManualCompleted(ls.completed ?? {})
        setDismissed(Boolean(ls.dismissed))
        ahaRef.current = Boolean(ls.ahaMomentSent)
        setReady(true)

        const lsSnapshot: PersistedState = {
            completed: ls.completed ?? {},
            dismissed: Boolean(ls.dismissed),
            ahaMomentSent: Boolean(ls.ahaMomentSent),
        }
        if (persistedStateHasActivity(lsSnapshot)) {
            void persistOnboardingGuideAction(lsSnapshot).then((r) => {
                if (!r.ok) {
                    toast.error('No se pudo guardar la guía en tu cuenta', { description: r.error })
                }
            })
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- initialOnboardingGuideKey serializa la guía (evita `{}` nuevo cada render)
    }, [coachId, initialOnboardingGuideKey])

    const schedulePersistToServer = useCallback((snapshot: PersistedState) => {
        writePersistedState(coachId, snapshot)
        if (persistTimerRef.current) {
            clearTimeout(persistTimerRef.current)
        }
        persistTimerRef.current = setTimeout(() => {
            persistTimerRef.current = null
            void persistOnboardingGuideAction({
                dismissed: snapshot.dismissed,
                completed: snapshot.completed,
                ahaMomentSent: snapshot.ahaMomentSent,
            }).then((r) => {
                if (!r.ok) {
                    toast.error('No se pudo sincronizar la guía', { description: r.error })
                }
            })
        }, 450)
    }, [coachId])

    useEffect(() => {
        return () => {
            if (persistTimerRef.current) {
                clearTimeout(persistTimerRef.current)
            }
        }
    }, [])

    useEffect(() => {
        const tourKey = brandTourSeenStorageKey(coachId)
        const readTourSeen = () => {
            try {
                setBrandTourSeen(localStorage.getItem(tourKey) === 'true')
            } catch {
                setBrandTourSeen(false)
            }
        }
        readTourSeen()
        const onStorage = (e: StorageEvent) => {
            if (e.key === tourKey && e.newValue === 'true') {
                readTourSeen()
            }
        }
        const onTourSeenSameTab = () => {
            readTourSeen()
        }
        window.addEventListener('storage', onStorage)
        window.addEventListener(BRAND_TOUR_SEEN_CHANGED_EVENT, onTourSeenSameTab)
        return () => {
            window.removeEventListener('storage', onStorage)
            window.removeEventListener(BRAND_TOUR_SEEN_CHANGED_EVENT, onTourSeenSameTab)
        }
    }, [coachId])

    const autoCompleted = useMemo(
        () => ({
            profile_branding: hasCoachLogo || brandTourSeen,
            first_client: totalClients > 0,
            first_plan: activePlans > 0,
            first_checkin: hasStudentSignal30d,
        }),
        [activePlans, brandTourSeen, hasCoachLogo, hasStudentSignal30d, totalClients]
    )

    const completed: Record<StepKey, boolean> = useMemo(
        () => ({
            /** `false` explícito = “Desmarcar” aunque haya logo/tour (auto). */
            profile_branding:
                manualCompleted.profile_branding === false
                    ? false
                    : autoCompleted.profile_branding || manualCompleted.profile_branding === true,
            first_client: autoCompleted.first_client || Boolean(manualCompleted.first_client),
            first_plan: autoCompleted.first_plan || Boolean(manualCompleted.first_plan),
            first_checkin: autoCompleted.first_checkin || Boolean(manualCompleted.first_checkin),
        }),
        [autoCompleted, manualCompleted]
    )

    const completedCount = (Object.values(completed).filter(Boolean) || []).length
    const progressPct = Math.round((completedCount / 4) * 100)
    const allDone = completedCount === 4

    useEffect(() => {
        if (!ready) return

        const previous = previousStateRef.current
        const entries = Object.entries(completed) as Array<[StepKey, boolean]>
        for (const [key, nowDone] of entries) {
            const beforeDone = Boolean(previous[key])
            if (!beforeDone && nowDone) {
                void emitOnboardingEvent(key, 'step_completed', { progressPct })
            } else if (beforeDone && !nowDone) {
                void emitOnboardingEvent(key, 'step_reopened', { progressPct })
            }
        }

        if (allDone && !ahaRef.current) {
            if (typeof window !== 'undefined') {
                const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
                if (
                    !prefersReduced &&
                    !sessionStorage.getItem(confetti100SessionKey(coachId))
                ) {
                    sessionStorage.setItem(confetti100SessionKey(coachId), '1')
                    confetti({
                        particleCount: 130,
                        spread: 72,
                        origin: { y: 0.4 },
                        colors: ['#10B981', '#007AFF', '#22c55e', '#38bdf8', '#34d399'],
                    })
                }
            }
            void emitOnboardingEvent('first_checkin', 'aha_moment', { progressPct: 100 })
            ahaRef.current = true
        }

        previousStateRef.current = completed
        schedulePersistToServer({
            completed: manualCompleted,
            ahaMomentSent: ahaRef.current,
            dismissed,
        })
    }, [allDone, coachId, completed, dismissed, manualCompleted, progressPct, ready, schedulePersistToServer])

    function toggleProfileStep() {
        setManualCompleted((prev) => {
            const autoBranding = hasCoachLogo || brandTourSeen
            const currentlyDone =
                prev.profile_branding === false
                    ? false
                    : autoBranding || prev.profile_branding === true
            if (currentlyDone) {
                return { ...prev, profile_branding: false }
            }
            return { ...prev, profile_branding: true }
        })
    }

    function dismiss() {
        void postGuideEngagement('profile_branding', {
            widget: 'onboarding_checklist',
            action: 'dismiss_confirm',
            progress_pct: progressPct,
            all_done: allDone,
        })
        setDismissed(true)
        toast('Guía ocultada. Podés retomarla desde el dashboard.', { duration: 3000 })
    }

    function resumeGuide() {
        setDismissed(false)
    }

    if (!ready) {
        return (
            <div
                className="min-h-[120px] rounded-2xl border border-dashed border-border/40 bg-muted/10 animate-pulse"
                aria-hidden
            />
        )
    }

    if (dismissed && allDone) {
        return null
    }

    if (dismissed && !allDone) {
        return (
            <div className="rounded-2xl border border-[color:var(--theme-primary)]/25 bg-[color:var(--theme-primary)]/5 px-4 py-3 sm:px-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm font-medium text-foreground">
                        Seguís con pasos pendientes en tu guía de inicio.
                    </p>
                    <Button
                        type="button"
                        variant="default"
                        className="h-11 min-h-11 shrink-0 touch-manipulation sm:w-auto w-full"
                        onClick={resumeGuide}
                    >
                        Continuar guía
                    </Button>
                </div>
            </div>
        )
    }

    const studentAppPath = `/c/${encodeURIComponent(coachSlug)}`

    return (
        <>
        <GlassCard className="overflow-hidden border-border bg-white/90 p-5 dark:bg-zinc-950 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                        Tu ruta en EVA
                    </p>
                    <h3 className="text-lg font-black tracking-tight text-foreground sm:text-xl">
                        Pon tu estudio en marcha
                    </h3>
                    <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
                        Cuatro pasos para cerrar el circuito: tu marca → un alumno → un plan asignado → señal de que tu
                        alumno ya usa la app.
                    </p>
                </div>
                <div className="flex shrink-0 items-start justify-between gap-3 sm:flex-col sm:items-end sm:text-right">
                    <div>
                        <p className="text-2xl font-black text-[color:var(--theme-primary)]">{progressPct}%</p>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                            Completado
                        </p>
                    </div>
                    <motion.button
                        type="button"
                        onClick={dismiss}
                        aria-label="Saltar guía de inicio"
                        animate={{ scale: [1, 1.04, 1] }}
                        transition={{ duration: 1.8, repeat: Infinity, repeatDelay: 3, ease: 'easeInOut' }}
                        whileHover={{ scale: 1.07 }}
                        whileTap={{ scale: 0.95 }}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-muted/60 px-3 py-2 text-xs font-semibold text-foreground shadow-sm backdrop-blur-sm transition-colors hover:border-primary/40 hover:bg-muted hover:text-primary min-h-11 touch-manipulation"
                    >
                        <X className="h-3.5 w-3.5 shrink-0" />
                        <span>Saltar guía</span>
                    </motion.button>
                </div>
            </div>

            {isFree && (
                <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-3.5 text-sm">
                    <p className="font-semibold text-foreground mb-2">Plan Free — lo que tenés incluido:</p>
                    <div className="grid grid-cols-1 gap-1 sm:grid-cols-2 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-500" />3 alumnos activos</div>
                        <div className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-500" />Entrenos ilimitados</div>
                        <div className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-500" />App para tus alumnos</div>
                        <div className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-500" />Check-ins</div>
                        <div className="flex items-center gap-1.5 text-muted-foreground/60"><span className="w-3.5 h-3.5 shrink-0 text-center leading-none">✗</span>Marca personalizada (Starter+)</div>
                        <div className="flex items-center gap-1.5 text-muted-foreground/60"><span className="w-3.5 h-3.5 shrink-0 text-center leading-none">✗</span>Nutrición (Pro+)</div>
                    </div>
                    <Link href="/coach/subscription" className="mt-2 text-xs text-primary hover:opacity-80 font-medium inline-block">Ver planes →</Link>
                </div>
            )}

            {!allDone ? (
                <>
                    <OnboardingThreeSlot />
                    <OnboardingCompactLoopStrip />
                </>
            ) : null}

            {/* V3 gemelo: tabs en móvil, grid desde md (plan §5.2) */}
            <div className="mt-5 md:hidden">
                <Tabs defaultValue="coach" className="flex w-full flex-col gap-3">
                    <TabsList className="grid h-auto w-full min-w-0 grid-cols-2 gap-1 p-1" variant="default">
                        <TabsTrigger
                            value="coach"
                            className="min-h-11 gap-2 px-2 py-2 text-xs font-semibold sm:text-sm"
                        >
                            <Monitor className="h-4 w-4 shrink-0 text-[color:var(--theme-primary)]" aria-hidden />
                            Tu panel
                        </TabsTrigger>
                        <TabsTrigger
                            value="student"
                            className="min-h-11 gap-2 px-2 py-2 text-xs font-semibold sm:text-sm"
                        >
                            <Smartphone className="h-4 w-4 shrink-0 text-[color:var(--theme-primary)]" aria-hidden />
                            Tu alumno
                        </TabsTrigger>
                    </TabsList>
                    <TabsContent value="coach" className="focus-visible:outline-none">
                        <OnboardingGemelliCoachCard />
                    </TabsContent>
                    <TabsContent value="student" className="focus-visible:outline-none">
                        <OnboardingGemelliStudentCard studentAppPath={studentAppPath} />
                    </TabsContent>
                </Tabs>
            </div>
            <div className="mt-5 hidden gap-4 md:grid md:grid-cols-2">
                <OnboardingGemelliCoachCard />
                <OnboardingGemelliStudentCard studentAppPath={studentAppPath} />
            </div>

            <ShareAppBlock absoluteUrl={absoluteStudentAppUrl} />

            <div className="mt-5 h-2 overflow-hidden rounded-full bg-muted">
                <div
                    className="h-full bg-[color:var(--theme-primary)] transition-all duration-300"
                    style={{ width: `${progressPct}%` }}
                    role="progressbar"
                    aria-valuenow={progressPct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label="Progreso de la guía de inicio"
                />
            </div>

            {!allDone ? <OnboardingStepsVignetteCarousel completed={completed} /> : null}

            <OnboardingStepsJumpNav />

            <div className="mt-5 space-y-3">
                <OnboardingStepBlock
                    anchorId="coach-onboarding-step-1"
                    title="1. Tu marca en la app del alumno"
                    description={
                        isFree
                            ? 'Disponible desde Starter. Podés marcarlo como visto o hacer upgrade para personalizar logo, color y mensajes.'
                            : 'Logo, color y mensajes: lo que ves en Mi Marca es lo que ellos ven al instalar tu espacio.'
                    }
                    done={completed.profile_branding}
                    actions={
                        isFree ? (
                            <>
                                <Link
                                    href="/coach/subscription"
                                    className={cn(
                                        buttonVariants({ variant: 'default' }),
                                        'h-11 min-h-11 touch-manipulation inline-flex items-center justify-center px-4 text-center'
                                    )}
                                >
                                    Desbloquear con Starter ↑
                                </Link>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    className="h-11 min-h-11 touch-manipulation text-muted-foreground"
                                    onClick={(e) => {
                                        e.preventDefault()
                                        e.stopPropagation()
                                        toggleProfileStep()
                                    }}
                                >
                                    {completed.profile_branding ? 'Desmarcar paso' : 'Marcar como visto'}
                                </Button>
                            </>
                        ) : (
                            <>
                                <Link
                                    href="/coach/settings?tour=1"
                                    className={cn(
                                        buttonVariants({ variant: 'default' }),
                                        'h-11 min-h-11 touch-manipulation inline-flex items-center justify-center px-4 text-center'
                                    )}
                                >
                                    Ir a Mi Marca y guía
                                </Link>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    className="h-11 min-h-11 touch-manipulation text-muted-foreground"
                                    onClick={(e) => {
                                        e.preventDefault()
                                        e.stopPropagation()
                                        toggleProfileStep()
                                    }}
                                >
                                    {completed.profile_branding ? 'Desmarcar paso' : 'Ya lo dejé listo'}
                                </Button>
                            </>
                        )
                    }
                />

                <OnboardingStepBlock
                    anchorId="coach-onboarding-step-2"
                    title="2. Primer alumno"
                    description="Creá o importá al menos un perfil para poder asignarle un plan."
                    done={completed.first_client}
                    actions={
                        <Link
                            href="/coach/clients"
                            className={cn(
                                buttonVariants({ variant: 'secondary' }),
                                'h-11 min-h-11 touch-manipulation inline-flex items-center justify-center px-4'
                            )}
                        >
                            Ir a alumnos
                        </Link>
                    }
                />

                <OnboardingStepBlock
                    anchorId="coach-onboarding-step-3"
                    title="3. Primer plan asignado"
                    description="Desde programas o el constructor: activá un plan para ese alumno."
                    done={completed.first_plan}
                    actions={
                        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                            <Link
                                href="/coach/workout-programs"
                                className={cn(
                                    buttonVariants({ variant: 'secondary' }),
                                    'h-11 min-h-11 touch-manipulation inline-flex items-center justify-center px-4'
                                )}
                            >
                                Ver programas
                            </Link>
                            <Link
                                href="/coach/workout-programs/builder"
                                className={cn(
                                    buttonVariants({ variant: 'outline' }),
                                    'h-11 min-h-11 touch-manipulation inline-flex items-center justify-center px-4'
                                )}
                            >
                                Abrir constructor
                            </Link>
                        </div>
                    }
                />

                <OnboardingStepBlock
                    anchorId="coach-onboarding-step-4"
                    title="4. Tu alumno ya usó la app"
                    description="Se marca listo si en los últimos 30 días hay al menos un check-in o un registro de entreno de tus alumnos (misma ventana que el dashboard)."
                    done={completed.first_checkin}
                    actions={
                        <Link
                            href="/coach/clients"
                            className={cn(
                                buttonVariants({ variant: 'outline' }),
                                'h-11 min-h-11 touch-manipulation inline-flex items-center justify-center px-4'
                            )}
                        >
                            Ver alumnos
                        </Link>
                    }
                />
            </div>

            <NutritionTierBlock subscriptionTier={subscriptionTier} />

            {allDone ? (
                <div className="mt-5 flex gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
                    <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden />
                    <div>
                        <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                            Activación lista
                        </p>
                        <p className="text-xs leading-relaxed text-muted-foreground">
                            Completaste el circuito mínimo: marca, alumno, plan y señal de uso en los últimos 30 días.
                            El enlace y el QR de arriba siguen disponibles para invitar a más gente.
                        </p>
                    </div>
                </div>
            ) : null}
        </GlassCard>

        </>
    )
}

function OnboardingGemelliCoachCard() {
    return (
        <div className="rounded-2xl border border-border/80 bg-muted/20 p-4">
            <div className="mb-2 flex items-center gap-2 text-foreground">
                <Monitor className="h-4 w-4 shrink-0 text-[color:var(--theme-primary)]" aria-hidden />
                <span className="text-xs font-bold uppercase tracking-wide">Tu panel</span>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">
                Acá sumás alumnos, armás o duplicás programas y asignás planes. Todo lo que configurás acá es lo que
                vos controlás como coach.
            </p>
        </div>
    )
}

function OnboardingGemelliStudentCard({ studentAppPath }: { studentAppPath: string }) {
    return (
        <div className="rounded-2xl border border-border/80 bg-gradient-to-br from-[color:var(--theme-primary)]/12 to-transparent p-4">
            <div className="mb-2 flex items-center gap-2 text-foreground">
                <Smartphone className="h-4 w-4 shrink-0 text-[color:var(--theme-primary)]" aria-hidden />
                <span className="text-xs font-bold uppercase tracking-wide">Tu alumno</span>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">
                Tus alumnos entran a tu espacio con tu marca, ven su plan y registran entrenos o check-ins.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
                <Link
                    href="/coach/settings/preview"
                    className={cn(
                        buttonVariants({ variant: 'secondary', size: 'sm' }),
                        'h-10 min-h-10 touch-manipulation inline-flex items-center justify-center px-3'
                    )}
                >
                    Vista previa alumno
                </Link>
                <Link
                    href={studentAppPath}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(
                        buttonVariants({ variant: 'outline', size: 'sm' }),
                        'h-10 min-h-10 touch-manipulation inline-flex items-center justify-center gap-1.5 px-3'
                    )}
                >
                    Abrir app alumno
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                </Link>
            </div>
        </div>
    )
}

function NutritionTierBlock({ subscriptionTier }: { subscriptionTier: SubscriptionTier }) {
    const { canUseNutrition } = getTierCapabilities(subscriptionTier)
    const isFree = subscriptionTier === 'free'

    if (!canUseNutrition) {
        return (
            <div className="mt-5 rounded-2xl border border-border/70 bg-muted/20 p-4 sm:p-5">
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Nutrición</p>
                <h4 className="mt-1 text-sm font-black tracking-tight text-foreground sm:text-base">
                    Planes de nutrición en Pro o superior
                </h4>
                <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground sm:text-sm">
                    {isFree
                        ? 'Tu plan Free incluye entrenos y check-ins. La nutrición está disponible desde Pro: plantillas, catálogo de alimentos y asignación de planes nutricionales.'
                        : 'Tu plan Starter incluye entrenos y marca. Cuando subas de plan, desbloqueás plantillas, catálogo de alimentos y asignación de planes nutricionales a tus alumnos.'
                    }
                </p>
                <Link
                    href="/coach/subscription"
                    className={cn(
                        buttonVariants({ variant: 'secondary' }),
                        'mt-3 inline-flex h-11 min-h-11 items-center justify-center px-4 touch-manipulation'
                    )}
                >
                    Ver planes y upgrade
                </Link>
            </div>
        )
    }

    return (
        <div className="mt-5 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 sm:p-5 dark:border-emerald-500/25 dark:bg-emerald-500/10">
            <p className="text-xs font-bold uppercase tracking-widest text-emerald-700 dark:text-emerald-400/90">
                Nutrición (opcional)
            </p>
            <h4 className="mt-1 text-sm font-black tracking-tight text-foreground sm:text-base">
                Cuando quieras, seguí esta ruta
            </h4>
            <p className="mt-1 max-w-2xl text-xs text-muted-foreground sm:text-sm">
                Ya tenés nutrición en tu plan. Estos tres pasos son independientes del circuito principal de arriba.
            </p>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                {COACH_NUTRITION_ONBOARDING_STEPS.map((step) => {
                    const Icon = step.icon
                    const href = step.href ?? '/coach/nutrition-plans'
                    return (
                        <div
                            key={step.number}
                            className="flex flex-col rounded-xl border border-border/60 bg-card/50 p-3"
                        >
                            <div className="flex items-center gap-2">
                                <span
                                    className={cn(
                                        'inline-flex h-8 w-8 items-center justify-center rounded-lg',
                                        step.iconBg
                                    )}
                                >
                                    <Icon className={cn('h-4 w-4', step.iconColor)} aria-hidden />
                                </span>
                                <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                                    Paso {step.number}
                                </span>
                            </div>
                            <p className="mt-2 text-sm font-bold text-foreground">{step.title}</p>
                            <p className="mt-1 flex-1 text-xs leading-relaxed text-muted-foreground">{step.description}</p>
                            <Link
                                href={href}
                                className={cn(
                                    buttonVariants({ variant: 'outline', size: 'sm' }),
                                    'mt-3 h-9 min-h-9 touch-manipulation inline-flex items-center justify-center px-2 text-center'
                                )}
                            >
                                {step.cta}
                            </Link>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

function ShareAppBlock({ absoluteUrl }: { absoluteUrl: string }) {
    async function copyLink() {
        try {
            await navigator.clipboard.writeText(absoluteUrl)
            toast.success('Enlace copiado al portapapeles')
        } catch {
            toast.error('No se pudo copiar. Copiá el enlace manualmente.')
        }
    }

    return (
        <div className="mt-5 rounded-2xl border border-dashed border-border/90 bg-muted/15 p-4 sm:p-5">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Compartir app</p>
            <h4 className="mt-1 text-sm font-black tracking-tight text-foreground sm:text-base">
                Enviá tu enlace o mostrá el QR
            </h4>
            <p className="mt-1 max-w-xl text-xs leading-relaxed text-muted-foreground sm:text-sm">
                Tus alumnos entran a tu espacio con tu marca. Copiá el enlace para WhatsApp o usá el QR en el gym; en Mi
                Marca tenés opciones extra (tamaños y descarga).
            </p>
            <p className="mt-3 break-all rounded-lg border border-border/60 bg-background/80 px-3 py-2 font-mono text-[11px] leading-relaxed text-foreground/90 sm:text-xs">
                {absoluteUrl}
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                <Button
                    type="button"
                    variant="default"
                    className="h-11 min-h-11 touch-manipulation gap-2"
                    onClick={() => void copyLink()}
                >
                    <Copy className="h-4 w-4 shrink-0" aria-hidden />
                    Copiar enlace
                </Button>
                <Link
                    href="/coach/settings"
                    className={cn(
                        buttonVariants({ variant: 'outline' }),
                        'h-11 min-h-11 touch-manipulation inline-flex items-center justify-center gap-2 px-4'
                    )}
                >
                    Mi Marca (link y QR)
                </Link>
            </div>
            <div className="mt-4 flex justify-center">
                <div
                    className="rounded-xl bg-white p-3 shadow-sm dark:bg-zinc-100"
                    aria-label="Código QR del enlace de tu app"
                >
                    <QRCodeSVG value={absoluteUrl} size={120} level="M" />
                </div>
            </div>
        </div>
    )
}

function OnboardingStepBlock({
    anchorId,
    title,
    description,
    done,
    actions,
}: {
    anchorId?: string
    title: string
    description: string
    done: boolean
    actions: ReactNode
}) {
    return (
        <div
            id={anchorId}
            className={cn(
                'rounded-xl border border-border/70 bg-card/40 p-4',
                anchorId && 'scroll-mt-24 md:scroll-mt-28'
            )}
        >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                        {done ? (
                            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" aria-hidden />
                        ) : (
                            <Circle className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                        )}
                        <h4 className="text-sm font-bold text-foreground">{title}</h4>
                    </div>
                    <p className="pl-6 text-xs leading-relaxed text-muted-foreground sm:text-sm">{description}</p>
                </div>
            </div>
            <div className="mt-3 flex flex-col gap-2 pl-0 sm:mt-4 sm:flex-row sm:flex-wrap sm:items-center sm:pl-6">
                {actions}
            </div>
        </div>
    )
}
