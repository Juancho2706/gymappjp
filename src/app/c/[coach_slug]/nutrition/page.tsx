import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ArrowLeft, CheckCircle2, Circle, Apple } from 'lucide-react'
import Link from 'next/link'
import type { Metadata } from 'next'
import { NutritionTracker } from './NutritionTracker'
import type { Tables } from '@/lib/database.types'

type NutritionPlan = Tables<'nutrition_plans'>
type NutritionMeal = Tables<'nutrition_meals'>
type FoodItem = Tables<'food_items'>
type Food = Tables<'foods'>

interface NutritionMealWithItems extends NutritionMeal {
    food_items: (FoodItem & {
        foods: Food
    })[]
}

interface NutritionPlanWithMeals extends NutritionPlan {
    nutrition_meals: NutritionMealWithItems[]
}

export const metadata: Metadata = { title: 'Plan Nutricional' }

interface Props {
    params: Promise<{ coach_slug: string }>
}

export default async function ClientNutritionPage({ params }: Props) {
    const { coach_slug } = await params
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect(`/c/${coach_slug}/login`)

    // Fetch client and plan in parallel after auth
    const [clientResponse, planResponse] = await Promise.all([
        supabase
            .from('clients')
            .select(`
                id,
                coaches ( brand_name, primary_color )
            `)
            .eq('id', user.id)
            .single(),
        supabase
            .from('nutrition_plans')
            .select(`
                *,
                nutrition_meals (
                    *,
                    food_items (
                        *,
                        foods (*)
                    )
                )
            `)
            .eq('client_id', user.id)
            .eq('is_active', true)
            .maybeSingle<NutritionPlanWithMeals>()
    ])

    const client = clientResponse.data
    const plan = planResponse.data
    
    if (!client) redirect(`/c/${coach_slug}/login`)
    const coachBranding = Array.isArray(client.coaches) ? client.coaches[0] : client.coaches

    if (!plan) {
        return (
            <div className="min-h-screen relative overflow-hidden bg-background">
                <header className="border-b border-border px-4 py-4 flex items-center gap-3">
                    <Link href={`/c/${coach_slug}/dashboard`} className="p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors">
                        <ArrowLeft className="w-5 h-5" />
                    </Link>
                    <h1 className="text-xl font-bold text-foreground" style={{ fontFamily: 'var(--font-outfit)' }}>
                        Plan Nutricional
                    </h1>
                </header>
                <div className="flex flex-col items-center justify-center p-8 mt-20 text-center">
                    <Apple className="w-16 h-16 text-muted-foreground mb-4" />
                    <h2 className="text-xl font-bold text-foreground mb-2">Sin plan asignado</h2>
                    <p className="text-muted-foreground text-sm max-w-xs">Tu coach aún no te ha asignado un plan nutricional. Consulta con él para empezar.</p>
                </div>
            </div>
        )
    }

    // Fetch today's log (now we have the plan.id)
    const today = new Date().toISOString().split('T')[0]
    const { data: todayLog } = await supabase
        .from('daily_nutrition_logs')
        .select(`
            *,
            nutrition_meal_logs (*)
        `)
        .eq('client_id', user.id)
        .eq('plan_id', plan.id)
        .eq('log_date', today)
        .maybeSingle()

    return (
        <div className="min-h-screen relative overflow-hidden bg-background">
            <div className="absolute top-0 right-0 w-96 h-96 opacity-10 blur-3xl rounded-full pointer-events-none" 
                 style={{ backgroundColor: coachBranding?.primary_color || 'var(--theme-primary)' }} />
            
            <header className="border-b border-border/10 px-4 py-4 md:px-8 sticky top-0 bg-background/80 backdrop-blur-xl z-40 flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-3">
                    <Link href={`/c/${coach_slug}/dashboard`} className="p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors">
                        <ArrowLeft className="w-5 h-5" />
                    </Link>
                    <h1 className="text-xl md:text-2xl font-bold text-foreground" style={{ fontFamily: 'var(--font-outfit)' }}>
                        Plan Nutricional
                    </h1>
                </div>
            </header>

            <main className="px-4 py-6 space-y-8 max-w-2xl mx-auto relative z-0 pb-32">
                {/* Header section with instructions only */}
                <section>
                    <h2 className="text-2xl font-bold text-foreground mb-1">{plan.name}</h2>
                    {plan.instructions && (
                        <div className="mt-4 bg-card/50 border border-border rounded-xl p-4">
                            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Indicaciones Generales</h3>
                            <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{plan.instructions}</p>
                        </div>
                    )}
                </section>

                <hr className="border-border" />

                {/* Meals Tracker */}
                <section>
                    <h3 className="text-lg font-bold text-foreground mb-4">Comidas de Hoy</h3>
                    
                    {plan.nutrition_meals && plan.nutrition_meals.length > 0 ? (
                        <NutritionTracker 
                            meals={plan.nutrition_meals.sort((a: any, b: any) => a.order_index - b.order_index)} 
                            log={todayLog} 
                            planId={plan.id}
                            clientId={user.id}
                            coachSlug={coach_slug}
                            goalMacros={{
                                calories: plan.daily_calories || 0,
                                protein: plan.protein_g || 0,
                                carbs: plan.carbs_g || 0,
                                fats: plan.fats_g || 0,
                            }}
                        />
                    ) : (
                        <div className="bg-card border border-border rounded-xl p-6 text-center">
                            <p className="text-muted-foreground text-sm">Este plan no tiene comidas específicas, solo macros diarios.</p>
                        </div>
                    )}
                </section>
            </main>
        </div>
    )
}
