import { renderHook } from '@testing-library/react'
import { PostHogProvider } from 'posthog-js/react'
import { describe, expect, it, vi } from 'vitest'
import { useIdentifyCoach } from './events'

/**
 * SEC-01 (05-09) — property de rol en personas de PostHog. Antes solo viajaba
 * `platform: 'coach'`, que ya usan OTROS eventos con otro significado (`web`/`ios`/`android`).
 * `role: 'coach'` es la propiedad nueva y estable para segmentar personas coach vs alumno.
 */

function fakePostHog() {
    return { identify: vi.fn(), capture: vi.fn() } as unknown as import('posthog-js').PostHog
}

function wrapper(ph: ReturnType<typeof fakePostHog>) {
    function Wrapper({ children }: { children: React.ReactNode }) {
        return <PostHogProvider client={ph}>{children}</PostHogProvider>
    }
    return Wrapper
}

describe('useIdentifyCoach — role (SEC-01)', () => {
    it('con consentimiento: identifica con tier, platform:coach y role:coach', () => {
        const ph = fakePostHog()
        const { result } = renderHook(() => useIdentifyCoach(), { wrapper: wrapper(ph) })

        result.current('coach-1', 'pro', true)

        expect(ph.identify).toHaveBeenCalledTimes(1)
        expect(ph.identify).toHaveBeenCalledWith('coach-1', {
            tier: 'pro',
            platform: 'coach',
            role: 'coach',
        })
    })

    it('sin consentimiento: no identifica (no-op, Ley 21.719)', () => {
        const ph = fakePostHog()
        const { result } = renderHook(() => useIdentifyCoach(), { wrapper: wrapper(ph) })

        result.current('coach-1', 'pro', false)

        expect(ph.identify).not.toHaveBeenCalled()
    })
})
