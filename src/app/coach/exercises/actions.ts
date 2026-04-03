'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

const cloneExerciseSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  muscle_group: z.string().min(1),
  equipment: z.string().nullable(),
  video_url: z.string().url().nullable().or(z.literal('')),
  difficulty: z.string().nullable().optional(),
  gender_focus: z.string().nullable().optional(),
  instructions: z.array(z.string()).nullable().optional(),
  secondary_muscles: z.array(z.string()).nullable().optional(),
})

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
      } catch (e) {
        // Fallback for line breaks
        instructions = instructionsStr.split('\n').filter(s => s.trim().length > 0)
      }
    }

    // Parse secondary muscles
    const secondaryMusclesStr = formData.get('secondary_muscles') as string
    let secondaryMuscles: string[] = []
    if (secondaryMusclesStr) {
      try {
        secondaryMuscles = JSON.parse(secondaryMusclesStr)
      } catch (e) {
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

    const validated = cloneExerciseSchema.parse(data)

    // Insert as new exercise owned by coach
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
  } catch (error: any) {
    console.error('Error cloning exercise:', error)
    return { error: error.message || 'Error al clonar ejercicio' }
  }
}
