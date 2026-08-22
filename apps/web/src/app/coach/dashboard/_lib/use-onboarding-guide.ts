'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
    ONBOARDING_STEPS,
    ONBOARDING_TOTAL_STEPS,
    isOnboardingComplete,
    progress,
    resolveAutoCompleted,
    type OnboardingSignals,
    type OnboardingStep,
    type OnboardingStepKey,
} from '@eva/onboarding'
import type { Persona } from '@eva/schemas'
import type { Json } from '@/lib/database.types'
import { persistOnboardingGuideAction } from '../_actions/onboarding-guide.actions'
import { postAhaMoment, postOnboardingDismissed, postStepCompleted } from './onboarding-telemetry.client'
import {
    EMPTY_GUIDE_STATE,
    guideStateHasActivity,
    parseOnboardingGuide,
    type OnboardingGuideState,
} from './onboarding-guide-state'

/**
 * Estado de la guía de inicio v2 — un solo dueño para las DOS posiciones del dashboard.
 *
 * La guía vive ARRIBA (cabecera, antes del hero) hasta llegar a 5/5 o hasta que el coach toca
 * «Ocultar»; después baja a una tira de una línea al PIE (SPEC §6, decisión D5=A). Como son dos
 * puntos distintos del árbol, el estado se calcula acá una vez y se reparte por props: sin este
 * hook cada bloque tendría su propia copia y se contradirían.
 *
 * Reglas que implementa:
 *  - Los pasos se tildan SOLOS con señales reales del servidor (`resolveAutoCompleted`). No hay
 *    tilde manual: el checklist refleja trabajo hecho, no clics.
 *  - Sticky: una vez tildado, el paso queda tildado aunque la señal desaparezca (el coach borra el
 *    programa del demo y no por eso «desactiva» su onboarding).
 *  - El servidor GANA sobre localStorage cuando tiene algo escrito; si no, se sube lo local.
 *  - `step_completed` se emite UNA vez por transición y se recuerda en `onboarding_guide.emitted`
 *    (la DB deduplica igual, pero sin esto el cliente reintentaba el POST en cada render: ese fue
 *    el re-emit que dejó 2.293 filas de `first_client` para 19 coaches).
 */

export interface OnboardingGuideVm {
    /** `false` hasta hidratar: evita el parpadeo entre el estado del servidor y el del navegador. */
    ready: boolean
    persona: Persona
    steps: readonly OnboardingStep[]
    completed: Record<OnboardingStepKey, boolean>
    done: number
    total: typeof ONBOARDING_TOTAL_STEPS
    allDone: boolean
    /** La guía está al pie (5/5 o el coach la ocultó). */
    atFoot: boolean
    /** El coach cerró también la tira del pie: no se pinta nada. */
    hidden: boolean
    /** Tilda un paso a mano tras una acción in-place (guardar la marca) sin esperar al refresh. */
    markStepCompleted: (key: OnboardingStepKey) => void
    /** «Ocultar»: la guía baja al pie. */
    sendToFoot: () => void
    /** «Ocultar» en la tira del pie: la guía desaparece. */
    hide: () => void
}

/** Clave por coach: el dismiss de otra cuenta en el mismo navegador no puede ocultar esta guía. */
export function onboardingGuideStorageKey(coachId: string): string {
    return `eva:coach-onboarding:v2:${coachId}`
}

/** Evita doble confeti (Strict Mode en dev, doble montaje) en la misma sesión del navegador. */
function ahaConfettiSessionKey(coachId: string): string {
    return `eva:coach-onboarding-aha-confetti:${coachId}`
}

function readLocalState(coachId: string): OnboardingGuideState {
    try {
        const raw = localStorage.getItem(onboardingGuideStorageKey(coachId))
        if (!raw) return EMPTY_GUIDE_STATE
        return parseOnboardingGuide(JSON.parse(raw))
    } catch {
        return EMPTY_GUIDE_STATE
    }
}

function writeLocalState(coachId: string, state: OnboardingGuideState): void {
    try {
        localStorage.setItem(onboardingGuideStorageKey(coachId), JSON.stringify(state))
    } catch {
        /* modo privado / cuota llena: el servidor sigue siendo la fuente */
    }
}

