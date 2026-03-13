'use client'

import { useState } from 'react'
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Search, Plus, Loader2, Clock, Flame } from 'lucide-react'
import { saveRecipe } from './actions'
import { toast } from 'sonner'
import Image from 'next/image'

export function RecipeSearch({ coachId }: { coachId: string }) {
    const [query, setQuery] = useState('')
    const [results, setResults] = useState<any[]>([])
    const [loading, setLoading] = useState(false)
    const [savingId, setSavingId] = useState<string | null>(null)

    const handleSearch = async (e?: React.FormEvent) => {
        if (e) e.preventDefault()
        if (!query.trim()) return

        setLoading(true)
        setResults([])
        try {
            const res = await fetch(`/api/recipes/search?q=${encodeURIComponent(query)}`)
            const data = await res.json()
            if (data.recipes) {
                setResults(data.recipes)
            } else {
                toast.error(data.error || 'Error al buscar recetas')
            }
        } catch (error) {
            console.error(error)
            toast.error('Error de red al buscar recetas')
        } finally {
            setLoading(false)
        }
    }

    const handleSave = async (recipe: any) => {
        setSavingId(recipe.id)
        try {
            const result = await saveRecipe(recipe, coachId)
            if (result.error) {
                toast.error(result.error)
            } else {
                toast.success('Receta guardada en tu biblioteca')
                // Opcional: remover de la lista de resultados o marcar como guardada
            }
        } catch (error) {
            toast.error('Error al guardar la receta')
        } finally {
            setSavingId(null)
        }
    }

    return (
        <div className="space-y-6">
            <form onSubmit={handleSearch} className="flex gap-2">
                <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        type="search"
                        placeholder="Buscar por ingredientes, nombre, dieta (ej: pollo, keto, ensalada)..."
                        className="pl-9"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                    />
                </div>
                <Button type="submit" disabled={loading || !query.trim()}>
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Buscar'}
                </Button>
            </form>

            {results.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {results.map((recipe) => (
                        <div key={recipe.id} className="border rounded-xl overflow-hidden bg-card flex flex-col">
                            <div className="relative h-48 w-full bg-muted">
                                {recipe.image ? (
                                    <Image 
                                        src={recipe.image} 
                                        alt={recipe.title} 
                                        fill 
                                        className="object-cover"
                                        unoptimized // Para URLs externas arbitrarias en desarrollo
                                    />
                                ) : (
                                    <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                                        Sin imagen
                                    </div>
                                )}
                            </div>
                            <div className="p-4 flex flex-col flex-1">
                                <h3 className="font-semibold text-lg line-clamp-2 mb-2">{recipe.title}</h3>
                                
                                <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4">
                                    <div className="flex items-center gap-1">
                                        <Flame className="w-4 h-4" />
                                        {recipe.calories} kcal
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <Clock className="w-4 h-4" />
                                        {recipe.prepTime} min
                                    </div>
                                </div>

                                <div className="text-sm space-y-1 mb-4">
                                    <p><span className="font-medium">P:</span> {recipe.protein}g <span className="font-medium ml-2">C:</span> {recipe.carbs}g <span className="font-medium ml-2">G:</span> {recipe.fat}g</p>
                                    <p className="text-muted-foreground line-clamp-2">
                                        {recipe.ingredients?.length} ingredientes
                                    </p>
                                </div>

                                <div className="mt-auto pt-4">
                                    <Button 
                                        variant="secondary" 
                                        className="w-full gap-2"
                                        onClick={() => handleSave(recipe)}
                                        disabled={savingId === recipe.id}
                                    >
                                        {savingId === recipe.id ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <>
                                                <Plus className="w-4 h-4" />
                                                Guardar en Biblioteca
                                            </>
                                        )}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {results.length === 0 && !loading && query && (
                <div className="text-center py-12 text-muted-foreground">
                    No se encontraron recetas para "{query}"
                </div>
            )}
        </div>
    )
}
