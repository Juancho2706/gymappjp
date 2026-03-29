import { createClient } from '@/lib/supabase/server'
import { NutritionPlanBuilder } from './NutritionPlanBuilder'
import { CoachSidebar } from '@/components/coach/CoachSidebar'

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

    // 4. Get Coach Data for sidebar
    const { data: coach } = await supabase
        .from('coaches')
        .select('full_name, brand_name')
        .eq('id', user.id)
        .single()

    return (
        <div className="flex min-h-screen bg-muted/30">
            <CoachSidebar 
                coachName={coach?.full_name || ''} 
                coachBrand={coach?.brand_name || ''} 
            />
            <main className="flex-1 p-4 md:p-8">
                <div className="max-w-6xl mx-auto space-y-8">
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
            </main>
        </div>
    )
}
