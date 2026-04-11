import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

function redisFromEnv(): Redis | null {
    const url = process.env.UPSTASH_REDIS_REST_URL
    const token = process.env.UPSTASH_REDIS_REST_TOKEN
    if (!url || !token) return null
    return new Redis({ url, token })
}

let authRatelimit: Ratelimit | null | undefined
let paymentRatelimit: Ratelimit | null | undefined

function getAuthRatelimit(): Ratelimit | null {
    if (authRatelimit !== undefined) return authRatelimit
    const redis = redisFromEnv()
    if (!redis) {
        authRatelimit = null
        return null
    }
    authRatelimit = new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(40, '1 m'),
        prefix: 'ratelimit:auth',
    })
    return authRatelimit
}

function getPaymentRatelimit(): Ratelimit | null {
    if (paymentRatelimit !== undefined) return paymentRatelimit
    const redis = redisFromEnv()
    if (!redis) {
        paymentRatelimit = null
        return null
    }
    paymentRatelimit = new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(15, '1 m'),
        prefix: 'ratelimit:payment',
    })
    return paymentRatelimit
}

export function clientIpFromRequest(request: NextRequest | Request): string {
    const xf = request.headers.get('x-forwarded-for')
    if (xf) return xf.split(',')[0]!.trim()
    const realIp = request.headers.get('x-real-ip')
    if (realIp) return realIp.trim()
    return 'unknown'
}

export async function rateLimitAuth(
    identifier: string
): Promise<{ ok: true } | { ok: false; retryAfter: number }> {
    const limiter = getAuthRatelimit()
    if (!limiter) return { ok: true }
    const res = await limiter.limit(`auth:${identifier}`)
    await res.pending.catch(() => undefined)
    if (res.success) return { ok: true }
    const retryAfter = Math.max(1, Math.ceil((res.reset - Date.now()) / 1000))
    return { ok: false, retryAfter }
}

export async function rateLimitPayment(
    identifier: string
): Promise<{ ok: true } | { ok: false; retryAfter: number }> {
    const limiter = getPaymentRatelimit()
    if (!limiter) return { ok: true }
    const res = await limiter.limit(`pay:${identifier}`)
    await res.pending.catch(() => undefined)
    if (res.success) return { ok: true }
    const retryAfter = Math.max(1, Math.ceil((res.reset - Date.now()) / 1000))
    return { ok: false, retryAfter }
}

export function jsonRateLimited(retryAfter: number) {
    return NextResponse.json(
        { error: 'Too many requests', code: 'RATE_LIMIT' },
        {
            status: 429,
            headers: { 'Retry-After': String(retryAfter) },
        }
    )
}
