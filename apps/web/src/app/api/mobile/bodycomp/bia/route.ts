import { NextRequest, NextResponse } from 'next/server'
import {
    mobileContextOwnsClient,
    resolveMobileClientMutationContext,
} from '../../coach/clients/_mutation-auth'
import {
    BodyCompositionKillSwitchError,
    bodyCompositionAccessFromExplicitScope,
    saveBodyCompositionWithAccess,
} from '@/services/bodycomp/body-composition.service'

/**
 * Endpoint mobile para GUARDAR una medicion BIA de composicion corporal. Espejo de
 * saveBodyCompositionAction (apps/web/.../coach/clients/[clientId]/bodycomp/_actions). El mobile NO
 * debe escribir por PostgREST directo: el gate del modulo (`body_composition`) hoy solo vive en la
 * UI mobile (hasModule client-side), asi que un coach SIN el modulo podria insertar por API directa
 * (evasion de cobro). Aca corre el MISMO gate server-side que la web:
 *   - `_mutation-auth`: bearer autoritativo + workspace explicito + ownership del alumno.
 *   - service: kill-switch + Zod + assertModule por recurso + consentimiento team + insert.
 * Mutacion => auth por getUser (autoritativo), no jose.
 */

export async function POST(request: NextRequest) {
    const rawBody = await request.json().catch(() => null)
    const body = rawBody && typeof rawBody === 'object' ? rawBody as Record<string, unknown> : {}
    if (body.workspace === undefined) {
        return NextResponse.json({ error: 'Workspace requerido.', code: 'WORKSPACE_REQUIRED' }, { status: 400 })
    }
    const context = await resolveMobileClientMutationContext(request, body.workspace)
    if ('error' in context) return context.error
    const clientId = typeof body.clientId === 'string' ? body.clientId : ''
    if (!clientId || !(await mobileContextOwnsClient(context, clientId))) {
        return NextResponse.json({ error: 'Alumno no encontrado.', code: 'NOT_FOUND' }, { status: 404 })
    }

    try {
        // Forzamos method='bia' (el endpoint /isak es el unico que acepta ISAK) — el resto del shape
        // (clientId, metrics, deviceBrand/Model, weightKg/heightCm, notes) lo valida el schema.
        const { workspace: _workspace, ...payload } = body
        const input = { ...payload, method: 'bia' as const }
        const access = bodyCompositionAccessFromExplicitScope(context.scope)
        const { row } = await saveBodyCompositionWithAccess(context.userDb, context.userId, input, clientId, access)
        return NextResponse.json({ ok: true, measurementId: row.id })
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'No se pudo guardar la medición.'
        if (e instanceof BodyCompositionKillSwitchError) {
            return NextResponse.json({ error: msg, code: 'MODULE_DISABLED' }, { status: 503 })
        }
        if (msg.startsWith('Modulo no habilitado')) {
            return NextResponse.json({ error: msg, code: 'MODULE_OFF' }, { status: 403 })
        }
        if (msg.includes('consentimiento')) {
            return NextResponse.json({ error: msg, code: 'CONSENT_REQUIRED' }, { status: 403 })
        }
        return NextResponse.json({ error: msg }, { status: 400 })
    }
}
