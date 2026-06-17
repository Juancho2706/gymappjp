import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

export const getNutritionPlansPageCoach = cache(async () => {
    const supabase = await createClient()
    // getClaims(): verificación local del JWT (ES256), sin /user. El proxy ya validó/refrescó la sesión.
    const { data: __cl } = await supabase.auth.getClaims()
    const user = __cl?.claims?.sub ? { id: __cl.claims.sub as string } : null
    if (!user) return { user: null, coach: null }

    const { data: coach } = await supabase
        .from('coaches')
        .select('subscription_tier, active_org_id')
        .eq('id', user.id)
        .maybeSingle()

    return { user, coach }
})

export type OrgNutritionTemplate = {
    id: string
    name: string
    description: string | null
    goal_type: string | null
    daily_calories: number | null
    protein_g: number | null
    carbs_g: number | null
    fats_g: number | null
    instructions: string | null
    meal_names: { name: string; order_index: number; description?: string }[]
}

export const getCoachOrgNutritionTemplates = cache(async (orgId: string): Promise<OrgNutritionTemplate[]> => {
    const supabase = await createClient()
    const { data } = await supabase
        .from('org_nutrition_templates')
        .select('id, name, description, goal_type, daily_calories, protein_g, carbs_g, fats_g, instructions, meal_names')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
    return (data ?? []).map(t => ({
        ...t,
        meal_names: Array.isArray(t.meal_names) ? (t.meal_names as OrgNutritionTemplate['meal_names']) : [],
    }))
})
