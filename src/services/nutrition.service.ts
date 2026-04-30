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
    goal_type?: string | null;
    tags?: string[] | null;
    is_favorite?: boolean | null;
};

type MealInput = {
    name: string;
    notes?: string | null;
    order_index: number;
    day_of_week?: number | null;
    foodItems: Array<{
        food_id: string
        quantity: number
        unit: string
        swap_options?: Array<{
            food_id: string
            is_liquid?: boolean
            quantity?: number
            unit?: 'g' | 'un' | 'ml'
            name: string
            calories: number
            protein_g: number
            carbs_g: number
            fats_g: number
            serving_size: number
            serving_unit?: string | null
        }>
    }>;
};

type TemplateSavedMealItem = {
    food_id: string
    quantity: number
    unit: string
    swap_options?: Array<{
        food_id: string
        is_liquid?: boolean
        quantity?: number
        unit?: 'g' | 'un' | 'ml'
        name: string
        calories: number
        protein_g: number
        carbs_g: number
        fats_g: number
        serving_size: number
        serving_unit?: string | null
    }>
}

type TemplateMealWithGroups = {
    name: string
    order_index: number
    template_meal_groups?: Array<{
        saved_meals?: {
            saved_meal_items?: TemplateSavedMealItem[]
        } | null
    }> | null
}

export class NutritionService {
    constructor(private supabase: SupabaseClient<Database>) {}

    private getTemplateMealItems(templateMeal: TemplateMealWithGroups): TemplateSavedMealItem[] {
        const groups = templateMeal.template_meal_groups ?? []
        const flatItems: TemplateSavedMealItem[] = []
        for (const group of groups) {
            const items = group?.saved_meals?.saved_meal_items ?? []
            for (const item of items) {
                flatItems.push(item)
            }
        }
        return flatItems
    }

    private assertTemplateMealsAreComplete(templateMeals: TemplateMealWithGroups[]) {
        const emptyMeals = templateMeals.filter((m) => this.getTemplateMealItems(m).length === 0)
        if (emptyMeals.length === 0) return

        const names = emptyMeals.map((m) => m.name || `Comida #${m.order_index + 1}`).join(', ')
        throw new Error(`La plantilla tiene comidas sin alimentos: ${names}. Corrige la plantilla antes de propagar.`)
    }

    /**
     * Crea o actualiza una plantilla desde un payload JSON tipado.
     * No usa FormData indexado — elimina el riesgo de pérdida silenciosa de comidas.
     */
    async createOrUpdateTemplateFromJson(
        templateId: string | null,
        templateData: TemplateData,
        meals: MealInput[]
    ): Promise<string> {
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

        const sorted = [...meals].sort((a, b) => a.order_index - b.order_index);

        for (const meal of sorted) {
            const { data: tMeal, error: mealError } = await this.supabase
                .from('template_meals')
                .insert({
                    template_id: currentTemplateId,
                    name: meal.name,
                    description: meal.notes ?? '',
                    order_index: meal.order_index,
                    day_of_week: meal.day_of_week ?? null,
                })
                .select('id')
                .single();

            if (mealError) throw mealError;
            if (!meal.foodItems.length) continue;

            const { data: savedMeal } = await this.supabase
                .from('saved_meals')
                .insert({
                    coach_id: templateData.coach_id,
                    name: `Internal_${meal.name}_${Date.now()}`,
                })
                .select('id')
                .single();

            if (savedMeal) {
                await this.supabase.from('saved_meal_items').insert(
                    meal.foodItems.map((f) => ({
                        saved_meal_id: savedMeal.id,
                        food_id: f.food_id,
                        quantity: f.quantity,
                        unit: f.unit,
                        swap_options: f.swap_options ?? [],
                    }))
                );

                await this.supabase.from('template_meal_groups').insert({
                    template_meal_id: tMeal.id,
                    saved_meal_id: savedMeal.id,
                    order_index: 0,
                });
            }
        }

        return currentTemplateId;
    }

