import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { MODULE_KEYS, isModuleKilledByOperator } from '@/services/entitlements.service'

/**
 * Config operacional para el cliente mobile (flags server-only que RN no puede leer).
 *
 * - `disabledModules`: MODULE_KEYS apagados por el kill-switch de operador
 *   (env `EVA_DISABLED_MODULES`). El mobile lee `coaches.enabled_modules` directo por
 *   PostgREST y NO ve esta env → sin esto, un modulo killeado seguiria visible/usable en
 *   mobile por encima del entitlement. El gate de DINERO (escritura) ya vive server-side en
 *   los endpoints /api/mobile/* (assertModule, que aplica el kill-switch); esto es para que la
 *   UI mobile espeje la web (no mostrar superficie killeada).
 * - `featurePrefsEnabled`: flag Edge Config `FEATURE_PREFS_ENABLED` (fail-OPEN, igual que web:
 *   ausente/false/Edge caido => las prefs se IGNORAN = mostrar todo lo entitled). El gating
 *   por-alumno de la Zona C de nutricion en mobile solo se aplica cuando esto es true.
 *
 * GET con Bearer (no expone datos sensibles, pero reusa el patron auth del resto de /api/mobile).
 */

function bearerToken(request: NextRequest): string | null {
    const auth = request.headers.get('authorization') || request.headers.get('Authorization')
    if (!auth?.startsWith('Bearer ')) return null
    return auth.slice('Bearer '.length).trim() || null
}

/** Lee FEATURE_PREFS_ENABLED de Edge Config. Fail-OPEN: cualquier fallo => false (= mostrar todo). */
async function readFeaturePrefsEnabled(): Promise<boolean> {
    if (!process.env.EDGE_CONFIG) return false
    try {
        const { get } = await import('@vercel/edge-config')
        return (await get<boolean>('FEATURE_PREFS_ENABLED')) === true
    } catch {
        return false
    }
}

export async function GET(request: NextRequest) {
    const token = bearerToken(request)
    if (!token) return NextResponse.json({ error: 'Unauthorized', code: 'MISSING_TOKEN' }, { status: 401 })

    const admin = createServiceRoleClient()
    const { data: ud, error: uerr } = await admin.auth.getUser(token)
    if (uerr || !ud.user) return NextResponse.json({ error: 'Unauthorized', code: 'INVALID_TOKEN' }, { status: 401 })

    const disabledModules = MODULE_KEYS.filter((k) => isModuleKilledByOperator(k))
    const featurePrefsEnabled = await readFeaturePrefsEnabled()

    return NextResponse.json({ disabledModules, featurePrefsEnabled })
}
