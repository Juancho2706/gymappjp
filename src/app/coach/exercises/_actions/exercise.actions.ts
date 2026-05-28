'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getTierCapabilities, type SubscriptionTier } from '@/lib/constants'
import { normalizeYoutubeEmbedUrl } from '@/lib/youtube'

const exerciseSchema = z.object({
    name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres').max(100),
    muscle_group: z.string().min(1, 'Seleccioná un grupo muscular'),
    equipment: z.string().optional(),
    difficulty: z.string().optional(),
    secondary_muscles: z.array(z.string()).optional(),
    instructions: z.array(z.string()).optional(),
    video_url: z
        .string()
        .optional()
        .transform((v) => v || undefined)
        .refine(
            (v) => !v || normalizeYoutubeEmbedUrl(v) !== null,
            'URL de YouTube inválida. Usá un link de youtube.com o youtu.be'
        ),
})

export type ExerciseActionState = {
    error?: string
    success?: boolean
    exerciseId?: string
    fieldErrors?: Record<string, string[]>
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

    const rawSecondary = formData.get('secondary_muscles') as string
    const rawInstructions = formData.get('instructions') as string

    const raw = {
        name: formData.get('name') as string,
        muscle_group: formData.get('muscle_group') as string,
        equipment: formData.get('equipment') as string || undefined,
        difficulty: formData.get('difficulty') as string || undefined,
        secondary_muscles: rawSecondary ? rawSecondary.split(',').map((s) => s.trim()).filter(Boolean) : [],
        instructions: rawInstructions ? rawInstructions.split('\n').map((s) => s.trim()).filter(Boolean) : [],
        video_url: formData.get('video_url') as string || undefined,
    }

    const parsed = exerciseSchema.safeParse(raw)
    if (!parsed.success) {
        return { fieldErrors: parsed.error.flatten().fieldErrors }
    }

    const embedUrl = parsed.data.video_url
        ? normalizeYoutubeEmbedUrl(parsed.data.video_url)
        : null

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
            video_url: embedUrl,
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

    const rawSecondary = formData.get('secondary_muscles') as string
    const rawInstructions = formData.get('instructions') as string

    const raw = {
        name: formData.get('name') as string,
        muscle_group: formData.get('muscle_group') as string,
        equipment: formData.get('equipment') as string || undefined,
        difficulty: formData.get('difficulty') as string || undefined,
        secondary_muscles: rawSecondary ? rawSecondary.split(',').map((s) => s.trim()).filter(Boolean) : [],
        instructions: rawInstructions ? rawInstructions.split('\n').map((s) => s.trim()).filter(Boolean) : [],
        video_url: formData.get('video_url') as string || undefined,
    }

    const parsed = exerciseSchema.safeParse(raw)
    if (!parsed.success) {
        return { fieldErrors: parsed.error.flatten().fieldErrors }
    }

    const embedUrl = parsed.data.video_url
        ? normalizeYoutubeEmbedUrl(parsed.data.video_url)
        : null

    // RLS ensures only owner can update
    const { error } = await supabase
        .from('exercises')
        .update({
            name: parsed.data.name,
            muscle_group: parsed.data.muscle_group,
            equipment: parsed.data.equipment ?? null,
            difficulty: parsed.data.difficulty ?? null,
            secondary_muscles: parsed.data.secondary_muscles ?? [],
            instructions: parsed.data.instructions ?? [],
            video_url: embedUrl,
        })
        .eq('id', exerciseId)
        .eq('coach_id', coach.id)

    if (error) {
        console.error('updateExerciseAction error:', error)
        return { error: 'Error al actualizar el ejercicio.' }
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
