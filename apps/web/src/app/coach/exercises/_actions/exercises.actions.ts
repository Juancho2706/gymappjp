'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { CloneExerciseSchema } from '@eva/schemas'
import { z } from 'zod'
import { getTierCapabilities, type SubscriptionTier } from '@/lib/constants'
import { getCoachOrgContext } from '@/lib/coach-context'
import { resolvePreferredWorkspace } from '@/services/auth/workspace.service'
import { normalizeYoutubeEmbedUrl } from '@/lib/youtube'
import { deleteExerciseMediaByUrlAction } from './exercise-media.actions'

const SUPABASE_MEDIA_PREFIX = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''}/storage/v1/object/public/exercise-media/`

const exerciseSchema = z.object({
    name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres').max(100),
    muscle_group: z.string().min(1, 'Seleccioná un grupo muscular'),
    // Polimórfico (specs/movida-entrenamiento): default strength = comportamiento de siempre.
    exercise_type: z.enum(['strength', 'cardio', 'mobility', 'roller']).default('strength'),
    equipment: z.string().optional(),
    difficulty: z.string().optional(),
    secondary_muscles: z.array(z.string()).optional(),
    instructions: z.array(z.string()).optional(),
    media_kind: z.enum(['youtube', 'gif', 'image', 'none']).default('none'),
    video_url: z
        .string()
        .optional()
        .transform((v) => v || undefined)
        .refine(
            (v) => !v || normalizeYoutubeEmbedUrl(v) !== null,
            'URL de YouTube inválida. Usá un link de youtube.com o youtu.be'
        ),
    gif_url: z
        .string()
        .optional()
        .transform((v) => v || undefined)
        .refine(
            (v) => !v || v.startsWith(SUPABASE_MEDIA_PREFIX),
            'URL de GIF no permitida.'
        ),
    image_url: z
        .string()
        .optional()
        .transform((v) => v || undefined)
        .refine(
            (v) => !v || v.startsWith(SUPABASE_MEDIA_PREFIX),
            'URL de imagen no permitida.'
        ),
})

export type ExerciseActionState = {
    error?: string
    success?: boolean
    exerciseId?: string
    fieldErrors?: Record<string, string[]>
}

function parseExerciseFormData(formData: FormData) {
    const rawSecondary = formData.get('secondary_muscles') as string
    const rawInstructions = formData.get('instructions') as string
    return {
        name: formData.get('name') as string,
        muscle_group: formData.get('muscle_group') as string,
        exercise_type: (formData.get('exercise_type') as string) || 'strength',
        equipment: (formData.get('equipment') as string) || undefined,
        difficulty: (formData.get('difficulty') as string) || undefined,
        secondary_muscles: rawSecondary
            ? rawSecondary.split(',').map((s) => s.trim()).filter(Boolean)
            : [],
        instructions: rawInstructions
            ? rawInstructions.split('\n').map((s) => s.trim()).filter(Boolean)
            : [],
        media_kind: (formData.get('media_kind') as 'youtube' | 'gif' | 'image' | 'none') || 'none',
        video_url: (formData.get('video_url') as string) || undefined,
        gif_url: (formData.get('gif_url') as string) || undefined,
        image_url: (formData.get('image_url') as string) || undefined,
    }
}

function resolveMediaFields(parsed: z.infer<typeof exerciseSchema>) {
    const embed = parsed.video_url ? normalizeYoutubeEmbedUrl(parsed.video_url) : null
    switch (parsed.media_kind) {
        case 'youtube': return { video_url: embed, gif_url: null, image_url: null }
        case 'gif': return { video_url: null, gif_url: parsed.gif_url ?? null, image_url: null }
        case 'image': return { video_url: null, gif_url: null, image_url: parsed.image_url ?? null }
        default: return { video_url: null, gif_url: null, image_url: null }
    }
}

export async function cloneExerciseAction(formData: FormData) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return { error: 'No autorizado' }
    }

    // Parse instructions
    const instructionsStr = formData.get('instructions') as string
    let instructions: string[] = []
    if (instructionsStr) {
      try {
        instructions = JSON.parse(instructionsStr)
      } catch {
        instructions = instructionsStr.split('\n').filter(s => s.trim().length > 0)
      }
    }

    // Parse secondary muscles
    const secondaryMusclesStr = formData.get('secondary_muscles') as string
    let secondaryMuscles: string[] = []
    if (secondaryMusclesStr) {
      try {
        secondaryMuscles = JSON.parse(secondaryMusclesStr)
      } catch {
        secondaryMuscles = secondaryMusclesStr.split(',').map(s => s.trim()).filter(s => s.length > 0)
      }
    }

    const data = {
      id: formData.get('id'),
      name: formData.get('name'),
      muscle_group: formData.get('muscle_group'),
      equipment: formData.get('equipment') || null,
      video_url: formData.get('video_url') || null,
      difficulty: formData.get('difficulty') || null,
      gender_focus: formData.get('gender_focus') || null,
      instructions: instructions.length > 0 ? instructions : null,
      secondary_muscles: secondaryMuscles.length > 0 ? secondaryMuscles : null,
    }

    const validated = CloneExerciseSchema.parse(data)

    const { error } = await supabase
      .from('exercises')
      .insert({
        name: validated.name,
        muscle_group: validated.muscle_group,
        equipment: validated.equipment,
        video_url: validated.video_url,
        difficulty: validated.difficulty,
        gender_focus: validated.gender_focus,
        instructions: validated.instructions,
        secondary_muscles: validated.secondary_muscles,
        coach_id: user.id
      })

    if (error) throw error

    revalidatePath('/coach/exercises')
    return { success: true }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error al clonar ejercicio'
    return { error: message }
  }
}

// ── Custom exercise creator (enterprise-aware) ────────────────────────────────

/**
 * Resolves owner fields for a custom exercise (exactamente UNO de coach_id | org_id | team_id).
 * - Workspace activo team → { coach_id: null, org_id: null, team_id: workspace.teamId } — AC6/AC11
 * - Standalone coach      → { coach_id: user.id, org_id: null, team_id: null }
 * - Org admin/owner       → { coach_id: null, org_id: ctx.orgId, team_id: null }
 * - Org coach             → error (no permission)
 */
async function resolveExerciseOwner(
    supabase: Awaited<ReturnType<typeof createClient>>
): Promise<
    | { ok: true; coachId: string | null; orgId: string | null; teamId: string | null; tier: SubscriptionTier }
    | { ok: false; error: string }
> {
    const { data: userData } = await supabase.auth.getUser()
    const user = userData?.user
    if (!user) return { ok: false, error: 'No autenticado.' }

    // 3er caso (mustFix AC6/AC11): workspace ACTIVO team ⇒ el ejercicio nace en el catálogo del
    // POOL (team_id), nunca personal. Sin esto, un coach de Movida en contexto team creaba
    // ejercicios coach_id = user.id: invisibles para los demás miembros (rompe full-access AC6)
    // y NO legibles por los alumnos del pool vía exercises_client_coach_select (exige
    // clients.coach_id = exercises.coach_id, que no se cumple en el pool) ⇒ bloque fantasma en
    // la ejecución. La RLS exercises_team_insert (20260611090001) respalda este write-path.
    const workspace = await resolvePreferredWorkspace(supabase, user.id)
    if (workspace?.type === 'coach_team') {
        // Full-access plano del pool: cualquier miembro activo crea/edita; billing a nivel team.
        return { ok: true, coachId: null, orgId: null, teamId: workspace.teamId, tier: 'pro' }
    }

    const ctx = await getCoachOrgContext()
    if (!ctx) return { ok: false, error: 'No autenticado.' }

    // Org coach role = no access
    if (ctx.isOrgUser && !ctx.isOrgAdmin) {
        return { ok: false, error: 'Tu rol no permite crear ejercicios.' }
    }

    if (ctx.isOrgAdmin && ctx.orgId) {
        // Org admin: tier check via org — allow all (org manages billing separately)
        return { ok: true, coachId: null, orgId: ctx.orgId, teamId: null, tier: 'pro' }
    }

    // Standalone coach
    const { data: coach } = await supabase
        .from('coaches')
        .select('id, subscription_tier')
        .eq('id', user.id)
        .maybeSingle()
    if (!coach) return { ok: false, error: 'Coach no encontrado.' }

    return {
        ok: true,
        coachId: coach.id,
        orgId: null,
        teamId: null,
        tier: (coach.subscription_tier ?? 'free') as SubscriptionTier,
    }
}

/** Scoping 3-vías del owner sobre un query de exercises (team > coach personal > org). */
function applyExerciseOwnerScope<T extends { eq: (column: string, value: string) => T }>(
    query: T,
    owner: { coachId: string | null; orgId: string | null; teamId: string | null }
): T {
    if (owner.teamId) return query.eq('team_id', owner.teamId)
    if (owner.coachId) return query.eq('coach_id', owner.coachId)
    return query.eq('org_id', owner.orgId!)
}

export async function createExerciseAction(
    _prev: ExerciseActionState,
    formData: FormData
): Promise<ExerciseActionState> {
    const supabase = await createClient()
    const owner = await resolveExerciseOwner(supabase)
    if (!owner.ok) return { error: owner.error }

    const caps = getTierCapabilities(owner.tier)
    if (!caps.canCreateCustomExercises) return { error: 'upgrade_required' }

    const raw = parseExerciseFormData(formData)
    const parsed = exerciseSchema.safeParse(raw)
    if (!parsed.success) {
        return { fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]> }
    }

    // Duplicate name check (scoped to owner — en team, por team_id: el catálogo es del pool)
    const nameQuery = applyExerciseOwnerScope(
        supabase
            .from('exercises')
            .select('id', { count: 'exact', head: true })
            .ilike('name', parsed.data.name),
        owner
    )

    const { count: nameCount } = await nameQuery
    if ((nameCount ?? 0) > 0) {
        return { fieldErrors: { name: ['Ya existe un ejercicio con ese nombre.'] } }
    }

    const media = resolveMediaFields(parsed.data)

    const { data: exercise, error } = await supabase
        .from('exercises')
        .insert({
            coach_id: owner.coachId,
            org_id: owner.orgId,
            team_id: owner.teamId,
            name: parsed.data.name,
            muscle_group: parsed.data.muscle_group,
            exercise_type: parsed.data.exercise_type,
            equipment: parsed.data.equipment ?? null,
            difficulty: parsed.data.difficulty ?? null,
            secondary_muscles: parsed.data.secondary_muscles ?? [],
            instructions: parsed.data.instructions ?? [],
            video_url: media.video_url,
            gif_url: media.gif_url,
            image_url: media.image_url,
            source: owner.orgId ? 'org' : owner.teamId ? 'team' : 'coach',
        })
        .select('id')
        .single()

    if (error) {
        console.error('createExerciseAction error:', error)
        return { error: 'Error al guardar el ejercicio.' }
    }

    revalidatePath('/coach/exercises')
    revalidatePath('/coach/builder')
    return { success: true, exerciseId: exercise.id }
}

export async function updateExerciseAction(
    exerciseId: string,
    _prev: ExerciseActionState,
    formData: FormData
): Promise<ExerciseActionState> {
    const supabase = await createClient()
    const owner = await resolveExerciseOwner(supabase)
    if (!owner.ok) return { error: owner.error }

    const caps = getTierCapabilities(owner.tier)
    if (!caps.canCreateCustomExercises) return { error: 'upgrade_required' }

    const raw = parseExerciseFormData(formData)
    const parsed = exerciseSchema.safeParse(raw)
    if (!parsed.success) {
        return { fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]> }
    }

    // Duplicate name check (exclude self; en team, scoped por team_id)
    const nameQuery = applyExerciseOwnerScope(
        supabase
            .from('exercises')
            .select('id', { count: 'exact', head: true })
            .ilike('name', parsed.data.name)
            .neq('id', exerciseId),
        owner
    )

    const { count: nameCount } = await nameQuery
    if ((nameCount ?? 0) > 0) {
        return { fieldErrors: { name: ['Ya existe un ejercicio con ese nombre.'] } }
    }

    // Load old URLs for storage cleanup
    const { data: existing } = await supabase
        .from('exercises')
        .select('gif_url, image_url')
        .eq('id', exerciseId)
        .maybeSingle()

    const media = resolveMediaFields(parsed.data)

    const updateQuery = supabase
        .from('exercises')
        .update({
            name: parsed.data.name,
            muscle_group: parsed.data.muscle_group,
            exercise_type: parsed.data.exercise_type,
            equipment: parsed.data.equipment ?? null,
            difficulty: parsed.data.difficulty ?? null,
            secondary_muscles: parsed.data.secondary_muscles ?? [],
            instructions: parsed.data.instructions ?? [],
            video_url: media.video_url,
            gif_url: media.gif_url,
            image_url: media.image_url,
        })
        .eq('id', exerciseId)
    applyExerciseOwnerScope(updateQuery, owner)

    const { error } = await updateQuery
    if (error) {
        console.error('updateExerciseAction error:', error)
        return { error: 'Error al actualizar el ejercicio.' }
    }

    // Cleanup old storage files
    if (existing) {
        const oldUrls = [existing.gif_url, existing.image_url].filter(Boolean) as string[]
        const newUrls = [media.gif_url, media.image_url].filter(Boolean) as string[]
        for (const old of oldUrls) {
            if (!newUrls.includes(old)) {
                deleteExerciseMediaByUrlAction(old).catch(() => undefined)
            }
        }
    }

    revalidatePath('/coach/exercises')
    revalidatePath('/coach/builder')
    return { success: true, exerciseId }
}

export async function softDeleteExerciseAction(exerciseId: string): Promise<ExerciseActionState> {
    const supabase = await createClient()
    const owner = await resolveExerciseOwner(supabase)
    if (!owner.ok) return { error: owner.error }

    const updateQuery = supabase
        .from('exercises')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', exerciseId)
    applyExerciseOwnerScope(updateQuery, owner)

    const { error } = await updateQuery
    if (error) return { error: 'Error al eliminar el ejercicio.' }

    revalidatePath('/coach/exercises')
    revalidatePath('/coach/builder')
    return { success: true }
}

export async function restoreExerciseAction(exerciseId: string): Promise<ExerciseActionState> {
    const supabase = await createClient()
    const owner = await resolveExerciseOwner(supabase)
    if (!owner.ok) return { error: owner.error }

    const updateQuery = supabase
        .from('exercises')
        .update({ deleted_at: null })
        .eq('id', exerciseId)
    applyExerciseOwnerScope(updateQuery, owner)

    const { error } = await updateQuery
    if (error) return { error: 'No se pudo restaurar.' }

    revalidatePath('/coach/exercises')
    revalidatePath('/coach/builder')
    return { success: true }
}
