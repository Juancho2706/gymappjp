import { createClient } from '@/lib/supabase/server'
import { NutritionManagement } from './NutritionManagement'

export default async function NutritionPlansPage() {
    const supabase = await createClient()

    // 1. Get Coach ID
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    // 2. Get data in parallel
    const [mealGroupsResponse, templatesResponse, clientsResponse] = await Promise.all([
        supabase
            .from('saved_meals')
            .select(`
                id,
                name,
                items:saved_meal_items(
                    id,
                    quantity,
                    unit,
                    food:foods(*)
                )
            `)
            .eq('coach_id', user.id)
            .order('name'),
        
        supabase
            .from('nutrition_plan_templates')
            .select(`
                *,
                assigned_clients:nutrition_plans(
                    client:clients(id, full_name),
                    is_active
                ),
                template_meals (
                    id,
                    name,
                    order_index,
                    template_meal_groups (
                        id,
                        order_index,
                        saved_meals (
                            id,
                            name,
                            saved_meal_items (
                                id,
                                quantity,
                                unit,
                                food:foods (*)
                            )
                        )
                    )
                )
            `)
            .eq('coach_id', user.id)
            .order('created_at', { ascending: false }),

        supabase
            .from('clients')
            .select(`
                id, 
                full_name,
                active_plans:nutrition_plans(id, name, template_id, is_active)
            `)
            .eq('coach_id', user.id)
            .eq('is_active', true)
            .eq('active_plans.is_active', true)
            .order('full_name')
    ])

    const mealGroups = mealGroupsResponse.data
    const templates = (templatesResponse.data || []).map(t => ({
        ...t,
        assigned_clients: t.assigned_clients
            ?.filter((p: any) => p.is_active)
            .map((p: any) => p.client) || []
    }))
    const clients = (clientsResponse.data || []).map(c => ({
        id: c.id,
        full_name: c.full_name,
        active_plan: c.active_plans?.[0] || null
    }))

    return (
        <NutritionManagement 
            coachId={user.id} 
            initialTemplates={templates || []}
            initialGroups={mealGroups || []} 
            availableClients={clients || []}
        />
    )
}
