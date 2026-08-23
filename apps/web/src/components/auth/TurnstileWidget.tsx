'use client'

import * as React from 'react'
import Script from 'next/script'

/**
 * Montaje único de Cloudflare Turnstile para la web.
 *
 * POR QUÉ EXISTE (Sentry EVA-NEXTJS-1H / 1J, 2026-08-23). Los montajes previos —`/register` y
 * `CaptchaSlot`— usaban render IMPLÍCITO (`class="cf-turnstile"` + `data-*`) sin un solo callback.
 * Cuando el challenge fallaba (600010, típico en la WebView de Instagram por donde entra el tráfico
 * de ads) pasaba la cadena completa: el `TurnstileError` quedaba SIN MANEJAR y llegaba a Sentry como
 * `handled: no`, el input `cf-turnstile-response` se quedaba vacío, y el submit moría en el server
 * con «Verificación de seguridad requerida. Recarga la página…» — el coach perdía el formulario.
 *
 * POR QUÉ RENDER EXPLÍCITO Y NO IMPLÍCITO. En render implícito los callbacks se declaran como
 * NOMBRES DE FUNCIONES GLOBALES (`data-error-callback="miFuncion"`), según
 * https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/widget-configurations/
 * Eso obliga a colgar funciones de `window` con nombres únicos por instancia y a limpiarlas al
 * desmontar: más piezas móviles y más frágil dentro de React que pasar closures directas. Además
 * `turnstile.render()` devuelve un `widgetId`, que es justo lo que habilita el `reset()` del botón
 * «Reintentar» de la UI. Simple y robusto le gana a elegante.
 */

/** Estado del captcha visto desde React. Lo alimentan los callbacks del widget. */
export type CaptchaState = 'pending' | 'ok' | 'error'

export interface TurnstileHandle {
    /** Descarta el token actual y vuelve a correr el challenge. */
    reset: () => void
}

/**
 * Opciones de `turnstile.render()`. Los nombres con guion son los de Cloudflare tal cual: la API
 * explícita usa las MISMAS claves que los `data-*`, sin el prefijo (`data-error-callback` →
 * `error-callback`).
 */
type TurnstileRenderOptions = {
    sitekey: string
    theme?: 'auto' | 'light' | 'dark'
    size?: 'normal' | 'flexible' | 'compact'
    appearance?: 'always' | 'execute' | 'interaction-only'
    'response-field-name'?: string
    retry?: 'auto' | 'never'
    'retry-interval'?: number
    'refresh-expired'?: 'auto' | 'manual' | 'never'
    'refresh-timeout'?: 'auto' | 'manual' | 'never'
    callback?: (token: string) => void
    'error-callback'?: (code?: string) => void
    'expired-callback'?: () => void
    'timeout-callback'?: () => void
}

interface TurnstileApi {
    ready?: (callback: () => void) => void
    render: (container: HTMLElement, options: TurnstileRenderOptions) => string | undefined
    reset: (widgetId?: string) => void
    remove: (widgetId?: string) => void
}

declare global {
    interface Window {
        turnstile?: TurnstileApi
    }
}

/** ~20 s sondeando por `window.turnstile` antes de rendirse (200 ms × 100). */
const BOOT_POLL_MS = 200
const BOOT_MAX_ATTEMPTS = 100

interface TurnstileWidgetProps {
    siteKey: string
    theme?: 'auto' | 'light' | 'dark'
    size?: 'normal' | 'flexible' | 'compact'
    appearance?: 'always' | 'execute' | 'interaction-only'
    /** Nombre del input oculto que lleva el token (default de Cloudflare: `cf-turnstile-response`). */
    responseFieldName?: string
    className?: string
    /** Se llama con cada transición de estado reportada por el widget. */
    onStateChange?: (state: CaptchaState) => void
    ref?: React.Ref<TurnstileHandle>
}

