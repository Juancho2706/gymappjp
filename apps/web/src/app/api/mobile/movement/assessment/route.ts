import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { authorizeMovement } from '../_lib'

/**
 * DELETE /api/mobile/movement/assessment — borra una evaluacion (espejo de deleteAssessment del
 * lib mobile). Final inmutable: corregir = eliminar (el cascade borra los items) + re-evaluar.
 * Gate assertModule('movement_assessment') antes de escribir (ver _lib.ts). Standalone v1.
 *
 * Body: { assessment_id: string }  (DELETE con body, como el lib mobile borra por id bajo RLS)
 * Retorna: { error: null } en exito | { error, code? }
 */
const BodySchema = z.object({ assessment_id: z.guid() })

export async function DELETE(request: NextRequest) {
    const auth = await authorizeMovement(request)
    if (auth instanceof NextResponse) return auth
    const { userClient } = auth

    const body = await request.json().catch(() => null)
    const parsed = BodySchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })

    const { error } = await userClient
        .from('movement_assessments')
        .delete()
        .eq('id', parsed.data.assessment_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ error: null })
}
