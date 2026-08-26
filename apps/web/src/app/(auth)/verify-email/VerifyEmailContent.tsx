'use client'

import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { MailCheck, Check, RefreshCw } from 'lucide-react'
import { getTierMaxClients, studentCountLabel } from '@eva/tiers'
import { useActionState, useEffect, useRef, useState } from 'react'
import { MetaTrackEvent } from '@/components/meta/MetaTrackEvent'
import { CoachRegisteredTracker } from '@/components/analytics/RegistrationTracker'
import {
    resendConfirmationAction,
    type ResendConfirmationState,
} from './_actions/resend.actions'

/** Cooldown del reenvío. El limitador real vive en el server; esto sólo evita el tap en vacío. */
const RESEND_COOLDOWN_S = 45

/**
 * Cuánto tarda en aparecer el link secundario «Ya confirmé». Antes de eso el correo casi nunca
 * llegó todavía, y el link es exactamente la trampa que la autopsia del 25-08 midió: el coach lo
 * tocaba a los 6-13 s de registrarse, el login lo rechazaba por email sin confirmar, y terminaba
 * en `/forgot-password` creyendo que era la contraseña (o re-registrándose con otro correo).
 */
const ALREADY_CONFIRMED_DELAY_MS = 30_000

/**
 * CTA primario de la pantalla: reenviar el correo. Existe por el QA pre-campaña 17-08 (sin
 * reenvío, un correo perdido dejaba al coach encerrado: el login lo rechaza hasta confirmar y el
 * email ya está tomado para re-registrarse), y pasó a primario tras la autopsia del 25-08.
 */
function ResendConfirmation({ uid, onAccountActive }: { uid: string; onAccountActive: () => void }) {
    const [state, formAction, pending] = useActionState<ResendConfirmationState, FormData>(
        resendConfirmationAction,
        {},
    )
    const [cooldown, setCooldown] = useState(0)

    // El cooldown arranca con CUALQUIER respuesta del action, no sólo con el éxito: si el server
    // frenó por throttle, volver a pedirlo al segundo siguiente tampoco sirve. Guardia por
    // IDENTIDAD del objeto de estado (`useActionState` devuelve uno nuevo por resultado), así dos
    // reenvíos seguidos reinician la cuenta y un re-render cualquiera no la toca.
    const reportedStateRef = useRef<ResendConfirmationState>(state)
    useEffect(() => {
        if (reportedStateRef.current === state) return
        reportedStateRef.current = state
        setCooldown(RESEND_COOLDOWN_S)
        // Sanación: el server acaba de confirmar que la cuenta quedó activa, así que el link a
        // /login deja de ser una trampa y se muestra ya (sin esperar los 30 s).
        if (state.message) onAccountActive()
    }, [state, onAccountActive])

    useEffect(() => {
        if (cooldown <= 0) return
        const timer = setTimeout(() => setCooldown((s) => s - 1), 1000)
        return () => clearTimeout(timer)
    }, [cooldown])

    const disabled = pending || cooldown > 0

    return (
        <form action={formAction} className="mt-6">
            {/* El `uid` sólo desempata cuando NO hay sesión (el proxy manda acá al coach
                `pending_email` ya logueado). El Server Action prefiere siempre la sesión, y del id
                saca el email autoritativo: nada de lo tipeado en el form decide a quién se escribe. */}
            <input type="hidden" name="uid" value={uid} />
            <button
                type="submit"
                disabled={disabled}
                className="inline-flex h-14 w-full items-center justify-center gap-2 rounded-control bg-[var(--cta-fill)] text-[17px] font-bold tracking-[-0.01em] text-[var(--text-on-sport)] shadow-[var(--glow-sport)] transition-all duration-200 hover:bg-[color-mix(in_oklab,var(--cta-fill)_92%,#000)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none"
            >
                <RefreshCw className={`h-4 w-4 ${pending ? 'animate-spin' : ''}`} aria-hidden="true" />
                {pending
                    ? 'Reenviando…'
                    : cooldown > 0
                        ? `Reenviar en ${cooldown} s`
                        : 'Reenviar correo'}
            </button>

            {state.ok ? (
                <p className="mt-2.5 text-[12.5px] text-[var(--success-700)]">
                    Listo — te reenviamos el correo. Revisa también la carpeta de spam.
                </p>
            ) : null}

            {/* `message` (no `error`): la cuenta ya quedó activa al pedir el reenvío —el Server Action
                la sanó porque GoTrue ya tenía el email confirmado—, así que esto es una buena
                noticia, no un fallo, y se pinta en el mismo tono que el reenvío exitoso. */}
            {state.message ? (
                <p className="mt-2.5 text-[12.5px] text-[var(--success-700)]">{state.message}</p>
            ) : null}

            {state.error ? (
                <p className="mt-2.5 text-[12px] text-[var(--danger-600)]">{state.error}</p>
            ) : null}

            {!state.ok && !state.message && !state.error ? (
                <p className="mt-2.5 text-[12.5px] text-text-subtle">
                    ¿No te llegó? Revisa la carpeta de spam antes de reenviarlo.
                </p>
            ) : null}
        </form>
    )
}

