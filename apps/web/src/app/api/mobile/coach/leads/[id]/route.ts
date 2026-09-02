import { NextRequest, NextResponse } from 'next/server'
import { CoachLeadUpdateRequestSchema } from '@eva/schemas'
import { updateCoachLeadStatus } from '@/services/coach/leads.service'
import { capturePostHogServerEvent } from '@/lib/posthog/server-capture'
import { resolveMobileLeadsContext } from '../_auth'

/**
 * `PATCH /api/mobile/coach/leads/[id]` — el coach mueve una solicitud desde la app (W3.2).
 *
 * Estados aceptados: `contacted`, `converted`, `dismissed` (el CHECK de la tabla también admite
 * `new`, pero ese es el estado inicial que escribe `/join` y volver a él reabriría una solicitud
 * ya trabajada).
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
    )

    if (!result.ok) {
        return NextResponse.json(
            { error: result.error, code: result.code },
            { status: result.code === 'NOT_FOUND' ? 404 : 500 },
        )
    }

    // Mismo evento que emite el panel web al convertir. Props del COACH, nada del solicitante
    // (Ley 21.719). `referred` es lo único que interesa del embudo de la tarjeta compartida.
    //
    // OJO: acá NO viaja `coach_client_referred` ni la copia de atribución a `clients` — las dos
    // necesitan el `clients.id` recién creado, que el alta móvil todavía no devuelve. Ese cierre
    // sigue siendo del panel web (`markLeadConvertedAction`).
    if (parsed.data.status === 'converted') {
        await capturePostHogServerEvent({
            event: 'coach_lead_converted',
            distinctId: ctx.userId,
            properties: {
                // El nombre del referente puede venir null aunque haya atribución (el embed pasa
                // por la RLS de `clients`), así que `referral_source` es la señal más fiel.
                referred: Boolean(result.lead.referralSource || result.lead.referrerName),
                surface: 'mobile',
            },
        })
    }

    return NextResponse.json({ ok: true, lead: result.lead })
}
