import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import type { Json, TablesInsert } from '@/lib/database.types'
import { getPaymentsProvider, getPaymentsProviderForCoach } from '@/lib/payments/provider'
import { rateLimitAuth, jsonRateLimited } from '@/lib/rate-limit'

/**
 * Eliminacion de cuenta EN-APP (Guideline 5.1.1(v) de App Review — rechazo de la build iOS 1.1.0).
 *
 * POR QUE existe: hasta hoy la baja se pedia por `mailto` en ambos roles y Apple lo rechaza — solo
 * industrias altamente reguladas pueden exigir un canal de atencion; el correo puede acompañar a la
 * baja en-app, jamas reemplazarla. Ver `specs/account-deletion/SPEC.md`.
 *
 * Contrato (decision del owner 2026-08-11):
 *   1. la cuenta queda DESHABILITADA al instante (ban en GoTrue -> no hay login ni refresh),
 *   2. la purga definitiva ocurre a los 30 dias, por un job posterior que lee `app_metadata`,
 *   3. si el coach tiene una suscripcion viva, se cancela en su gateway de forma automatica.
 *
 * SIN MIGRACION a proposito: el pedido de baja se registra en `auth` (ban + `app_metadata`), no en
 * una tabla nueva. El ban es fail-closed A NIVEL AUTH: corta TODAS las superficies (RN, web, PWA) sin
 * depender de RLS ni de que la UI se acuerde de chequear un flag. Mismo mecanismo que ya usa
 * `services/client/client-archive.service.ts` para archivar alumnos.
 *
 * AUTH — por que `admin.auth.getUser(token)` y NO `verifyMobileBearer`: `lib/mobile-auth.ts` documenta
 * que la verificacion local con JWKS es SOLO para GETs read-only, porque valida la firma pero no
 * consulta revocacion en GoTrue. Esta es la mutacion de cuenta mas destructiva del producto => la
 * identidad se resuelve por red, autoritativa (mismo patron que `coach/activate-free`).
 *
 * La identidad sale UNICAMENTE del bearer. El body no se lee: no hay ningun id que un cliente pueda
 * mandar para borrar una cuenta ajena.
 */

/** ~100 años. Mismo valor que `client-archive.service.ts`: el "ban permanente" documentado de GoTrue. */
const BAN_FOREVER = '876000h'

type AdminClient = ReturnType<typeof createServiceRoleClient>

function bearerToken(request: NextRequest): string | null {
    const match = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)
    return match?.[1]?.trim() || null
}

function errorResponse(status: number, code: string, error: string) {
    return NextResponse.json({ ok: false, code, error }, { status })
}

/** Espejo de `/api/payments/cancel-subscription`: "ya estaba cancelada" no es un fallo. */
function isAlreadyCanceledError(message: string) {
    return /already|cancelled|canceled|cancelado|invalid status|not authorized|cannot be modified/i.test(message)
}

type CoachBillingRow = {
    id: string
    subscription_status: string | null
    subscription_mp_id: string | null
    subscription_provider: string | null
    subscription_provider_external_id: string | null
    superseded_mp_preapproval_id: string | null
}

/**
 * Cancela la suscripcion del coach que se da de baja. BEST-EFFORT por decision del owner: el borrado
 * de la cuenta NO puede quedar rehen de MercadoPago/Flow — si el gateway falla se registra el fallo y
 * la baja sigue adelante; el warning viaja en la respuesta para que soporte lo persiga a mano.
 *
 * El gateway se resuelve por el PERSISTIDO (`subscription_provider`), nunca por el body: Flow ->
 * `subscription_provider_external_id`, MP -> `subscription_mp_id`. El `superseded_mp_preapproval_id`
 * (preapproval viejo que quedo como backstop durante un cambio de plan) se cancela SIEMPRE con el
 * provider MP explicito: un id de MP contra Flow falla en silencio y lo dejaria cobrando.
 * Copiado 1:1 del contrato de `/api/payments/cancel-subscription` para no divergir en dinero.
 */
async function cancelCoachBillingBestEffort(
    admin: AdminClient,
    coach: CoachBillingRow
): Promise<{ warnings: string[]; canceledSomething: boolean; providerFailed: boolean }> {
    const warnings: string[] = []
    let canceledSomething = false
    let providerFailed = false

    const provider = getPaymentsProviderForCoach(coach)
    const checkoutId = (coach.subscription_provider === 'flow'
        ? coach.subscription_provider_external_id
        : coach.subscription_mp_id
    )?.trim()

    if (checkoutId) {
        try {
            await provider.cancelCheckoutAtProvider(checkoutId)
            canceledSomething = true
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            if (isAlreadyCanceledError(msg)) {
                canceledSomething = true
            } else {
                providerFailed = true
                warnings.push('SUBSCRIPTION_CANCEL_FAILED')
                console.error('[mobile.account.delete] provider cancel failed', {
                    coachId: coach.id,
                    provider: provider.name,
                    message: msg,
                })
            }
        }
    }

    const superseded = coach.superseded_mp_preapproval_id?.trim()
    if (superseded && superseded !== checkoutId) {
        try {
            await getPaymentsProvider('mercadopago').cancelCheckoutAtProvider(superseded)
            canceledSomething = true
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            if (!isAlreadyCanceledError(msg)) {
                providerFailed = true
                warnings.push('SUPERSEDED_CANCEL_FAILED')
                console.error('[mobile.account.delete] superseded preapproval cancel failed', {
                    coachId: coach.id,
                    superseded,
                    message: msg,
                })
            }
        }
        // El marcador se limpia igual: la cuenta se va y dejarlo colgando solo confunde al webhook.
        // supabase-js NO rechaza en error de DB (devuelve `{ error }`), asi que no hace falta try.
        await admin.from('coaches').update({ superseded_mp_preapproval_id: null }).eq('id', coach.id)
    }

    return { warnings, canceledSomething, providerFailed }
}

