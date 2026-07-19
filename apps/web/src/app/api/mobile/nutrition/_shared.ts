import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { verifyMobileBearer, isBlockedClientRow } from '@/lib/mobile-auth'

/**
 * Helpers compartidos de los endpoints mobile de nutricion ALUMNO (micros + recap).
 *
 * A diferencia de `nutrition/exchanges/_shared` (token = COACH, escribe), aca el token es del
 * ALUMNO y todo es GET read-only: se usa `verifyMobileBearer` (JWT local con fallback a getUser,
 * igual que coach/dashboard). El `userId` verificado == `clients.id` (identidad legacy de EVA:
 * `clients.id = auth.uid()`), asi que es el `clientId` autoritativo.
 *
 * Las lecturas se hacen con service-role PERO SIEMPRE filtradas por ese `clientId`/`coachId`
 * verificado (nunca por un id del body), de modo que el resultado es identico al de la sesion
 * cookie del alumno en web. El gating de dinero (micros avanzados = modulo `nutrition_exchanges`)
 * vive server-side en `resolveFeaturePrefs` (entitlement fail-closed), espejo EXACTO de web.
 */

export function bearerToken(request: NextRequest): string | null {
    const auth = request.headers.get('authorization') || request.headers.get('Authorization')
    if (!auth?.startsWith('Bearer ')) return null
    return auth.slice('Bearer '.length).trim() || null
}

export type NutritionAuthOk = {
    ok: true
    clientId: string
    admin: ReturnType<typeof createServiceRoleClient>
}
export type NutritionAuthErr = { ok: false; response: NextResponse }

/** 401 si falta/invalido el token. Devuelve el `clientId` (= auth.uid) + cliente service-role. */
export async function authNutritionClient(
    request: NextRequest,
): Promise<NutritionAuthOk | NutritionAuthErr> {
    const token = bearerToken(request)
    if (!token) {
        return {
            ok: false,
            response: NextResponse.json({ error: 'Unauthorized', code: 'MISSING_TOKEN' }, { status: 401 }),
        }
    }
    const auth = await verifyMobileBearer(token)
    if (!auth.ok) {
        return {
            ok: false,
            response: NextResponse.json({ error: 'Unauthorized', code: 'INVALID_TOKEN' }, { status: 401 }),
        }
    }
    const admin = createServiceRoleClient()
    const { data: clientRow } = await admin
        .from('clients')
        .select('is_archived, is_active')
        .eq('id', auth.userId)
        .maybeSingle()
    if (isBlockedClientRow(clientRow)) {
        return {
            ok: false,
            response: NextResponse.json({ error: 'No autorizado', code: 'CLIENT_BLOCKED' }, { status: 403 }),
        }
    }
    return { ok: true, clientId: auth.userId, admin }
}

export type ClientNutritionContext = {
    planId: string
    coachId: string | null
    teamId: string | null
    orgId: string | null
}

/**
 * Plan nutricional ACTIVO + scope (team/org) del alumno. Filtrado por el `clientId` verificado
 * (nunca por el body). `null` si el alumno no tiene plan activo (espejo del `NutritionNoPlan` web).
 */
export async function resolveClientNutritionContext(
    admin: ReturnType<typeof createServiceRoleClient>,
    clientId: string,
): Promise<ClientNutritionContext | null> {
    const [{ data: plan }, { data: client }] = await Promise.all([
        admin
            .from('nutrition_plans')
            .select('id, coach_id')
            .eq('client_id', clientId)
            .eq('is_active', true)
            .maybeSingle(),
        admin.from('clients').select('team_id, org_id').eq('id', clientId).maybeSingle(),
    ])
    if (!plan) return null
    return {
        planId: plan.id,
        coachId: (plan.coach_id ?? null) as string | null,
        teamId: (client?.team_id ?? null) as string | null,
        orgId: (client?.org_id ?? null) as string | null,
    }
}

/* ──────────────────  GATE con ESCRITURA (notas / shopping / off-plan)  ────────────────── */

/**
 * Las features base-tier con WRITE del alumno (notas coach⇄alumno, lista de compras,
 * off-plan/intake) NO pueden escribir con service-role (bypasearia la RLS y la integridad
 * de `author_id`/`client_id`). Este gate entrega un cliente token-scoped (anon + Bearer del
 * alumno) para que la RLS (`client_id = auth.uid()`) siga siendo la 2da capa en cada write —
 * idéntico a la sesión-cookie RLS-scoped de la web.
 *
 * NO llevan `assertModule`: son base tier (la web tampoco las gatea por módulo, sólo por
 * sesión + RLS). La visibilidad por sección (feature-prefs, fail-OPEN) viaja por
 * `/api/mobile/config` (render-only), no aquí.
 *
 * Identidad: WRITES → `admin.auth.getUser(token)` (autoritativo, revocación-safe; regla de
 * lib/mobile-auth "las mutaciones deben usar getUser"). READS → `verifyMobileBearer`.
 */

export type AlumnoGateOk = {
    ok: true
    clientId: string
    userClient: SupabaseClient<Database>
    admin: ReturnType<typeof createServiceRoleClient>
}
export type AlumnoGateErr = { ok: false; response: NextResponse }

/** Cliente anon + Bearer del alumno: TODAS las lecturas/escrituras corren RLS-scoped. */
function makeUserClient(token: string): SupabaseClient<Database> {
    return createSupabaseClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            global: { headers: { Authorization: `Bearer ${token}` } },
            auth: { persistSession: false, autoRefreshToken: false },
        }
    )
}

/**
 * 401 si falta/invalido el token; 403 `NOT_A_CLIENT` si el uid no mapea a un alumno.
 * Devuelve el `clientId` (= auth.uid) y el cliente token-scoped listo para RLS.
 */
export async function gateAlumno(
    request: NextRequest,
    opts: { write: boolean }
): Promise<AlumnoGateOk | AlumnoGateErr> {
    const token = bearerToken(request)
    if (!token) {
        return { ok: false, response: NextResponse.json({ error: 'Unauthorized', code: 'MISSING_TOKEN' }, { status: 401 }) }
    }

    const admin = createServiceRoleClient()

    let userId: string
    if (opts.write) {
        const { data, error } = await admin.auth.getUser(token)
        if (error || !data.user) {
            return { ok: false, response: NextResponse.json({ error: 'Unauthorized', code: 'INVALID_TOKEN' }, { status: 401 }) }
        }
        userId = data.user.id
    } else {
        const auth = await verifyMobileBearer(token)
        if (!auth.ok) {
            return { ok: false, response: NextResponse.json({ error: 'Unauthorized', code: 'INVALID_TOKEN' }, { status: 401 }) }
        }
        userId = auth.userId
    }

    // Endpoint SOLO del alumno: confirmar que el uid mapea a un `client` (evita filas huérfanas
    // de un coach/otro rol; la RLS igual vaciaría, pero devolvemos un error claro).
    const { data: clientRow } = await admin.from('clients').select('id, is_archived, is_active').eq('id', userId).maybeSingle()
    if (!clientRow) {
        return { ok: false, response: NextResponse.json({ error: 'No autorizado', code: 'NOT_A_CLIENT' }, { status: 403 }) }
    }
    if (isBlockedClientRow(clientRow)) {
        return { ok: false, response: NextResponse.json({ error: 'No autorizado', code: 'CLIENT_BLOCKED' }, { status: 403 }) }
    }

    return { ok: true, clientId: userId, userClient: makeUserClient(token), admin }
}
