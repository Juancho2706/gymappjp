'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, Circle, Sparkles, X } from 'lucide-react'
import { GlassCard } from '@/components/ui/glass-card'

type StepKey = 'profile_branding' | 'first_client' | 'first_plan' | 'first_checkin'

type PersistedState = {
    completed: Partial<Record<StepKey, boolean>>
    ahaMomentSent?: boolean
    dismissed?: boolean
}

const STORAGE_KEY = 'eva:coach-onboarding:v1'

function readPersistedState(): PersistedState {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) return { completed: {} }
        return JSON.parse(raw) as PersistedState
    } catch {
        return { completed: {} }
    }
}

function writePersistedState(state: PersistedState) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
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
    totalClients,
    activePlans,
    hasRecentCheckin,
}: {
    totalClients: number
    activePlans: number
    hasRecentCheckin: boolean
}) {
    const [ready, setReady] = useState(false)
    const [dismissed, setDismissed] = useState(false)
    const [manualCompleted, setManualCompleted] = useState<Partial<Record<StepKey, boolean>>>({})
    const previousStateRef = useRef<Partial<Record<StepKey, boolean>>>({})
    const ahaRef = useRef(false)

    useEffect(() => {
        const persisted = readPersistedState()
        setManualCompleted(persisted.completed ?? {})
        ahaRef.current = Boolean(persisted.ahaMomentSent)
        setDismissed(Boolean(persisted.dismissed))
        setReady(true)
    }, [])

    const autoCompleted = useMemo(
        () => ({
            profile_branding: false,
            first_client: totalClients > 0,
            first_plan: activePlans > 0,
            first_checkin: hasRecentCheckin,
        }),
        [activePlans, hasRecentCheckin, totalClients]
    )

    const completed: Record<StepKey, boolean> = useMemo(
        () => ({
            profile_branding: Boolean(manualCompleted.profile_branding),
            first_client: autoCompleted.first_client || Boolean(manualCompleted.first_client),
            first_plan: autoCompleted.first_plan || Boolean(manualCompleted.first_plan),
            first_checkin: autoCompleted.first_checkin || Boolean(manualCompleted.first_checkin),
        }),
        [autoCompleted.first_checkin, autoCompleted.first_client, autoCompleted.first_plan, manualCompleted]
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
            void emitOnboardingEvent('first_checkin', 'aha_moment', { progressPct: 100 })
            ahaRef.current = true
        }

        previousStateRef.current = completed
        writePersistedState({ completed: manualCompleted, ahaMomentSent: ahaRef.current, dismissed })
    }, [allDone, completed, dismissed, manualCompleted, progressPct, ready])

    function toggleProfileStep() {
        setManualCompleted((prev) => ({
            ...prev,
            profile_branding: !prev.profile_branding,
        }))
    }

    function dismiss() {
        setDismissed(true)
        writePersistedState({ completed: manualCompleted, ahaMomentSent: ahaRef.current, dismissed: true })
    }

    if (!ready || dismissed) return null

    return (
        <GlassCard className="p-5 border-border bg-white/90 dark:bg-zinc-950">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Onboarding coach</p>
                    <h3 className="text-lg font-black tracking-tight text-foreground mt-1">Activa tu beta en 4 pasos</h3>
                </div>
                <div className="flex items-start gap-3">
                    <div className="text-right">
                        <p className="text-2xl font-black text-[color:var(--theme-primary)]">{progressPct}%</p>
                        <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Completado</p>
                    </div>
                    <button
                        type="button"
                        onClick={dismiss}
                        className="mt-1 rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                        aria-label="Cerrar onboarding"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>

            <div className="h-2 rounded-full bg-muted mt-4 overflow-hidden">
                <div
                    className="h-full bg-[color:var(--theme-primary)] transition-all duration-300"
                    style={{ width: `${progressPct}%` }}
                />
            </div>

            <div className="space-y-2 mt-4">
                <button
                    type="button"
                    onClick={toggleProfileStep}
                    className="w-full flex items-center justify-between rounded-lg border border-border px-3 py-2 text-left hover:bg-muted/40 transition-colors"
                >
                    <span className="text-sm text-foreground">Completar branding inicial</span>
                    {completed.profile_branding ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    ) : (
                        <Circle className="w-4 h-4 text-muted-foreground" />
                    )}
                </button>

                <StatusRow label="Registrar primer alumno" done={completed.first_client} />
                <StatusRow label="Asignar primer plan" done={completed.first_plan} />
                <StatusRow label="Recibir primer check-in" done={completed.first_checkin} />
            </div>

            {allDone ? (
                <div className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 flex items-start gap-2">
                    <Sparkles className="w-4 h-4 text-emerald-500 mt-0.5" />
                    <div>
                        <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">Aha moment alcanzado</p>
                        <p className="text-xs text-muted-foreground">Ya completaste el flujo minimo de activacion beta.</p>
                    </div>
                </div>
            ) : null}
        </GlassCard>
    )
}

function StatusRow({ label, done }: { label: string; done: boolean }) {
    return (
        <div className="w-full flex items-center justify-between rounded-lg border border-border/70 px-3 py-2">
            <span className="text-sm text-foreground">{label}</span>
            {done ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Circle className="w-4 h-4 text-muted-foreground" />}
        </div>
    )
}
