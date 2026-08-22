import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { PersonaSchema } from '@eva/schemas'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { verifyMobileBearer } from '@/lib/mobile-auth'
import { resolvePreferredWorkspace } from '@/services/auth/workspace.service'
import { applyCoachPersona } from '@/services/coach/persona.service'
import { loadPersonaGateStatus } from '@/services/onboarding/onboarding-v2.queries'
import { resolveMobileClientMutationContext } from '@/app/api/mobile/coach/clients/_mutation-auth'

/**
 * `/api/mobile/coach/persona` — la pantalla «¿A qué te dedicas?» de la app
 * (SPEC coach-onboarding-v2 §1 y §9, TASKS W5 F5.1).
 *
 * GET  → `{ persona, alsoOther, needsPersona }`. El gate del primer ingreso de RN: la app no
 *        puede decidirlo sola (necesita `created_at`, el conteo de alumnos REALES y el workspace),
 *        y la decisión tiene que ser la MISMA que toma `proxy.ts` en la web — por eso las dos
 *        superficies comparten los resolvers de `services/coach/persona.service`.
 * POST → guarda la respuesta con `applyCoachPersona`, el MISMO núcleo del server action web
 *        (persona + 5 filas de dominio + evento + alumno de ejemplo + PostHog), y devuelve
 *        `{ ok, demoClientId }`.
 *
 * Autenticación: idéntica al resto de `api/mobile/coach/*`. El GET es read-only y verifica el JWT
 * localmente (`verifyMobileBearer`, con degradación a GoTrue); el POST es una MUTACIÓN de cuenta y
 * usa `resolveMobileClientMutationContext`, que resuelve el usuario con `auth.getUser` (sensible a
 * revocación) y entrega el cliente del USUARIO para escribir bajo RLS + column-grants.
 *
 * El `coachId` SIEMPRE sale del token; el body solo trae la respuesta a la pregunta.
 */

function bearerToken(request: NextRequest): string | null {
    const auth = request.headers.get('authorization') || request.headers.get('Authorization')
    if (!auth?.startsWith('Bearer ')) return null
    return auth.slice('Bearer '.length).trim() || null
}

export async function GET(request: NextRequest) {
    const token = bearerToken(request)
    if (!token) {
        return NextResponse.json({ error: 'Unauthorized', code: 'MISSING_TOKEN' }, { status: 401 })
    }

    const auth = await verifyMobileBearer(token)
    if (!auth.ok) {
        return NextResponse.json({ error: 'Unauthorized', code: 'INVALID_TOKEN' }, { status: 401 })
    }

    const admin = createServiceRoleClient()
    const { data: coach, error } = await admin
        .from('coaches')
        .select('id, persona, persona_also_other, subscription_status, created_at')
        .eq('id', auth.userId)
        .maybeSingle()

    if (error) {
        return NextResponse.json({ error: 'No se pudo cargar el coach.', code: 'COACH_LOAD_FAILED' }, { status: 500 })
    }
    if (!coach) {
        return NextResponse.json({ error: 'Coach no encontrado.', code: 'COACH_NOT_FOUND' }, { status: 404 })
    }

    const workspace = await resolvePreferredWorkspace(admin, auth.userId)
    const status = await loadPersonaGateStatus(admin, auth.userId, {
        persona: coach.persona ?? null,
        personaAlsoOther: coach.persona_also_other === true,
        coachCreatedAt: coach.created_at ?? null,
        subscriptionStatus: coach.subscription_status ?? null,
        workspaceType: workspace?.type ?? null,
    })

    return NextResponse.json(status)
}

const bodySchema = z.object({
    persona: PersonaSchema,
    /** Segunda pregunta inline. Ausente ⇒ «No» (el default de la pantalla). */
    alsoOther: z.boolean().optional(),
})

export async function POST(request: NextRequest) {
    const ctx = await resolveMobileClientMutationContext(request, undefined)
    if ('error' in ctx) return ctx.error

    const parsed = bodySchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
        return NextResponse.json(
            { error: 'Elige una de las opciones para continuar.', code: 'INVALID_PERSONA' },
            { status: 400 },
        )
    }

    // Coach administrado por una org o un team: su panel lo define el tenant, no él (mismo
    // rechazo que el server action web y que el resto de acciones de cuenta en el bridge móvil).
    if (ctx.scope.type !== 'standalone') {
        return NextResponse.json(
            { error: 'Tu panel lo administra tu organización o tu equipo.', code: 'WORKSPACE_ACTION_NOT_ALLOWED' },
            { status: 403 },
        )
    }

    const applied = await applyCoachPersona({
        supabase: ctx.userDb,
        admin: ctx.admin,
        coachId: ctx.userId,
        persona: parsed.data.persona,
        alsoOther: parsed.data.alsoOther === true,
        surface: 'rn',
    })

    if (!applied.ok) {
        return NextResponse.json({ error: applied.error, code: 'PERSONA_SAVE_FAILED' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, demoClientId: applied.demoClientId })
}