export async function POST(request: NextRequest) {
    const token = bearerToken(request)
    if (!token) return errorResponse(401, 'MISSING_TOKEN', 'Unauthorized')

    const admin = createServiceRoleClient()
    const { data: userData, error: userError } = await admin.auth.getUser(token)
    const user = userData?.user
    if (userError || !user) return errorResponse(401, 'INVALID_TOKEN', 'Unauthorized')

    // Techo de abuso por usuario (la identidad ya viene del bearer, asi que no hay enumeracion
    // posible). fail-open como el resto de `rateLimitAuth`: negarle la baja a alguien porque Redis
    // se cayo seria justo lo que Apple rechaza.
    const rl = await rateLimitAuth(`account-delete:${user.id}`)
    if (!rl.ok) return jsonRateLimited(rl.retryAfter)

    const warnings: string[] = []

    // Rol: `coaches.id` y `clients.id`/`client_accounts.id` son todos el MISMO uuid de `auth.users`
    // (ver `/api/mobile/auth/account-status`). Un usuario sin ninguna fila (identidad huerfana de un
    // registro a medias) TAMBIEN puede darse de baja: negarselo reabriria el rechazo de Apple.
    const [{ data: coach }, { data: client }, { data: clientAccount }] = await Promise.all([
        admin
            .from('coaches')
            .select(
                'id, subscription_status, subscription_mp_id, subscription_provider, subscription_provider_external_id, superseded_mp_preapproval_id'
            )
            .eq('id', user.id)
            .maybeSingle(),
        admin.from('clients').select('id').eq('id', user.id).maybeSingle(),
        admin.from('client_accounts').select('id').eq('id', user.id).maybeSingle(),
    ])

    const role: 'coach' | 'client' | 'unknown' = coach ? 'coach' : client || clientAccount ? 'client' : 'unknown'

    if (coach) {
        // TODO el bloque de billing va dentro de un try: ni una excepcion inesperada (constructor del
        // provider sin env, red caida) puede impedir que abajo se deshabilite la cuenta — ahi esta el
        // rechazo de Apple. Peor caso: queda un preapproval vivo y el warning lo delata.
        try {
            const billing = await cancelCoachBillingBestEffort(admin, coach)
            warnings.push(...billing.warnings)

            // Solo se marca `canceled` si el gateway NO fallo: si el preapproval quizas siga vivo,
            // mentirle a la DB dejaria un cobro real con estado "cancelado" y nadie lo perseguiria.
            if (!billing.providerFailed && coach.subscription_status !== 'canceled') {
                const { error: statusError } = await admin
                    .from('coaches')
                    .update({ subscription_status: 'canceled' })
                    .eq('id', user.id)
                if (statusError) {
                    console.error('[mobile.account.delete] failed to mark subscription canceled', {
                        coachId: user.id,
                        message: statusError.message,
                    })
                }
            }

            if (billing.canceledSomething) {
                const eventRow: TablesInsert<'subscription_events'> = {
                    coach_id: user.id,
                    provider: getPaymentsProviderForCoach(coach).name,
                    provider_event_id: `account-deletion:${user.id}:${Date.now()}`,
                    provider_status: 'canceled',
                    payload: { cancel_reason: 'account_deletion_requested' } as Json,
                }
                await admin.from('subscription_events').insert(eventRow)
            }
        } catch (err) {
            warnings.push('SUBSCRIPTION_CANCEL_FAILED')
            console.error('[mobile.account.delete] billing teardown threw', {
                coachId: user.id,
                message: err instanceof Error ? err.message : String(err),
            })
        }
    }

    const requestedAt = new Date().toISOString()

    // FAIL-CLOSED: el ban es lo unico que realmente cierra la cuenta. GoTrue MERGEA `app_metadata`
    // (no lo reemplaza), asi que mandar solo las dos llaves nuevas conserva `provider`/`providers`.
    // `deletion_requested_at` es la cola de trabajo del job de purga a 30 dias (pendiente T6).
    const { error: banError } = await admin.auth.admin.updateUserById(user.id, {
        ban_duration: BAN_FOREVER,
        app_metadata: {
            deletion_requested_at: requestedAt,
            deletion_reason: 'user_request',
        },
    })

    if (banError) {
        console.error('[mobile.account.delete] failed to ban auth user', {
            userId: user.id,
            message: banError.message,
        })
        // Sin ban no hay baja: NO se responde ok (la app no debe cerrar sesion ni decir "listo").
        return errorResponse(500, 'ACCOUNT_DELETE_FAILED', 'No se pudo eliminar la cuenta. Intenta de nuevo.')
    }

    // Traza durable del pedido sin migracion (mismo patron que `activateFreePlanForCoach`).
    // Best-effort: la cuenta ya quedo deshabilitada, un fallo de auditoria no revierte nada.
    const auditRow: TablesInsert<'admin_audit_logs'> = {
        admin_email: 'user-self-action',
        action: 'account.delete_requested',
        target_table: role === 'coach' ? 'coaches' : 'clients',
        target_id: user.id,
        payload: { role, requested_at: requestedAt, origin: 'mobile', warnings } as Json,
    }
    await admin.from('admin_audit_logs').insert(auditRow)

    return NextResponse.json({ ok: true, ...(warnings.length > 0 ? { warnings } : {}) })
}
