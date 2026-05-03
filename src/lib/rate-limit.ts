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
let recipesRatelimit: Ratelimit | null | undefined
let adminRatelimit: Ratelimit | null | undefined
let coachOnboardingEventsRatelimit: Ratelimit | null | undefined
let supportRatelimit: Ratelimit | null | undefined

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

function getRecipesRatelimit(): Ratelimit | null {
    if (recipesRatelimit !== undefined) return recipesRatelimit
    const redis = redisFromEnv()
    if (!redis) {
        recipesRatelimit = null
        return null
    }
    recipesRatelimit = new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(30, '1 m'),
        prefix: 'ratelimit:recipes',
    })
    return recipesRatelimit
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

export async function rateLimitRecipesSearch(
    identifier: string
): Promise<{ ok: true } | { ok: false; retryAfter: number }> {
    const limiter = getRecipesRatelimit()
    if (!limiter) return { ok: true }
    const res = await limiter.limit(`recipes:${identifier}`)
    await res.pending.catch(() => undefined)
    if (res.success) return { ok: true }
    const retryAfter = Math.max(1, Math.ceil((res.reset - Date.now()) / 1000))
    return { ok: false, retryAfter }
}

function getAdminRatelimit(): Ratelimit | null {
    if (adminRatelimit !== undefined) return adminRatelimit
    const redis = redisFromEnv()
    if (!redis) {
        adminRatelimit = null
        return null
    }
    adminRatelimit = new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(20, '1 m'),
        prefix: 'ratelimit:admin',
    })
    return adminRatelimit
}

function getCoachOnboardingEventsRatelimit(): Ratelimit | null {
    if (coachOnboardingEventsRatelimit !== undefined) return coachOnboardingEventsRatelimit
    const redis = redisFromEnv()
    if (!redis) {
        coachOnboardingEventsRatelimit = null
        return null
    }
    coachOnboardingEventsRatelimit = new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(48, '1 m'),
        prefix: 'ratelimit:coach-onboarding-events',
    })
    return coachOnboardingEventsRatelimit
}

function getSupportRatelimit(): Ratelimit | null {
    if (supportRatelimit !== undefined) return supportRatelimit
    const redis = redisFromEnv()
    if (!redis) {
        supportRatelimit = null
        return null
    }
    supportRatelimit = new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(5, '1 h'),
        prefix: 'ratelimit:support',
    })
    return supportRatelimit
}

/** Límite por coach autenticado (evita spam de eventos de onboarding / re-renders). */
export async function rateLimitCoachOnboardingEvents(
    coachUserId: string
): Promise<{ ok: true } | { ok: false; retryAfter: number }> {
    const limiter = getCoachOnboardingEventsRatelimit()
    if (!limiter) return { ok: true }
    const res = await limiter.limit(`coach-onboarding:${coachUserId}`)
    await res.pending.catch(() => undefined)
    if (res.success) return { ok: true }
    const retryAfter = Math.max(1, Math.ceil((res.reset - Date.now()) / 1000))
    return { ok: false, retryAfter }
}

export async function rateLimitAdmin(
    identifier: string
): Promise<{ ok: true } | { ok: false; retryAfter: number }> {
    const limiter = getAdminRatelimit()
    if (!limiter) return { ok: true }
    const res = await limiter.limit(`admin:${identifier}`)
    await res.pending.catch(() => undefined)
    if (res.success) return { ok: true }
    const retryAfter = Math.max(1, Math.ceil((res.reset - Date.now()) / 1000))
    return { ok: false, retryAfter }
}

export async function rateLimitSupport(
    identifier: string
): Promise<{ ok: true } | { ok: false; retryAfter: number }> {
    const limiter = getSupportRatelimit()
    if (!limiter) return { ok: true }
    const res = await limiter.limit(`support:${identifier}`)
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