    /**
     * Propaga los cambios de una plantilla a todos sus clientes SYNCED.
     *
     * FIX E1: Para clientes que YA tienen un plan activo con este template_id,
     * se actualiza el plan IN-PLACE (mismo plan_id). Esto preserva los
     * daily_nutrition_logs históricos que apuntan al plan_id existente.
     *
     * Solo se crea un plan_id nuevo para clientes que reciben la plantilla por
     * primera vez (no tienen logs históricos = no hay riesgo de huérfanos).
     */
    async propagateTemplateChanges(
        templateId: string,
        coachId: string,
        selectedClientsStr: string
    ) {
        const selectedClients: string[] = selectedClientsStr
            ? JSON.parse(selectedClientsStr)
            : [];

        const { data: existingClients } = await this.supabase
            .from('nutrition_plans')
            .select('client_id')
            .eq('template_id', templateId)
            .eq('is_active', true)
            .eq('is_custom', false) as any;

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

        if (!template) throw new Error('Plantilla no encontrada');

        this.assertTemplateMealsAreComplete(template.template_meals as TemplateMealWithGroups[])

        for (const clientId of allClientIds) {
            // Buscar plan SYNCED existente para este cliente+plantilla
            const { data: existingPlan } = await this.supabase
                .from('nutrition_plans')
                .select('id')
                .eq('client_id', clientId)
                .eq('template_id', templateId)
                .eq('is_active', true)
                .eq('is_custom', false)
                .maybeSingle() as any;

            let planId: string;

            if (existingPlan) {
                // UPDATE in-place: el plan_id NO cambia → daily_nutrition_logs siguen válidos
                await this.supabase
                    .from('nutrition_plans')
                    .update({
                        name: template.name,
                        daily_calories: template.daily_calories,
                        protein_g: template.protein_g,
                        carbs_g: template.carbs_g,
                        fats_g: template.fats_g,
                        instructions: template.instructions,
                    } as any)
                    .eq('id', existingPlan.id);

                planId = existingPlan.id;

                // Fetch existing meals to match by order_index (preserves IDs → nutrition_meal_logs survive)
                const { data: existingMeals } = await this.supabase
                    .from('nutrition_meals')
                    .select('id, order_index, day_of_week')
                    .eq('plan_id', existingPlan.id)
                    .order('order_index', { ascending: true });

                const existingByIndex = new Map<number, string>(
                    (existingMeals ?? []).map((m: any) => [m.order_index as number, m.id as string])
                );
                const templateMealsSorted = [...template.template_meals].sort(
                    (a: any, b: any) => a.order_index - b.order_index
                );
                const newIndices = new Set(templateMealsSorted.map((m: any) => m.order_index as number));

                const toDelete = (existingMeals ?? [])
                    .filter((m: any) => !newIndices.has(m.order_index as number))
                    .map((m: any) => m.id as string);

                if (toDelete.length) {
                    await this.supabase.from('food_items').delete().in('meal_id', toDelete);
                    await this.supabase.from('nutrition_meals').delete().in('id', toDelete);
                }

                for (const tMeal of templateMealsSorted) {
                    const items = this.getTemplateMealItems(tMeal as TemplateMealWithGroups);
                    const existingId = existingByIndex.get(tMeal.order_index as number);

                    if (existingId) {
                        await this.supabase
                            .from('nutrition_meals')
                            .update({
                                name: tMeal.name,
                                description: (tMeal as { description?: string }).description ?? '',
                                order_index: tMeal.order_index,
                                day_of_week: (tMeal as { day_of_week?: number | null }).day_of_week ?? null,
                            })
                            .eq('id', existingId);
                        await this.supabase.from('food_items').delete().eq('meal_id', existingId);
                        if (items.length > 0) {
                            await this.supabase.from('food_items').insert(
                                items.map((it: any) => ({
                                    meal_id: existingId,
                                    food_id: it.food_id,
                                    quantity: it.quantity,
                                    unit: it.unit,
                                    swap_options: it.swap_options ?? [],
                                }))
                            );
                        }
                    } else {
                        const { data: newMeal } = await this.supabase
                            .from('nutrition_meals')
                            .insert({
                                plan_id: planId,
                                name: tMeal.name,
                                description: (tMeal as { description?: string }).description ?? '',
                                order_index: tMeal.order_index,
                                day_of_week: (tMeal as { day_of_week?: number | null }).day_of_week ?? null,
                            })
                            .select('id')
                            .single();
                        if (newMeal && items.length > 0) {
                            await this.supabase.from('food_items').insert(
                                items.map((it: any) => ({
                                    meal_id: newMeal.id,
                                    food_id: it.food_id,
                                    quantity: it.quantity,
                                    unit: it.unit,
                                    swap_options: it.swap_options ?? [],
                                }))
                            );
                        }
                    }
                }

                continue; // meals already handled above
            } else {
                // Cliente nuevo para esta plantilla: crear plan fresco
                // (no hay logs históricos todavía → crear nuevo plan_id es seguro)
                await this.supabase
                    .from('nutrition_plans')
                    .update({ is_active: false } as any)
                    .eq('client_id', clientId)
                    .eq('is_active', true);

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
                planId = newPlan.id;
            }

            // Re-insertar meals y food_items para el plan
            for (const tMeal of template.template_meals) {
                const { data: newMeal } = await this.supabase
                    .from('nutrition_meals')
                    .insert({
                        plan_id: planId,
                        name: tMeal.name,
                        description: (tMeal as { description?: string }).description ?? '',
                        order_index: tMeal.order_index,
                        day_of_week: (tMeal as { day_of_week?: number | null }).day_of_week ?? null,
                    })
                    .select('id')
                    .single();

                if (!newMeal) continue;

                const items = this.getTemplateMealItems(tMeal as TemplateMealWithGroups);
                if (items.length > 0) {
                    await this.supabase.from('food_items').insert(
                        items.map((it: any) => ({
                            meal_id: newMeal.id,
                            food_id: it.food_id,
                            quantity: it.quantity,
                            unit: it.unit,
                            swap_options: it.swap_options ?? [],
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

        this.assertTemplateMealsAreComplete(template.template_meals as TemplateMealWithGroups[])

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
                    day_of_week: (tMeal as { day_of_week?: number | null }).day_of_week ?? null,
                })
                .select('id')
                .single();

            if (!newMeal) continue;

            const items = this.getTemplateMealItems(tMeal as TemplateMealWithGroups);
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
                            swap_options: it.swap_options ?? [],
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