export function useOnboardingGuide(input: {
    coachId: string
    /** `null` = el coach todavía no eligió especialidad: se usan los pasos de `other`. */
    persona: Persona | null
    initialGuide: Json
    signals: OnboardingSignals
    /**
     * `false` cuando el RSC ni siquiera consultó las señales (guía apagada por el coach): el hook
     * queda dormido — ni hidrata, ni emite eventos, ni escribe. Los hooks no pueden ser
     * condicionales, así que la condición entra como dato.
     */
    enabled?: boolean
}): OnboardingGuideVm {
    const { coachId, initialGuide, signals } = input
    const enabled = input.enabled !== false
    const persona: Persona = input.persona ?? 'other'

    const [ready, setReady] = useState(false)
    const [state, setState] = useState<OnboardingGuideState>(EMPTY_GUIDE_STATE)
    const hydratedRef = useRef(false)
    const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    /** Serializa el jsonb: sin esto, un `{}` nuevo por render re-dispararía la hidratación. */
    const initialGuideKey = useMemo(() => JSON.stringify(initialGuide ?? null), [initialGuide])

    useEffect(() => {
        if (!enabled) return
        const fromServer = parseOnboardingGuide(initialGuide)
        const local = readLocalState(coachId)

        if (guideStateHasActivity(fromServer)) {
            // El servidor manda, pero lo del navegador se SUMA en vez de perderse: el guardado va
            // con debounce y una navegación rápida puede cancelarlo. Sin esta unión, `emitted` y
            // `ahaMomentSent` volverían a cero y se re-emitiría el evento (o el confeti) de nuevo.
            const merged: OnboardingGuideState = {
                ...fromServer,
                completed: { ...local.completed, ...fromServer.completed },
                emitted: [...new Set([...fromServer.emitted, ...local.emitted])],
                dismissed: fromServer.dismissed || local.dismissed,
                hidden: fromServer.hidden || local.hidden,
                ahaMomentSent: fromServer.ahaMomentSent || local.ahaMomentSent,
            }
            writeLocalState(coachId, merged)
            setState(merged)
        } else {
            setState(local)
            if (guideStateHasActivity(local)) {
                void persistOnboardingGuideAction(local).then((r) => {
                    if (!r.ok) toast.error('No se pudo guardar la guía en tu cuenta', { description: r.error })
                })
            }
        }
        hydratedRef.current = true
        setReady(true)
        // eslint-disable-next-line react-hooks/exhaustive-deps -- initialGuideKey serializa el jsonb
    }, [coachId, initialGuideKey, enabled])

    const schedulePersist = useCallback(
        (next: OnboardingGuideState) => {
            writeLocalState(coachId, next)
            if (persistTimerRef.current) clearTimeout(persistTimerRef.current)
            persistTimerRef.current = setTimeout(() => {
                persistTimerRef.current = null
                void persistOnboardingGuideAction({
                    completed: next.completed,
                    dismissed: next.dismissed,
                    hidden: next.hidden,
                    emitted: next.emitted,
                    ahaMomentSent: next.ahaMomentSent,
                }).then((r) => {
                    if (!r.ok) toast.error('No se pudo sincronizar la guía', { description: r.error })
                })
            }, 450)
        },
        [coachId]
    )

    useEffect(() => {
        return () => {
            if (persistTimerRef.current) clearTimeout(persistTimerRef.current)
        }
    }, [])

    const auto = useMemo(() => resolveAutoCompleted(signals), [signals])

    const completed = useMemo<Record<OnboardingStepKey, boolean>>(() => {
        const out = { ...auto }
        for (const key of Object.keys(out) as OnboardingStepKey[]) {
            out[key] = out[key] || state.completed[key] === true
        }
        return out
    }, [auto, state.completed])

    const steps = ONBOARDING_STEPS[persona]
    const { done } = progress(completed)
    const allDone = isOnboardingComplete(completed)

    // Emisión de `step_completed` + confeti del aha. Converge: los pasos ya emitidos viven en el
    // estado persistido, así que este efecto no vuelve a disparar nada tras estabilizarse.
    useEffect(() => {
        if (!ready || !enabled) return

        const pending = (Object.keys(completed) as OnboardingStepKey[]).filter(
            (key) => completed[key] && !state.emitted.includes(key)
        )
        const needsAha = completed.aha && !state.ahaMomentSent

        if (pending.length === 0 && !needsAha) return

        for (const key of pending) {
            void postStepCompleted(key, { persona, progress_done: done, surface: 'web' })
        }

        if (needsAha) {
            void postAhaMoment({ persona, surface: 'web' })
            void fireAhaConfetti(coachId)
        }

        const next: OnboardingGuideState = {
            ...state,
            completed: pending.reduce(
                (acc, key) => ({ ...acc, [key]: true }),
                { ...state.completed }
            ),
            emitted: [...state.emitted, ...pending],
            ahaMomentSent: state.ahaMomentSent || needsAha,
        }
        setState(next)
        schedulePersist(next)
    }, [ready, enabled, completed, state, persona, done, coachId, schedulePersist])

    const markStepCompleted = useCallback(
        (key: OnboardingStepKey) => {
            setState((prev) => {
                if (prev.completed[key] === true) return prev
                const next: OnboardingGuideState = {
                    ...prev,
                    completed: { ...prev.completed, [key]: true },
                }
                schedulePersist(next)
                return next
            })
        },
        [schedulePersist]
    )

    const sendToFoot = useCallback(() => {
        void postOnboardingDismissed('profile_branding', {
            widget: 'onboarding_checklist',
            action: 'send_to_foot',
            progress_done: done,
            persona,
        })
        setState((prev) => {
            const next = { ...prev, dismissed: true }
            schedulePersist(next)
            return next
        })
        toast('Guía al pie del panel. Sigue ahí cuando la necesites.', { duration: 3000 })
    }, [done, persona, schedulePersist])

    const hide = useCallback(() => {
        void postOnboardingDismissed('profile_branding', {
            widget: 'onboarding_footer',
            action: 'hide',
            progress_done: done,
            persona,
        })
        setState((prev) => {
            const next = { ...prev, dismissed: true, hidden: true }
            schedulePersist(next)
            return next
        })
    }, [done, persona, schedulePersist])

    return {
        ready,
        persona,
        steps,
        completed,
        done,
        total: ONBOARDING_TOTAL_STEPS,
        allDone,
        atFoot: allDone || state.dismissed,
        hidden: state.hidden,
        markStepCompleted,
        sendToFoot,
        hide,
    }
}

/** Confeti del aha: una sola vez por coach y respetando `prefers-reduced-motion`. */
async function fireAhaConfetti(coachId: string): Promise<void> {
    if (typeof window === 'undefined') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    try {
        if (sessionStorage.getItem(ahaConfettiSessionKey(coachId))) return
        sessionStorage.setItem(ahaConfettiSessionKey(coachId), '1')
    } catch {
        /* sin sessionStorage: preferimos lanzarlo igual antes que quedarnos sin celebración */
    }
    const { default: confetti } = await import('canvas-confetti')
    confetti({
        particleCount: 130,
        spread: 72,
        origin: { y: 0.4 },
        colors: ['#1462DC', '#38bdf8', '#22c55e', '#34d399', '#f59e0b'],
    })
}
