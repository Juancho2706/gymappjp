import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { PERSONA_COPY, PersonaSchema } from '@eva/schemas'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { capturePostHogServerEvent } from '@/lib/posthog/server-capture'
import { verifyMobileBearer } from '@/lib/mobile-auth'
import { resolvePreferredWorkspace } from '@/services/auth/workspace.service'
import {
    applyCoachPersona,
    readCoachPersona,
    recordOnboardingEvent,
    saveCoachPersona,
    writePersonaDomainPrefs,
} from '@/services/coach/persona.service'
import { loadPersonaGateStatus } from '@/services/onboarding/onboarding-v2.queries'
import {
    archivePersonaGuideProgress,
    demoChangeNotice,
    reseedDemoForPersonaChange,
    type DemoChangeResult,
} from '@/services/onboarding/persona-switch.service'
import { resolveMobileClientMutationContext } from '@/app/api/mobile/coach/clients/_mutation-auth'

/**
 * `/api/mobile/coach/persona` — la pantalla «¿A qué te dedicas?» de la app
 * (SPEC coach-onboarding-v2 §1 y §9, TASKS W5 F5.1).
 *
 * GET  → `{ persona, alsoOther, needsPersona }`. El gate del primer ingreso de RN: la app no
 *        puede decidirlo sola (necesita `created_at`, el conteo de alumnos REALES y el workspace),
 *        y la decisión tiene que ser la MISMA que toma `proxy.ts` en la web — por eso las dos
 *        superficies comparten los resolvers de `services/coach/persona.service`.
 * POST → guarda la respuesta. Tiene DOS caminos, y los separa la presencia de `reorderPanel`:
 *        · sin `reorderPanel` (primer ingreso) → `applyCoachPersona`, el MISMO núcleo del server
 *          action web: persona + 5 filas de dominio + evento + alumno de ejemplo + PostHog.
 *          Devuelve `{ ok, demoClientId }`.
 *        · con `reorderPanel` (Opciones › Mi panel, TASKS W8.2.2) → espejo de
 *          `saveMiPanelPersonaAction`: persona + reorden SOLO si el coach lo pidió, sin tocar el
 *          alumno de ejemplo. Devuelve `{ ok, demoClientId: null, reordered }`.
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
    /**
     * PRESENTE ⇒ la llamada viene de «Opciones › Mi panel» (RN, TASKS W8.2.2), no del primer
     * ingreso. El valor dice si además hay que re-sembrar los 5 dominios con la matriz de la
     * persona. AUSENTE ⇒ primer ingreso: sigue el camino completo de `applyCoachPersona`.
     */
    reorderPanel: z.boolean().optional(),
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

    // ── Camino «Mi panel»: cambiar de especialidad SIN reordenar por sorpresa ────────────────
    //
    // Espejo exacto de `saveMiPanelPersonaAction` (web): guarda la persona, re-ejecuta la matriz
    // de dominios SOLO si el coach lo pidió, y deja el alumno de ejemplo en paz (esa es otra
    // acción, con su propio botón). No pasa por `applyCoachPersona` justamente porque ese núcleo
    // reordena y siembra siempre — que es lo correcto en el primer ingreso y lo INCORRECTO acá:
    // un coach que ya ajustó sus módulos a mano no puede perderlos por corregir una etiqueta.
    if (parsed.data.reorderPanel !== undefined) {
        const persona = parsed.data.persona
        const alsoOther =
            PERSONA_COPY[persona].secondQuestion == null ? false : parsed.data.alsoOther === true
        const reorderPanel = parsed.data.reorderPanel === true

        const previous = await readCoachPersona(ctx.userDb, ctx.userId)
        const personaChanged = previous.persona != null && previous.persona !== persona

        // Memoria de la guía por especialidad (W8.1.3), ANTES de guardar: mide los pasos 2 y 3 con
        // el `persona_set_at` viejo. Mismo servicio que usa la web: las dos «Mi panel» no pueden
        // divergir en qué recuerda la guía.
        const memory = await archivePersonaGuideProgress(ctx.userDb, {
            coachId: ctx.userId,
            from: previous.persona,
            to: persona,
        })
        if (memory.error) {
            console.error('[mi-panel/rn] no se pudo archivar el progreso de la guía', memory.error)
        }

        const saved = await saveCoachPersona(ctx.userDb, ctx.userId, persona, alsoOther)
        if (!saved.ok) {
            console.error('[mi-panel/rn] no se pudo guardar la persona', saved.error)
            return NextResponse.json(
                { error: 'No pudimos guardar tu especialidad. Inténtalo de nuevo.', code: 'PERSONA_SAVE_FAILED' },
                { status: 500 },
            )
        }

        if (reorderPanel) {
            const prefs = await writePersonaDomainPrefs(ctx.userDb, ctx.userId, persona, alsoOther)
            if (!prefs.ok) {
                console.error('[mi-panel/rn] no se pudieron reordenar los dominios', prefs.error)
                return NextResponse.json(
                    {
                        error: 'Guardamos tu especialidad, pero no pudimos reordenar el panel. Inténtalo de nuevo.',
                        code: 'PERSONA_REORDER_FAILED',
                    },
                    { status: 500 },
                )
            }
        }

        // Cambió de rama ⇒ el alumno de ejemplo también (Matías → Pedro). Idéntico a la web.
        const demo: DemoChangeResult = personaChanged
            ? await reseedDemoForPersonaChange(ctx.admin, { coachId: ctx.userId, persona, surface: 'rn' })
            : { action: 'kept', demoName: PERSONA_COPY[persona].demoName, demoClientId: null, error: null }

        await recordOnboardingEvent(ctx.admin, {
            coachId: ctx.userId,
            eventType: 'persona_selected',
            metadata: {
                persona,
                alsoOther,
                surface: 'rn',
                source: 'mi_panel',
                changed: previous.persona !== persona,
                reordered: reorderPanel,
                demo: demo.action,
            },
        })
        await capturePostHogServerEvent({
            event: 'persona_selected',
            distinctId: ctx.userId,
            properties: {
                persona,
                also_other: alsoOther,
                surface: 'rn',
                source: 'mi_panel',
                changed: previous.persona !== persona,
                demo: demo.action,
            },
        })

        // 200 aunque el ejemplo falle: la especialidad YA quedó guardada y decirle a la app que
        // todo falló la haría revertir la pantalla. El detalle viaja en `demo.error`.
        return NextResponse.json({
            ok: true,
            demoClientId: demo.demoClientId,
            reordered: reorderPanel,
            /** `{ action, demoName, demoClientId, error }` — la app avisa «ahora es Pedro». */
            demo,
            /** Aviso listo para el toast (`null` si no hubo cambio de alumno de ejemplo). */
            notice: demo.error ?? demoChangeNotice(demo),
        })
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
