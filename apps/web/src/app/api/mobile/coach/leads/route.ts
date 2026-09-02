import { NextRequest, NextResponse } from 'next/server'
import { CoachLeadsQuerySchema } from '@eva/schemas'
import { listCoachLeads } from '@/services/coach/leads.service'
import { resolveMobileLeadsContext } from './_auth'

/**
 * `GET /api/mobile/coach/leads` — inbox «Solicitudes» del coach para la app RN (W3.1).
 *
 * Sin `?status=` devuelve la bandeja ABIERTA (`new` + `contacted`), exactamente la misma consulta
 * que pinta `/coach/clients` en la web. Con `?status=` filtra por ese estado (la app lo usa para
 * el histórico de descartadas/convertidas).
 *
 * Sin rate limit, igual que sus hermanos de lectura (`dashboard`, `clients/pulse`): es un GET
 * acotado a 50 filas del propio coach, sin efectos y sin costo externo.
 */
export async function GET(request: NextRequest) {
    const ctx = await resolveMobileLeadsContext(request, 'read')
    if ('error' in ctx) return ctx.error

    const parsed = CoachLeadsQuerySchema.safeParse({
        status: request.nextUrl.searchParams.get('status') ?? undefined,
    })
    if (!parsed.success) {
        return NextResponse.json({ error: 'Estado invalido.', code: 'INVALID_STATUS' }, { status: 400 })
    }

    const result = await listCoachLeads(ctx.userDb, ctx.userId, {
        statuses: parsed.data.status ? [parsed.data.status] : undefined,
    })

    if (!result.ok) {
        console.error('[mobile/coach/leads] lectura del inbox falló:', result.error)
        return NextResponse.json(
            { error: 'No pudimos cargar las solicitudes.', code: 'LEADS_LOAD_FAILED' },
            { status: 500 },
        )
    }

    return NextResponse.json({ leads: result.leads })
}
