'use client'

import { useState } from 'react'
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FoodSearch } from '@/app/coach/foods/FoodSearch'
interface Food {
    id: string;
    name: string;
    serving_size_g: number;
    calories: number;
    protein_g: number;
    carbs_g: number;
    fats_g: number;
    coach_id: string | null;
}
import { Search } from 'lucide-react'

interface Props {
    onFoodSelected: (food: Food, quantity: number) => void;
}

export function FoodSearchModal({ onFoodSelected }: Props) {
    const [isOpen, setIsOpen] = useState(false)
    const [quantity, setQuantity] = useState(100)

    const handleFoodSelected = (food: Food) => {
        onFoodSelected(food, quantity)
        setIsOpen(false)
    }

    return (
        <>
            <div onClick={() => setIsOpen(true)} className="cursor-pointer">
                <Button type="button" variant="outline" size="sm" className="h-8 gap-1 rounded-lg mt-2">
                    <Search className="w-3.5 h-3.5" />
                    Buscar Alimento
                </Button>
            </div>
            <Dialog open={isOpen} onOpenChange={setIsOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>Buscar Alimento</DialogTitle>
                    </DialogHeader>
                    <FoodSearch onFoodSelected={handleFoodSelected} />
                </DialogContent>
            </Dialog>
        </>
    )
}
