'use server'

import { createClient } from '@/lib/supabase/server'
import { createRawAdminClient } from '@/lib/supabase/admin-raw'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

const exerciseSchema = z.object({
    name: z.string().min(2, 'Nombre requerido').max(100),
    muscle_group: z.string().min(1, 'Selecciona un grupo muscular'),
    video_url: z.string().url('URL inválida').optional().or(z.literal('')),
})

export type ExerciseState = {
    error?: string
    success?: boolean
    fieldErrors?: Record<string, string[]>
}

export async function createExerciseAction(
    _prev: ExerciseState,
    formData: FormData
): Promise<ExerciseState> {
    const raw = {
        name: formData.get('name') as string,
        muscle_group: formData.get('muscle_group') as string,
        video_url: formData.get('video_url') as string,
    }

    const parsed = exerciseSchema.safeParse(raw)
    if (!parsed.success) {
        return { fieldErrors: parsed.error.flatten().fieldErrors }
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado.' }

    const adminDb = await createRawAdminClient()
    const { error } = await adminDb.from('exercises').insert({
        name: parsed.data.name,
        muscle_group: parsed.data.muscle_group,
        video_url: parsed.data.video_url || null,
        coach_id: user.id,
    })

    if (error) return { error: error.message }

    revalidatePath('/coach/exercises')
    return { success: true }
}

export async function deleteExerciseAction(exerciseId: string): Promise<{ error?: string }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado.' }

    const adminDb = await createRawAdminClient()
    const { error } = await adminDb
        .from('exercises')
        .delete()
        .eq('id', exerciseId)
        .eq('coach_id', user.id)

    if (error) return { error: error.message }

    revalidatePath('/coach/exercises')
    return {}
}
