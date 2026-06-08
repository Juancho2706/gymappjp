'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getClientBasePath } from '@/lib/client/base-path'

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
    const ageConfirmed = formData.get('age_confirmed') === 'on'

    if (!weight || !height || !goals || !experienceLevel || !availability) {
        return { error: 'Por favor, completa todos los campos obligatorios.' }
    }
    if (!ageConfirmed) {
        return { error: 'Debes confirmar que tienes 14 años o más.' }
    }

    const { error: intakeError } = await supabase
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
        if (intakeError.code !== '23505') {
            return { error: 'Ocurrió un error al guardar tu información. Inténtalo de nuevo.' }
        }
    }

    const { error: clientError } = await supabase
        .from('clients')
        .update({ onboarding_completed: true, age_confirmed_at: new Date().toISOString() })
        .eq('id', user.id)

    if (clientError) {
        return { error: 'Ocurrió un error al actualizar tu estado. Inténtalo de nuevo.' }
    }

    revalidatePath(`/c/${coachSlug}/onboarding`)
    redirect(`${await getClientBasePath(coachSlug)}/dashboard`)
}
