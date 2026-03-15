'use client'

import { useState, useEffect } from 'react'
import { Input } from "@/components/ui/input"
import { createClient } from "@/lib/supabase/client"

export interface Food {
    id: string;
    name: string;
    serving_size_g: number;
    calories: number;
    protein_g: number;
    carbs_g: number;
    fats_g: number;
    coach_id: string | null;
}

interface Props {
    onFoodSelected?: (food: Food) => void;
}

export function FoodSearch({ onFoodSelected }: Props) {
    const supabase = createClient()
    const [searchTerm, setSearchTerm] = useState('')
    const [results, setResults] = useState<Food[]>([])

    useEffect(() => {
        const timer = setTimeout(async () => {
            if (searchTerm.trim().length < 3) {
                setResults([])
                return
            }

            const { data, error } = await supabase.rpc('search_foods', { search_term: searchTerm })

            if (error) {
                console.error('Error searching foods:', error)
                return
            }

            setResults(data as Food[])
        }, 300)

        return () => clearTimeout(timer)
    }, [searchTerm, supabase])

    return (
        <div>
            <div className="flex w-full max-w-sm items-center space-x-2">
                <Input
                    type="text"
                    placeholder="Buscar alimento..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                {results.map((food) => (
                    <div key={food.id} className="bg-card border border-border rounded-xl p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div className="flex-1 w-full">
                            <h3 className="font-bold line-clamp-2">{food.name}</h3>
                            <p className="text-sm text-muted-foreground mb-2">Porción: {food.serving_size_g}g</p>
                            <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs bg-muted/50 p-2 rounded-lg w-fit">
                                <div className="flex flex-col">
                                    <span className="font-medium text-muted-foreground">Calorías</span>
                                    <span>{food.calories}</span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="font-medium text-muted-foreground">Proteínas</span>
                                    <span>{food.protein_g}g</span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="font-medium text-muted-foreground">Carbs</span>
                                    <span>{food.carbs_g}g</span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="font-medium text-muted-foreground">Grasas</span>
                                    <span>{food.fats_g}g</span>
                                </div>
                            </div>
                        </div>
                        {onFoodSelected && (
                            <button
                                type="button"
                                className="bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-4 py-2 shrink-0 w-full sm:w-auto inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 mt-2 sm:mt-0"
                                onClick={() => onFoodSelected(food)}
                            >
                                Agregar
                            </button>
                        )}
                    </div>
                ))}
            </div>
        </div>
    )
}
