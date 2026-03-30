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
                template_meals (
                    id,
                    name
                )
            `)
            .eq('coach_id', user.id)
            .order('created_at', { ascending: false }),

        supabase
            .from('clients')
            .select('id, full_name')
            .eq('coach_id', user.id)
            .eq('is_active', true)
            .order('full_name')
    ])

    const mealGroups = mealGroupsResponse.data
    const templates = templatesResponse.data
    const clients = clientsResponse.data

    return (
        <NutritionManagement 
            coachId={user.id} 
            initialTemplates={templates || []}
            initialGroups={mealGroups || []} 
            availableClients={clients || []}
        />
    )
}
