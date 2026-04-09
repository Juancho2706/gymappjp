'use client'

import { motion } from 'framer-motion'
import { Zap } from 'lucide-react'

interface SummaryLog {
    weight_kg: number | null
    reps_done: number | null
}

interface WorkoutSummaryOverlayProps {
    planTitle: string
    logs: SummaryLog[]
    onDone: () => void
}

export function WorkoutSummaryOverlay({ planTitle, logs, onDone }: WorkoutSummaryOverlayProps) {
    const completedSets = logs.length
    const totalReps = logs.reduce((acc, l) => acc + (l.reps_done || 0), 0)
    const totalVolume = logs.reduce((acc, l) => acc + ((l.weight_kg || 0) * (l.reps_done || 0)), 0)

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-[9999] bg-background flex flex-col items-center justify-center px-6"
        >
            <motion.div
                initial={{ scale: 0.9, y: 12 }}
                animate={{ scale: 1, y: 0 }}
                transition={{ duration: 0.35 }}
                className="w-full max-w-md bg-card border border-border rounded-3xl p-6 shadow-2xl"
            >
                <div className="w-20 h-20 rounded-full flex items-center justify-center mb-5 mx-auto bg-primary/10">
                    <Zap className="w-10 h-10 text-primary" />
                </div>
                <h2 className="text-2xl font-extrabold text-center text-foreground mb-1">Entrenamiento completado</h2>
                <p className="text-center text-sm text-muted-foreground mb-5">{planTitle}</p>
                <div className="grid grid-cols-3 gap-2 mb-5">
                    <div className="rounded-xl border border-border p-2 text-center">
                        <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Sets</p>
                        <p className="text-lg font-bold">{completedSets}</p>
                    </div>
                    <div className="rounded-xl border border-border p-2 text-center">
                        <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Reps</p>
                        <p className="text-lg font-bold">{totalReps}</p>
                    </div>
                    <div className="rounded-xl border border-border p-2 text-center">
                        <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Volumen</p>
                        <p className="text-lg font-bold">{Math.round(totalVolume)}kg</p>
                    </div>
                </div>
                <button
                    onClick={onDone}
                    className="w-full h-12 rounded-2xl bg-primary text-primary-foreground font-bold"
                >
                    Volver al inicio
                </button>
            </motion.div>
        </motion.div>
    )
}
