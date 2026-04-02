import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Apple } from 'lucide-react'
import { AddFoodForm } from './AddFoodForm'
import { FoodSearch } from './FoodSearch'

interface Food {
    id: string;
    name: string;
    serving_size: number;
    serving_unit: string;
    calories: number;
    protein_g: number;
    carbs_g: number;
    fats_g: number;
    coach_id: string | null;
}

export default async function CoachFoodsPage() {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const { data: foods } = await supabase
        .from('foods')
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
                        <Apple className="w-5 h-5 text-primary flex-shrink-0" />
                        <span className="truncate">Mis Alimentos</span>
                    </h1>
                </div>
            </div>

            <div className="bg-card border border-border rounded-2xl shadow-sm p-4 sm:p-8">
                <AddFoodForm coachId={user.id} />
            </div>

            <div className="mt-8">
                <h2 className="text-lg font-bold text-foreground mb-4">Buscar Alimentos</h2>
                <FoodSearch />
            </div>

            <div className="mt-8">
                <h2 className="text-lg font-bold text-foreground mb-4">Alimentos Creados</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {(foods as Food[])?.map((food) => (
                        <div key={food.id} className="bg-card border border-border rounded-xl p-4">
                            <h3 className="font-bold">{food.name}</h3>
                            <p className="text-sm text-muted-foreground">Serving: {food.serving_size}{food.serving_unit}</p>
                            <div className="grid grid-cols-4 gap-2 mt-2 text-xs">
                                <div>
                                    <p className="font-bold">Calorías</p>
                                    <p>{food.calories}</p>
                                </div>
                                <div>
                                    <p className="font-bold">Proteínas</p>
                                    <p>{food.protein_g}g</p>
                                </div>
                                <div>
                                    <p className="font-bold">Carbs</p>
                                    <p>{food.carbs_g}g</p>
                                </div>
                                <div>
                                    <p className="font-bold">Grasas</p>
                                    <p>{food.fats_g}g</p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}
