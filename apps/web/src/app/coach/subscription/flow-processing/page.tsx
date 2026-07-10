'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { BILLING_CYCLE_CONFIG, TIER_CONFIG, type BillingCycle, type SubscriptionTier } from '@/lib/constants'

const POLL_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutos
const POLL_INTERVAL_MS = 4000 // 4s

/**
 * Retorno de Flow tras enrolar la tarjeta (urlReturn del checkout de enrolamiento). A diferencia
 * de MercadoPago (una sola autorización), Flow tiene DOS pasos: la tarjeta se enrola primero y
 * recién cuando el proveedor la refleja (customer/get con pay_mode:'auto') podemos crear el plan +
 * suscripción. Por eso pooleamos POST /api/payments/flow/confirm-enrollment (idempotente):
 *   · status 'active' (o alreadyCreated) → suscripción creada, al dashboard.
 *   · status 'pending_payment' (200) → Flow tomó el pago pero aún no confirma; el webhook activa.
 *     Cortamos el poll y avisamos (outcome 'pending').
 *   · enrolled:false → la tarjeta aún no refleja en Flow, seguimos pooleando.
 *   · 409 ACTIVE_MP_SUBSCRIPTION / INVALID_CHECKOUT_INTENT → conflicto terminal, cortamos.
 *   · 500 ORPHAN_PERSIST_FAILED / ORPHAN_NEEDS_RECONCILE → cobro sin sub materializada: TERMINAL
 *     con revisión manual (sin reintento automático), ofrecemos canal de soporte.
 *   · 4xx (400/403) genérico → error terminal con reintento manual.
 *   · 5xx sin code de orfandad → transitorio, seguimos.
 * Sin montos en el cliente: el server calcula todo (getCompositeAmountClp es la única fuente).
 */
// Desenlaces terminales/transitorios del tick. `retry` = terminal pero reintentable a mano;
// `terminal` = no reintentable (support opcional abre canal de soporte); `pending` = pago tomado,
// a la espera del webhook (no es error).
type Outcome =
    | { kind: 'retry'; message: string }
    | { kind: 'terminal'; message: string; support?: boolean }
    | { kind: 'pending'; message: string }

const SUPPORT_MAILTO = 'mailto:contacto@eva-app.cl?subject=Pago%20Webpay%20requiere%20revisi%C3%B3n'

// Parse robusto: un 4xx/5xx del WAF puede devolver HTML (no-JSON). Nunca dejamos que el parse
// reviente el tick; sin JSON válido devolvemos {} y decidimos por response.status.
function safeParse(raw: string): Record<string, unknown> {
    if (!raw) return {}
    try {
        const v = JSON.parse(raw)
        return v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
    } catch {
        return {}
    }
}

