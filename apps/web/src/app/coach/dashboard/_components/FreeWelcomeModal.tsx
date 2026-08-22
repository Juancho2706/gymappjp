'use client'

import { useEffect, useState } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Sparkles } from 'lucide-react'
import { personaNoun, type Persona } from '@eva/schemas'
import { getTierMaxClients, studentCountLabel } from '@eva/tiers'
import { MetaTrackEvent } from '@/components/meta/MetaTrackEvent'
import { CoachRegisteredTracker } from '@/components/analytics/RegistrationTracker'

/**
 * Bienvenida del coach Free — SOLO TEXTO, tres líneas (SPEC coach-onboarding-v2 §6).
 *
 * La evidencia de onboarding es clara: el modal de bienvenida solo texto se completa mucho más
 * (44 % vs 21 % con video) y los tours largos fracasan. Antes esto era un catálogo de features con
 * checks, upsell a planes y dos CTAs; ahora dice lo mínimo y devuelve al coach a la guía, que es
 * donde de verdad avanza.
 *
 * «Recordármelo después» lo silencia 24 h; «Empezar» lo cierra para siempre. La clave de
 * localStorage es POR COACH: con la clave global, un segundo coach en el mismo navegador nunca
 * veía su bienvenida.
 */

/** Clave global del modal v1. Si está, el coach ya vio la bienvenida: no se le repite. */
const LEGACY_STORAGE_KEY = 'eva_free_welcome_seen'

const SNOOZE_MS = 24 * 60 * 60 * 1000

function storageKey(coachId: string): string {
    return `eva:coach-free-welcome:v2:${coachId}`
}

type WelcomeState = { seen?: boolean; snoozedUntil?: number }

function readState(coachId: string): WelcomeState {
    try {
        if (localStorage.getItem(LEGACY_STORAGE_KEY)) return { seen: true }
        const raw = localStorage.getItem(storageKey(coachId))
        if (!raw) return {}
        const parsed: unknown = JSON.parse(raw)
        if (parsed == null || typeof parsed !== 'object') return {}
        const o = parsed as Record<string, unknown>
        return {
            seen: o.seen === true,
            snoozedUntil: typeof o.snoozedUntil === 'number' ? o.snoozedUntil : undefined,
        }
    } catch {
        return {}
    }
}

function writeState(coachId: string, state: WelcomeState): void {
    try {
        localStorage.setItem(storageKey(coachId), JSON.stringify(state))
    } catch {
        /* modo privado: el modal volverá a aparecer, no es crítico */
    }
}

export function FreeWelcomeModal({
    coachId,
    persona,
}: {
    coachId: string
    /** `null` = todavía no eligió especialidad; el vocabulario cae en «alumno». */
    persona: Persona | null
}) {
    const searchParams = useSearchParams()
    const router = useRouter()
    const pathname = usePathname()
    const [open, setOpen] = useState(false)

    useEffect(() => {
        if (searchParams.get('welcome') !== 'free') return
        if (typeof window === 'undefined') return
        const state = readState(coachId)
        if (state.seen) return
        if (state.snoozedUntil != null && Date.now() < state.snoozedUntil) return
        setOpen(true)
    }, [coachId, searchParams])

    function cleanUrl() {
        // Saca ?welcome=free (y el eid del espejo de Meta) sin ensuciar el historial.
        const params = new URLSearchParams(searchParams.toString())
        params.delete('welcome')
        params.delete('eid')
        const next = params.size > 0 ? `${pathname}?${params.toString()}` : pathname
        router.replace(next)
    }

    function start() {
        writeState(coachId, { seen: true })
        setOpen(false)
        cleanUrl()
    }

    function snooze() {
        writeState(coachId, { snoozedUntil: Date.now() + SNOOZE_MS })
        setOpen(false)
        cleanUrl()
    }

    // Espejo browser del CompleteRegistration del alta por Google: el server action ya lo mandó
    // por CAPI con este mismo `eid`, y Meta funde ambos en UNA conversión (dedupe por
    // event_name + event_id). El camino por email tiene su espejo en /verify-email; este es el
    // equivalente del camino Google, cuyo destino es directamente el dashboard.
    const metaEventId = searchParams.get('welcome') === 'free' ? searchParams.get('eid') : null
    const noun = personaNoun(persona ?? 'other')
    const cupo = studentCountLabel(getTierMaxClients('free'))

    return (
        <Dialog open={open} onOpenChange={(v) => !v && snooze()}>
            {metaEventId ? <MetaTrackEvent event="CompleteRegistration" eventId={metaEventId} /> : null}
            {/* Espejo en PostHog del mismo hecho (coach_registered): este es el aterrizaje del alta
                free por Google, que nunca pasa por /verify-email. Mismo gate `eid`. */}
            {metaEventId ? <CoachRegisteredTracker tier="free" dedupeKey={metaEventId} /> : null}
            <DialogContent className="max-w-sm rounded-card border border-subtle bg-surface-card p-6 text-body shadow-2xl">
                <span className="flex size-11 items-center justify-center rounded-control border border-[var(--sport-500)]/30 bg-[var(--sport-100)]">
                    <Sparkles className="size-5 text-[var(--sport-600)]" />
                </span>
                <DialogTitle className="mt-3.5 font-display text-xl font-extrabold tracking-[-0.02em] text-strong">
                    Tu app ya está lista
                </DialogTitle>
                <div className="mt-2 flex flex-col gap-1.5 text-[13.5px] leading-snug text-muted">
                    <p>Tu plan gratuito incluye tu marca completa: tu logo, tu color, tu nombre.</p>
                    <p>
                        Puedes trabajar con {cupo} y, cuando tu {noun} entre, verá TU app — no la de EVA.
                    </p>
                    <p>Abajo te dejamos los cinco pasos para dejar todo andando hoy.</p>
                </div>
                <div className="mt-5 flex flex-col gap-2">
                    <button
                        type="button"
                        onClick={start}
                        className="h-11 w-full touch-manipulation rounded-control bg-sport-500 text-sm font-bold text-[var(--text-on-sport)] transition-colors hover:bg-sport-600"
                    >
                        Empezar
                    </button>
                    <button
                        type="button"
                        onClick={snooze}
                        className="h-11 w-full touch-manipulation rounded-control text-xs font-semibold text-muted transition-colors hover:text-strong"
                    >
                        Recordármelo después
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    )
}
