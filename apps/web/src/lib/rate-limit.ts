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
let signupRatelimit: Ratelimit | null | undefined
let paymentRatelimit: Ratelimit | null | undefined
let recipesRatelimit: Ratelimit | null | undefined
let coachSearchRatelimit: Ratelimit | null | undefined
let adminRatelimit: Ratelimit | null | undefined
let coachOnboardingEventsRatelimit: Ratelimit | null | undefined
let supportRatelimit: Ratelimit | null | undefined
let exerciseMediaUploadRatelimit: Ratelimit | null | undefined
let exerciseMediaUploadIpRatelimit: Ratelimit | null | undefined

function getAuthRatelimit(): Ratelimit | null {
    if (authRatelimit !== undefined) return authRatelimit
    const redis = redisFromEnv()
    if (!redis) {
        authRatelimit = null
        return null
    }
    authRatelimit = new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(20, '1 m'),
        prefix: 'ratelimit:auth',
    })
    return authRatelimit
}

function getSignupRatelimit(): Ratelimit | null {
    if (signupRatelimit !== undefined) return signupRatelimit
    const redis = redisFromEnv()
    if (!redis) {
        signupRatelimit = null
        return null
    }
    signupRatelimit = new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(5, '1 h'),
        prefix: 'ratelimit:signup',
    })
    return signupRatelimit
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
    // CF-Connecting-IP is the real client IP when Cloudflare is proxying
    const cfIp = request.headers.get('cf-connecting-ip')
    if (cfIp) return cfIp.trim()
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

export async function rateLimitSignup(
    identifier: string
): Promise<{ ok: true } | { ok: false; retryAfter: number }> {
    const limiter = getSignupRatelimit()
    if (!limiter) return { ok: true }
    const res = await limiter.limit(`signup:${identifier}`)
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

function getCoachSearchRatelimit(): Ratelimit | null {
    if (coachSearchRatelimit !== undefined) return coachSearchRatelimit
    const redis = redisFromEnv()
    if (!redis) {
        coachSearchRatelimit = null
        return null
    }
    coachSearchRatelimit = new Ratelimit({
        redis,
        // 60/min: la búsqueda global es incremental (debounce ~250ms) → ventana generosa para el
        // tecleo legítimo de un coach, sin abrir la puerta a scraping del workspace.
        limiter: Ratelimit.slidingWindow(60, '1 m'),
        prefix: 'ratelimit:coach-search',
    })
    return coachSearchRatelimit
}

/** fail-OPEN (espeja rateLimitRecipesSearch): sin Redis permite; la búsqueda es lectura scopeada. */
export async function rateLimitCoachSearch(
    identifier: string
): Promise<{ ok: true } | { ok: false; retryAfter: number }> {
    const limiter = getCoachSearchRatelimit()
    if (!limiter) return { ok: true }
    const res = await limiter.limit(`coach-search:${identifier}`)
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

let inviteAcceptRatelimit: Ratelimit | null | undefined
let orgCreationRatelimit: Ratelimit | null | undefined

function getInviteAcceptRatelimit(): Ratelimit | null {
    if (inviteAcceptRatelimit !== undefined) return inviteAcceptRatelimit
    const redis = redisFromEnv()
    if (!redis) { inviteAcceptRatelimit = null; return null }
    inviteAcceptRatelimit = new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(10, '1 h'),
        prefix: 'ratelimit:invite-accept',
    })
    return inviteAcceptRatelimit
}

function getOrgCreationRatelimit(): Ratelimit | null {
    if (orgCreationRatelimit !== undefined) return orgCreationRatelimit
    const redis = redisFromEnv()
    if (!redis) { orgCreationRatelimit = null; return null }
    orgCreationRatelimit = new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(3, '1 d'),
        prefix: 'ratelimit:org-creation',
    })
    return orgCreationRatelimit
}

/** fail-CLOSED: bloquea si Redis no responde (endpoint sensible a abuso) */
export async function rateLimitInviteAccept(
    identifier: string
): Promise<{ ok: true } | { ok: false; retryAfter: number }> {
    const limiter = getInviteAcceptRatelimit()
    if (!limiter) return { ok: false, retryAfter: 3600 }
    try {
        const res = await limiter.limit(`invite-accept:${identifier}`)
        await res.pending.catch(() => undefined)
        if (res.success) return { ok: true }
        return { ok: false, retryAfter: Math.max(1, Math.ceil((res.reset - Date.now()) / 1000)) }
    } catch {
        return { ok: false, retryAfter: 3600 }
    }
}

/** fail-OPEN: permite si Redis no responde (bloquear creación org por caída Redis es peor) */
export async function rateLimitOrgCreation(
    identifier: string
): Promise<{ ok: true } | { ok: false; retryAfter: number }> {
    const limiter = getOrgCreationRatelimit()
    if (!limiter) return { ok: true }
    try {
        const res = await limiter.limit(`org-creation:${identifier}`)
        await res.pending.catch(() => undefined)
        if (res.success) return { ok: true }
        return { ok: false, retryAfter: Math.max(1, Math.ceil((res.reset - Date.now()) / 1000)) }
    } catch {
        return { ok: true }
    }
}

let cardChangeRatelimit: Ratelimit | null | undefined

function getCardChangeRatelimit(): Ratelimit | null {
    if (cardChangeRatelimit !== undefined) return cardChangeRatelimit
    const redis = redisFromEnv()
    if (!redis) { cardChangeRatelimit = null; return null }
    cardChangeRatelimit = new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(5, '1 h'),
        prefix: 'ratelimit:card-change',
    })
    return cardChangeRatelimit
}

