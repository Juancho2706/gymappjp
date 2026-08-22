import { NextRequest, NextResponse } from 'next/server'
import { deleteDemoStudent } from '@/services/onboarding/demo-student.service'
import { recordOnboardingEvent } from '@/services/coach/persona.service'
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
