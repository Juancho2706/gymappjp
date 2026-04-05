'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { NutritionService } from '@/services/nutrition.service'

export type TemplateFormState = {
    error?: string
    success?: boolean
}

function safeParseInt(value: string | null): number | null {
    if (!value) return null
    const parsed = parseInt(value, 10)
    return isNaN(parsed) ? null : parsed
}

export async function saveNutritionTemplate(
    coachId: string,
    prevState: TemplateFormState,
    formData: FormData
): Promise<TemplateFormState> {
    const supabase = await createClient()
    const nutritionService = new NutritionService(supabase)
    
    try {
        const templateId = formData.get('id') as string | null
        const name = formData.get('name') as string
        const caloriesStr = formData.get('daily_calories') as string
        const proteinStr = formData.get('protein_g') as string
        const carbsStr = formData.get('carbs_g') as string
        const fatsStr = formData.get('fats_g') as string
        const instructions = formData.get('instructions') as string
        const selectedClientsStr = formData.get('selected_clients') as string

        if (!name) return { error: 'El nombre es obligatorio.' }

        const templateData = {
            name,
            daily_calories: safeParseInt(caloriesStr),
            protein_g: safeParseInt(proteinStr),
            carbs_g: safeParseInt(carbsStr),
            fats_g: safeParseInt(fatsStr),
            instructions: instructions || null,
            coach_id: coachId
        }

        const newTemplateId = await nutritionService.createOrUpdateTemplate(templateId, templateData, formData);

        await nutritionService.propagateTemplateChanges(newTemplateId, coachId, selectedClientsStr);

        revalidatePath('/coach/nutrition-plans')
        return { success: true }
    } catch (err: any) {
        console.error('[saveNutritionTemplate] Error:', err)
        return { error: err.message || 'Error inesperado al guardar la plantilla.' }
    }
}

export async function deleteNutritionTemplate(templateId: string, coachId: string) {
    const supabase = await createClient()
    const { error } = await supabase
        .from('nutrition_plan_templates')
        .delete()
        .eq('id', templateId)
        .eq('coach_id', coachId)

    if (error) return { error: 'No se pudo eliminar la plantilla.' }
    revalidatePath('/coach/nutrition-plans')
    return { success: true }
}

export async function duplicateNutritionTemplate(templateId: string, coachId: string) {
    const supabase = await createClient()
    const nutritionService = new NutritionService(supabase)

    try {
        await nutritionService.duplicateTemplate(templateId, coachId);
        revalidatePath('/coach/nutrition-plans')
        return { success: true }
    } catch (err: any) {
        console.error('[duplicateNutritionTemplate] Error:', err)
        return { error: err.message || 'Error al duplicar la plantilla.' }
    }
}

export async function unassignNutritionPlan(clientId: string, planId: string) {
    const supabase = await createClient()

    try {
        const { error } = await supabase
            .from('nutrition_plans')
            .update({ is_active: false })
            .eq('id', planId)
            .eq('client_id', clientId)

        if (error) throw error

        revalidatePath('/coach/nutrition-plans')
        revalidatePath(`/coach/clients/${clientId}`)
        return { success: true }
    } catch (err: any) {
        console.error('[unassignNutritionPlan] Error:', err)
        return { error: 'Error al desasignar el plan.' }
    }
}

export async function assignTemplateToClients(templateId: string, coachId: string, clientIds: string[]) {
    const supabase = await createClient()
    const nutritionService = new NutritionService(supabase)

    try {
        if (clientIds.length === 0) return { success: true }

        await nutritionService.propagateTemplateChanges(templateId, coachId, JSON.stringify(clientIds))

        revalidatePath('/coach/nutrition-plans')
        revalidatePath('/coach/clients')
        return { success: true }
    } catch (err: any) {
        console.error('[assignTemplateToClients] Error:', err)
        return { error: err.message || 'Error al asignar la plantilla.' }
    }
}

export async function saveCustomFood(
    coachId: string,
    prevState: any,
    formData: FormData
) {
    const supabase = await createClient()
    
    try {
        const name = formData.get('name') as string
        const calories = parseFloat(formData.get('calories') as string)
        const protein = parseFloat(formData.get('protein') as string)
        const carbs = parseFloat(formData.get('carbs') as string)
        const fats = parseFloat(formData.get('fats') as string)
        const category = formData.get('category') as string || 'General'
        const unit = formData.get('unit') as string || 'g'

        if (!name || isNaN(calories)) {
            return { error: 'Nombre y calorías son obligatorios.' }
        }

        const { error } = await supabase
            .from('foods')
            .insert({
                name,
                calories,
                protein,
                carbs,
                fats,
                category,
                serving_unit: unit,
                coach_id: coachId
            })

        if (error) throw error

        revalidatePath('/coach/nutrition-plans')
        return { success: true }
    } catch (err: any) {
        console.error('[saveCustomFood] Error:', err)
        return { error: 'Error al guardar el alimento personalizado.' }
    }
}
