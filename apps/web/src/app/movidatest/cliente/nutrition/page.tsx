'use client'

import { useState } from 'react'
import { Plus, Apple, X } from 'lucide-react'
import { useDemoState, useDemoActions } from '../../_providers/DemoStateProvider'
import { mariaNutritionTotals, MOVIDA_BRAND, type DemoMeal } from '../../_mock'

const QUICK_FOODS = [
    { name: 'Plátano', calories: 89, protein_g: 1, carbs_g: 23, fat_g: 0, amount_g: 100 },
    { name: 'Yogurt griego', calories: 97, protein_g: 9, carbs_g: 7, fat_g: 3, amount_g: 150 },
    { name: 'Avena cocida', calories: 71, protein_g: 2.5, carbs_g: 12, fat_g: 1.5, amount_g: 100 },
    { name: 'Palta', calories: 160, protein_g: 2, carbs_g: 9, fat_g: 15, amount_g: 100 },
    { name: 'Pollo grillado', calories: 165, protein_g: 31, carbs_g: 0, fat_g: 4, amount_g: 100 },
    { name: 'Arroz blanco', calories: 130, protein_g: 2.7, carbs_g: 28, fat_g: 0.3, amount_g: 100 },
]

export default function NutritionPage() {
    const { mealLog } = useDemoState()
    const actions = useDemoActions()
    const [showAddMeal, setShowAddMeal] = useState(false)

    const totalCalories = mealLog.reduce((s, m) => s + m.calories, 0)
    const totalProtein = mealLog.reduce((s, m) => s + m.protein_g, 0)
    const totalCarbs = mealLog.reduce((s, m) => s + m.carbs_g, 0)
    const totalFat = mealLog.reduce((s, m) => s + m.fat_g, 0)

    function addQuickFood(food: typeof QUICK_FOODS[0]) {
        const newMeal: DemoMeal = {
            id: `meal-quick-${Date.now()}`,
            name: 'Colación rápida',
            time: new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }),
            calories: food.calories,
            protein_g: food.protein_g,
            carbs_g: food.carbs_g,
            fat_g: food.fat_g,
            foods: [{ name: food.name, amount_g: food.amount_g }],
        }
        actions.addMeal(newMeal)
        setShowAddMeal(false)
    }

    return (
        <div className="pb-4">
            {/* Header */}
            <div className="px-4 py-3 border-b border-border bg-card">
                <h1 className="text-sm font-bold">Nutrición</h1>
                <p className="text-[11px] text-muted-foreground">Log del día</p>
            </div>

            {/* Macro summary */}
            <div className="mx-4 mt-3 rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-semibold">Resumen del día</span>
                    <span className="text-xs text-muted-foreground">Meta: {mariaNutritionTotals.target_calories} kcal</span>
                </div>
                <div className="text-center mb-3">
                    <p className="text-3xl font-bold">{totalCalories}</p>
                    <p className="text-xs text-muted-foreground">kcal consumidas</p>
                    <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
                        <div
                            className="h-full rounded-full"
                            style={{ width: `${Math.min(100, (totalCalories / mariaNutritionTotals.target_calories) * 100)}%`, backgroundColor: MOVIDA_BRAND.primaryColor }}
                        />
                    </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                    {[
                        { label: 'Proteína', value: totalProtein, target: mariaNutritionTotals.target_protein_g, unit: 'g', color: '#3B82F6' },
                        { label: 'Carbs', value: totalCarbs, target: mariaNutritionTotals.target_carbs_g, unit: 'g', color: '#F59E0B' },
                        { label: 'Grasas', value: totalFat, target: mariaNutritionTotals.target_fat_g, unit: 'g', color: '#10B981' },
                    ].map(m => (
                        <div key={m.label} className="rounded-lg bg-muted p-2">
                            <p className="text-sm font-bold" style={{ color: m.color }}>{m.value}{m.unit}</p>
                            <p className="text-[10px] text-muted-foreground">{m.label}</p>
                            <p className="text-[9px] text-muted-foreground">/{m.target}{m.unit}</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* Meal log */}
            <div className="px-4 mt-4 space-y-2">
                <div className="flex items-center justify-between">
                    <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Comidas del día</h2>
                    <button
                        onClick={() => setShowAddMeal(v => !v)}
                        className="flex items-center gap-1 text-xs font-medium"
                        style={{ color: MOVIDA_BRAND.primaryColor }}
                    >
                        <Plus className="w-3.5 h-3.5" />
                        Agregar
                    </button>
                </div>

                {showAddMeal && (
                    <div className="rounded-xl border border-teal-500/30 bg-teal-500/5 p-3">
                        <p className="text-xs font-semibold mb-2">Agregar rápido</p>
                        <div className="grid grid-cols-2 gap-1.5">
                            {QUICK_FOODS.map(food => (
                                <button
                                    key={food.name}
                                    onClick={() => addQuickFood(food)}
                                    className="text-left rounded-lg border border-border bg-background px-2.5 py-2 hover:bg-accent transition-colors"
                                >
                                    <p className="text-xs font-medium">{food.name}</p>
                                    <p className="text-[10px] text-muted-foreground">{food.calories} kcal · {food.protein_g}g prot</p>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {mealLog.map(meal => (
                    <div key={meal.id} className="rounded-xl border border-border bg-card p-3">
                        <div className="flex items-start justify-between gap-2">
                            <div className="flex items-start gap-2">
                                <Apple className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                                <div>
                                    <div className="flex items-center gap-2">
                                        <p className="text-sm font-semibold">{meal.name}</p>
                                        <span className="text-[10px] text-muted-foreground">{meal.time}</span>
                                    </div>
                                    <div className="flex gap-2 text-[10px] text-muted-foreground mt-0.5">
                                        <span>{meal.calories} kcal</span>
                                        <span style={{ color: '#3B82F6' }}>{meal.protein_g}g P</span>
                                        <span style={{ color: '#F59E0B' }}>{meal.carbs_g}g C</span>
                                        <span style={{ color: '#10B981' }}>{meal.fat_g}g G</span>
                                    </div>
                                    <div className="mt-1.5 flex flex-wrap gap-1">
                                        {meal.foods.map(f => (
                                            <span key={f.name} className="text-[10px] bg-muted px-1.5 py-0.5 rounded">{f.name} {f.amount_g}g</span>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            <button
                                onClick={() => actions.removeMeal(meal.id)}
                                className="p-1 rounded text-muted-foreground hover:text-red-500 hover:bg-red-500/10"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
