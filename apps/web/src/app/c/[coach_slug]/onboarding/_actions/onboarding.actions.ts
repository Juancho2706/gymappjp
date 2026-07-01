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

    // UPSERT (no INSERT): si el coach ya creó la fila de intake al setear biometría desde la ficha
    // (write-path "Editar biometría"), las respuestas REALES del onboarding del alumno deben
    // sobreescribir los placeholders del coach. onConflict=client_id (unique, isOneToOne). Antes un
    // INSERT ignoraba 23505 → perdía en silencio las respuestas del alumno si la fila ya existía.
    // `sex` NO va en el objeto → un upsert no lo toca, preservando el valor que puso el coach.
    const { error: intakeError } = await supabase
        .from('client_intake')
        .upsert({
            client_id: user.id,
            weight_kg: parseFloat(weight),
            height_cm: parseFloat(height),
            goals,
            experience_level: experienceLevel,
            injuries: injuries || null,
            medical_conditions: medicalConditions || null,
            availability,
        }, { onConflict: 'client_id' })

    if (intakeError) {
        return { error: 'Ocurrió un error al guardar tu información. Inténtalo de nuevo.' }
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
