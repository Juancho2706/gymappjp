import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * SEC-01 (05-09) — super-property global `app_version` (commit corto de Vercel, `dev` fuera de
 * Vercel) + `platform: 'web'`, para poder medir cuánto tráfico sigue en un bundle viejo tras un
 * deploy. Van con `posthog.register()`, así que viajan en TODO evento (identify, pageview,
 * captura anónima pre-consentimiento incluida) sin depender del opt-in de cookies.
 */

const init = vi.fn()
const register = vi.fn()

vi.mock('posthog-js', () => ({
    default: {
        init: (...args: unknown[]) => init(...args),
        register: (...args: unknown[]) => register(...args),
        capture: vi.fn(),
        get_session_id: vi.fn(),
    },
}))

vi.mock('posthog-js/react', () => ({
    PostHogProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    usePostHog: () => undefined,
}))

vi.mock('next/navigation', () => ({
    usePathname: () => '/pricing',
    useSearchParams: () => new URLSearchParams(),
}))

vi.mock('./consent', () => ({
    applyConsent: vi.fn(),
    getStoredConsent: () => null,
}))

import { PostHogProvider } from './provider'

describe('PostHogProvider — super-properties globales (SEC-01)', () => {
    const ORIGINAL_ENV = { ...process.env }

    beforeEach(() => {
        vi.clearAllMocks()
        process.env.NEXT_PUBLIC_POSTHOG_TOKEN = 'phc_test_token'
    })

    afterEach(() => {
        process.env = { ...ORIGINAL_ENV }
    })

    it('registra app_version (commit corto) y platform:web junto al init', () => {
        process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA = 'abcdef1234567890'

        render(
            <PostHogProvider>
                <div>hijo</div>
            </PostHogProvider>,
        )

        expect(init).toHaveBeenCalledTimes(1)
        expect(register).toHaveBeenCalledTimes(1)
        expect(register).toHaveBeenCalledWith({ app_version: 'abcdef12', platform: 'web' })
    })

    it('fuera de Vercel (sin commit sha): cae a app_version "dev"', () => {
        delete process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA

        render(
            <PostHogProvider>
                <div>hijo</div>
            </PostHogProvider>,
        )

        expect(register).toHaveBeenCalledWith({ app_version: 'dev', platform: 'web' })
    })

    it('sin token: no inicializa ni registra nada', () => {
        delete process.env.NEXT_PUBLIC_POSTHOG_TOKEN

        render(
            <PostHogProvider>
                <div>hijo</div>
            </PostHogProvider>,
        )

        expect(init).not.toHaveBeenCalled()
        expect(register).not.toHaveBeenCalled()
    })
})
