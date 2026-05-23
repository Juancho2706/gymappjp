import * as Sentry from '@sentry/nextjs'

Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.VERCEL_ENV ?? 'development',
    tracesSampleRate: 0.1,
    ignoreErrors: ['ResizeObserver loop limit exceeded'],
})
