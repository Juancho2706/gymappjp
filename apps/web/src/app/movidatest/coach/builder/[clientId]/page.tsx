'use client'

import { use, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, Plus, GripVertical, Trash2, ChevronDown, ChevronUp, Save } from 'lucide-react'
import { useDemoState, useDemoActions } from '../../../_providers/DemoStateProvider'
import { mariaActivePlan, movidaExercises } from '../../../_mock'

type BuilderExercise = {
    id: string
    exercise_name: string
    sets: number
    reps: string
    weight_kg: number | null
    rest_seconds: number
    notes: string | null
}

export default function BuilderPage({ params }: { params: Promise<{ clientId: string }> }) {
    const { clientId } = use(params)
    const { clients } = useDemoState()
    const actions = useDemoActions()
    const client = clients.find(c => c.id === clientId)

    const [exercises, setExercises] = useState<BuilderExercise[]>(
        mariaActivePlan.exercises.map(ex => ({ ...ex }))
    )
    const [showExercisePicker, setShowExercisePicker] = useState(false)
    const [expandedId, setExpandedId] = useState<string | null>(null)
    const [saved, setSaved] = useState(false)

    function addExercise(name: string) {
        const newEx: BuilderExercise = {
            id: `ex-new-${Date.now()}`,
            exercise_name: name,
            sets: 3,
            reps: '10-12',
            weight_kg: null,
            rest_seconds: 90,
            notes: null,
        }
        setExercises(prev => [...prev, newEx])
        setShowExercisePicker(false)
        actions.simulateAction(`${name} agregado al programa`)
    }

    function removeExercise(id: string) {
        setExercises(prev => prev.filter(e => e.id !== id))
        actions.simulateAction('Ejercicio eliminado')
    }

    function handleSave() {
        setSaved(true)
        actions.simulateAction('Programa guardado ✓')
        setTimeout(() => setSaved(false), 2000)
    }

    const clientName = client?.full_name ?? 'Alumno'

    return (
        <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-5">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Link href={`/movidatest/coach/clients`} className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent">
                        <ChevronLeft className="w-5 h-5" />
                    </Link>
                    <div>
                        <h1 className="text-lg font-bold">Builder — {clientName}</h1>
                        <p className="text-xs text-muted-foreground">{mariaActivePlan.program_name} · Sem {mariaActivePlan.week}</p>
                    </div>
                </div>
                <button
                    onClick={handleSave}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-white transition-colors"
                    style={{ backgroundColor: saved ? '#059669' : '#0D9488' }}
                >
                    <Save className="w-4 h-4" />
                    {saved ? 'Guardado' : 'Guardar'}
                </button>
            </div>

            {/* Session info */}
            <div className="rounded-xl border border-teal-500/20 bg-teal-500/5 p-4">
                <p className="text-xs text-muted-foreground mb-1">Sesión actual</p>
                <p className="text-sm font-semibold">{mariaActivePlan.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Semana {mariaActivePlan.week} · Día {mariaActivePlan.day} · {exercises.length} ejercicios</p>
            </div>

            {/* Exercise list */}
            <div className="space-y-2">
                {exercises.map((ex, idx) => (
                    <div key={ex.id} className="rounded-xl border border-border bg-card">
                        <div
                            className="flex items-center gap-3 p-3 cursor-pointer"
                            onClick={() => setExpandedId(expandedId === ex.id ? null : ex.id)}
                        >
                            <GripVertical className="w-4 h-4 text-muted-foreground shrink-0 cursor-grab" />
                            <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground shrink-0">
                                {idx + 1}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{ex.exercise_name}</p>
                                <p className="text-[11px] text-muted-foreground">
                                    {ex.sets} × {ex.reps} {ex.weight_kg ? `· ${ex.weight_kg}kg` : '· peso corporal'} · {ex.rest_seconds}s descanso
                                </p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                                <button
                                    onClick={(e) => { e.stopPropagation(); removeExercise(ex.id) }}
                                    className="p-1 rounded text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                                {expandedId === ex.id
                                    ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
                                    : <ChevronDown className="w-4 h-4 text-muted-foreground" />
                                }
                            </div>
                        </div>
                        {expandedId === ex.id && (
                            <div className="px-4 pb-4 grid grid-cols-2 sm:grid-cols-4 gap-3 border-t border-border pt-3">
                                <div>
                                    <label className="text-[10px] text-muted-foreground">Series</label>
                                    <input
                                        type="number"
                                        defaultValue={ex.sets}
                                        onChange={e => setExercises(prev => prev.map(x => x.id === ex.id ? { ...x, sets: Number(e.target.value) } : x))}
                                        className="w-full mt-1 rounded-lg border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/50"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] text-muted-foreground">Reps</label>
                                    <input
                                        defaultValue={ex.reps}
                                        onChange={e => setExercises(prev => prev.map(x => x.id === ex.id ? { ...x, reps: e.target.value } : x))}
                                        className="w-full mt-1 rounded-lg border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/50"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] text-muted-foreground">Peso (kg)</label>
                                    <input
                                        type="number"
                                        defaultValue={ex.weight_kg ?? ''}
                                        placeholder="—"
                                        onChange={e => setExercises(prev => prev.map(x => x.id === ex.id ? { ...x, weight_kg: Number(e.target.value) || null } : x))}
                                        className="w-full mt-1 rounded-lg border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/50"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] text-muted-foreground">Descanso (s)</label>
                                    <input
                                        type="number"
                                        defaultValue={ex.rest_seconds}
                                        onChange={e => setExercises(prev => prev.map(x => x.id === ex.id ? { ...x, rest_seconds: Number(e.target.value) } : x))}
                                        className="w-full mt-1 rounded-lg border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/50"
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* Add exercise */}
            <button
                onClick={() => setShowExercisePicker(v => !v)}
                className="w-full flex items-center justify-center gap-2 rounded-xl border border-dashed border-teal-500/40 p-3 text-sm font-medium text-teal-600 dark:text-teal-400 hover:border-teal-500 hover:bg-teal-500/5 transition-colors"
            >
                <Plus className="w-4 h-4" />
                Agregar ejercicio
            </button>

            {showExercisePicker && (
                <div className="rounded-xl border border-border bg-card p-4">
                    <p className="text-xs font-semibold text-muted-foreground mb-2">Seleccionar ejercicio</p>
                    <div className="grid grid-cols-2 gap-1.5 max-h-56 overflow-y-auto">
                        {movidaExercises.map(ex => (
                            <button
                                key={ex.id}
                                onClick={() => addExercise(ex.name)}
                                className="text-left rounded-lg border border-border bg-background px-2.5 py-2 text-xs hover:bg-accent transition-colors"
                            >
                                <p className="font-medium truncate">{ex.name}</p>
                                <p className="text-[10px] text-muted-foreground">{ex.muscle_group}</p>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}
