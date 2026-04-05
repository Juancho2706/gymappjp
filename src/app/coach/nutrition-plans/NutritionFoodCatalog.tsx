'use client'

import { useState, useMemo } from 'react'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Search, Apple, Info } from 'lucide-react'

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

interface Props {
    foods: Food[]
}

export function NutritionFoodCatalog({ foods }: Props) {
    const [search, setSearch] = useState('')

    const filteredFoods = useMemo(() => {
        return foods.filter(food => 
            food.name.toLowerCase().includes(search.toLowerCase())
        )
    }, [foods, search])

    return (
        <div className="space-y-6">
            <div className="relative max-w-md">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input 
                    placeholder="Buscar alimento por nombre..." 
                    className="pl-12 h-12 rounded-2xl bg-muted/30 border-border/50 focus:ring-primary/20 transition-all"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {filteredFoods.map((food) => (
                    <Card key={food.id} className="p-4 border-border/50 bg-card/50 backdrop-blur-sm hover:border-primary/30 transition-all group">
                        <div className="flex items-start justify-between mb-3">
                            <div>
                                <h3 className="font-bold text-sm line-clamp-1">{food.name}</h3>
                                <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest mt-1">
                                    {food.serving_size} {food.serving_unit}
                                </p>
                            </div>
                            <Apple className="w-4 h-4 text-primary opacity-30 group-hover:opacity-100 transition-opacity" />
                        </div>

                        <div className="grid grid-cols-2 gap-2 mt-4">
                            <div className="p-2 rounded-lg bg-orange-500/5 border border-orange-500/10">
                                <p className="text-[8px] font-black uppercase text-orange-500/60 leading-none">Kcal</p>
                                <p className="text-sm font-bold tabular-nums">{food.calories}</p>
                            </div>
                            <div className="p-2 rounded-lg bg-blue-500/5 border border-blue-500/10">
                                <p className="text-[8px] font-black uppercase text-blue-500/60 leading-none">Prot</p>
                                <p className="text-sm font-bold tabular-nums">{food.protein_g}g</p>
                            </div>
                            <div className="p-2 rounded-lg bg-emerald-500/5 border border-emerald-500/10">
                                <p className="text-[8px] font-black uppercase text-emerald-500/60 leading-none">Carbs</p>
                                <p className="text-sm font-bold tabular-nums">{food.carbs_g}g</p>
                            </div>
                            <div className="p-2 rounded-lg bg-purple-500/5 border border-purple-500/10">
                                <p className="text-[8px] font-black uppercase text-purple-500/60 leading-none">Fat</p>
                                <p className="text-sm font-bold tabular-nums">{food.fats_g}g</p>
                            </div>
                        </div>
                    </Card>
                ))}

                {filteredFoods.length === 0 && (
                    <div className="col-span-full py-12 text-center text-muted-foreground italic border-2 border-dashed border-border/50 rounded-3xl">
                        No se encontraron alimentos con "{search}"
                    </div>
                )}
            </div>
        </div>
    )
}
