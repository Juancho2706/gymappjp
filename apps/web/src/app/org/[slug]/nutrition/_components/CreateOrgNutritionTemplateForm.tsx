'use client'

import { useState, useTransition } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { createOrgNutritionTemplateAction } from '../_actions/nutrition-templates.actions'

interface Props { orgSlug: string }

type MealRow = { name: string; description: string }

const GOAL_OPTIONS = [
    { value: '', label: 'Sin objetivo específico' },
    { value: 'deficit', label: 'Déficit / Pérdida de grasa' },
    { value: 'maintenance', label: 'Mantenimiento' },
    { value: 'surplus', label: 'Volumen / Ganancia muscular' },
]

const inputClass = 'w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100'
const numInput = inputClass + ' [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none'

export function CreateOrgNutritionTemplateForm({ orgSlug }: Props) {
    const [open, setOpen] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState(false)
    const [pending, start] = useTransition()
    const [meals, setMeals] = useState<MealRow[]>([{ name: 'Desayuno', description: '' }, { name: 'Almuerzo', description: '' }, { name: 'Cena', description: '' }])

    const addMeal = () => setMeals(p => [...p, { name: '', description: '' }])
    const removeMeal = (i: number) => setMeals(p => p.filter((_, idx) => idx !== i))
    const updateMeal = (i: number, field: keyof MealRow, val: string) =>
        setMeals(p => p.map((m, idx) => idx === i ? { ...m, [field]: val } : m))

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        const fd = new FormData(e.currentTarget)
        setError(null)
        setSuccess(false)
        const payload = {
            name: fd.get('name'),
            description: fd.get('description'),
            goal_type: fd.get('goal_type'),
            daily_calories: fd.get('daily_calories') ? Number(fd.get('daily_calories')) : undefined,
            protein_g: fd.get('protein_g') ? Number(fd.get('protein_g')) : undefined,
            carbs_g: fd.get('carbs_g') ? Number(fd.get('carbs_g')) : undefined,
            fats_g: fd.get('fats_g') ? Number(fd.get('fats_g')) : undefined,
            instructions: fd.get('instructions'),
            meal_names: meals.filter(m => m.name.trim()).map((m, i) => ({ name: m.name, order_index: i, description: m.description })),
        }
        start(async () => {
            const result = await createOrgNutritionTemplateAction(orgSlug, payload)
            if ('error' in result && result.error) {
                setError(result.error)
            } else {
                setSuccess(true)
                setOpen(false)
                setMeals([{ name: 'Desayuno', description: '' }, { name: 'Almuerzo', description: '' }, { name: 'Cena', description: '' }])
            }
        })
    }

    return (
        <>
            <button
                onClick={() => setOpen(true)}
                className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
                <Plus className="w-4 h-4" />
                Nuevo template
            </button>

            {open && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4" onClick={() => setOpen(false)}>
                    <div className="w-full max-w-lg max-h-[90dvh] overflow-y-auto rounded-2xl bg-white dark:bg-zinc-900 p-6 shadow-xl flex flex-col gap-4" onClick={e => e.stopPropagation()}>
                        <h3 className="font-bold text-zinc-900 dark:text-zinc-100">Nuevo template nutricional</h3>
                        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                            <div className="flex flex-col gap-1">
                                <label className="text-xs font-medium text-zinc-500">Nombre *</label>
                                <input name="name" required maxLength={120} className={inputClass} placeholder="Ej: Plan Déficit 1800 kcal" />
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-xs font-medium text-zinc-500">Objetivo</label>
                                <select name="goal_type" className={inputClass}>
                                    {GOAL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="flex flex-col gap-1">
                                    <label className="text-xs font-medium text-zinc-500">Calorías</label>
                                    <input name="daily_calories" type="number" min={0} className={numInput} placeholder="ej: 2000" />
                                </div>
                                <div className="flex flex-col gap-1">
                                    <label className="text-xs font-medium text-zinc-500">Proteína (g)</label>
                                    <input name="protein_g" type="number" min={0} className={numInput} placeholder="ej: 150" />
                                </div>
                                <div className="flex flex-col gap-1">
                                    <label className="text-xs font-medium text-zinc-500">Carbos (g)</label>
                                    <input name="carbs_g" type="number" min={0} className={numInput} placeholder="ej: 200" />
                                </div>
                                <div className="flex flex-col gap-1">
                                    <label className="text-xs font-medium text-zinc-500">Grasas (g)</label>
                                    <input name="fats_g" type="number" min={0} className={numInput} placeholder="ej: 70" />
                                </div>
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-xs font-medium text-zinc-500">Descripción</label>
                                <textarea name="description" maxLength={500} rows={2} className={inputClass} placeholder="Para qué tipo de cliente es este template..." />
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-xs font-medium text-zinc-500">Instrucciones</label>
                                <textarea name="instructions" maxLength={2000} rows={2} className={inputClass} placeholder="Instrucciones generales del plan..." />
                            </div>

                            <div className="flex flex-col gap-2">
                                <div className="flex items-center justify-between">
                                    <label className="text-xs font-medium text-zinc-500">Comidas</label>
                                    <button type="button" onClick={addMeal} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800">
                                        <Plus className="w-3 h-3" /> Agregar
                                    </button>
                                </div>
                                {meals.map((m, i) => (
                                    <div key={i} className="flex items-center gap-2">
                                        <input
                                            value={m.name}
                                            onChange={e => updateMeal(i, 'name', e.target.value)}
                                            placeholder={`Comida ${i + 1}`}
                                            className={inputClass + ' flex-1'}
                                            maxLength={80}
                                        />
                                        <button type="button" onClick={() => removeMeal(i)} className="text-zinc-400 hover:text-red-500 shrink-0">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                            </div>

                            {error && <p className="text-sm text-red-600">{error}</p>}

                            <div className="flex gap-2 justify-end pt-2">
                                <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-zinc-200 px-4 py-2 text-sm hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800">
                                    Cancelar
                                </button>
                                <button type="submit" disabled={pending} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                                    {pending ? 'Guardando...' : 'Crear template'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {success && (
                <p className="text-sm text-emerald-600 dark:text-emerald-400">Template creado</p>
            )}
        </>
    )
}
