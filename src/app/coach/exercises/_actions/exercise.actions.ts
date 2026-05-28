'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getTierCapabilities, type SubscriptionTier } from '@/lib/constants'
import { normalizeYoutubeEmbedUrl } from '@/lib/youtube'
import { deleteExerciseMediaByUrlAction } from './exercise-media.actions'

const SUPABASE_MEDIA_PREFIX = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''}/storage/v1/object/public/exercise-media/`

const exerciseSchema = z.object({
    name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres').max(100),
    muscle_group: z.string().min(1, 'Seleccioná un grupo muscular'),
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

function parseFormData(formData: FormData) {
    const rawSecondary = formData.get('secondary_muscles') as string
    const rawInstructions = formData.get('instructions') as string
    return {
        name: formData.get('name') as string,
        muscle_group: formData.get('muscle_group') as string,
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

/** Devuelve los 3 campos de URL en base al media_kind seleccionado (los otros van a null). */
function resolveMediaFields(parsed: z.infer<typeof exerciseSchema>) {
    const embed = parsed.video_url ? normalizeYoutubeEmbedUrl(parsed.video_url) : null
    switch (parsed.media_kind) {
        case 'youtube':
            return { video_url: embed, gif_url: null, image_url: null }
        case 'gif':
            return { video_url: null, gif_url: parsed.gif_url ?? null, image_url: null }
        case 'image':
            return { video_url: null, gif_url: null, image_url: parsed.image_url ?? null }
        case 'none':
        default:
            return { video_url: null, gif_url: null, image_url: null }
    }
}

export async function createExerciseAction(
    _prev: ExerciseActionState,
    formData: FormData
): Promise<ExerciseActionState> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado.' }

    const { data: coach } = await supabase
        .from('coaches')
        .select('id, subscription_tier')
        .eq('id', user.id)
        .maybeSingle()

    if (!coach) return { error: 'Coach no encontrado.' }

    const caps = getTierCapabilities((coach.subscription_tier ?? 'free') as SubscriptionTier)
    if (!caps.canCreateCustomExercises) return { error: 'upgrade_required' }

    const raw = parseFormData(formData)
    const parsed = exerciseSchema.safeParse(raw)
    if (!parsed.success) {
        return { fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]> }
    }

    const { count: nameCount } = await supabase
        .from('exercises')
        .select('id', { count: 'exact', head: true })
        .eq('coach_id', coach.id)
        .ilike('name', parsed.data.name)

    if ((nameCount ?? 0) > 0) {
        return { fieldErrors: { name: ['Ya existe un ejercicio tuyo con ese nombre.'] } }
    }

    const media = resolveMediaFields(parsed.data)

    const { data: exercise, error } = await supabase
        .from('exercises')
        .insert({
            coach_id: coach.id,
            name: parsed.data.name,
            muscle_group: parsed.data.muscle_group,
            equipment: parsed.data.equipment ?? null,
            difficulty: parsed.data.difficulty ?? null,
            secondary_muscles: parsed.data.secondary_muscles ?? [],
            instructions: parsed.data.instructions ?? [],
            video_url: media.video_url,
            gif_url: media.gif_url,
            image_url: media.image_url,
            source: 'coach',
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
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado.' }

    const { data: coach } = await supabase
        .from('coaches')
        .select('id, subscription_tier')
        .eq('id', user.id)
        .maybeSingle()

    if (!coach) return { error: 'Coach no encontrado.' }

    const caps = getTierCapabilities((coach.subscription_tier ?? 'free') as SubscriptionTier)
    if (!caps.canCreateCustomExercises) return { error: 'upgrade_required' }

    const raw = parseFormData(formData)
    const parsed = exerciseSchema.safeParse(raw)
    if (!parsed.success) {
        return { fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]> }
    }

    const { count: nameCount } = await supabase
        .from('exercises')
        .select('id', { count: 'exact', head: true })
        .eq('coach_id', coach.id)
        .ilike('name', parsed.data.name)
        .neq('id', exerciseId)

    if ((nameCount ?? 0) > 0) {
        return { fieldErrors: { name: ['Ya existe un ejercicio tuyo con ese nombre.'] } }
    }

    // Cargar URLs viejas para detectar cleanup de storage
    const { data: existing } = await supabase
        .from('exercises')
        .select('gif_url, image_url')
        .eq('id', exerciseId)
        .eq('coach_id', coach.id)
        .maybeSingle()

    const media = resolveMediaFields(parsed.data)

    const { error } = await supabase
        .from('exercises')
        .update({
            name: parsed.data.name,
            muscle_group: parsed.data.muscle_group,
            equipment: parsed.data.equipment ?? null,
            difficulty: parsed.data.difficulty ?? null,
            secondary_muscles: parsed.data.secondary_muscles ?? [],
            instructions: parsed.data.instructions ?? [],
            video_url: media.video_url,
            gif_url: media.gif_url,
            image_url: media.image_url,
        })
        .eq('id', exerciseId)
        .eq('coach_id', coach.id)

    if (error) {
        console.error('updateExerciseAction error:', error)
        return { error: 'Error al actualizar el ejercicio.' }
    }

    // Cleanup de archivos viejos en storage si cambió el medium
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
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado.' }

    const { data: coach } = await supabase
        .from('coaches')
        .select('id')
        .eq('id', user.id)
        .maybeSingle()

    if (!coach) return { error: 'Coach no encontrado.' }

    const { error } = await supabase
        .from('exercises')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', exerciseId)
        .eq('coach_id', coach.id)

    if (error) {
        console.error('softDeleteExerciseAction error:', error)
        return { error: 'Error al eliminar el ejercicio.' }
    }

    revalidatePath('/coach/exercises')
    revalidatePath('/coach/builder')
    return { success: true }
}

/** Restaura un ejercicio soft-deleted (Deshacer en toast). */
export async function restoreExerciseAction(exerciseId: string): Promise<ExerciseActionState> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado.' }

    const { data: coach } = await supabase
        .from('coaches')
        .select('id')
        .eq('id', user.id)
        .maybeSingle()

    if (!coach) return { error: 'Coach no encontrado.' }

    const { error } = await supabase
        .from('exercises')
        .update({ deleted_at: null })
        .eq('id', exerciseId)
        .eq('coach_id', coach.id)

    if (error) {
        console.error('restoreExerciseAction error:', error)
        return { error: 'No se pudo restaurar.' }
    }

    revalidatePath('/coach/exercises')
    revalidatePath('/coach/builder')
    return { success: true }
}
