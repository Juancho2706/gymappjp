import * as Sentry from '@sentry/nextjs'

Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? 'development',
    tracesSampleRate: 0.1,
    ignoreErrors: ['ResizeObserver loop limit exceeded'],
    // Sin registrar la integración, las dos tasas de replay de abajo eran INERTES:
    // replay no viene en los defaults de @sentry/nextjs y los errores llegaban sin
    // contexto (EVA-NEXTJS-16/17 sin un solo breadcrumb). Solo-en-error: costo cero
    // en sesiones sanas.
    integrations: [Sentry.replayIntegration()],
    replaysOnErrorSampleRate: 1.0,
    replaysSessionSampleRate: 0.0,
})

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
