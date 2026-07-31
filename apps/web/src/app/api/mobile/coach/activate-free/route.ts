import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { activateFreePlanForCoach } from '@/services/billing/activate-free.service'
import { resolvePreferredWorkspace } from '@/services/auth/workspace.service'
import { canViewBilling } from '@/services/auth/workspace-permissions.service'

function bearerToken(request: NextRequest): string | null {
    const match = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)
    return match?.[1]?.trim() || null
}

/**
 * Bridge bearer de "volver al plan gratuito" para la app RN.
 *
 * POR QUE existe pese a la regla money-safety "los pagos NUNCA se procesan in-app": esto no cobra
 * nada — es la SALIDA sin pagar. Un coach cuyo plan vencio quedaba encerrado en el muro de
 * /coach/reactivate de mobile, que solo sabia link-outear al navegador; si el coach no tenia
 * computador a mano, su unica alternativa era pagar. El camino de PAGO (checkout, cambio de plan,
 * tarjeta) sigue siendo link-out exclusivo a la web.
 *
 * Toda la validacion de dinero (estado bloqueado, recuento de cupo, cancelacion en el gateway) vive
 * en `activateFreePlanForCoach`, el MISMO service que usa `/api/payments/activate-free`. Aca solo
 * cambia como se autentica al caller: bearer en vez de cookie de sesion.
 */
export async function POST(request: NextRequest) {
    const token = bearerToken(request)
    if (!token) {
        return NextResponse.json({ error: 'Unauthorized', code: 'MISSING_TOKEN' }, { status: 401 })
    }

    const admin = createServiceRoleClient()
    const { data, error } = await admin.auth.getUser(token)
    const user = data?.user
    if (error || !user) {
        return NextResponse.json({ error: 'Unauthorized', code: 'INVALID_TOKEN' }, { status: 401 })
    }

    // Mismo techo que la web: el billing self-service es exclusivo del coach independiente. Un coach
    // de org/team no puede tocar el plan (lo paga su organizacion).
    const workspace = await resolvePreferredWorkspace(admin, user.id)
    if (!canViewBilling(workspace)) {
        return NextResponse.json(
            { error: 'Billing disponible solo para coach independiente.', code: 'WORKSPACE_NOT_ALLOWED' },
            { status: 403 }
        )
    }

    try {
        const result = await activateFreePlanForCoach(admin, user.id, 'mobile')
        if (!result.ok) {
            const { ok: _ok, status, ...payload } = result
            return NextResponse.json({ ...payload, code: 'ACTIVATE_FREE_REJECTED' }, { status })
        }
        return NextResponse.json({ ok: true })
    } catch (err) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'Error inesperado', code: 'ACTIVATE_FREE_FAILED' },
            { status: 500 }
        )
    }
}
