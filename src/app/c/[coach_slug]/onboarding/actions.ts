'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

export type OnboardingState = {
    error?: string
    success?: boolean
}

export async function submitIntakeForm(
    coachSlug: string,
    prevState: OnboardingState,
    formData: FormData
): Promise<OnboardingState> {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return { error: 'No estás autenticado' }
    }

    const weight = formData.get('weight') as string
    const height = formData.get('height') as string
    const goals = formData.get('goals') as string
    const experienceLevel = formData.get('experience_level') as string
    const injuries = formData.get('injuries') as string
    const medicalConditions = formData.get('medical_conditions') as string
    const availability = formData.get('availability') as string

    if (!weight || !height || !goals || !experienceLevel || !availability) {
        return { error: 'Por favor, completa todos los campos obligatorios.' }
    }

    // Insert the intake form
    const { error: intakeError } = await (supabase as any)
        .from('client_intake')
        .insert({
            client_id: user.id,
            weight_kg: parseFloat(weight),
            height_cm: parseFloat(height),
            goals,
            experience_level: experienceLevel,
            injuries: injuries || null,
            medical_conditions: medicalConditions || null,
            availability,
        })

    if (intakeError) {
        // If it violates unique constraint, it means it already exists, which is fine
        if (intakeError.code !== '23505') {
            console.error('Intake insert error:', intakeError)
            return { error: 'Ocurrió un error al guardar tu información. Inténtalo de nuevo.' }
        }
    }

    // Update the client as onboarded
    const { error: clientError } = await (supabase as any)
        .from('clients')
        .update({ onboarding_completed: true })
        .eq('id', user.id)

    if (clientError) {
        console.error('Client update error:', clientError)
        return { error: 'Ocurrió un error al actualizar tu estado. Inténtalo de nuevo.' }
    }

    revalidatePath(`/c/${coachSlug}/onboarding`)
    redirect(`/c/${coachSlug}/dashboard`)
}
