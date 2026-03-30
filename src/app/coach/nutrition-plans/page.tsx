import { createClient } from '@/lib/supabase/server'
import { NutritionPlanBuilder } from './NutritionPlanBuilder'

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
                food:foods(*)
            )
        `)
        .eq('coach_id', user.id)
        .order('name')

    // 3. Get Clients for assignment
    const { data: clients } = await supabase
        .from('clients')
        .select('id, full_name')
        .eq('coach_id', user.id)
        .eq('is_active', true)
        .order('full_name')

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold">Plan Alimenticio Global</h1>
                <p className="text-muted-foreground mt-1">
                    Crea plantillas de planes y asígnalas a múltiples alumnos a la vez.
                </p>
            </div>

            <NutritionPlanBuilder 
                coachId={user.id} 
                availableGroups={mealGroups || []} 
                availableClients={clients || []}
            />
        </div>
    )
}
