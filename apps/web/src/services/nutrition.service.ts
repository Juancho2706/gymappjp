import { SupabaseClient } from '@supabase/supabase-js';
import { Database } from '@/lib/database.types';
import { reconcileMeals } from './nutrition-propagation.reconcile';

type TemplateData = {
    name: string;
    daily_calories: number | null;
    protein_g: number | null;
    carbs_g: number | null;
    fats_g: number | null;
    instructions: string | null;
    coach_id: string;
    org_id?: string | null;
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

    private applyOrgScope<T extends { eq: (column: string, value: string) => T; is: (column: string, value: null) => T }>(
        query: T,
        orgId: string | null
    ): T {
        return orgId ? query.eq('org_id', orgId) : query.is('org_id', null)
    }

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

    private foodRowsFor(mealId: string, items: TemplateSavedMealItem[]) {
        return items.map((it) => ({
            meal_id: mealId,
            food_id: it.food_id,
            quantity: it.quantity,
            unit: it.unit,
            swap_options: (it.swap_options ?? []) as unknown as Database['public']['Tables']['food_items']['Insert']['swap_options'],
        }))
    }

    /**
     * Inserta un conjunto de comidas (con sus food_items) en un plan, BATCHEADO:
     * 1 INSERT para todas las comidas + 1 INSERT para todos los food_items
     * (vs. el N+1 previo de 2 queries por comida). Mapea food_items -> meal por
     * order_index (único dentro de un plan). RLS-scoped (corre como el usuario, no
     * service-role) -> el aislamiento por coach/org lo sigue gateando la policy.
     */
    private async insertMealsForPlan(planId: string, templateMeals: TemplateMealWithGroups[]) {
        if (templateMeals.length === 0) return
        const { data: inserted } = await this.supabase
            .from('nutrition_meals')
            .insert(
                templateMeals.map((t) => ({
                    plan_id: planId,
                    name: t.name,
                    description: (t as { description?: string }).description ?? '',
                    order_index: t.order_index,
                    day_of_week: (t as { day_of_week?: number | null }).day_of_week ?? null,
                })) as any
            )
            .select('id, order_index');

        const idByIndex = new Map<number, string>(
            (inserted ?? []).map((m: any) => [m.order_index as number, m.id as string])
        );
        const foodRows: ReturnType<typeof this.foodRowsFor> = [];
        for (const t of templateMeals) {
            const mealId = idByIndex.get(t.order_index as number);
            if (!mealId) continue;
            const items = this.getTemplateMealItems(t);
            if (items.length > 0) foodRows.push(...this.foodRowsFor(mealId, items));
        }
        if (foodRows.length > 0) {
            await this.supabase.from('food_items').insert(foodRows as any);
        }
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
            let updateQuery = this.supabase
                .from('nutrition_plan_templates')
                .update(templateData)
                .eq('id', templateId)
                .eq('coach_id', templateData.coach_id)
            updateQuery = this.applyOrgScope(updateQuery, templateData.org_id ?? null)
            const { error: updateError } = await updateQuery;

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
        selectedClientsStr: string,
        orgId: string | null = null
    ) {
        const selectedClients: string[] = selectedClientsStr
            ? JSON.parse(selectedClientsStr)
            : [];

        let existingClientsQuery = this.supabase
            .from('nutrition_plans')
            .select('client_id')
            .eq('template_id', templateId)
            .eq('coach_id', coachId)
            .eq('is_active', true)
            .eq('is_custom', false)
        existingClientsQuery = this.applyOrgScope(existingClientsQuery, orgId)
        const { data: existingClients } = await existingClientsQuery as any;

        const allClientIds = new Set([
            ...selectedClients,
            ...(existingClients?.map((c: any) => c.client_id) || []),
        ]);

        if (allClientIds.size === 0) return;

        let templateQuery = this.supabase
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
        templateQuery = this.applyOrgScope(templateQuery, orgId)
        const { data: template } = await templateQuery.single() as any;

        if (!template) throw new Error('Plantilla no encontrada');

        this.assertTemplateMealsAreComplete(template.template_meals as TemplateMealWithGroups[])

        let allowedClientsQuery = this.supabase
            .from('clients')
            .select('id')
            .eq('coach_id', coachId)
            .in('id', [...allClientIds])
        allowedClientsQuery = this.applyOrgScope(allowedClientsQuery, orgId)
        const { data: allowedClients, error: allowedClientsError } = await allowedClientsQuery;
        if (allowedClientsError) throw allowedClientsError;

        const allowedClientIds = new Set((allowedClients ?? []).map((client) => client.id as string));
        if (allowedClientIds.size !== allClientIds.size) {
            throw new Error('Uno o mas alumnos no pertenecen al workspace activo.');
        }

        // Pre-fetch BATCHEADO de planes SYNCED existentes para TODOS los clientes (1 query en
        // vez de 1 por alumno). RLS-scoped -> solo trae los planes visibles al usuario actual.
        let existingPlansQuery = this.supabase
            .from('nutrition_plans')
            .select('id, client_id')
            .in('client_id', [...allClientIds])
            .eq('template_id', templateId)
            .eq('is_active', true)
            .eq('is_custom', false)
        existingPlansQuery = this.applyOrgScope(existingPlansQuery, orgId)
        const { data: existingPlanRows } = await existingPlansQuery as any;
        const existingPlanByClient = new Map<string, string>(
            (existingPlanRows ?? []).map((r: any) => [r.client_id as string, r.id as string])
        );

        // Best-effort por-cliente (NO transaccional: PostgREST autocommit). Si falla a mitad,
        // re-ejecutar la propagación reconcilia (UPDATE in-place por order_index = idempotente).
        for (const clientId of allClientIds) {
            const existingPlanId = existingPlanByClient.get(clientId);

            let planId: string;

            if (existingPlanId) {
                // UPDATE in-place: el plan_id NO cambia → daily_nutrition_logs siguen válidos
                let updatePlanQuery = this.supabase
                    .from('nutrition_plans')
                    .update({
                        name: template.name,
                        daily_calories: template.daily_calories,
                        protein_g: template.protein_g,
                        carbs_g: template.carbs_g,
                        fats_g: template.fats_g,
                        instructions: template.instructions,
                    } as any)
                    .eq('id', existingPlanId)
                    .eq('coach_id', coachId)
                updatePlanQuery = this.applyOrgScope(updatePlanQuery, orgId)
                await updatePlanQuery;

                planId = existingPlanId;

                // Comidas existentes -> match por order_index (preserva IDs → nutrition_meal_logs sobreviven)
                const { data: existingMeals } = await this.supabase
                    .from('nutrition_meals')
                    .select('id, order_index')
                    .eq('plan_id', existingPlanId)
                    .order('order_index', { ascending: true });

                const templateMealsSorted = [...template.template_meals].sort(
                    (a: any, b: any) => a.order_index - b.order_index
                );

                // Cascade-safety (CRÍTICO): nutrition_meal_logs.meal_id -> nutrition_meals es ON DELETE
                // CASCADE; borrar una comida con historial elimina la adherencia del alumno. Averiguar
                // cuáles comidas huérfanas tienen logs ANTES de decidir qué borrar.
                const newIndices = new Set(templateMealsSorted.map((m: any) => m.order_index as number));
                const removalCandidates = (existingMeals ?? [])
                    .filter((m: any) => !newIndices.has(m.order_index as number))
                    .map((m: any) => m.id as string);
                let loggedMealIds = new Set<string>();
                if (removalCandidates.length) {
                    const { data: loggedRows } = await this.supabase
                        .from('nutrition_meal_logs')
                        .select('meal_id')
                        .in('meal_id', removalCandidates);
                    loggedMealIds = new Set((loggedRows ?? []).map((r: any) => r.meal_id as string));
                }

                const recon = reconcileMeals(
                    (existingMeals ?? []).map((m: any) => ({
                        id: m.id as string,
                        order_index: m.order_index as number,
                    })),
                    templateMealsSorted.map((t: any) => ({
                        order_index: t.order_index as number,
                        name: t.name as string,
                        description: (t as { description?: string }).description ?? '',
                        day_of_week: (t as { day_of_week?: number | null }).day_of_week ?? null,
                    })),
                    loggedMealIds
                );

                // BORRAR huérfanas sin logs (batcheado; las que tienen logs se conservan)
                if (recon.toDelete.length) {
                    await this.supabase.from('food_items').delete().in('meal_id', recon.toDelete);
                    await this.supabase.from('nutrition_meals').delete().in('id', recon.toDelete);
                }

                // UPDATE in-place de comidas matcheadas (valores distintos por id → 1 update c/u)
                for (const u of recon.toUpdate) {
                    await this.supabase
                        .from('nutrition_meals')
                        .update({
                            name: u.name,
                            description: u.description,
                            order_index: u.order_index,
                            day_of_week: u.day_of_week,
                        })
                        .eq('id', u.id);
                }
                // food_items de las comidas updateadas: 1 DELETE + 1 INSERT batcheados (antes 2/comida)
                if (recon.toUpdate.length) {
                    const updatedIds = recon.toUpdate.map((u) => u.id);
                    await this.supabase.from('food_items').delete().in('meal_id', updatedIds);
                    const idByIndex = new Map<number, string>(recon.toUpdate.map((u) => [u.order_index, u.id]));
                    const foodRows: ReturnType<typeof this.foodRowsFor> = [];
                    for (const tMeal of templateMealsSorted) {
                        const mealId = idByIndex.get(tMeal.order_index as number);
                        if (!mealId) continue;
                        const items = this.getTemplateMealItems(tMeal as TemplateMealWithGroups);
                        if (items.length > 0) foodRows.push(...this.foodRowsFor(mealId, items));
                    }
                    if (foodRows.length > 0) await this.supabase.from('food_items').insert(foodRows as any);
                }

                // INSERTAR comidas nuevas (índices de plantilla sin comida existente), batcheado
                if (recon.toInsert.length) {
                    const insertIndices = new Set(recon.toInsert.map((t) => t.order_index));
                    const toInsertMeals = templateMealsSorted.filter((t: any) =>
                        insertIndices.has(t.order_index as number)
                    ) as TemplateMealWithGroups[];
                    await this.insertMealsForPlan(planId, toInsertMeals);
                }

                continue; // meals already handled above
            } else {
                // Cliente nuevo para esta plantilla: crear plan fresco
                // (no hay logs históricos todavía → crear nuevo plan_id es seguro)
                let deactivateQuery = this.supabase
                    .from('nutrition_plans')
                    .update({ is_active: false } as any)
                    .eq('client_id', clientId)
                    .eq('coach_id', coachId)
                    .eq('is_active', true)
                deactivateQuery = this.applyOrgScope(deactivateQuery, orgId)
                await deactivateQuery;

                const { data: newPlan } = await this.supabase
                    .from('nutrition_plans')
                    .insert({
                        client_id: clientId,
                        coach_id: coachId,
                        org_id: orgId,
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

                // Cliente nuevo: insertar TODAS las comidas de la plantilla (batcheado, N exactas).
                await this.insertMealsForPlan(planId, template.template_meals as TemplateMealWithGroups[]);
            }
        }
    }

    async duplicateTemplate(templateId: string, coachId: string, orgId: string | null = null) {
        let templateQuery = this.supabase
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
        templateQuery = this.applyOrgScope(templateQuery, orgId)
        const { data: template, error: fetchError } = await templateQuery.single() as any;

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
                org_id: orgId,
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