/**
 * Contenido cliente de `/verify-email`. La página (`page.tsx`) es un Server Component que primero
 * intenta SANAR al coach con sesión cuyo email ya está confirmado en GoTrue (ver ahí) y recién
 * después monta esto.
 */
export function VerifyEmailContent() {
    const params = useSearchParams()
    const email = params.get('email') ?? ''
    const uid = params.get('uid') ?? ''
    // `eid` lo genera el Server Action de registro y ya viajo a Meta por CAPI. Mismo event_id acá =
    // Meta funde ambos en UNA conversion (dedupe por event_name + event_id, ventana 48h).
    const metaEventId = params.get('eid')

    // El camino real es el link del correo, no `/login`: acá el coach todavía es `pending_email` y
    // el login lo rechaza. El link secundario aparece recién a los 30 s (o antes, si el reenvío
    // descubrió que la cuenta ya estaba activa), para el caso honesto de «confirmé en otra pestaña».
    const [showAlreadyConfirmed, setShowAlreadyConfirmed] = useState(false)
    useEffect(() => {
        const timer = setTimeout(() => setShowAlreadyConfirmed(true), ALREADY_CONFIRMED_DELAY_MS)
        return () => clearTimeout(timer)
    }, [])

    const benefits = [
        `${studentCountLabel(getTierMaxClients('free'))} sin costo, con tu marca`,
        'Planes de entrenamiento ilimitados',
        'Tu propia app para alumnos',
        'Upgrade cuando quieras',
    ]

    return (
        <div className="w-full max-w-md mx-auto my-auto animate-slide-up text-center">
            {metaEventId ? (
                <MetaTrackEvent event="CompleteRegistration" eventId={metaEventId} />
            ) : null}
            {/* Espejo en PostHog del mismo hecho: solo con `eid` (o sea, viniendo del redirect del
                Server Action) — aterrizar acá a mano no es un alta. Único plan que llega: free. */}
            {metaEventId ? (
                <CoachRegisteredTracker tier="free" dedupeKey={metaEventId} />
            ) : null}
            <div className="inline-flex h-[76px] w-[76px] items-center justify-center rounded-full bg-sport-100 text-sport-600 mb-5">
                <MailCheck className="h-[34px] w-[34px]" />
            </div>

            <h1 className="font-display text-[25px] font-black tracking-[-0.02em] text-text-strong">
                Revisa tu email
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-text-muted">
                Te enviamos un enlace de confirmación a
                <br />
                <strong className="text-text-strong">{email || 'tu correo'}</strong>.
            </p>
            <p className="mt-2.5 text-[15px] font-semibold leading-relaxed text-text-strong">
                Abre el correo y toca el botón — te deja adentro solo.
            </p>

            <div className="mt-6 rounded-card border border-border-subtle bg-surface-card p-[18px] text-left shadow-[var(--shadow-sm)]">
                <p className="mb-3 text-[11px] font-extrabold uppercase tracking-[0.05em] text-text-subtle">
                    Incluido en tu plan Free
                </p>
                <div className="flex flex-col gap-2.5">
                    {benefits.map((item) => (
                        <div key={item} className="flex items-center gap-2.5">
                            <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-[var(--success-100)] text-[var(--success-700)]">
                                <Check className="h-[13px] w-[13px]" />
                            </span>
                            <span className="text-[13.5px] text-text-body">{item}</span>
                        </div>
                    ))}
                </div>
            </div>

            <ResendConfirmation uid={uid} onAccountActive={() => setShowAlreadyConfirmed(true)} />

            {showAlreadyConfirmed ? (
                <p className="mt-5 animate-fade-in text-[13px] text-text-muted">
                    ¿Ya confirmaste desde otra pestaña?{' '}
                    <Link
                        href="/login"
                        className="font-bold text-sport-600 underline underline-offset-2 transition-opacity hover:opacity-80"
                    >
                        Inicia sesión
                    </Link>
                </p>
            ) : null}
        </div>
    )
}
