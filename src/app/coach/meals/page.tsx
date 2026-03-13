import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Bookmark } from 'lucide-react'

interface SavedMeal {
    id: string;
    name: string;
    coach_id: string;
}

export default async function CoachSavedMealsPage() {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const { data: savedMeals } = await supabase
        .from('saved_meals')
        .select('*')
        .eq('coach_id', user.id)

    return (
        <div className="max-w-3xl mx-auto animate-fade-in mb-24 md:mb-0">
            <div className="flex items-center gap-4 mb-6 md:mb-8">
                <Link href="/coach/dashboard"
                    className="p-2 rounded-xl border border-border hover:bg-muted transition-colors flex-shrink-0">
                    <ArrowLeft className="w-5 h-5 text-muted-foreground" />
                </Link>
                <div className="min-w-0">
                    <h1 className="text-xl font-bold flex items-center gap-2">
                        <Bookmark className="w-5 h-5 text-primary flex-shrink-0" />
                        <span className="truncate">Mis Comidas Guardadas</span>
                    </h1>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(savedMeals as SavedMeal[])?.map((meal) => (
                    <div key={meal.id} className="bg-card border border-border rounded-xl p-4">
                        <h3 className="font-bold">{meal.name}</h3>
                    </div>
                ))}
            </div>
        </div>
    )
}
