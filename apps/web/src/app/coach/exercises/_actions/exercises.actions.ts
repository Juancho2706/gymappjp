'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { CloneExerciseSchema } from '@eva/schemas'

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
