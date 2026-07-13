import { NextRequest, NextResponse } from 'next/server'
import {
    mobileContextOwnsClient,
    resolveMobileClientMutationContext,
} from '../../_mutation-auth'
import {
    BodyCompositionKillSwitchError,
    bodyCompositionAccessFromExplicitScope,
    listClientMeasurementsWithAccess,
} from '@/services/bodycomp/body-composition.service'

function bodyCompositionError(error: unknown): NextResponse {
    const message = error instanceof Error ? error.message : 'No se pudieron cargar las mediciones.'
    if (error instanceof BodyCompositionKillSwitchError) {
        return NextResponse.json({ error: message, code: 'MODULE_DISABLED' }, { status: 503 })
    }
    if (message.startsWith('Modulo no habilitado')) {
        return NextResponse.json({ error: message, code: 'MODULE_OFF' }, { status: 403 })
    }
    if (message.includes('consentimiento')) {
        return NextResponse.json({ error: message, code: 'CONSENT_REQUIRED' }, { status: 403 })
    }
    return NextResponse.json({ error: message, code: 'BODYCOMP_READ_FAILED' }, { status: 500 })
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ clientId: string }> }) {
    const { clientId } = await params
    const rawWorkspace = {
        kind: request.nextUrl.searchParams.get('workspaceKind'),
        teamId: request.nextUrl.searchParams.get('teamId') || null,
        orgId: request.nextUrl.searchParams.get('orgId') || null,
    }
    const context = await resolveMobileClientMutationContext(request, rawWorkspace)
    if ('error' in context) return context.error
    if (!(await mobileContextOwnsClient(context, clientId))) {
        return NextResponse.json({ error: 'Alumno no encontrado.', code: 'NOT_FOUND' }, { status: 404 })
    }

    try {
        const access = bodyCompositionAccessFromExplicitScope(context.scope)
        const measurements = await listClientMeasurementsWithAccess(
            context.userDb,
            context.userId,
            access,
            clientId,
        )
        return NextResponse.json({ ok: true, ...measurements })
    } catch (error) {
        return bodyCompositionError(error)
    }
}
