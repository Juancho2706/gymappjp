'use client'

import { useState, useTransition } from 'react'
import { Loader2, Plus, Salad, Trash2 } from 'lucide-react'
import { createOrgNutritionTemplateAction } from '../_actions/nutrition-templates.actions'

interface Props { orgSlug: string }

type MealRow = { name: string; description: string }

const GOAL_OPTIONS = [
    { value: '', label: 'Sin objetivo especifico' },
    { value: 'deficit', label: 'Deficit / perdida de grasa' },
    { value: 'maintenance', label: 'Mantenimiento' },
    { value: 'surplus', label: 'Volumen / ganancia muscular' },
]

const inputClass = 'w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-emerald-300'
const numInput = inputClass + ' [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none'

export function CreateOrgNutritionTemplateForm({ orgSlug }: Props) {
    const [open, setOpen] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState(false)
    const [pending, start] = useTransition()
    const [meals, setMeals] = useState<MealRow[]>([
        { name: 'Desayuno', description: '' },
        { name: 'Almuerzo', description: '' },
        { name: 'Cena', description: '' },
    ])

    const addMeal = () => setMeals(previous => [...previous, { name: '', description: '' }])
    const removeMeal = (index: number) => setMeals(previous => previous.filter((_, currentIndex) => currentIndex !== index))
    const updateMeal = (index: number, field: keyof MealRow, value: string) =>
        setMeals(previous => previous.map((meal, currentIndex) => currentIndex === index ? { ...meal, [field]: value } : meal))

    const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        const formData = new FormData(event.currentTarget)
        setError(null)
        setSuccess(false)
        const payload = {
            name: formData.get('name'),
            description: formData.get('description'),
            goal_type: formData.get('goal_type'),
            daily_calories: formData.get('daily_calories') ? Number(formData.get('daily_calories')) : undefined,
            protein_g: formData.get('protein_g') ? Number(formData.get('protein_g')) : undefined,
            carbs_g: formData.get('carbs_g') ? Number(formData.get('carbs_g')) : undefined,
            fats_g: formData.get('fats_g') ? Number(formData.get('fats_g')) : undefined,
            instructions: formData.get('instructions'),
            meal_names: meals.filter(meal => meal.name.trim()).map((meal, index) => ({ name: meal.name, order_index: index, description: meal.description })),
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
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <div className="flex items-center gap-2">
                        <Salad className="h-4 w-4 text-emerald-300" aria-hidden="true" />
                        <h2 className="text-lg font-black text-white">Crear template</h2>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-zinc-500">
                        Bases reutilizables para coaches enterprise. Evita plantillas ambiguas: objetivo, macros y comidas claras.
                    </p>
                </div>
            </div>

            <button
                onClick={() => setOpen(true)}
                className="mt-5 inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-emerald-400 px-4 text-sm font-black text-zinc-950 transition hover:bg-emerald-300"
            >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Nuevo template
            </button>

            {success && (
                <p className="mt-3 text-sm text-emerald-400">Template creado</p>
            )}

            {open && (
                <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center" onClick={() => setOpen(false)}>
                    <div className="flex max-h-[90dvh] w-full max-w-2xl flex-col gap-4 overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-950 p-5 shadow-2xl" onClick={event => event.stopPropagation()}>
                        <div>
                            <h3 className="text-lg font-black text-white">Nuevo template nutricional</h3>
                            <p className="mt-1 text-sm text-zinc-500">Visible para coaches enterprise activos.</p>
                        </div>
                        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                            <div>
                                <label className="mb-1 block text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">Nombre</label>
                                <input name="name" required maxLength={120} className={inputClass} placeholder="Ej: Deficit 1800 kcal" />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">Objetivo</label>
                                <select name="goal_type" className={inputClass}>
                                    {GOAL_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="mb-1 block text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">Calorias</label>
                                    <input name="daily_calories" type="number" min={0} className={numInput} placeholder="2000" />
                                </div>
                                <div>
                                    <label className="mb-1 block text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">Proteina (g)</label>
                                    <input name="protein_g" type="number" min={0} className={numInput} placeholder="150" />
                                </div>
                                <div>
                                    <label className="mb-1 block text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">Carbos (g)</label>
                                    <input name="carbs_g" type="number" min={0} className={numInput} placeholder="200" />
                                </div>
                                <div>
                                    <label className="mb-1 block text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">Grasas (g)</label>
                                    <input name="fats_g" type="number" min={0} className={numInput} placeholder="70" />
                                </div>
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">Descripcion</label>
                                <textarea name="description" maxLength={500} rows={2} className={inputClass} placeholder="Para que tipo de alumno sirve este template..." />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">Instrucciones</label>
                                <textarea name="instructions" maxLength={2000} rows={3} className={inputClass} placeholder="Reglas generales, sustituciones y notas para el coach..." />
                            </div>

                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <label className="text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">Comidas</label>
                                    <button type="button" onClick={addMeal} className="inline-flex items-center gap-1 text-xs font-bold text-emerald-300 hover:text-emerald-200">
                                        <Plus className="h-3 w-3" aria-hidden="true" /> Agregar
                                    </button>
                                </div>
                                {meals.map((meal, index) => (
                                    <div key={index} className="flex items-center gap-2">
                                        <input
                                            value={meal.name}
                                            onChange={event => updateMeal(index, 'name', event.target.value)}
                                            placeholder={`Comida ${index + 1}`}
                                            className={`${inputClass} flex-1`}
                                            maxLength={80}
                                        />
                                        <button type="button" onClick={() => removeMeal(index)} className="shrink-0 rounded-xl border border-zinc-700 p-2 text-zinc-400 transition hover:border-red-400/40 hover:text-red-300">
                                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                                        </button>
                                    </div>
                                ))}
                            </div>

                            {error && <p className="text-sm text-red-400">{error}</p>}

                            <div className="flex justify-end gap-2 pt-2">
                                <button type="button" onClick={() => setOpen(false)} className="inline-flex min-h-10 items-center justify-center rounded-xl border border-zinc-700 px-4 text-sm font-bold text-zinc-200 transition hover:bg-zinc-800">
                                    Cancelar
                                </button>
                                <button type="submit" disabled={pending} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-emerald-400 px-4 text-sm font-black text-zinc-950 transition hover:bg-emerald-300 disabled:opacity-50">
                                    {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                                    {pending ? 'Guardando...' : 'Crear template'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </section>
    )
}
