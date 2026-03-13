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
        const timer = setTimeout(() => {
            handleSearch()
        }, 300)

        return () => clearTimeout(timer)
    }, [searchTerm])

    const handleSearch = async () => {
        if (!searchTerm.trim()) {
            setResults([])
            return
        }

        const { data, error } = await supabase.rpc('search_foods', { search_term: searchTerm })

        if (error) {
            console.error('Error searching foods:', error)
            return
        }

        setResults(data as Food[])
    }

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
                    <div key={food.id} className="bg-card border border-border rounded-xl p-4 flex justify-between items-center">
                        <div>
                            <h3 className="font-bold">{food.name}</h3>
                            <p className="text-sm text-muted-foreground">Serving: {food.serving_size_g}g</p>
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
                        {onFoodSelected && (
                            <button
                                type="button"
                                className="bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-4 py-2 inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
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