export default function FlowProcessingPage() {
    const searchParams = useSearchParams()
    const [statusText, setStatusText] = useState('Confirmando tu tarjeta con Webpay...')
    const [outcome, setOutcome] = useState<Outcome | null>(null)
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
    const pollStartRef = useRef<number>(0)
    const aliveRef = useRef(true)

    const rawTierParam = searchParams.get('tier')
    const normalizedTierParam = rawTierParam === 'starter_lite' ? 'starter' : rawTierParam
    // `in TIER_CONFIG` valida contra todas las entradas (incluidas legacy): esta pantalla solo
    // muestra el label de lo que se está pagando, no es una superficie de venta.
    const tierFromUrl = (
        normalizedTierParam && normalizedTierParam in TIER_CONFIG ? normalizedTierParam : 'starter'
    ) as SubscriptionTier
    const cycleFromUrl = (searchParams.get('cycle') ?? 'monthly') as BillingCycle

    // Add-ons del combo (CSV en el query → array en el body del POST). El botón Reintentar los conserva.
    const addonsFromUrl = useMemo(() => {
        const raw = searchParams.get('addons')
        if (!raw) return [] as string[]
        return raw.split(',').map((s) => s.trim()).filter(Boolean)
    }, [searchParams])

    const tierLabel = TIER_CONFIG[tierFromUrl]?.label ?? tierFromUrl
    const cycleLabel = BILLING_CYCLE_CONFIG[cycleFromUrl]?.label ?? cycleFromUrl

    const stopPolling = useCallback(() => {
        if (pollRef.current) {
            clearInterval(pollRef.current)
            pollRef.current = null
        }
    }, [])

    // Un tick de confirmación. Devuelve true si hay que seguir pooleando, false si terminó (éxito o error).
    const confirmTick = useCallback(async (): Promise<boolean> => {
        try {
            const response = await fetch('/api/payments/flow/confirm-enrollment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(addonsFromUrl.length > 0 ? { addons: addonsFromUrl } : {}),
            })
            // U3: leer texto y parsear robusto ANTES del check ok — un 4xx/5xx no-JSON (HTML del WAF)
            // ya no revienta el tick.
            const raw = await response.text()
            const payload = safeParse(raw)
            if (!aliveRef.current) return false

            const code = typeof payload.code === 'string' ? payload.code : undefined
            const serverMsg = typeof payload.error === 'string' ? payload.error : undefined

            if (!response.ok) {
                // 409 = conflicto terminal (ya hay sub MP activa / intent de checkout inconsistente):
                // mostramos el mensaje del server y cortamos, sin reintento.
                if (response.status === 409) {
                    setOutcome({
                        kind: 'terminal',
                        message: serverMsg ?? 'Tu suscripción ya está activa. Revisa tu suscripción.',
                    })
                    return false
                }
                // 500 con code de orfandad: el cobro salió pero no pudimos materializar la sub.
                // TERMINAL, sin reintento automático — requiere revisión manual (canal de soporte).
                if (
                    response.status >= 500 &&
                    (code === 'ORPHAN_PERSIST_FAILED' || code === 'ORPHAN_NEEDS_RECONCILE')
                ) {
                    setOutcome({
                        kind: 'terminal',
                        message: 'Tu pago requiere revisión manual. Escríbenos a soporte.',
                        support: true,
                    })
                    return false
                }
                // 4xx (400/403) genérico = error terminal con reintento manual.
                if (response.status >= 400 && response.status < 500) {
                    setOutcome({ kind: 'retry', message: serverMsg ?? 'No se pudo confirmar tu pago con Webpay.' })
                    return false
                }
                // 5xx sin code de orfandad = transitorio: seguimos pooleando.
                return true
            }

            // status 'pending_payment' en un 200: Flow tomó el pago pero aún no confirma. El webhook
            // activará la sub — cortamos el poll y avisamos (no es error). ⚠️ Este check va ANTES del
            // redirect: el short-circuit de idempotencia del server responde alreadyCreated con el status
            // REAL del coach — un alreadyCreated pending (tarjeta declinada en el 1er cargo) NO debe
            // redirigir al dashboard como si estuviera activo (slip cazado por el escéptico de Ola 4).
            if (payload.status === 'pending_payment') {
                setOutcome({
                    kind: 'pending',
                    message: 'Tu pago está siendo procesado por Flow. Te avisaremos al confirmarse.',
                })
                return false
            }

            if (payload.status === 'active' || payload.alreadyCreated) {
                window.location.href = '/coach/dashboard?subscription=active'
                return false
            }

            // enrolled:false → la tarjeta aún no refleja en Flow, seguimos.
            setStatusText('Confirmando tu tarjeta con Webpay...')
            return true
        } catch {
            // Error de red transitorio: seguimos pooleando.
            return true
        }
    }, [addonsFromUrl])

    const startPolling = useCallback(() => {
        stopPolling()
        setOutcome(null)
        setStatusText('Confirmando tu tarjeta con Webpay...')
        pollStartRef.current = Date.now()

        // ⚠️ Honrar el resultado del tick INMEDIATO (escéptico Ola 4): si ya resolvió un desenlace
        // (pending/terminal/redirect), cortar el intervalo — descartarlo dejaba el poll vivo y el
        // siguiente tick (idempotencia → alreadyCreated) pisaba el desenlace pending con un redirect.
        void (async () => {
            const keepGoing = await confirmTick()
            if (!keepGoing) stopPolling()
        })()

        pollRef.current = setInterval(async () => {
            if (Date.now() - pollStartRef.current > POLL_TIMEOUT_MS) {
                stopPolling()
                if (aliveRef.current) {
                    setOutcome({
                        kind: 'retry',
                        message: 'Esto está tardando más de lo esperado. Si ya completaste el pago, reintenta la verificación.',
                    })
                }
                return
            }
            const keepGoing = await confirmTick()
            if (!keepGoing) stopPolling()
        }, POLL_INTERVAL_MS)
    }, [confirmTick, stopPolling])

    useEffect(() => {
        aliveRef.current = true
        startPolling()
        return () => {
            aliveRef.current = false
            stopPolling()
        }
    }, [startPolling, stopPolling])

    // Spinner solo mientras pooleamos (sin desenlace). El 'pending' NO es error pero tampoco spinner.
    const isPolling = outcome === null
    const title = isPolling
        ? 'Procesando tu suscripción'
        : outcome.kind === 'pending'
        ? 'Pago en proceso'
        : 'Problema al procesar'
    const message = outcome?.message ?? statusText

    return (
        <main className="flex min-h-dvh items-center justify-center px-4 py-12 pt-safe pb-safe bg-background">
            <div className="w-full max-w-md rounded-card border border-subtle bg-surface-card p-8 text-center shadow-xl">
                {isPolling && (
                    <div className="mx-auto mb-6 h-12 w-12 animate-spin rounded-full border-[3px] border-sport-500 border-t-transparent" />
                )}

                {(tierFromUrl || cycleFromUrl) && (
                    <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-sport-500/30 bg-sport-100 px-3 py-1 text-xs font-semibold text-sport-600">
                        {tierLabel} · {cycleLabel}
                    </div>
                )}

                <div role="status" aria-live="polite">
                    <h1 className="font-display text-xl font-bold tracking-tight text-strong">{title}</h1>
                    <p className="mt-2 text-sm text-muted">{message}</p>

                    {isPolling && (
                        <p className="mt-3 text-xs text-muted">
                            Te redirigiremos automáticamente cuando tu suscripción esté activa.
                        </p>
                    )}
                </div>

                <div className="mt-6 flex flex-col gap-3">
                    {/* Reintento manual solo en desenlaces reintentables (4xx genérico / timeout). */}
                    {outcome?.kind === 'retry' && (
                        <button
                            type="button"
                            onClick={() => startPolling()}
                            className="inline-flex h-11 items-center justify-center rounded-control bg-sport-500 px-6 text-sm font-semibold text-white transition-colors hover:bg-sport-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                        >
                            Reintentar
                        </button>
                    )}

                    {/* Terminal con revisión manual: canal de soporte destacado (sin reintento). */}
                    {outcome?.kind === 'terminal' && outcome.support && (
                        <a
                            href={SUPPORT_MAILTO}
                            className="inline-flex h-11 items-center justify-center rounded-control bg-sport-500 px-6 text-sm font-semibold text-white transition-colors hover:bg-sport-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                        >
                            Escribir a soporte
                        </a>
                    )}

                    {/* Desenlaces terminales / pending llevan a la suscripción; polling y retry a reactivación. */}
                    {outcome && outcome.kind !== 'retry' ? (
                        <Link
                            href="/coach/subscription"
                            className={
                                outcome.kind === 'pending'
                                    ? 'inline-flex h-11 items-center justify-center rounded-control bg-sport-500 px-6 text-sm font-semibold text-white transition-colors hover:bg-sport-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2'
                                    : 'inline-flex h-11 items-center justify-center rounded-control border border-default px-6 text-sm font-semibold text-strong hover:bg-surface-sunken transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2'
                            }
                        >
                            Ir a mi suscripción
                        </Link>
                    ) : (
                        <Link
                            href="/coach/reactivate"
                            className="inline-flex h-11 items-center justify-center rounded-control border border-default px-6 text-sm font-semibold text-strong hover:bg-surface-sunken transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                        >
                            Ir a reactivación
                        </Link>
                    )}
                </div>
            </div>
        </main>
    )
}
