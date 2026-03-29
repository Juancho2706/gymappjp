'use client'

import { useState, useEffect } from 'react'
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Search } from 'lucide-react'
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
            <div className="flex w-full items-center space-x-2">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                        type="text"
                        placeholder="Escribe para buscar (Ej: Pollo, Arroz...)"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-9 h-11"
                        autoFocus
                    />
                </div>
            </div>

            <div className="mt-4 space-y-2">
                {results.length === 0 && searchTerm.length >= 3 && (
                    <p className="text-center py-8 text-muted-foreground text-sm italic">No se encontraron alimentos con "{searchTerm}"</p>
                )}
                {results.map((food) => (
                    <div key={food.id} className="bg-card border border-border/60 hover:border-emerald-500/40 rounded-xl p-3 flex justify-between items-center gap-4 transition-colors group">
                        <div className="flex-1 min-w-0">
                            <h3 className="font-bold text-sm truncate group-hover:text-emerald-600 transition-colors">{food.name}</h3>
                            <div className="flex gap-3 mt-1">
                                <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground font-medium">100g/u base</span>
                                <div className="flex gap-2 text-[10px] text-muted-foreground">
                                    <span>{food.calories}kcal</span>
                                    <span className="opacity-30">|</span>
                                    <span>P: {food.protein_g}g</span>
                                    <span className="opacity-30">|</span>
                                    <span>C: {food.carbs_g}g</span>
                                    <span className="opacity-30">|</span>
                                    <span>G: {food.fats_g}g</span>
                                </div>
                            </div>
                        </div>
                        {onFoodSelected && (
                            <Button
                                type="button"
                                size="sm"
                                className="h-8 rounded-lg bg-emerald-600 hover:bg-emerald-700 font-bold"
                                onClick={() => onFoodSelected(food)}
                            >
                                Seleccionar
                            </Button>
                        )}
                    </div>
                ))}
            </div>
        </div>
    )
}
