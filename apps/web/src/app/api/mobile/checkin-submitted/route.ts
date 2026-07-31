import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { notifyCoachOfCheckin } from '@/lib/push-events'

/**
 * Side effect posterior al check-in RN (patrón `program-assignment-notifications`): la app ya
 * insertó la fila de `check_ins` por RLS; este bridge solo REVALIDA esa fila (pertenece al
 * bearer, es reciente) y emite la push W1 `checkin_received` al coach. Nunca muta el check-in.
 * Best-effort declarado: si esto falla, el check-in del alumno ya quedó guardado igual.
 */

const bodySchema = z.object({
    checkInId: z.string().uuid(),
})

const MAX_AGE_MS = 24 * 60 * 60 * 1000

function bearerToken(request: NextRequest): string | null {
    const authorization = request.headers.get('authorization')
    const match = authorization?.match(/^Bearer\s+(.+)$/i)
    return match?.[1]?.trim() || null
}

function errorResponse(status: number, code: string, error: string) {
    return NextResponse.json({ ok: false, code, error }, { status })
}

export async function POST(request: NextRequest) {
    const token = bearerToken(request)
    if (!token) return errorResponse(401, 'MISSING_TOKEN', 'Unauthorized')

    const admin = createServiceRoleClient()
    const { data: userData, error: userError } = await admin.auth.getUser(token)
    if (userError || !userData.user) return errorResponse(401, 'INVALID_TOKEN', 'Unauthorized')

    const parsed = bodySchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return errorResponse(400, 'VALIDATION_ERROR', 'Datos inválidos.')

    try {
        const { data: checkIn } = await admin
            .from('check_ins')
            .select('id, client_id, weight, energy_level, created_at')
            .eq('id', parsed.data.checkInId)
            .eq('client_id', userData.user.id)
            .maybeSingle()
        // Fila ajena, inexistente o vieja (reintento tardío de la app) → no-op silencioso:
        // este endpoint jamás filtra existencia de datos de terceros.
        if (!checkIn) return NextResponse.json({ ok: true, notified: false })
        const ageMs = Date.now() - Date.parse(checkIn.created_at ?? '')
        if (!Number.isFinite(ageMs) || ageMs > MAX_AGE_MS) {
            return NextResponse.json({ ok: true, notified: false })
        }

        await notifyCoachOfCheckin(admin, {
            clientId: checkIn.client_id,
            weight: checkIn.weight,
            energyLevel: checkIn.energy_level,
        })
        return NextResponse.json({ ok: true, notified: true })
    } catch {
        return NextResponse.json({ ok: true, notified: false })
    }
}
