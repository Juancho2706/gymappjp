'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, LayoutGrid } from 'lucide-react'
import { MealGroupLibraryClient } from './MealGroupLibraryClient'

export default async function CoachMealGroupsPage() {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    // Fetch existing meal groups with their items
    const { data: mealGroups } = await supabase
        .from('saved_meals')
        .select(`
            *,
            items:saved_meal_items(
                id,
                quantity,
                unit,
                food:foods(*)
            )
        `)
        .eq('coach_id', user.id)
        .order('name')

    return (
        <div className="max-w-4xl mx-auto animate-fade-in mb-24 md:mb-0">
            <div className="flex items-center gap-4 mb-6 md:mb-8">
                <Link href="/coach/dashboard"
                    className="p-2 rounded-xl border border-border hover:bg-muted transition-colors flex-shrink-0">
                    <ArrowLeft className="w-5 h-5 text-muted-foreground" />
                </Link>
                <div className="min-w-0">
                    <h1 className="text-xl font-bold flex items-center gap-2">
                        <LayoutGrid className="w-5 h-5 text-primary flex-shrink-0" />
                        <span className="truncate">Grupos de Alimentos</span>
                    </h1>
                    <p className="text-sm text-muted-foreground truncate">Crea plantillas de comidas para tus planes nutricionales</p>
                </div>
            </div>

            <MealGroupLibraryClient initialGroups={mealGroups || []} coachId={user.id} />
        </div>
    )
}
