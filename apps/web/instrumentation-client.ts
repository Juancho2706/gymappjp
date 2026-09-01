import * as Sentry from '@sentry/nextjs'

// ── Recuperación del skew de deploy en Server Actions (FCN W3.12) ────────────────────────────────
//
// Sentry EVA-NEXTJS-19 «Failed to find Server Action»: la pestaña la sirvió un deploy y el POST del
// formulario cae en el siguiente, que ya no conoce ese id de acción. Le pega a quien tenía la
// pantalla abierta cuando sale un deploy — y `/register` es la pantalla con más tráfico pagado del
// producto, así que el coach que llegó del ad y estaba tipeando pierde el alta entera.
//
// La cura es RECARGAR: la recarga trae los ids del deploy nuevo y el navegador restaura los campos
// del formulario. UNA sola vez por pestaña, con guard en `sessionStorage`: si el error se repite (un
// deploy realmente roto) el bucle de recargas sería peor que el error.
const SERVER_ACTION_SKEW = /Failed to find Server Action/i
const SKEW_RELOAD_GUARD = 'eva:server-action-skew-reloaded'

/** Espera corta antes de recargar para que el evento de Sentry alcance a salir. */
const SKEW_RELOAD_DELAY_MS = 300

function messageOf(value: unknown): string | null {
    if (typeof value === 'string') return value
    if (value instanceof Error) return value.message
    if (value && typeof value === 'object' && typeof (value as { message?: unknown }).message === 'string') {
        return (value as { message: string }).message
    }
    return null
}

function recoverFromServerActionSkew(raw: unknown): void {
    const message = messageOf(raw)
    if (!message || !SERVER_ACTION_SKEW.test(message)) return
    try {
        if (window.sessionStorage.getItem(SKEW_RELOAD_GUARD)) return
        window.sessionStorage.setItem(SKEW_RELOAD_GUARD, '1')
    } catch {
        // Storage bloqueado (Safari privado, cookies de terceros): sin guard NO se recarga. Un
        // formulario perdido es reparable; un bucle de recargas, no.
        return
    }
    window.setTimeout(() => window.location.reload(), SKEW_RELOAD_DELAY_MS)
}

// Los dos caminos por los que llega: excepción suelta (React 19 reporta las no capturadas con
// `reportError`, que dispara un ErrorEvent) y promesa rechazada (la acción invocada a mano).
if (typeof window !== 'undefined') {
    window.addEventListener('error', (event) => recoverFromServerActionSkew(event.error ?? event.message))
    window.addEventListener('unhandledrejection', (event) => recoverFromServerActionSkew(event.reason))
}

Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? 'development',
    tracesSampleRate: 0.1,
    ignoreErrors: [
        'ResizeObserver loop limit exceeded',
        // Telemetría del navegador in-app de Instagram/Facebook (script inyectado
        // `navigation_performance_logger_*`): vacía métricas al host nativo en `beforeunload`/
        // `pagehide` cuando el puente Java/WebKit ya murió. Cero código nuestro, y crece con cada
        // campaña de ads encendida.
        // OJO: `ignoreErrors` mira SOLO `event.message` y `${type}: ${value}` de la última
        // excepción — NUNCA el nombre ni el filename de los frames del stack. Por eso el filtro
        // anterior ('sendDataToNative', que existe únicamente como función del stack de Meta) era
        // INERTE: quedó deployado y los eventos siguieron entrando con ese mismo release.
        /Error invoking postMessage/, // EVA-NEXTJS-1F, -14, -1D (Android, @JavascriptInterface)
        /window\.webkit\.messageHandlers/, // EVA-NEXTJS-X (iOS, WKScriptMessageHandler)
        // Texto de Safari para un fetch abortado: el prefetch de un <Link> muere al navegar o al
        // mandar la pestaña a segundo plano. 91 eventos, 0 usuarios impactados.
        'Load failed',
        // EVA-NEXTJS-1M — extensión de navegador inyectada (familia Grammarly/Office): llega como
        // rejection sin stacktrace, en /privacidad, una página sin interactividad propia. Cero
        // usuarios impactados y cero código nuestro.
        // La regex describe la ESTRUCTURA COMPLETA del mensaje (los tres campos con sus tipos), no
        // un fragmento: `ignoreErrors` matchea por SUBSTRING, así que un patrón corto como
        // «Object Not Found» se tragaría errores propios que casualmente lo contengan.
        /Object Not Found Matching Id:\d+, MethodName:\w+, ParamCount:\d+/,
    ],
    // Cinturón para cualquier OTRA cosa que tire el logger inyectado de Meta: a diferencia de
    // `ignoreErrors`, `denyUrls` sí matchea el filename del stack. Ningún archivo nuestro se llama
    // así, así que en el peor caso queda inerte — nunca sobre-filtra.
    denyUrls: [/navigation_performance_logger/],
    // Next marca sus errores internos con `__NEXT_ERROR_CODE` (E394 «respuesta inválida» vs E715
    // «deploy skew», por ejemplo). Sin el tag caen los dos en el MISMO issue y hay que reabrir la
    // investigación cada vez para saber cuál es. Sólo etiqueta: no descarta ningún evento.
    beforeSend(event, hint) {
        const original: unknown = hint?.originalException
        // W3.12 — tercer camino, y el más confiable: si Sentry lo capturó (el issue existe, 15
        // eventos), pasa por acá aunque el error lo haya atrapado un error boundary de React y
        // nunca haya llegado a `window`. El evento se sigue reportando: esto solo agenda la
        // recarga. Idempotente por el guard de `sessionStorage`.
        recoverFromServerActionSkew(original ?? event.exception?.values?.[0]?.value ?? event.message)
        const code =
            original && typeof original === 'object' && '__NEXT_ERROR_CODE' in original
                ? (original as { __NEXT_ERROR_CODE?: unknown }).__NEXT_ERROR_CODE
                : undefined
        if (typeof code === 'string') {
            event.tags = { ...event.tags, next_error_code: code }
        }
        return event
    },
    // Sin registrar la integración, las dos tasas de replay de abajo eran INERTES:
    // replay no viene en los defaults de @sentry/nextjs y los errores llegaban sin
    // contexto (EVA-NEXTJS-16/17 sin un solo breadcrumb). Solo-en-error: costo cero
    // en sesiones sanas.
    integrations: [Sentry.replayIntegration()],
    replaysOnErrorSampleRate: 1.0,
    replaysSessionSampleRate: 0.0,
})

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
