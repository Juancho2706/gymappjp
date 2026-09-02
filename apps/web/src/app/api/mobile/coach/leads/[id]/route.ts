import { NextRequest, NextResponse } from 'next/server'
import { CoachLeadUpdateRequestSchema } from '@eva/schemas'
import { updateCoachLeadStatus } from '@/services/coach/leads.service'
import { resolveMobileLeadsContext } from '../_auth'

/**
 * `PATCH /api/mobile/coach/leads/[id]` — el coach mueve una solicitud desde la app (W3.2).
 *
 * Estados aceptados: `contacted`, `converted`, `dismissed` (el CHECK de la tabla también admite
 * `new`, pero ese es el estado inicial que escribe `/join` y volver a él reabriría una solicitud
 * ya trabajada).
 *
 * `converted` acepta un `clientId` OPCIONAL —el alumno que el alta móvil acaba de crear— y con él
 * corre el MISMO cierre que el panel web: copia de atribución de la tarjeta compartida a `clients`,
 * `converted_client_id` y `coach_client_referred` (todo en `services/coach/leads.service.ts`, una
 * sola implementación). Opcional y no obligatorio a propósito: un binario ya publicado manda
 * `converted` a secas y ese camino tiene que seguir cerrando la solicitud.
 *
 * La UI NUNCA autoriza: la pertenencia la verifica el servicio con el cliente del usuario (RLS de
 * `coach_leads`) ANTES de que service_role escriba, y el `where` del write repite `coach_id`. Un
 * lead ajeno —o un uuid inventado— responde 404 con el mismo texto que uno inexistente.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params

    // Mutación ⇒ `getUser` autoritativo (revocación), nunca verificación local del JWT.
    const ctx = await resolveMobileLeadsContext(request, 'mutation')
    if ('error' in ctx) return ctx.error

    const parsed = CoachLeadUpdateRequestSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
        return NextResponse.json({ error: 'Estado invalido.', code: 'VALIDATION_ERROR' }, { status: 400 })
    }

    const result = await updateCoachLeadStatus(
        { userDb: ctx.userDb, admin: ctx.admin },
        ctx.userId,
        id,
        parsed.data.status,
        { clientId: parsed.data.clientId ?? null, surface: 'mobile' },
    )

    if (!result.ok) {
        // `CLIENT_NOT_FOUND` es 404 igual que el lead ajeno: el alumno que mandó la app no es de
        // este coach (o no existe). No se distingue de "no existe" y NO se escribe nada — cerrar
        // la solicitud igual dejaría el inbox diciendo que hay un alumno atribuido que no está.
        const notFound = result.code === 'NOT_FOUND' || result.code === 'CLIENT_NOT_FOUND'
        return NextResponse.json(
            { error: result.error, code: result.code },
            { status: notFound ? 404 : 500 },
        )
    }

    // Los eventos (`coach_lead_converted` y, con `clientId`, `coach_client_referred`) los emite el
    // servicio: es el único lugar que sabe si el lead traía atribución mirando la COLUMNA
    // (`referred_by_client_id`) y no el embed del referente, que puede venir null por la RLS de
    // `clients` aunque la atribución exista.
    return NextResponse.json({ ok: true, lead: result.lead })
}
