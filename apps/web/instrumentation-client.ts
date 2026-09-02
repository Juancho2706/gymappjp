import * as Sentry from '@sentry/nextjs'
import { isDeploySkewError, shouldDropEvent, shouldReload } from '@/lib/deploy-skew'

// ── Recuperación del skew de deploy en Server Actions (FCN W3.12 + QA 02-09) ─────────────────────
//
// Sentry EVA-NEXTJS-3 / -19: la pestaña la sirvió un deploy y su siguiente Server Action cae en el
// deploy nuevo, que ya no conoce ese id. Next lo reporta de dos formas: `Failed to find Server
// Action` (el deploy nuevo responde pero no encuentra la acción) y, mucho más seguido, E394
// «An unexpected response was received from the server» (12 eventos en 7 días, en todas las
// releases, siempre por `onunhandledrejection`). Le pega a quien tenía la pantalla abierta cuando
// salió un deploy — `/register` es la pantalla con más tráfico pagado, así que el coach que llegó
// del ad y estaba tipeando pierde el alta entera. El plan de Vercel no tiene Skew Protection.
//
// La cura es RECARGAR: trae los ids del deploy nuevo y el navegador restaura los campos. UNA sola
// vez por ventana de 2 min y por pestaña (guard en `sessionStorage`, ver `lib/deploy-skew.ts`): si
// se repite es un deploy roto de verdad y el bucle de recargas sería peor que el error.

/**
 * Tope de espera del flush antes de recargar: lo único que tiene que salir es el mensaje
 * `deploy_skew_reload` (el error de skew se descarta). `Sentry.flush(ms)` resuelve APENAS el
 * transport vacía la cola — el tope sólo corta redes lentas, no se espera entero. Un `setTimeout`
 * ciego (lo que había) perdía el conteo que pide AC-J4 justo en las conexiones malas.
 */
const SKEW_RELOAD_FLUSH_MS = 400

/**
 * ¿Ya se agendó la recarga en esta pestaña? El guard de `sessionStorage` NO alcanza como señal para
 * `beforeSend`: los listeners de `window` corren primero y lo consumen (`shouldReload` escribe la
 * marca al devolver `true`), así que para cuando el MISMO error llega al hook de Sentry el guard ya
 * dice «no». Sin este flag, el E394 recuperado se reportaba igual: ruido duplicado (error + mensaje)
 * en vez de limpio. Es por pestaña y por carga, como la recarga misma.
 */
let reloadScheduled = false

function sessionStorageOrNull() {
    // Acceder a `sessionStorage` (no solo leerlo) tira en algunos navegadores con storage bloqueado.
    try {
        return typeof window === 'undefined' ? null : window.sessionStorage
    } catch {
        return null
    }
}

/** Devuelve true si agendó la recarga (y por lo tanto el error NO es del producto). */
function recoverFromDeploySkew(raw: unknown): boolean {
    if (!isDeploySkewError(raw)) return false
    // Sin storage (Safari privado, cookies de terceros) `shouldReload` devuelve false: sin guard NO
    // se recarga. Una acción perdida es reparable; un bucle de recargas, no.
    if (!shouldReload(Date.now(), sessionStorageOrNull())) return false
    reloadScheduled = true
    Sentry.addBreadcrumb({
        category: 'deploy-skew',
        level: 'info',
        message: 'Bundle desfasado del deploy vivo: se recarga la pestaña',
    })
    // Todo lo que habla con Sentry sale del stack actual (`setTimeout` 0): esta función también se
    // llama DESDE `beforeSend`, y capturar ahí adentro reentra en el hook — Sentry lo documenta
    // como puro. Hoy termina (el mensaje no matchea ningún patrón de skew), pero basta que alguien
    // meta «E394» en un texto para volverlo recursivo.
    window.setTimeout(() => {
        // Mensaje propio (nivel info, fingerprint fijo) para CONTAR las recargas sin ensuciar la
        // tasa de errores: todas caen en un único issue.
        Sentry.captureMessage('deploy_skew_reload', { level: 'info', fingerprint: ['deploy-skew-reload'] })
        // Recargar recién cuando el mensaje salió (o venció el tope): la recarga mata el transport.
        void Sentry.flush(SKEW_RELOAD_FLUSH_MS).finally(() => window.location.reload())
    }, 0)
    return true
}

// Los dos caminos por los que llega: excepción suelta (React 19 reporta las no capturadas con
// `reportError`, que dispara un ErrorEvent) y promesa rechazada (la acción invocada a mano). Si se
// agenda la recarga, `preventDefault()` evita además que el navegador lo loguee como rechazo sin
// manejar (el evento de Sentry lo filtra `beforeSend`, abajo).
if (typeof window !== 'undefined') {
    window.addEventListener('error', (event) => recoverFromDeploySkew(event.error ?? event.message))
    window.addEventListener('unhandledrejection', (event) => {
        if (recoverFromDeploySkew(event.reason)) event.preventDefault()
    })
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
        const raw = original ?? event.exception?.values?.[0]?.value ?? event.message
        // Camino 1 — el error ya lo agendó un listener de `window` (el caso DOMINANTE: E394 llega
        // por `onunhandledrejection`). Ahí el guard de `sessionStorage` ya está consumido, así que
        // la señal es el flag de módulo: se descarta el evento porque la recarga lo cura.
        if (shouldDropEvent(reloadScheduled, raw)) return null
        // Camino 2 — el error lo atrapó un error boundary de React y nunca llegó a `window`: acá es
        // donde se agenda. Si se agenda, el error NO se reporta (no es del producto: lo cuenta el
        // mensaje `deploy_skew_reload`); si NO se agenda (segunda vez en 2 min = deploy roto de
        // verdad, o storage bloqueado) se reporta como siempre.
        if (recoverFromDeploySkew(raw)) return null
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
