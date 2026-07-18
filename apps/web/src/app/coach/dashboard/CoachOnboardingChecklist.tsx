'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, PartyPopper, Rocket, Sparkles, X } from 'lucide-react'
import { toast } from 'sonner'
import confetti from 'canvas-confetti'
import { cn } from '@/lib/utils'
import type { Json } from '@/lib/database.types'
import { getTierCapabilities, type SubscriptionTier } from '@/lib/constants'
import { brandTourSeenStorageKey, BRAND_TOUR_SEEN_CHANGED_EVENT } from '@/lib/coach-brand-tour'
import { persistOnboardingGuideAction } from './_actions/onboarding-guide.actions'
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
    initialOnboardingGuide,
    totalClients,
    activePlans,
    hasStudentSignal30d,
    subscriptionTier,
    hasCoachLogo,
}: {
    coachId: string
    coachSlug: string
    coachInviteCode?: string | null
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
    const [guideOpenOverride, setGuideOpenOverride] = useState<boolean | null>(null)
    const isFree = subscriptionTier === 'free'
    const { canUseNutrition } = getTierCapabilities(subscriptionTier)
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
        toast('Guía ocultada. Puedes retomarla desde el dashboard.', { duration: 3000 })
    }

    function resumeGuide() {
        setDismissed(false)
    }

    if (!ready) {
        return (
            <div
                className="h-[42px] animate-pulse rounded-control border border-subtle bg-surface-sunken"
                aria-hidden
            />
        )
    }

    if (dismissed && allDone) {
        return null
    }

    if (dismissed && !allDone) {
        return (
            <div className="flex items-center gap-[11px] rounded-control border border-[var(--sport-200)] bg-[var(--sport-100)] px-[13px] py-1">
                <span className="flex shrink-0 text-[var(--sport-600)]">
                    <Rocket className="size-4" />
                </span>
                <span className="flex-1 text-[13px] font-bold text-[var(--sport-700)]">
                    Sigues con pasos pendientes en tu guía de inicio.
                </span>
                <button
                    type="button"
                    onClick={resumeGuide}
                    className="min-h-11 shrink-0 touch-manipulation px-1 text-[12.5px] font-extrabold text-[var(--sport-700)]"
                >
                    Continuar guía
                </button>
            </div>
        )
    }

    if (allDone) {
        return (
            <div className="flex items-center gap-[11px] rounded-card border border-[var(--success-500)]/30 bg-[var(--success-100)] p-4">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--success-500)] text-white">
                    <PartyPopper className="size-[18px]" />
                </span>
                <div className="flex-1">
                    <div className="text-[14.5px] font-extrabold text-[var(--success-700)]">
                        ¡Activación lista!
                    </div>
                    <div className="text-[12.5px] text-[var(--success-700)] opacity-85">
                        Tu cuenta está configurada. A entrenar.
                    </div>
                </div>
                <button
                    type="button"
                    onClick={dismiss}
                    aria-label="Cerrar"
                    className="flex size-11 shrink-0 touch-manipulation items-center justify-center text-[var(--success-700)]"
                >
                    <X className="size-[18px]" />
                </button>
            </div>
        )
    }

    const guideOpen = guideOpenOverride ?? completedCount === 0

    const steps: Array<{ key: StepKey; label: string; href: string }> = [
        {
            key: 'profile_branding',
            label: 'Personaliza tu marca',
            href: isFree ? '/coach/subscription' : '/coach/settings?tour=1',
        },
        { key: 'first_client', label: 'Suma tu primer alumno', href: '/coach/clients' },
        { key: 'first_plan', label: 'Crea tu primer plan', href: '/coach/workout-programs' },
        { key: 'first_checkin', label: 'Recibe el primer check-in', href: '/coach/clients' },
    ]

    return (
        <div>
            <button
                type="button"
                onClick={() => setGuideOpenOverride(!guideOpen)}
                aria-expanded={guideOpen}
                className={cn(
                    'flex w-full items-center gap-[11px] border border-[var(--sport-200)] bg-[var(--sport-100)] px-[13px] py-[11px] text-left',
                    guideOpen ? 'rounded-t-control border-b-0' : 'rounded-control'
                )}
            >
                <span className="flex shrink-0 text-[var(--sport-600)]">
                    <Rocket className="size-4" />
                </span>
                <span className="flex-1 text-[13px] font-bold text-[var(--sport-700)]">
                    Guía de inicio
                </span>
                <span className="flex gap-1">
                    {steps.map((s) => (
                        <span
                            key={s.key}
                            className="size-[7px] rounded-full"
                            style={{
                                background: completed[s.key]
                                    ? 'var(--sport-500)'
                                    : 'var(--sport-300)',
                                opacity: completed[s.key] ? 1 : 0.5,
                            }}
                        />
                    ))}
                </span>
                <span className="min-w-[26px] text-right text-[12.5px] font-extrabold text-[var(--sport-700)]">
                    {completedCount}/4
                </span>
                <span
                    className={cn(
                        'flex shrink-0 text-[var(--sport-600)] transition-transform duration-200',
                        guideOpen && 'rotate-180'
                    )}
                >
                    <ChevronDown className="size-4" />
                </span>
            </button>
            {guideOpen && (
                <div className="rounded-b-control border border-t-0 border-[var(--sport-200)] bg-[var(--sport-100)] px-[13px] pb-[13px] pt-1">
                    <div className="flex flex-col gap-[7px]">
                        {steps.map((s) => {
                            const done = completed[s.key]
                            return (
                                <div key={s.key} className="flex items-center gap-[9px]">
                                    <span
                                        className={cn(
                                            'flex size-5 shrink-0 items-center justify-center rounded-full text-white',
                                            done
                                                ? 'bg-[var(--sport-500)]'
                                                : 'border-2 border-[var(--sport-300)]'
                                        )}
                                    >
                                        {done && <Check className="size-3" />}
                                    </span>
                                    <Link
                                        href={s.href}
                                        className={cn(
                                            'flex-1 py-0.5 text-[13.5px] font-semibold',
                                            done
                                                ? 'text-[var(--sport-600)] line-through opacity-70'
                                                : 'text-[var(--sport-700)]'
                                        )}
                                    >
                                        {s.label}
                                    </Link>
                                    {s.key === 'profile_branding' && (
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.preventDefault()
                                                e.stopPropagation()
                                                toggleProfileStep()
                                            }}
                                            className="-my-2 min-h-11 shrink-0 touch-manipulation px-1 text-[12px] font-extrabold text-[var(--sport-700)]"
                                        >
                                            {done ? 'Desmarcar' : 'Marcar visto'}
                                        </button>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                    {!canUseNutrition && (
                        <div className="mt-3 flex items-center gap-[9px] border-t border-[var(--sport-200)] pt-3">
                            <span className="flex shrink-0 text-[var(--sport-600)]">
                                <Sparkles className="size-[15px]" />
                            </span>
                            <span className="flex-1 text-xs leading-[1.35] text-[var(--sport-700)]">
                                Suma planes de nutrición con <b>Pro</b>.
                            </span>
                            <Link
                                href="/coach/subscription"
                                className="-my-2 inline-flex min-h-11 shrink-0 touch-manipulation items-center px-1 text-xs font-extrabold text-[var(--sport-700)]"
                            >
                                Mejorar
                            </Link>
                        </div>
                    )}
                    <button
                        type="button"
                        onClick={dismiss}
                        className="mt-1 min-h-11 touch-manipulation pr-2 text-left text-xs font-bold text-[var(--sport-600)]"
                    >
                        Saltar guía
                    </button>
                </div>
            )}
        </div>
    )
}
