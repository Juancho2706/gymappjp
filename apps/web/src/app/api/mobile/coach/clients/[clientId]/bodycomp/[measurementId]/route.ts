import { NextRequest, NextResponse } from 'next/server'
import {
    mobileContextOwnsClient,
    resolveMobileClientMutationContext,
} from '../../../_mutation-auth'
import {
    BodyCompositionKillSwitchError,
    bodyCompositionAccessFromExplicitScope,
    deleteBodyCompositionWithAccess,
} from '@/services/bodycomp/body-composition.service'

function bodyCompositionError(error: unknown): NextResponse {
    const message = error instanceof Error ? error.message : 'No se pudo eliminar la medicion.'
    if (error instanceof BodyCompositionKillSwitchError) {
        return NextResponse.json({ error: message, code: 'MODULE_DISABLED' }, { status: 503 })
    }
    if (message.startsWith('Modulo no habilitado')) {
        return NextResponse.json({ error: message, code: 'MODULE_OFF' }, { status: 403 })
    }
    if (message === 'Medicion no encontrada.') {
        return NextResponse.json({ error: message, code: 'NOT_FOUND' }, { status: 404 })
    }
    return NextResponse.json({ error: message, code: 'BODYCOMP_DELETE_FAILED' }, { status: 500 })
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ clientId: string; measurementId: string }> },
) {
    const { clientId, measurementId } = await params
    const rawBody = await request.json().catch(() => null)
    const body = rawBody && typeof rawBody === 'object' ? rawBody as Record<string, unknown> : {}
    if (body.workspace === undefined) {
        return NextResponse.json({ error: 'Workspace requerido.', code: 'WORKSPACE_REQUIRED' }, { status: 400 })
    }
    const context = await resolveMobileClientMutationContext(request, body.workspace)
    if ('error' in context) return context.error
    if (!(await mobileContextOwnsClient(context, clientId))) {
        return NextResponse.json({ error: 'Alumno no encontrado.', code: 'NOT_FOUND' }, { status: 404 })
    }

    try {
        const access = bodyCompositionAccessFromExplicitScope(context.scope)
        await deleteBodyCompositionWithAccess(
            context.userDb,
            context.userId,
            measurementId,
            clientId,
            access,
        )
        return NextResponse.json({ ok: true })
    } catch (error) {
        return bodyCompositionError(error)
    }
}
