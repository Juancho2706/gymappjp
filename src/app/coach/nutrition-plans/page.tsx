import { createClient } from '@/lib/supabase/server'
import { NutritionManagement } from './NutritionManagement'

export default async function NutritionPlansPage() {
    const supabase = await createClient()

    // 1. Get Coach ID
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    // 2. Get Saved Meal Groups
    const { data: mealGroups } = await supabase
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
        .order('name')

    // 3. Get Nutrition Templates (Global Plans)
    const { data: templates } = await supabase
        .from('nutrition_plan_templates')
        .select(`
            *,
            template_meals (
                id,
                name
            )
        `)
        .eq('coach_id', user.id)
        .order('created_at', { ascending: false })

    // 4. Get Clients for assignment
    const { data: clients } = await supabase
        .from('clients')
        .select('id, full_name')
        .eq('coach_id', user.id)
        .eq('is_active', true)
        .order('full_name')

    return (
        <NutritionManagement 
            coachId={user.id} 
            initialTemplates={templates || []}
            initialGroups={mealGroups || []} 
            availableClients={clients || []}
        />
    )
}
