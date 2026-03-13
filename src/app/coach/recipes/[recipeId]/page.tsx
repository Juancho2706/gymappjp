import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, ChefHat, Clock, Flame } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'

export default async function RecipeDetailPage({ params }: { params: Promise<{ recipeId: string }> }) {
    const { recipeId } = await params
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const { data: recipe } = await supabase
        .from('recipes')
        .select(`
            *,
            recipe_ingredients (*)
        `)
        .eq('id', recipeId)
        .single()

    if (!recipe) {
        return (
            <div className="p-6 text-center">
                <p>Receta no encontrada.</p>
                <Link href="/coach/recipes" className="text-primary hover:underline mt-4 inline-block">Volver a recetas</Link>
            </div>
        )
    }

    return (
        <div className="flex-1 space-y-6 p-6 max-w-5xl mx-auto w-full">
            <Link href="/coach/recipes" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Volver a Mis Recetas
            </Link>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Imagen y Resumen */}
                <div className="md:col-span-1 space-y-6">
                    <Card className="overflow-hidden">
                        <div className="relative h-64 w-full bg-muted">
                            {recipe.image_url ? (
                                <Image 
                                    src={recipe.image_url} 
                                    alt={recipe.name} 
                                    fill 
                                    className="object-cover"
                                    unoptimized
                                />
                            ) : (
                                <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                                    <ChefHat className="w-12 h-12 opacity-20" />
                                </div>
                            )}
                        </div>
                        <CardHeader>
                            <CardTitle className="text-2xl">{recipe.name}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex flex-wrap gap-2">
                                {recipe.prep_time_minutes && (
                                    <Badge variant="secondary" className="flex items-center gap-1">
                                        <Clock className="w-3 h-3" /> {recipe.prep_time_minutes} min
                                    </Badge>
                                )}
                                {recipe.calories && (
                                    <Badge variant="default" className="flex items-center gap-1">
                                        <Flame className="w-3 h-3" /> {recipe.calories} kcal
                                    </Badge>
                                )}
                            </div>

                            <div className="grid grid-cols-3 gap-2 text-center text-sm border-t pt-4">
                                <div className="bg-muted rounded-lg p-2">
                                    <div className="font-semibold">{recipe.protein_g || 0}g</div>
                                    <div className="text-xs text-muted-foreground">Proteína</div>
                                </div>
                                <div className="bg-muted rounded-lg p-2">
                                    <div className="font-semibold">{recipe.carbs_g || 0}g</div>
                                    <div className="text-xs text-muted-foreground">Carbs</div>
                                </div>
                                <div className="bg-muted rounded-lg p-2">
                                    <div className="font-semibold">{recipe.fats_g || 0}g</div>
                                    <div className="text-xs text-muted-foreground">Grasas</div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Ingredientes e Instrucciones */}
                <div className="md:col-span-2 space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Ingredientes</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <ul className="divide-y">
                                {recipe.recipe_ingredients?.map((ing: any) => (
                                    <li key={ing.id} className="py-2 flex justify-between items-center">
                                        <span>{ing.name}</span>
                                        <span className="text-muted-foreground font-medium bg-muted px-2 py-0.5 rounded text-sm">
                                            {ing.quantity} {ing.unit}
                                        </span>
                                    </li>
                                ))}
                                {(!recipe.recipe_ingredients || recipe.recipe_ingredients.length === 0) && (
                                    <p className="text-muted-foreground italic">No hay ingredientes registrados.</p>
                                )}
                            </ul>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Instrucciones</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {recipe.instructions ? (
                                <div className="whitespace-pre-wrap text-muted-foreground">
                                    {recipe.instructions}
                                </div>
                            ) : (
                                <p className="text-muted-foreground italic">
                                    {recipe.description || 'No hay instrucciones detalladas para esta receta.'}
                                </p>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    )
}
