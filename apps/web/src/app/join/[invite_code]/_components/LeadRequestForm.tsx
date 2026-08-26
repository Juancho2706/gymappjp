'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { requestJoinAction, type LeadRequestState } from '../_actions/join-request.actions'
import { TurnstileWidget, type CaptchaState, type TurnstileHandle } from '@/components/auth/TurnstileWidget'

interface Props {
    inviteCode: string
    /** Color de marca del coach (white-label): tiñe el CTA y el foco de los campos. */
    primaryColor: string
    brandName: string
    /** Login white-label del coach — el único link para quien YA es alumno suyo. */
    loginHref: string
    /**
     * F6 (workout-share): referido que venía en la URL, ya filtrado por forma en el servidor.
     * El tipo se declara inline (y no se importa de `_lib/join-referral`) para no cruzar un
     * módulo `server-only` al bundle del cliente.
     */
    referral?: { ref: string; src: string; k?: string } | null
}

const initialState: LeadRequestState = {}

/**
 * Aviso inline cuando el challenge de Turnstile falla (600010, típico en la WebView de Instagram
 * por donde entra el tráfico del ad). Mismo copy que `/register` (misma causa, mismo remedio).
 */
const CAPTCHA_ERROR_NOTICE = 'No pudimos verificar tu navegador. Reintenta o abre esta página en Chrome/Safari.'

/**
 * Formulario de SOLICITUD del `/join` standalone (decisión del owner 2026-08-21: el interesado no
 * se da de alta solo, le llega al coach y el coach decide). No crea cuenta: solo deja un contacto.
 *
 * El copy dice explícitamente qué pasa después —el coach escribe por WhatsApp— porque la fricción
 * nueva solo se sostiene si quien la vive entiende el trato.
 */
