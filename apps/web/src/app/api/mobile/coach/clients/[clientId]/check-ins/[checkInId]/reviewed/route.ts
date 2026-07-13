import { NextRequest, NextResponse } from 'next/server'
import {
    mobileContextOwnsClient,
    resolveMobileClientMutationContext,
} from '../../../../_mutation-auth'

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ clientId: string; checkInId: string }> },
) {
    const { clientId, checkInId } = await params
    const rawBody = await request.json().catch(() => null)
    const body = rawBody && typeof rawBody === 'object' ? rawBody as Record<string, unknown> : {}
    if (typeof body.reviewed !== 'boolean') {
        return NextResponse.json({ error: 'Estado invalido.', code: 'VALIDATION_ERROR' }, { status: 400 })
    }

    const context = await resolveMobileClientMutationContext(request, body.workspace)
    if ('error' in context) return context.error
    if (!(await mobileContextOwnsClient(context, clientId))) {
        return NextResponse.json({ error: 'Alumno no encontrado.', code: 'NOT_FOUND' }, { status: 404 })
    }

    const patch = body.reviewed
        ? { reviewed_at: new Date().toISOString(), reviewed_by: context.userId }
        : { reviewed_at: null, reviewed_by: null }
    const { data, error } = await context.admin
        .from('check_ins')
        .update(patch)
        .eq('id', checkInId)
        .eq('client_id', clientId)
        .select('id')
        .maybeSingle()
    if (error) return NextResponse.json({ error: error.message, code: 'UPDATE_FAILED' }, { status: 500 })
    if (!data) return NextResponse.json({ error: 'Check-in no encontrado.', code: 'NOT_FOUND' }, { status: 404 })
    return NextResponse.json({ ok: true })
}
