'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getCoach } from '@/lib/coach/get-coach'
import { isCurrentUserTeamManager } from '@/services/auth/team.service'
import { resolvePreferredWorkspace } from '@/services/auth/workspace.service'
import {
    createWorkoutArea,
    deleteWorkoutArea,
    updateWorkoutArea,
    type AreaScope,
} from '@/services/workout/workout-areas.service'
import {
    WorkoutAreaCreateSchema,
    WorkoutAreaDeleteSchema,
    WorkoutAreaUpdateSchema,
} from '@eva/schemas'
import type { WorkoutArea } from '@/domain/workout/types'

export type AreaActionState = { error?: string; area?: WorkoutArea; success?: boolean }

/**
 * Resuelve el contexto editable de areas del WORKSPACE ACTIVO (patron Modulos):
 * team -> solo owner/co-gestor (check app + RLS wst_* como techo real);
 * standalone -> el propio coach; enterprise/org_managed -> no aplica.
 */
async function resolveEditableAreaScope(): Promise<
    { ok: true; db: Awaited<ReturnType<typeof createClient>>; scope: AreaScope } | { ok: false; error: string }
> {
    const supabase = await createClient()
    const coach = await getCoach()
    if (!coach) return { ok: false, error: 'No autenticado.' }
    if (coach.subscription_status === 'org_managed') {
        return { ok: false, error: 'No disponible en cuentas gestionadas por una organización.' }
    }

    const workspace = await resolvePreferredWorkspace(supabase, coach.id)
    if (workspace?.type === 'enterprise_coach') {
        return { ok: false, error: 'No disponible en cuentas gestionadas por una organización.' }
    }

    if (workspace?.type === 'coach_team') {
        const teamId = workspace.teamId
        const isMgr = await isCurrentUserTeamManager(supabase, teamId)
        if (!isMgr) return { ok: false, error: 'Solo el owner o co-gestor del equipo puede gestionar las áreas.' }
        return { ok: true, db: supabase, scope: { coachId: null, teamId } }
    }

    return { ok: true, db: supabase, scope: { coachId: coach.id, teamId: null } }
}

function revalidateAreas() {
    revalidatePath('/coach/settings/areas')
}

export async function createAreaAction(input: unknown): Promise<AreaActionState> {
    const parsed = WorkoutAreaCreateSchema.safeParse(input)
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }

    const ctx = await resolveEditableAreaScope()
    if (!ctx.ok) return { error: ctx.error }

    const result = await createWorkoutArea(ctx.db, ctx.scope, parsed.data)
    if (result.error || !result.area) return { error: result.error ?? 'No se pudo crear el área.' }
    revalidateAreas()
    return { area: result.area, success: true }
}

export async function updateAreaAction(input: unknown): Promise<AreaActionState> {
    const parsed = WorkoutAreaUpdateSchema.safeParse(input)
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }

    const ctx = await resolveEditableAreaScope()
    if (!ctx.ok) return { error: ctx.error }

    const { id, ...values } = parsed.data
    const result = await updateWorkoutArea(ctx.db, id, values)
    if (result.error || !result.area) return { error: result.error ?? 'No se pudo actualizar el área.' }
    revalidateAreas()
    return { area: result.area, success: true }
}

export async function deleteAreaAction(input: unknown): Promise<AreaActionState> {
    const parsed = WorkoutAreaDeleteSchema.safeParse(input)
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }

    const ctx = await resolveEditableAreaScope()
    if (!ctx.ok) return { error: ctx.error }

    const result = await deleteWorkoutArea(ctx.db, parsed.data.id)
    if (result.error) return { error: result.error }
    revalidateAreas()
    return { success: true }
}