/**
 * fail-CLOSED: bloquea si Redis no responde. El endpoint de cambio de tarjeta opera sobre
 * el instrumento de pago de una suscripción → blanco de token-grinding/enumeración; preferimos
 * negar antes que dejar pasar por una caída de Redis (a diferencia de rateLimitPayment, que es
 * fail-open). 5/hora por coach: ventana generosa para el reintento legítimo de un coach con la
 * tarjeta vencida (plan P0-5). Espeja rateLimitInviteAccept.
 */
export async function rateLimitCardChange(
    identifier: string
): Promise<{ ok: true } | { ok: false; retryAfter: number }> {
    const limiter = getCardChangeRatelimit()
    if (!limiter) return { ok: false, retryAfter: 3600 }
    try {
        const res = await limiter.limit(`card-change:${identifier}`)
        await res.pending.catch(() => undefined)
        if (res.success) return { ok: true }
        return { ok: false, retryAfter: Math.max(1, Math.ceil((res.reset - Date.now()) / 1000)) }
    } catch {
        return { ok: false, retryAfter: 3600 }
    }
}

let couponRedeemRatelimit: Ratelimit | null | undefined
let couponRedeemIpRatelimit: Ratelimit | null | undefined

function getCouponRedeemRatelimit(): Ratelimit | null {
    if (couponRedeemRatelimit !== undefined) return couponRedeemRatelimit
    const redis = redisFromEnv()
    if (!redis) { couponRedeemRatelimit = null; return null }
    couponRedeemRatelimit = new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(10, '1 h'),
        prefix: 'ratelimit:coupon-redeem',
    })
    return couponRedeemRatelimit
}

function getCouponRedeemIpRatelimit(): Ratelimit | null {
    if (couponRedeemIpRatelimit !== undefined) return couponRedeemIpRatelimit
    const redis = redisFromEnv()
    if (!redis) { couponRedeemIpRatelimit = null; return null }
    couponRedeemIpRatelimit = new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(5, '1 h'),
        prefix: 'ratelimit:coupon-redeem-ip',
    })
    return couponRedeemIpRatelimit
}

/**
 * fail-CLOSED (espeja rateLimitCardChange): el canje de cupón mueve dinero (baja el precio del
 * preapproval) → blanco de enumeración de códigos. Negamos antes que dejar pasar por una caída de
 * Redis. Enforce de AMBAS llaves: 10/hora por coach + 5/hora por IP (ambas deben pasar).
 */
export async function rateLimitCouponRedeem(
    coachId: string,
    ip: string
): Promise<{ ok: true } | { ok: false; retryAfter: number }> {
    const coachLimiter = getCouponRedeemRatelimit()
    const ipLimiter = getCouponRedeemIpRatelimit()
    if (!coachLimiter || !ipLimiter) return { ok: false, retryAfter: 3600 }
    try {
        const [coachRes, ipRes] = await Promise.all([
            coachLimiter.limit(`coupon-redeem:${coachId}`),
            ipLimiter.limit(`coupon-redeem-ip:${ip}`),
        ])
        await Promise.all([
            coachRes.pending.catch(() => undefined),
            ipRes.pending.catch(() => undefined),
        ])
        if (coachRes.success && ipRes.success) return { ok: true }
        const reset = Math.max(coachRes.success ? 0 : coachRes.reset, ipRes.success ? 0 : ipRes.reset)
        return { ok: false, retryAfter: Math.max(1, Math.ceil((reset - Date.now()) / 1000)) }
    } catch {
        return { ok: false, retryAfter: 3600 }
    }
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

// ── Exercise media upload rate limiters ───────────────────────────────────────

function getExerciseMediaUploadRatelimit(): Ratelimit | null {
    if (exerciseMediaUploadRatelimit !== undefined) return exerciseMediaUploadRatelimit
    const redis = redisFromEnv()
    if (!redis) { exerciseMediaUploadRatelimit = null; return null }
    exerciseMediaUploadRatelimit = new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(30, '1 h'),
        prefix: 'ratelimit:exercise-media-upload-coach',
    })
    return exerciseMediaUploadRatelimit
}

function getExerciseMediaUploadIpRatelimit(): Ratelimit | null {
    if (exerciseMediaUploadIpRatelimit !== undefined) return exerciseMediaUploadIpRatelimit
    const redis = redisFromEnv()
    if (!redis) { exerciseMediaUploadIpRatelimit = null; return null }
    exerciseMediaUploadIpRatelimit = new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(100, '1 h'),
        prefix: 'ratelimit:exercise-media-upload-ip',
    })
    return exerciseMediaUploadIpRatelimit
}

/** fail-OPEN: permite si Redis no responde. 30 uploads/hora por coach. */
export async function rateLimitExerciseMediaUpload(
    coachId: string
): Promise<{ ok: true } | { ok: false; retryAfter: number }> {
    const limiter = getExerciseMediaUploadRatelimit()
    if (!limiter) return { ok: true }
    try {
        const res = await limiter.limit(`exercise-media:${coachId}`)
        await res.pending.catch(() => undefined)
        if (res.success) return { ok: true }
        return { ok: false, retryAfter: Math.max(1, Math.ceil((res.reset - Date.now()) / 1000)) }
    } catch {
        return { ok: true }
    }
}

/** fail-OPEN: permite si Redis no responde. 100 uploads/hora por IP. */
export async function rateLimitExerciseMediaUploadByIp(
    ip: string
): Promise<{ ok: true } | { ok: false; retryAfter: number }> {
    const limiter = getExerciseMediaUploadIpRatelimit()
    if (!limiter) return { ok: true }
    try {
        const res = await limiter.limit(`exercise-media-ip:${ip}`)
        await res.pending.catch(() => undefined)
        if (res.success) return { ok: true }
        return { ok: false, retryAfter: Math.max(1, Math.ceil((res.reset - Date.now()) / 1000)) }
    } catch {
        return { ok: true }
    }
}
