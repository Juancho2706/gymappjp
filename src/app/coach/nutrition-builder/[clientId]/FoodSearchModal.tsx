'use client'

import { useState } from 'react'
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FoodSearch } from '@/app/coach/foods/FoodSearch'
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
import { Search, Info } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface Props {
    onFoodSelected: (food: Food, quantity: number, unit?: string) => void;
}

export function FoodSearchModal({ onFoodSelected }: Props) {
    const [isOpen, setIsOpen] = useState(false)
    const [quantity, setQuantity] = useState<number>(100)

    const handleFoodSelected = (food: Food) => {
        onFoodSelected(food, quantity, food.serving_unit)
        setIsOpen(false)
    }

    return (
        <>
            <div onClick={() => setIsOpen(true)} className="cursor-pointer">
                <Button type="button" variant="outline" size="sm" className="w-full h-10 gap-2 rounded-xl border-dashed border-2 hover:border-emerald-500 hover:bg-emerald-500/5 transition-all text-muted-foreground hover:text-emerald-600">
                    <Search className="w-4 h-4" />
                    Buscar Alimento o Ingrediente
                </Button>
            </div>
            <Dialog open={isOpen} onOpenChange={setIsOpen}>
                <DialogContent className="sm:max-w-[500px] gap-6">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-bold flex items-center gap-2">
                            <Search className="w-5 h-5 text-emerald-500" />
                            Agregar Alimento
                        </DialogTitle>
                    </DialogHeader>
                    
                    <div className="space-y-4">
                        <div className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/10 flex items-start gap-3">
                            <Info className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                            <div className="space-y-3 flex-1">
                                <p className="text-sm text-emerald-800 leading-tight">
                                    Define la cantidad antes de seleccionar el alimento. Por defecto: <span className="font-bold">100g/u</span>.
                                </p>
                                <div className="space-y-1.5">
                                    <Label htmlFor="modal-quantity" className="text-[10px] uppercase font-bold text-emerald-700">Cantidad (g o unidades)</Label>
                                    <Input 
                                        id="modal-quantity"
                                        type="number" 
                                        step="any"
                                        value={quantity} 
                                        onChange={(e) => setQuantity(Number(e.target.value))}
                                        className="h-10 bg-white border-emerald-200 focus:ring-emerald-500 font-bold text-lg"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="max-h-[60vh] overflow-y-auto pr-1">
                            <FoodSearch onFoodSelected={handleFoodSelected} />
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    )
}
