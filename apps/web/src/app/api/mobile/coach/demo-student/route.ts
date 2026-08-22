import { NextRequest, NextResponse } from 'next/server'
import { PERSONA_COPY } from '@eva/schemas'
import { deleteDemoStudent, seedDemoStudent } from '@/services/onboarding/demo-student.service'
import { readCoachPersona, recordOnboardingEvent } from '@/services/coach/persona.service'
import { resolveMobileClientMutationContext } from '@/app/api/mobile/coach/clients/_mutation-auth'

/**
 * Alumno de ejemplo — borrado desde la app (SPEC coach-onboarding-v2 §4; TASKS W5 F5.2).
 *
 * Espejo móvil de `coach/dashboard/_actions/demo-student.actions.ts`: la guía de RN
 * (`app/coach/guia.tsx`) ofrece «Borrar ejemplo» en la tarjeta del demo y en el cierre 5/5, y el
 * demo tiene que desaparecer igual que en la web — con su inventario completo, no solo la ficha.
 *
 * Autorización: el MISMO helper que el resto de `api/mobile/coach/*`
 * (`resolveMobileClientMutationContext`): bearer verificado con `admin.auth.getUser` y workspace
 * resuelto contra la base. El `coachId` sale de ese contexto, NUNCA del body — el cuerpo de este
 * request no aporta identidad de ningún tipo.
 *
 * Solo `standalone`: el alumno de ejemplo se siembra en el alta de un coach propio. A un coach
 * administrado por un team o una org no se le siembra ni se le borra nada desde el teléfono.
 *
 * El borrado corre con el cliente ADMIN porque `clients.is_demo` la escribe solo `service_role`
 * (trigger `clients_guard_is_demo`) y el servicio acota el barrido a las filas de ESE coach.
 */
export async function DELETE(request: NextRequest) {
    const ctx = await resolveMobileClientMutationContext(request, undefined)
    if ('error' in ctx) return ctx.error

    if (ctx.scope.type !== 'standalone') {
        return NextResponse.json(
            { error: 'Accion administrada por tu equipo.', code: 'WORKSPACE_ACTION_NOT_ALLOWED' },
            { status: 403 },
        )
    }

    const result = await deleteDemoStudent(ctx.admin, { coachId: ctx.userId })

    if (!result.ok) {
        return NextResponse.json(
            { error: 'No se pudo borrar el alumno de ejemplo.', code: 'DEMO_DELETE_FAILED' },
            { status: 500 },
        )
    }

    // Señal de medición del funnel. Best-effort: si falla, el borrado igual valió.
    await recordOnboardingEvent(ctx.admin, {
        coachId: ctx.userId,
        eventType: 'demo_deleted',
        metadata: { surface: 'rn' },
    })

    return NextResponse.json({ ok: true, deleted: result.deleted })
}

/**
 * Re-sembrado del alumno de ejemplo desde «Opciones › Mi panel» de la app (TASKS W8.2.2).
 *
 * Espejo de `reseedDemoStudentAction` (web, `settings/funciones/_actions/mi-panel.actions.ts`):
 * un coach que borró su demo —o que cambió de especialidad— tiene que poder recuperarlo sin
 * gastar cupo ni tocar un alumno real.
 *
 * La persona sale de la BASE, no del body: es la misma regla que el resto de este bridge (el
 * cuerpo de un request nunca es autoridad). `other` no siembra nada (no tiene «mundo» del que
 * sacar un alumno de ejemplo, SPEC §4) y se responde con el motivo humano en vez de un 500.
 *
 * Como el DELETE de arriba: bearer verificado por `resolveMobileClientMutationContext`, solo
 * `standalone`, y el sembrado corre con el cliente ADMIN porque `clients.is_demo` la escribe solo
 * `service_role` (trigger `clients_guard_is_demo`).
 *
 * Idempotente: si el demo ya existía, `seedDemoStudent` devuelve el mismo id con
 * `alreadyExisted: true` y acá no se crea nada nuevo.
 */
export async function POST(request: NextRequest) {
    const ctx = await resolveMobileClientMutationContext(request, undefined)
    if ('error' in ctx) return ctx.error

    if (ctx.scope.type !== 'standalone') {
        return NextResponse.json(
            { error: 'Accion administrada por tu equipo.', code: 'WORKSPACE_ACTION_NOT_ALLOWED' },
            { status: 403 },
        )
    }

    const { persona } = await readCoachPersona(ctx.userDb, ctx.userId)
    if (persona == null) {
        return NextResponse.json(
            { error: 'Primero elige tu especialidad.', code: 'PERSONA_MISSING' },
            { status: 409 },
        )
    }

    const demoName = PERSONA_COPY[persona].demoName
    if (demoName == null) {
        return NextResponse.json(
            { error: 'Tu especialidad no trae alumno de ejemplo.', code: 'PERSONA_WITHOUT_DEMO' },
            { status: 409 },
        )
    }

    const seed = await seedDemoStudent(ctx.admin, { coachId: ctx.userId, persona })
    if (!seed.ok) {
        if (seed.reason === 'not_implemented') {
            return NextResponse.json(
                { error: 'El alumno de ejemplo todavía no está disponible.', code: 'DEMO_NOT_AVAILABLE' },
                { status: 503 },
            )
        }
        console.error('[demo-student/rn] no se pudo sembrar', seed.reason, seed.detail)
        return NextResponse.json(
            { error: 'No pudimos crear el alumno de ejemplo. Inténtalo de nuevo.', code: 'DEMO_SEED_FAILED' },
            { status: 500 },
        )
    }

    // Señal de medición del funnel. Best-effort: si falla, el sembrado igual valió.
    await recordOnboardingEvent(ctx.admin, {
        coachId: ctx.userId,
        eventType: 'demo_seeded',
        metadata: {
            persona,
            demoClientId: seed.demoClientId,
            alreadyExisted: seed.alreadyExisted,
            surface: 'rn',
            source: 'mi_panel',
        },
    })

    return NextResponse.json({
        ok: true,
        demoClientId: seed.demoClientId,
        demoName,
        alreadyExisted: seed.alreadyExisted,
    })
}
