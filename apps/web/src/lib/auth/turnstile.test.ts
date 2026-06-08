import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    vi.stubEnv('TURNSTILE_SECRET_KEY', 'test-secret')
})

afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
})

const { verifyTurnstile } = await import('./turnstile')

function mockFetch(body: object, ok = true) {
    vi.mocked(fetch).mockResolvedValueOnce({
        ok,
        json: () => Promise.resolve(body),
    } as Response)
}

describe('verifyTurnstile', () => {
    it('returns true on success response', async () => {
        mockFetch({ success: true })
        expect(await verifyTurnstile('valid-token', '1.2.3.4')).toBe(true)
    })

    it('returns false on failure response', async () => {
        mockFetch({ success: false })
        expect(await verifyTurnstile('bad-token', '1.2.3.4')).toBe(false)
    })

    it('returns false when token absent regardless of failCount', async () => {
        // Absent token always fails — fail-open is only for service outage (network/secret errors).
        // The caller (server action) gates captcha at failCount >= CAPTCHA_THRESHOLD.
        expect(await verifyTurnstile(null, null, { failCount: 0 })).toBe(false)
        expect(await verifyTurnstile(undefined, null, { failCount: 0 })).toBe(false)
        expect(fetch).not.toHaveBeenCalled()
    })

    it('fails open on network error when failCount < failOpenMax', async () => {
        vi.mocked(fetch).mockRejectedValueOnce(new Error('network'))
        expect(await verifyTurnstile('token', null, { failCount: 0 })).toBe(true)
    })

    it('fails closed on network error when failCount >= failOpenMax', async () => {
        vi.mocked(fetch).mockRejectedValueOnce(new Error('network'))
        expect(await verifyTurnstile('token', null, { failCount: 5, failOpenMax: 5 })).toBe(false)
    })

    it('passes remoteip when ip provided', async () => {
        mockFetch({ success: true })
        await verifyTurnstile('token', '10.0.0.1')
        const body = await (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body.text?.()
            ?? (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body.toString()
        expect(body).toContain('remoteip')
    })

    it('fails open when TURNSTILE_SECRET_KEY not set', async () => {
        vi.unstubAllEnvs()
        expect(await verifyTurnstile('token', null)).toBe(true)
        expect(fetch).not.toHaveBeenCalled()
    })
})
