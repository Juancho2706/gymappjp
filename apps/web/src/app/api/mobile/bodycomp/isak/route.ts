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
 * Endpoint mobile para GUARDAR una medicion ISAK de composicion corporal. Espejo de
 * saveBodyCompositionAction (web). CLAVE: el cliente envia SOLO los crudos (`rawInput`) + la
 * ecuacion; los `metrics` derivados (Kerr 5C + Heath-Carter + %grasa) los calcula el SERVER
 * (`computeIsak` dentro del service) — NO se confia en ningun calculo del client.
 * Mismo gate que la web: kill-switch + Zod (IsakRawInputSchema) + workspace/ownership explicitos +
 * assertModule('body_composition') + (consentimiento si team) + insert.
 * Mutacion => auth por getUser, no jose.
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
        // Forzamos method='isak'. El service valida `rawInput` con IsakRawInputSchema, calcula los
        // metrics server-side (computeIsak) y persiste raw_input + metrics derivados.
        const { workspace: _workspace, ...payload } = body
        const input = { ...payload, method: 'isak' as const }
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