export function TurnstileWidget({
    siteKey,
    theme = 'auto',
    size,
    appearance,
    responseFieldName,
    className,
    onStateChange,
    ref,
}: TurnstileWidgetProps) {
    const containerRef = React.useRef<HTMLDivElement | null>(null)
    const widgetIdRef = React.useRef<string | null>(null)

    // El consumidor puede pasar una closure nueva en cada render; guardarla en un ref evita
    // re-montar el widget (y perder el token) por un cambio de identidad de la función.
    const onStateChangeRef = React.useRef(onStateChange)
    React.useEffect(() => {
        onStateChangeRef.current = onStateChange
    }, [onStateChange])

    React.useImperativeHandle(
        ref,
        () => ({
            reset: () => {
                const widgetId = widgetIdRef.current
                if (!widgetId || !window.turnstile) return
                try {
                    window.turnstile.reset(widgetId)
                } catch (error) {
                    // Nunca lanzar desde acá: el reset lo dispara un botón de la UI.
                    console.warn('[turnstile] reset falló', error)
                }
            },
        }),
        []
    )

    React.useEffect(() => {
        let cancelled = false
        let pollId: ReturnType<typeof setInterval> | undefined
        let attempts = 0

        const emit = (next: CaptchaState) => {
            if (!cancelled) onStateChangeRef.current?.(next)
        }

        const renderWidget = () => {
            const container = containerRef.current
            const api = window.turnstile
            if (cancelled || !container || !api || widgetIdRef.current) return
            try {
                const widgetId = api.render(container, {
                    sitekey: siteKey,
                    theme,
                    ...(size ? { size } : {}),
                    ...(appearance ? { appearance } : {}),
                    ...(responseFieldName ? { 'response-field-name': responseFieldName } : {}),
                    // Los tres son el default documentado de Cloudflare; van explícitos para que el
                    // comportamiento no dependa de que ese default no cambie río arriba.
                    // `retry: auto` reintenta el challenge fallido solo (intervalo default: 8000 ms);
                    // `refresh-expired`/`refresh-timeout: auto` piden token nuevo sin intervención.
                    retry: 'auto',
                    'refresh-expired': 'auto',
                    'refresh-timeout': 'auto',
                    callback: () => emit('ok'),
                    'error-callback': (code) => {
                        // No relanzar ni tirar: devolver sin excepción es lo que convierte el
                        // 600010 en un error MANEJADO. Queda el rastro en consola para triage.
                        console.warn('[turnstile] challenge falló', code ?? 'sin código')
                        emit('error')
                    },
                    'expired-callback': () => emit('pending'),
                    'timeout-callback': () => emit('pending'),
                })
                widgetIdRef.current = widgetId ?? null
            } catch (error) {
                console.warn('[turnstile] render falló', error)
                emit('error')
            }
        }

        const boot = () => {
            const api = window.turnstile
            if (!api) return false
            // NUNCA `api.ready()` acá (Sentry EVA-NEXTJS-1K): con el script async (next/script),
            // Cloudflare LANZA «Remove async/defer … before using turnstile.ready()». Si
            // `window.turnstile` ya existe, api.js terminó de evaluarse y `render()` es seguro.
            renderWidget()
            return true
        }

        if (!boot()) {
            // El `<Script>` de abajo puede resolverse después del montaje, y `onLoad`/`onReady` de
            // next/script no vuelve a disparar si el script ya venía cargado desde otra ruta. El
            // sondeo cubre los dos casos sin depender del ciclo de vida del loader.
            pollId = setInterval(() => {
                attempts += 1
                if (boot() || attempts >= BOOT_MAX_ATTEMPTS) {
                    if (pollId) clearInterval(pollId)
                    pollId = undefined
                    // Script bloqueado (adblock, WebView sin red): mejor un estado de error que la
                    // UI esperando para siempre un token que no va a llegar.
                    if (attempts >= BOOT_MAX_ATTEMPTS && !widgetIdRef.current) {
                        console.warn('[turnstile] el script no cargó; captcha no disponible')
                        emit('error')
                    }
                }
            }, BOOT_POLL_MS)
        }

        return () => {
            cancelled = true
            if (pollId) clearInterval(pollId)
            const widgetId = widgetIdRef.current
            widgetIdRef.current = null
            if (widgetId && window.turnstile) {
                try {
                    window.turnstile.remove(widgetId)
                } catch {
                    // El widget ya no existe (navegación rápida). Nada que limpiar.
                }
            }
        }
    }, [siteKey, theme, size, appearance, responseFieldName])

    return (
        <>
            {/* `render=explicit` evita que api.js escanee y monte solo los `.cf-turnstile` del DOM:
                acá el montaje lo hace el efecto de arriba. */}
            <Script
                src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
                strategy="afterInteractive"
            />
            <div ref={containerRef} className={className} />
        </>
    )
}
