'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Info, Loader2, Save, Salad } from 'lucide-react'
import { createOrgNutritionPlanTemplateAction } from '../_actions/nutrition-templates.actions'

const GOAL_TYPES = [
    { value: '', label: 'Sin objetivo específico' },
    { value: 'deficit', label: 'Déficit calórico (pérdida de grasa)' },
    { value: 'maintenance', label: 'Mantenimiento' },
    { value: 'surplus', label: 'Superávit (ganancia muscular)' },
    { value: 'performance', label: 'Rendimiento deportivo' },
    { value: 'health', label: 'Salud general' },
]

export default function NewOrgNutritionTemplatePage() {
    const params = useParams<{ slug: string }>()
    const router = useRouter()
    const slug = params.slug

    const [error, setError] = useState<string | null>(null)
    const [pending, startTransition] = useTransition()

    function handleSubmit(formData: FormData) {
        setError(null)
        startTransition(async () => {
            const res = await createOrgNutritionPlanTemplateAction(slug, formData)
            if (res?.error) {
                setError(res.error)
            } else {
                router.push(`/org/${slug}/nutrition`)
            }
        })
    }

    return (
        <div className="min-h-full bg-zinc-950 text-zinc-100">
            <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-5 md:px-8 md:py-8">

                <div className="flex items-center gap-3">
                    <Link
                        href={`/org/${slug}/nutrition`}
                        className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        Nutrición
                    </Link>
                </div>

                <div>
                    <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-emerald-300">
                        <Salad className="h-3.5 w-3.5" />
                        Template nutricional de organización
                    </span>
                    <h1 className="mt-3 text-2xl font-black tracking-tight text-white md:text-4xl">
                        Nuevo template nutricional
                    </h1>
                    <p className="mt-2 text-sm text-zinc-500">
                        Define los macros base y el objetivo. Los coaches abren el template en su panel para agregar comidas y alimentos antes de asignarlo a alumnos.
                    </p>
                </div>

                <form action={handleSubmit} className="space-y-4">
                    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5 space-y-4">

                        <div>
                            <label className="block text-xs font-semibold uppercase tracking-[0.1em] text-zinc-400 mb-1.5">
                                Nombre <span className="text-red-400">*</span>
                            </label>
                            <input
                                name="name"
                                required
                                minLength={2}
                                maxLength={120}
                                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:border-emerald-400/50 focus:outline-none"
                                placeholder="ej. Plan de mantenimiento — 2000 kcal"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-semibold uppercase tracking-[0.1em] text-zinc-400 mb-1.5">
                                Objetivo
                            </label>
                            <select
                                name="goal_type"
                                defaultValue=""
                                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-2.5 text-sm text-zinc-100 focus:border-emerald-400/50 focus:outline-none"
                            >
                                {GOAL_TYPES.map(g => (
                                    <option key={g.value} value={g.value}>{g.label}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs font-semibold uppercase tracking-[0.1em] text-zinc-400 mb-1.5">
                                Descripción / notas para coaches
                            </label>
                            <textarea
                                name="description"
                                rows={3}
                                maxLength={500}
                                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:border-emerald-400/50 focus:outline-none resize-none"
                                placeholder="Para qué perfil es este plan, consideraciones, restricciones alimentarias..."
                            />
                        </div>

                        <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-zinc-400 mb-3">
                                Macros objetivo (por día)
                            </p>
                            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                                {[
                                    { name: 'daily_calories', label: 'Calorías', unit: 'kcal', placeholder: '2000' },
                                    { name: 'protein_g', label: 'Proteína', unit: 'g', placeholder: '150' },
                                    { name: 'carbs_g', label: 'Carbos', unit: 'g', placeholder: '200' },
                                    { name: 'fats_g', label: 'Grasas', unit: 'g', placeholder: '70' },
                                ].map(field => (
                                    <div key={field.name}>
                                        <label className="block text-[10px] font-bold uppercase tracking-wide text-zinc-500 mb-1">
                                            {field.label} <span className="text-zinc-500 normal-case font-normal">({field.unit})</span>
                                        </label>
                                        <input
                                            name={field.name}
                                            type="number"
                                            min={0}
                                            placeholder={field.placeholder}
                                            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-700 focus:border-emerald-400/50 focus:outline-none"
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="flex items-start gap-2.5 rounded-xl border border-zinc-700/50 bg-zinc-900/40 p-3.5">
                        <Info className="h-4 w-4 shrink-0 mt-0.5 text-zinc-500" />
                        <p className="text-xs text-zinc-500 leading-5">
                            El template se guarda con macros objetivo. Los coaches lo abren en su <strong className="text-zinc-400">panel de nutrición</strong> para agregar comidas con alimentos reales antes de asignarlo a un alumno.
                        </p>
                    </div>

                    {error && (
                        <p className="text-xs text-red-400 rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3">{error}</p>
                    )}

                    <div className="flex gap-3 pt-1">
                        <Link
                            href={`/org/${slug}/nutrition`}
                            className="flex-1 flex items-center justify-center rounded-xl border border-zinc-700 px-4 py-2.5 text-sm text-zinc-400 hover:bg-zinc-800 transition-colors"
                        >
                            Cancelar
                        </Link>
                        <button
                            type="submit"
                            disabled={pending}
                            className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-400 transition-colors disabled:opacity-50"
                        >
                            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                            Crear template
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
