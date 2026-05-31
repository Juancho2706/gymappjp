import * as Sentry from '@sentry/nextjs'

Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? 'development',
    tracesSampleRate: 0.1,
    ignoreErrors: ['ResizeObserver loop limit exceeded'],
    replaysOnErrorSampleRate: 1.0,
    replaysSessionSampleRate: 0.0,
})

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
