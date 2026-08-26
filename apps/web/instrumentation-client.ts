import * as Sentry from '@sentry/nextjs'

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
