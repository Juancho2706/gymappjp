import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { RecipeSearch } from './RecipeSearch'
import { RecipeLibraryClient } from './RecipeLibraryClient'
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChefHat } from 'lucide-react'

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
                    <RecipeLibraryClient recipes={savedRecipes || []} coachId={coach.id} />
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
