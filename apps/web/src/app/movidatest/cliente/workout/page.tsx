'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ChevronLeft, CheckCircle2, Circle, Timer, Dumbbell, ChevronDown, ChevronUp, Trophy } from 'lucide-react'
import { useDemoState, useDemoActions } from '../../_providers/DemoStateProvider'
import { mariaActivePlan, MOVIDA_BRAND } from '../../_mock'

export default function WorkoutPage() {
    const { activePlanExercises, workoutCompleted } = useDemoState()
    const actions = useDemoActions()
    const [expandedId, setExpandedId] = useState<string | null>(activePlanExercises[0]?.exercise_id ?? null)
    const [logValues, setLogValues] = useState<Record<string, { reps: string; weight: string }>>({})
    const [timer, setTimer] = useState(0)
    const [started, setStarted] = useState(false)

    const completedCount = activePlanExercises.filter(e => e.completed).length
    const allCompleted = completedCount === activePlanExercises.length

    function handleStart() {
        setStarted(true)
        actions.startWorkout()
    }

    function handleLogSet(ex: typeof activePlanExercises[0]) {
        const vals = logValues[ex.exercise_id] ?? { reps: String(ex.reps.split('-')[0]), weight: String(ex.weight_kg ?? '') }
        const reps = parseInt(vals.reps) || 0
        const weight = parseFloat(vals.weight) || null
        actions.logSet(ex.exercise_id, reps, weight)
    }

    function handleCompleteExercise(ex: typeof activePlanExercises[0]) {
        actions.completeExercise(ex.exercise_id, ex.exercise_name)
    }

    if (workoutCompleted) {
        return (
            <div className="flex flex-col items-center justify-center h-full min-h-[60vh] p-6 text-center gap-4">
                <div className="w-16 h-16 rounded-full bg-teal-500/10 flex items-center justify-center">
                    <Trophy className="w-8 h-8 text-teal-500" />
                </div>
                <h2 className="text-xl font-bold">¡Sesión completada!</h2>
                <p className="text-sm text-muted-foreground">Excelente trabajo, María. Felipe recibirá tu registro.</p>
                <Link href="/movidatest/cliente/dashboard" className="rounded-xl px-6 py-3 text-sm font-semibold text-white" style={{ backgroundColor: MOVIDA_BRAND.primaryColor }}>
                    Volver al inicio
                </Link>
            </div>
        )
    }

    return (
        <div className="pb-4">
            {/* Header */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-card">
                <Link href="/movidatest/cliente/dashboard" className="p-1 rounded text-muted-foreground hover:text-foreground">
                    <ChevronLeft className="w-5 h-5" />
                </Link>
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate">{mariaActivePlan.name}</p>
                    <p className="text-[11px] text-muted-foreground">Sem {mariaActivePlan.week} · {activePlanExercises.length} ejercicios</p>
                </div>
                <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Timer className="w-3.5 h-3.5" />
                    <span>{started ? '58:00' : '--:--'}</span>
                </div>
            </div>

            {/* Progress */}
            <div className="px-4 pt-3 pb-2">
                <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-muted-foreground">{completedCount} / {activePlanExercises.length} ejercicios</span>
                    <span className="text-xs font-semibold" style={{ color: MOVIDA_BRAND.primaryColor }}>{Math.round((completedCount / activePlanExercises.length) * 100)}%</span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${(completedCount / activePlanExercises.length) * 100}%`, backgroundColor: MOVIDA_BRAND.primaryColor }} />
                </div>
            </div>

            {!started && (
                <div className="px-4 mb-3">
                    <button
                        onClick={handleStart}
                        className="w-full py-3 rounded-xl text-sm font-semibold text-white"
                        style={{ backgroundColor: MOVIDA_BRAND.primaryColor }}
                    >
                        Iniciar entrenamiento
                    </button>
                </div>
            )}

            {/* Exercise list */}
            <div className="px-4 space-y-2">
                {activePlanExercises.map((ex, idx) => {
                    const expanded = expandedId === ex.exercise_id
                    const vals = logValues[ex.exercise_id] ?? { reps: ex.reps.split('-')[0], weight: String(ex.weight_kg ?? '') }

                    return (
                        <div
                            key={ex.exercise_id}
                            className={`rounded-xl border bg-card overflow-hidden ${ex.completed ? 'border-teal-500/30 bg-teal-500/5' : 'border-border'}`}
                        >
                            <button
                                className="w-full flex items-center gap-3 p-3 text-left"
                                onClick={() => setExpandedId(expanded ? null : ex.exercise_id)}
                            >
                                <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${ex.completed ? 'bg-teal-500' : 'border-2 border-border'}`}>
                                    {ex.completed
                                        ? <CheckCircle2 className="w-4 h-4 text-white" />
                                        : <span className="text-xs font-bold text-muted-foreground">{idx + 1}</span>
                                    }
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className={`text-sm font-medium truncate ${ex.completed ? 'line-through text-muted-foreground' : ''}`}>
                                        {ex.exercise_name}
                                    </p>
                                    <p className="text-[11px] text-muted-foreground">
                                        {ex.sets} × {ex.reps} {ex.weight_kg ? `· ${ex.weight_kg}kg` : ''} · {ex.rest_seconds}s descanso
                                    </p>
                                    {ex.previous_best && (
                                        <p className="text-[10px] text-violet-500">Anterior: {ex.previous_best}</p>
                                    )}
                                </div>
                                {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
                            </button>

                            {expanded && !ex.completed && (
                                <div className="px-3 pb-3 border-t border-border pt-3 space-y-3">
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <label className="text-[10px] text-muted-foreground">Reps realizadas</label>
                                            <input
                                                type="number"
                                                value={vals.reps}
                                                onChange={e => setLogValues(prev => ({ ...prev, [ex.exercise_id]: { ...vals, reps: e.target.value } }))}
                                                className="w-full mt-1 rounded-lg border border-border bg-background px-2 py-2 text-center text-sm font-bold focus:outline-none focus:ring-2"
                                                style={{ '--tw-ring-color': MOVIDA_BRAND.primaryColor } as React.CSSProperties}
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[10px] text-muted-foreground">Peso (kg)</label>
                                            <input
                                                type="number"
                                                value={vals.weight}
                                                onChange={e => setLogValues(prev => ({ ...prev, [ex.exercise_id]: { ...vals, weight: e.target.value } }))}
                                                placeholder="—"
                                                className="w-full mt-1 rounded-lg border border-border bg-background px-2 py-2 text-center text-sm font-bold focus:outline-none focus:ring-2"
                                            />
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => handleLogSet(ex)}
                                            className="flex-1 py-2 rounded-lg text-xs font-semibold border border-border text-muted-foreground hover:bg-accent"
                                        >
                                            Registrar set
                                        </button>
                                        <button
                                            onClick={() => handleCompleteExercise(ex)}
                                            className="flex-1 py-2 rounded-lg text-xs font-semibold text-white"
                                            style={{ backgroundColor: MOVIDA_BRAND.primaryColor }}
                                        >
                                            ✓ Completar
                                        </button>
                                    </div>
                                    {ex.notes && <p className="text-[11px] text-amber-500">📌 {ex.notes}</p>}
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>

            {/* Complete workout */}
            {allCompleted && (
                <div className="px-4 mt-4">
                    <button
                        onClick={() => actions.completeWorkout()}
                        className="w-full py-3 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2"
                        style={{ backgroundColor: MOVIDA_BRAND.primaryColor }}
                    >
                        <CheckCircle2 className="w-4 h-4" />
                        Finalizar entrenamiento
                    </button>
                </div>
            )}
        </div>
    )
}
