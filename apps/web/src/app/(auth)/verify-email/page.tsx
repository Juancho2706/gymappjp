'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import Link from 'next/link'
import { MailCheck, Check, ArrowRight } from 'lucide-react'
import { getTierMaxClients } from '@eva/tiers'
import { useActionState } from 'react'
import { MetaTrackEvent } from '@/components/meta/MetaTrackEvent'
import { CoachRegisteredTracker } from '@/components/analytics/RegistrationTracker'
import {
    resendConfirmationAction,
    type ResendConfirmationState,
} from './_actions/resend.actions'

function ResendConfirmation({ uid }: { uid: string }) {
    const [state, formAction, pending] = useActionState<ResendConfirmationState, FormData>(
        resendConfirmationAction,
        {},
    )

    if (state.ok) {
        return (
            <p className="mt-[18px] text-[12.5px] text-[var(--success-700)]">
                Listo — te reenviamos el correo. Revisa también la carpeta de spam.
            </p>
        )
    }

    return (
        <form action={formAction} className="mt-[18px]">
            {/* El `uid` sólo desempata cuando NO hay sesión (el proxy manda acá al coach
                `pending_email` ya logueado). El Server Action prefiere siempre la sesión, y del id
                saca el email autoritativo: nada de lo tipeado en el form decide a quién se escribe. */}
            <input type="hidden" name="uid" value={uid} />
            <p className="text-[12.5px] text-text-subtle">
                ¿No te llegó? Revisa spam{' '}
                <button
                    type="submit"
                    disabled={pending}
                    className="font-semibold underline underline-offset-2 hover:text-text-body disabled:opacity-60"
                >
                    {pending ? 'reenviando…' : 'o reenvíalo ahora'}
                </button>
                .
            </p>
            {state.error ? (
                <p className="mt-1 text-[12px] text-[var(--danger-600)]">{state.error}</p>
            ) : null}
        </form>
    )
}

function VerifyEmailContent() {
    const params = useSearchParams()
    const email = params.get('email') ?? ''
    const uid = params.get('uid') ?? ''
    // `eid` lo genera el Server Action de registro y ya viajo a Meta por CAPI. Mismo event_id acá =
    // Meta funde ambos en UNA conversion (dedupe por event_name + event_id, ventana 48h).
    const metaEventId = params.get('eid')

    const benefits = [
        `${getTierMaxClients('free')} alumnos sin costo`,
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
                <strong className="text-text-strong">{email || 'tu correo'}</strong>. Clickéalo para
                activar tu cuenta gratuita.
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

            {/* QA pre-campaña 17-08: sin reenvío, un correo perdido dejaba al coach encerrado —
                el login lo rechaza hasta confirmar y el email ya está tomado para re-registrarse. */}
            <ResendConfirmation uid={uid} />

            <Link
                href="/login"
                className="mt-6 inline-flex h-14 w-full items-center justify-center gap-2 rounded-control bg-[var(--cta-fill)] text-[17px] font-bold tracking-[-0.01em] text-[var(--text-on-sport)] shadow-[var(--glow-sport)] transition-all duration-200 hover:bg-[color-mix(in_oklab,var(--cta-fill)_92%,#000)] active:scale-[0.98]"
            >
                Ya confirmé · Ir al panel
                <ArrowRight className="h-4 w-4" />
            </Link>
        </div>
    )
}

export default function VerifyEmailPage() {
    return (
        <Suspense>
            <VerifyEmailContent />
        </Suspense>
    )
}
