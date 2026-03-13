import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { RecipeSearch } from './RecipeSearch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChefHat, Flame, Clock } from 'lucide-react'
import Image from 'next/image'

export const metadata = {
    title: 'Mis Recetas | OmniCoach',
}

export default async function RecipesPage() {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const { data: coach } = await supabase
        .from('coaches')
        .select('id')
        .eq('id', user.id)
        .single()

    if (!coach) redirect('/login')

    // Obtener recetas guardadas
    const { data: savedRecipes } = await supabase
        .from('recipes')
        .select('*')
        .eq('coach_id', coach.id)
        .order('created_at', { ascending: false })

    return (
        <div className="flex-1 space-y-6 p-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                        <ChefHat className="h-8 w-8 text-primary" />
                        Mis Recetas
                    </h2>
                    <p className="text-muted-foreground mt-1">
                        Busca, guarda y gestiona recetas para incluirlas en los planes de tus clientes.
                    </p>
                </div>
            </div>

            <Tabs defaultValue="library" className="w-full">
                <TabsList className="mb-4">
                    <TabsTrigger value="library">Mi Biblioteca ({savedRecipes?.length || 0})</TabsTrigger>
                    <TabsTrigger value="discover">Descubrir Nuevas</TabsTrigger>
                </TabsList>

                <TabsContent value="library" className="space-y-4">
                    {savedRecipes && savedRecipes.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                            {savedRecipes.map((recipe) => (
                                <Card key={recipe.id} className="overflow-hidden flex flex-col">
                                    <div className="relative h-40 w-full bg-muted">
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
                                                Sin imagen
                                            </div>
                                        )}
                                    </div>
                                    <CardHeader className="p-4 pb-2">
                                        <CardTitle className="text-base line-clamp-2">{recipe.name}</CardTitle>
                                    </CardHeader>
                                    <CardContent className="p-4 pt-0 flex flex-col flex-1">
                                        <div className="flex items-center gap-4 text-xs text-muted-foreground mb-3">
                                            <div className="flex items-center gap-1">
                                                <Flame className="w-3.5 h-3.5" />
                                                {recipe.calories || '-'} kcal
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <Clock className="w-3.5 h-3.5" />
                                                {recipe.prep_time_minutes || '-'} min
                                            </div>
                                        </div>
                                        <div className="text-xs space-y-1 mb-4 bg-muted/50 p-2 rounded-md">
                                            <div className="flex justify-between">
                                                <span>Proteínas:</span>
                                                <span className="font-medium">{recipe.protein_g || '-'}g</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span>Carbs:</span>
                                                <span className="font-medium">{recipe.carbs_g || '-'}g</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span>Grasas:</span>
                                                <span className="font-medium">{recipe.fats_g || '-'}g</span>
                                            </div>
                                        </div>
                                        <div className="mt-auto">
                                            <a href={`/coach/recipes/${recipe.id}`} className="text-sm text-primary hover:underline font-medium">
                                                Ver detalles →
                                            </a>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-12 border rounded-xl border-dashed">
                            <ChefHat className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-20" />
                            <h3 className="text-lg font-medium">Aún no tienes recetas</h3>
                            <p className="text-muted-foreground">Ve a la pestaña "Descubrir Nuevas" para buscar y agregar recetas a tu biblioteca.</p>
                        </div>
                    )}
                </TabsContent>

                <TabsContent value="discover">
                    <Card>
                        <CardHeader>
                            <CardTitle>Buscador de Recetas</CardTitle>
                            <CardDescription>
                                Busca recetas por ingredientes o nombre. Las recetas guardadas estarán disponibles para asignar a tus clientes.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <RecipeSearch coachId={coach.id} />
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    )
}
