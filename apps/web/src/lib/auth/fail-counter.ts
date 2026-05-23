// Per-feature failed-auth attempt counter stored in cookies. Server-only.
// Used to gate captcha challenge after N failed login attempts.

import { cookies } from 'next/headers'

const MAX_AGE_SECONDS = 15 * 60 // 15 min
const COOKIE_PREFIX = 'eva_'

export type AuthFailFeature = 'coach' | 'org'

interface FeatureConfig {
    name: string
    path: string
}

const FEATURES: Record<AuthFailFeature, FeatureConfig> = {
    coach: { name: 'eva_auth_fails', path: '/login' },
    org: { name: 'eva_org_auth_fails', path: '/org/login' },
}

function featureConfig(feature: AuthFailFeature): FeatureConfig {
    const cfg = FEATURES[feature]
    if (!cfg) throw new Error(`Unknown auth fail feature: ${feature}`)
    if (!cfg.name.startsWith(COOKIE_PREFIX)) {
        throw new Error(`Cookie name must start with ${COOKIE_PREFIX}`)
    }
    return cfg
}

export async function readFailCount(feature: AuthFailFeature): Promise<number> {
    const { name } = featureConfig(feature)
    const store = await cookies()
    const raw = store.get(name)?.value
    if (!raw) return 0
    const n = Number.parseInt(raw, 10)
    return Number.isFinite(n) && n > 0 ? n : 0
}

export async function incrementFailCount(feature: AuthFailFeature): Promise<number> {
    const cfg = featureConfig(feature)
    const store = await cookies()
    const current = await readFailCount(feature)
    const next = current + 1
    store.set({
        name: cfg.name,
        value: String(next),
        path: cfg.path,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: MAX_AGE_SECONDS,
    })
    return next
}

export async function clearFailCount(feature: AuthFailFeature): Promise<void> {
    const cfg = featureConfig(feature)
    const store = await cookies()
    store.set({
        name: cfg.name,
        value: '',
        path: cfg.path,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 0,
    })
}

export const CAPTCHA_THRESHOLD = 3
