'use client'

import Script from 'next/script'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'

// ── Tipos mínimos del SDK MercadoPago.js v2 (Secure Fields) — el SDK no trae tipos ────────────
type MpField = {
    mount: (containerId: string) => MpField
    unmount?: () => void
    on?: (event: string, cb: (data: { bin?: string }) => void) => void
}
type MpCardToken = { id: string; last_four_digits?: string; payment_method_id?: string }
type MpFields = {
    create: (type: string, opts?: Record<string, unknown>) => MpField
    createCardToken: (data: Record<string, unknown>) => Promise<MpCardToken>
}
type MpPaymentMethods = { results?: Array<{ id?: string }> }
type MpInstance = {
    fields: MpFields
    getPaymentMethods?: (opts: { bin: string }) => Promise<MpPaymentMethods>
}
type MpCtor = new (publicKey: string, opts?: Record<string, unknown>) => MpInstance
declare global {
    interface Window {
        MercadoPago?: MpCtor
    }
}

type DisclosurePoint = { number: number; title: string; text: string }

type Props = {
    publicKey: string
    termsVersion: string
    disclosure: DisclosurePoint[]
}

type FieldStyle = Record<string, string>

/** Las clases del contenedor donde Secure Fields monta su iframe (alto fijo, look de input). */
const FIELD_BOX =
    'h-11 rounded-md border border-neutral-300 bg-white px-3 dark:border-neutral-700 dark:bg-neutral-900'