export function LeadRequestForm({ inviteCode, primaryColor, brandName, loginHref, referral }: Props) {
    const [state, formAction, pending] = useActionState(
        requestJoinAction.bind(null, inviteCode),
        initialState
    )
    // Espejo del checkbox obligatorio: el CTA queda apagado hasta que hay consentimiento, así el
    // rechazo se ve ANTES de mandar (el servidor igual lo vuelve a exigir).
    const [consent, setConsent] = useState(false)
    // Estado del challenge, alimentado por los callbacks de `TurnstileWidget`. La UI de error se
    // deriva directo de acá (sin un `captchaNotice` aparte): en 'ok' el aviso desaparece solo.
    const [captchaState, setCaptchaState] = useState<CaptchaState>('pending')
    const turnstileRef = useRef<TurnstileHandle>(null)

    const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

    // El token de Turnstile es de un solo uso: cualquier rechazo del server ya lo quemó (llegó a
    // `siteverify` o no llegó porque faltaba). El reset es incondicional —igual que en
    // `/register`— para que el reintento no repita un token viejo y vuelva en loop.
    const reportedStateRef = useRef<LeadRequestState>(initialState)
    useEffect(() => {
        if (reportedStateRef.current === state) return
        reportedStateRef.current = state
        if (!state?.error) return
        setCaptchaState('pending')
        turnstileRef.current?.reset()
    }, [state])

    const inputClass =
        'w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder:text-zinc-500'
    const labelClass = 'block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1'

    if (state.success) {
        return (
            <div className="flex flex-col gap-4">
                <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Solicitud enviada</h2>
                <p className="text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed">
                    Listo. {brandName} recibió tu solicitud y te va a escribir al WhatsApp que dejaste.
                </p>
                <p className="text-xs text-zinc-400 dark:text-zinc-500">
                    ¿Ya tienes cuenta?{' '}
                    <Link href={loginHref} className="underline hover:text-zinc-600 dark:hover:text-zinc-300">
                        Entrar
                    </Link>
                </p>
            </div>
        )
    }

    return (
        <>
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 mb-1">Solicitud</h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-5 leading-relaxed">
                Deja tus datos y {brandName} te escribe por WhatsApp para empezar.
            </p>

            <form action={formAction} className="flex flex-col gap-4">
                {/*
                  F6: el referido viaja al server action por el MISMO FormData de la solicitud. Son
                  inputs ocultos (no estado del cliente ni storage) porque el submit ocurre en la
                  misma pantalla donde se leyó la URL: lo que el servidor pintó es exactamente lo
                  que se envía. El action igual revalida contra la DB — esto es transporte, no permiso.
                */}
                {referral && (
                    <>
                        <input type="hidden" name="ref" value={referral.ref} />
                        <input type="hidden" name="src" value={referral.src} />
                        {referral.k && <input type="hidden" name="k" value={referral.k} />}
                    </>
                )}

                <div>
                    <label htmlFor="lead-full-name" className={labelClass}>
                        Nombre completo
                    </label>
                    <input
                        id="lead-full-name"
                        name="full_name"
                        required
                        minLength={2}
                        maxLength={120}
                        autoComplete="name"
                        className={inputClass}
                        placeholder="Juan Pérez"
                    />
                </div>

                <div>
                    <label htmlFor="lead-phone" className={labelClass}>
                        WhatsApp
                    </label>
                    <input
                        id="lead-phone"
                        name="phone"
                        type="tel"
                        required
                        minLength={6}
                        maxLength={30}
                        autoComplete="tel"
                        className={inputClass}
                        placeholder="+56 9 1234 5678"
                    />
                </div>

                <div>
                    <label htmlFor="lead-email" className={labelClass}>
                        Correo (opcional)
                    </label>
                    <input
                        id="lead-email"
                        name="email"
                        type="email"
                        maxLength={254}
                        autoComplete="email"
                        className={inputClass}
                        placeholder="juan@email.com"
                    />
                </div>

                <div>
                    <label htmlFor="lead-message" className={labelClass}>
                        Mensaje (opcional)
                    </label>
                    <textarea
                        id="lead-message"
                        name="message"
                        maxLength={500}
                        rows={3}
                        className={`${inputClass} resize-none`}
                        placeholder="Cuéntale qué buscas entrenar"
                    />
                </div>

                {/* Ley 21.719: consentimiento explícito, previo y con el nombre de quien recibe los datos. */}
                <label className="flex items-start gap-2.5 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400 cursor-pointer">
                    <input
                        type="checkbox"
                        name="consent"
                        required
                        checked={consent}
                        onChange={(e) => setConsent(e.target.checked)}
                        className="mt-0.5 h-4 w-4 shrink-0 rounded border-zinc-300 dark:border-zinc-600"
                        style={{ accentColor: primaryColor }}
                    />
                    <span>Acepto que {brandName} reciba estos datos para contactarme (Ley 21.719)</span>
                </label>

                {siteKey && (
                    <div>
                        <TurnstileWidget
                            ref={turnstileRef}
                            siteKey={siteKey}
                            appearance="interaction-only"
                            onStateChange={setCaptchaState}
                        />
                        {captchaState === 'error' && (
                            <div
                                role="alert"
                                className="mt-2 rounded-xl bg-red-50 px-3 py-2.5 text-xs leading-relaxed text-red-600 dark:bg-red-950/40 dark:text-red-400"
                            >
                                <p>{CAPTCHA_ERROR_NOTICE}</p>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setCaptchaState('pending')
                                        turnstileRef.current?.reset()
                                    }}
                                    className="mt-1.5 font-semibold underline hover:opacity-80"
                                >
                                    Reintentar
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {state.error && (
                    <p className="text-sm text-red-600 dark:text-red-400" role="alert">
                        {state.error}
                    </p>
                )}

                <button
                    type="submit"
                    disabled={pending || !consent}
                    // El freno del captcha va en el CLICK, no en un `onSubmit` del `<form action={...}>`
                    // (mismo patrón que `/register`): un challenge ya fallido no vale la pena mandarlo
                    // al server a morir con «verificación requerida» cuando el aviso de arriba ya dice
                    // qué hacer.
                    onClick={(event) => {
                        if (siteKey && captchaState === 'error') event.preventDefault()
                    }}
                    style={{ backgroundColor: primaryColor }}
                    className="w-full rounded-xl py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                    {pending ? 'Enviando solicitud...' : 'Enviar solicitud'}
                </button>
            </form>

            <p className="mt-4 text-center text-xs text-zinc-400 dark:text-zinc-500">
                ¿Ya tienes cuenta?{' '}
                <Link href={loginHref} className="underline hover:text-zinc-600 dark:hover:text-zinc-300">
                    Entrar
                </Link>
            </p>
        </>
    )
}
