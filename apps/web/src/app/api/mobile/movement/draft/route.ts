import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { authorizeMovement } from '../_lib'

/**
 * POST /api/mobile/movement/draft — crea el borrador vacio del alumno (max 1 por alumno) si no
 * existe; idempotente (devuelve el id del borrador existente). Gate
 * assertModule('movement_assessment') antes de escribir (ver _lib.ts). Standalone v1.
 *
 * El autosave por paso vive en /item (crea el borrador on-demand), asi que este endpoint es el
 * gate explicito para "iniciar evaluacion" sin escribir items todavia.
 *
 * Body: { client_id: string }
 * Retorna: { assessmentId: string } | { error, code? }
 */
const BodySchema = z.object({ client_id: z.guid() })

export async function POST(request: NextRequest) {
    const auth = await authorizeMovement(request)
    if (auth instanceof NextResponse) return auth
    const { userId, userClient } = auth

    const body = await request.json().catch(() => null)
    const parsed = BodySchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
    const clientId = parsed.data.client_id

    const { data: existing } = await userClient
        .from('movement_assessments')
        .select('id')
        .eq('client_id', clientId)
        .eq('status', 'draft')
        .maybeSingle()
    if (existing) return NextResponse.json({ assessmentId: existing.id })

    const { data: created, error: insErr } = await userClient
        .from('movement_assessments')
        .insert({ client_id: clientId, coach_id: userId, status: 'draft', last_edited_by: userId })
        .select('id')
        .single()
    if (insErr || !created) {
        return NextResponse.json({ error: insErr?.message ?? 'No se pudo crear el borrador.' }, { status: 400 })
    }
    return NextResponse.json({ assessmentId: created.id })
}