export function CardChangeForm({ publicKey, termsVersion, disclosure }: Props) {
    const router = useRouter()
    const mpRef = useRef<MpInstance | null>(null)
    const mountedRef = useRef(false)
    const [fieldsReady, setFieldsReady] = useState(false)
    const [cardholderName, setCardholderName] = useState('')
    const [accepted, setAccepted] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)
    // Medio de pago (visa/master/debvisa/…) resuelto del BIN — DISPLAY-ONLY (ícono/marca). No gatea nada.
    const [paymentMethodId, setPaymentMethodId] = useState<string | null>(null)

    const missingKey = publicKey.trim().length === 0

    // Monta los Secure Fields. Idempotente (mountedRef). Se invoca tanto desde onLoad/onReady del
    // Script (donde window.MercadoPago ya está garantizado) como desde el effect de SDK-ya-cargado.
    // Si en una invocación el Ctor aún no existe, sale sin marcar montado → un disparo posterior reintenta
    // (evita el "bricked forever" de leer el Ctor en un effect keyed en un solo flag).
    const initFields = useCallback(() => {
        if (mountedRef.current || missingKey) return
        const Ctor = window.MercadoPago
        if (!Ctor) return
        try {
            const mp = new Ctor(publicKey, { locale: 'es-CL' })
            mpRef.current = mp
            // El iframe de Secure Fields NO hereda los estilos de la página → si no le pasamos el color
            // del texto, en dark mode sale negro sobre fondo oscuro (ilegible). Lo derivamos del modo.
            const isDark =
                typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
            const fieldStyle: FieldStyle = {
                height: '100%',
                'font-size': '16px',
                'font-family': 'inherit',
                color: isDark ? '#fafafa' : '#0a0a0a',
                placeholderColor: isDark ? '#6b7280' : '#9ca3af',
            }
            // Secure Fields no expone el BIN al JS de la página (vive en el iframe) y `createCardToken`
            // NO devuelve `payment_method_id` → escuchamos `binChange` y resolvemos el medio de pago con
            // el BIN (`mp.getPaymentMethods`). Best-effort: la marca es DISPLAY-ONLY (no gatea el swap);
            // si falla, la tarjeta queda sin ícono pero el cambio funciona igual.
            const cardNumber = mp.fields.create('cardNumber', { placeholder: '1234 1234 1234 1234', style: fieldStyle })
            cardNumber.on?.('binChange', async (data) => {
                const bin = data?.bin
                if (!bin) {
                    setPaymentMethodId(null)
                    return
                }
                try {
                    const methods = await mp.getPaymentMethods?.({ bin })
                    setPaymentMethodId(methods?.results?.[0]?.id ?? null)
                } catch {
                    // cosmético: sin marca, el swap sigue válido
                }
            })
            cardNumber.mount('mp-card-number')
            mp.fields.create('expirationDate', { placeholder: 'MM/AA', style: fieldStyle }).mount('mp-card-expiration')
            mp.fields.create('securityCode', { placeholder: 'CVV', style: fieldStyle }).mount('mp-card-security')
            mountedRef.current = true
            setFieldsReady(true)
        } catch {
            setError('No se pudo cargar el formulario de pago. Recargá la página e intentá de nuevo.')
        }
    }, [publicKey, missingKey])

    // SDK ya cargado (cache / navegación): monta sin esperar el onLoad del Script.
    useEffect(() => {
        if (window.MercadoPago) initFields()
    }, [initFields])

    const handleSubmit = useCallback(
        async (e: React.FormEvent) => {
            e.preventDefault()
            setError(null)
            if (!accepted) {
                setError('Debés aceptar las condiciones para continuar.')
                return
            }
            const mp = mpRef.current
            if (!mp || !fieldsReady) {
                setError('El formulario todavía se está cargando. Esperá un momento.')
                return
            }
            setSubmitting(true)

            // (1) Tokeniza la tarjeta client-side: el PAN nunca toca nuestro server (PCI SAQ-A). Los
            // errores de campo (PAN/exp/CVV) viven acá. Secure Fields LIMPIA el CVV tras tokenizar, así
            // que en un reintento hay que re-ingresarlo: lo decimos explícito.
            let token: MpCardToken
            try {
                token = await mp.fields.createCardToken({ cardholderName: cardholderName.trim() })
            } catch {
                setError('Revisá los datos de la tarjeta. Si reintentás, volvé a ingresar el código de seguridad (CVV).')
                setSubmitting(false)
                return
            }
            if (!token?.id) {
                setError('Revisá los datos de la tarjeta. Volvé a ingresar el código de seguridad (CVV) e intentá de nuevo.')
                setSubmitting(false)
                return
            }

            // (2) Envía el token al backend (errores de red/servidor, separados de la tokenización).
            try {
                const res = await fetch('/api/payments/change-card', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        cardToken: token.id,
                        acceptedTermsVersion: termsVersion,
                        last4: token.last_four_digits,
                        // brand/pmid resueltos por `binChange` (createCardToken no los trae). Display-only.
                        brand: paymentMethodId ?? token.payment_method_id,
                        paymentMethodId: paymentMethodId ?? token.payment_method_id,
                    }),
                })
                const data = (await res.json().catch(() => ({}))) as {
                    ok?: boolean
                    error?: string
                    code?: string
                    reactivateUrl?: string
                }
                if (res.ok && data.ok) {
                    router.push('/coach/subscription?card=success')
                    return
                }
                // Suscripción terminal → mandar a reactivar (recrea el preapproval con tarjeta nueva).
                if (data.code === 'PREAPPROVAL_TERMINAL' && data.reactivateUrl) {
                    window.location.href = data.reactivateUrl
                    return
                }
                setError(data.error ?? 'No se pudo cambiar la tarjeta. Intentá de nuevo.')
            } catch {
                setError('No se pudo conectar. Revisá tu conexión e intentá de nuevo.')
            } finally {
                setSubmitting(false)
            }
        },
        [accepted, cardholderName, fieldsReady, termsVersion, paymentMethodId, router]
    )

    if (missingKey) {
        return (
            <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                El cambio de tarjeta no está disponible en este momento. Intentá más tarde o escribinos a
                contacto@eva-app.cl.
            </p>
        )
    }

    return (
        <>
            <Script
                src="https://sdk.mercadopago.com/js/v2"
                strategy="afterInteractive"
                onReady={initFields}
                onLoad={initFields}
            />

            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1">
                    <label htmlFor="mp-cardholder" className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                        Nombre en la tarjeta
                    </label>
                    <input
                        id="mp-cardholder"
                        type="text"
                        autoComplete="cc-name"
                        value={cardholderName}
                        onChange={(e) => setCardholderName(e.target.value)}
                        className="h-11 w-full rounded-md border border-neutral-300 bg-white px-3 text-base text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50"
                        placeholder="Como figura en la tarjeta"
                    />
                </div>

                <div className="space-y-1">
                    <span id="mp-card-number-label" className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                        Número de tarjeta
                    </span>
                    <div id="mp-card-number" role="group" aria-labelledby="mp-card-number-label" className={FIELD_BOX} />
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                        <span id="mp-card-expiration-label" className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                            Vencimiento
                        </span>
                        <div id="mp-card-expiration" role="group" aria-labelledby="mp-card-expiration-label" className={FIELD_BOX} />
                    </div>
                    <div className="space-y-1">
                        <span id="mp-card-security-label" className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                            Código
                        </span>
                        <div id="mp-card-security" role="group" aria-labelledby="mp-card-security-label" className={FIELD_BOX} />
                    </div>
                </div>

                {/* Consentimiento DEDICADO (SERNAC) — texto versionado de CARD_CHANGE_DISCLOSURE. */}
                <div className="rounded-md bg-neutral-50 p-3 text-xs text-neutral-600 dark:bg-neutral-900 dark:text-neutral-400">
                    <ul className="space-y-1">
                        {disclosure.map((p) => (
                            <li key={p.number}>
                                <span className="font-medium text-neutral-700 dark:text-neutral-300">{p.title}:</span>{' '}
                                {p.text}
                            </li>
                        ))}
                    </ul>
                </div>

                <label className="flex items-start gap-2 text-sm text-neutral-700 dark:text-neutral-300">
                    <input
                        type="checkbox"
                        checked={accepted}
                        onChange={(e) => setAccepted(e.target.checked)}
                        className="mt-0.5 h-4 w-4"
                    />
                    <span>Entiendo y acepto las condiciones del cambio de tarjeta.</span>
                </label>

                {error && (
                    <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
                        {error}
                    </p>
                )}

                <button
                    type="submit"
                    disabled={submitting || !fieldsReady || !accepted}
                    className="h-11 w-full rounded-md bg-[#007AFF] font-medium text-white transition-opacity disabled:opacity-50"
                >
                    {submitting ? 'Guardando…' : 'Guardar tarjeta'}
                </button>

                <p className="text-center text-xs text-neutral-400 dark:text-neutral-500">
                    Procesado de forma segura por Mercado Pago. EVA no almacena el número de tu tarjeta.
                </p>
            </form>
        </>
    )
}
