// Cloudflare Turnstile verification helper. Edge-compatible (uses global fetch).
// Docs: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'
const TIMEOUT_MS = 3000

export interface TurnstileVerifyOptions {
    /** Fail-open threshold. When current consecutive failures exceed this, we close instead. */
    failCount?: number
    /** Cap for fail-open behavior. Default 5. */
    failOpenMax?: number
}

/**
 * Verify a Cloudflare Turnstile token.
 *
 * Behavior on outage / missing secret:
 *  - If `failCount < failOpenMax` (default 5) → returns true (fail-open) so legit users
 *    aren't locked out when Cloudflare or env is misconfigured.
 *  - If `failCount >= failOpenMax` → returns false (fail-closed) to prevent abuse.
 *  - If token is empty/missing → returns false.
 */
export async function verifyTurnstile(
    token: string | undefined | null,
    ip: string | null,
    options: TurnstileVerifyOptions = {},
): Promise<boolean> {
    const { failCount = 0, failOpenMax = 5 } = options

    if (!token) return false

    const secret = process.env.TURNSTILE_SECRET_KEY
    if (!secret) {
        // Misconfigured env: fail-open up to threshold so dev/preview without secret still works.
        return failCount < failOpenMax
    }

    const body = new URLSearchParams()
    body.set('secret', secret)
    body.set('response', token)
    if (ip) body.set('remoteip', ip)

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

    try {
        const res = await fetch(VERIFY_URL, {
            method: 'POST',
            body,
            signal: controller.signal,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        })
        if (!res.ok) return failCount < failOpenMax
        const data = (await res.json()) as { success?: boolean }
        return data.success === true
    } catch {
        return failCount < failOpenMax
    } finally {
        clearTimeout(timer)
    }
}

export function getTurnstileSiteKey(): string | null {
    return process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? null
}
