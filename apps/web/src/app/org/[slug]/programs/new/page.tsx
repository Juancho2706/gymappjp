'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Dumbbell, Info, Loader2, Save } from 'lucide-react'
import { createOrgWorkoutTemplateAction } from '../../_actions/org.actions'

export default function NewOrgWorkoutTemplatePage() {
    const params = useParams<{ slug: string }>()
    const router = useRouter()
    const slug = params.slug

    const [error, setError] = useState<string | null>(null)
    const [pending, startTransition] = useTransition()

    function handleSubmit(formData: FormData) {
        setError(null)
        startTransition(async () => {
            const res = await createOrgWorkoutTemplateAction(slug, formData)
            if (res?.error) {
                setError(res.error)
            } else {
                router.push(`/org/${slug}/programs`)
            }
        })
    }

    return (
        <div className="min-h-full bg-zinc-950 text-zinc-100">
            <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-5 md:px-8 md:py-8">

                {/* Header */}
                <div className="flex items-center gap-3">
                    <Link
                        href={`/org/${slug}/programs`}
                        className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        Programas
                    </Link>
                </div>

                <div>
                    <span className="inline-flex items-center gap-2 rounded-full border border-violet-400/30 bg-violet-400/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-violet-300">
                        <Dumbbell className="h-3.5 w-3.5" />
                        Template de organización
                    </span>
                    <h1 className="mt-3 text-2xl font-black tracking-tight text-white md:text-4xl">
                        Nuevo template
                    </h1>
                    <p className="mt-2 text-sm text-zinc-500">
                        Los templates de organización están disponibles para todos los coaches enterprise. Los coaches los abren en su builder para personalizar y asignar a alumnos.
                    </p>
                </div>

                {/* Form */}
                <form action={handleSubmit} className="space-y-4">
                    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5 space-y-4">

                        <div>
                            <label className="block text-xs font-semibold uppercase tracking-[0.1em] text-zinc-400 mb-1.5">
                                Nombre del template <span className="text-red-400">*</span>
                            </label>
                            <input
                                name="name"
                                required
                                minLength={2}
                                maxLength={120}
                                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:border-violet-400/50 focus:outline-none"
                                placeholder="ej. Fuerza base — 4 semanas"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-semibold uppercase tracking-[0.1em] text-zinc-400 mb-1.5">
                                Notas / descripción
                            </label>
                            <textarea
                                name="notes"
                                rows={3}
                                maxLength={500}
                                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:border-violet-400/50 focus:outline-none resize-none"
                                placeholder="Para qué nivel es, objetivos principales, notas para los coaches..."
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-semibold uppercase tracking-[0.1em] text-zinc-400 mb-1.5">
                                Duración (semanas)
                            </label>
                            <input
                                name="weeks_to_repeat"
                                type="number"
                                defaultValue={4}
                                min={1}
                                max={52}
                                className="w-32 rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-2.5 text-sm text-zinc-100 focus:border-violet-400/50 focus:outline-none"
                            />
                        </div>

                    </div>

                    {/* Info note */}
                    <div className="flex items-start gap-2.5 rounded-xl border border-zinc-700/50 bg-zinc-900/40 p-3.5">
                        <Info className="h-4 w-4 shrink-0 mt-0.5 text-zinc-500" />
                        <div className="text-xs text-zinc-500 space-y-1">
                            <p>Este template se guarda sin bloques de ejercicios todavía.</p>
                            <p>Los coaches lo abren en su <strong className="text-zinc-400">builder de programas</strong> para agregar ejercicios, series y días de entrenamiento antes de asignarlo a un alumno.</p>
                        </div>
                    </div>

                    {error && (
                        <p className="text-xs text-red-400 rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3">{error}</p>
                    )}

                    <div className="flex gap-3 pt-1">
                        <Link
                            href={`/org/${slug}/programs`}
                            className="flex-1 flex items-center justify-center rounded-xl border border-zinc-700 px-4 py-2.5 text-sm text-zinc-400 hover:bg-zinc-800 transition-colors"
                        >
                            Cancelar
                        </Link>
                        <button
                            type="submit"
                            disabled={pending}
                            className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-violet-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-400 transition-colors disabled:opacity-50"
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
