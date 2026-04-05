import { SupabaseClient } from '@supabase/supabase-js';
import { Database } from '@/lib/database.types';

type TemplateData = {
    name: string;
    daily_calories: number | null;
    protein_g: number | null;
    carbs_g: number | null;
    fats_g: number | null;
    instructions: string | null;
    coach_id: string;
};

export class NutritionService {
    constructor(private supabase: SupabaseClient<Database>) {}

    async createOrUpdateTemplate(
        templateId: string | null,
        templateData: TemplateData,
        formData: FormData
    ) {
        let currentTemplateId = templateId;

        if (templateId) {
            const { error: updateError } = await this.supabase
                .from('nutrition_plan_templates')
                .update(templateData)
                .eq('id', templateId)
                .eq('coach_id', templateData.coach_id);

            if (updateError) throw updateError;

            await this.supabase
                .from('template_meals')
                .delete()
                .eq('template_id', templateId);
        } else {
            const { data: newTemplate, error: insertError } = await this.supabase
                .from('nutrition_plan_templates')
                .insert(templateData)
                .select('id')
                .single();

            if (insertError) throw insertError;
            currentTemplateId = newTemplate.id;
        }

        if (!currentTemplateId) throw new Error('No se pudo obtener o crear el template_id');

        await this.insertTemplateMealsFromFormData(currentTemplateId, formData, templateData.coach_id);

        return currentTemplateId;
    }

    private async insertTemplateMealsFromFormData(templateId: string, formData: FormData, coachId: string) {
        let i = 0;
        while (formData.has(`meal_name_${i}`)) {
            const mealName = formData.get(`meal_name_${i}`) as string;

            const { data: meal, error: mealError } = await this.supabase
                .from('template_meals')
                .insert({
                    template_id: templateId,
                    name: mealName,
                    order_index: i,
                })
                .select('id')
                .single();

            if (mealError) throw mealError;

            let j = 0;
            const foodsToInsert = [];
            while (formData.has(`meal_${i}_food_${j}`)) {
                const foodData = JSON.parse(
                    formData.get(`meal_${i}_food_${j}`) as string
                );
                foodsToInsert.push(foodData);
                j++;
            }

            if (foodsToInsert.length > 0) {
                const { data: savedMeal } = await this.supabase
                    .from('saved_meals')
                    .insert({
                        coach_id: coachId,
                        name: `Internal_${mealName}_${Date.now()}`,
                    })
                    .select('id')
                    .single();

                if (savedMeal) {
                     await this.supabase.from('saved_meal_items').insert(
                        foodsToInsert.map((f) => ({
                            saved_meal_id: savedMeal.id,
                            food_id: f.food_id,
                            quantity: f.quantity,
                            unit: f.unit,
                        }))
                    );

                    await this.supabase.from('template_meal_groups').insert({
                        template_meal_id: meal.id,
                        saved_meal_id: savedMeal.id,
                        order_index: 0,
                    });
                }
            }
            i++;
        }
    }

    async propagateTemplateChanges(
        templateId: string,
        coachId: string,
        selectedClientsStr: string
    ) {
        const selectedClients: string[] = selectedClientsStr
            ? JSON.parse(selectedClientsStr)
            : [];

        const { data: existingClients } = await (this.supabase
            .from('nutrition_plans')
            .select('client_id')
            .eq('template_id', templateId)
            .eq('is_active', true) as any)
            .eq('is_custom', false);

        const allClientIds = new Set([
            ...selectedClients,
            ...(existingClients?.map((c: any) => c.client_id) || []),
        ]);

        if (allClientIds.size === 0) return;

        const { data: template } = await this.supabase
            .from('nutrition_plan_templates')
            .select(
                `
                *,
                template_meals (
                    *,
                    template_meal_groups (
                        saved_meals (
                            *,
                            saved_meal_items (*)
                        )
                    )
                )
            `
            )
            .eq('id', templateId)
            .single() as any;

        for (const clientId of allClientIds) {
            await this.supabase
                .from('nutrition_plans')
                .update({ is_active: false })
                .eq('client_id', clientId);

            const { data: newPlan } = await this.supabase
                .from('nutrition_plans')
                .insert({
                    client_id: clientId,
                    coach_id: coachId,
                    template_id: templateId,
                    name: template.name,
                    daily_calories: template.daily_calories,
                    protein_g: template.protein_g,
                    carbs_g: template.carbs_g,
                    fats_g: template.fats_g,
                    instructions: template.instructions,
                    is_active: true,
                    is_custom: false,
                } as any)
                .select('id')
                .single();

            if (!newPlan) continue;

            for (const tMeal of template.template_meals) {
                const { data: newMeal } = await this.supabase
                    .from('nutrition_meals')
                    .insert({
                        plan_id: newPlan.id,
                        name: tMeal.name,
                        description: '',
                        order_index: tMeal.order_index,
                    })
                    .select('id')
                    .single();
                
                if (!newMeal) continue;

                const items =
                    tMeal.template_meal_groups?.[0]?.saved_meals
                        ?.saved_meal_items || [];
                if (items.length > 0) {
                    await this.supabase.from('food_items').insert(
                        items.map((it: any) => ({
                            meal_id: newMeal.id,
                            food_id: it.food_id,
                            quantity: it.quantity,
                            unit: it.unit,
                        }))
                    );
                }
            }
        }
    }

    async duplicateTemplate(templateId: string, coachId: string) {
        const { data: template, error: fetchError } = await this.supabase
            .from('nutrition_plan_templates')
            .select(
                `
                *,
                template_meals (
                    *,
                    template_meal_groups (
                        saved_meals (
                            *,
                            saved_meal_items (*)
                        )
                    )
                )
            `
            )
            .eq('id', templateId)
            .eq('coach_id', coachId)
            .single() as any;

        if (fetchError || !template) throw new Error('Plantilla no encontrada');

        const { data: newTemplate, error: insertError } = await this.supabase
            .from('nutrition_plan_templates')
            .insert({
                name: `${template.name} (Copia)`,
                daily_calories: template.daily_calories,
                protein_g: template.protein_g,
                carbs_g: template.carbs_g,
                fats_g: template.fats_g,
                instructions: template.instructions,
                coach_id: coachId,
            })
            .select('id')
            .single();

        if (insertError || !newTemplate) throw insertError;

        for (const tMeal of template.template_meals) {
            const { data: newMeal } = await this.supabase
                .from('template_meals')
                .insert({
                    template_id: newTemplate.id,
                    name: tMeal.name,
                    order_index: tMeal.order_index,
                })
                .select('id')
                .single();

            if (!newMeal) continue;

            const items =
                tMeal.template_meal_groups?.[0]?.saved_meals
                    ?.saved_meal_items || [];
            if (items.length > 0) {
                const { data: savedMeal } = await this.supabase
                    .from('saved_meals')
                    .insert({
                        coach_id: coachId,
                        name: `Internal_${tMeal.name}_${Date.now()}`,
                    })
                    .select('id')
                    .single();

                if (savedMeal) {
                    await this.supabase.from('saved_meal_items').insert(
                        items.map((it: any) => ({
                            saved_meal_id: savedMeal.id,
                            food_id: it.food_id,
                            quantity: it.quantity,
                            unit: it.unit,
                        }))
                    );

                    await this.supabase.from('template_meal_groups').insert({
                        template_meal_id: newMeal.id,
                        saved_meal_id: savedMeal.id,
                        order_index: 0,
                    });
                }
            }
        }
    }
}
