'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ChevronLeft, ChevronRight, Zap, Info, Dumbbell, Timer, Play, X } from 'lucide-react'
import { LogSetForm } from './LogSetForm'
import { WorkoutTimerProvider } from './WorkoutTimerProvider'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import Image from 'next/image'

interface ExerciseType {
    id: string
    name: string
    muscle_group: string
    video_url: string | null
    gif_url: string | null
    instructions: string[] | null
}

interface BlockType {
    id: string
    order_index: number
    sets: number
    reps: string
    target_weight_kg: number | null
    tempo: string | null
    rir: string | null
    rest_time: string | null
    notes: string | null
    exercises: ExerciseType | ExerciseType[]
}

interface PlanType {
    id: string
    title: string
    assigned_date: string
    workout_blocks: BlockType[]
}

interface Props {
    plan: PlanType
    logs: Array<{
        block_id: string
        set_number: number
        weight_kg: number | null
        reps_done: number | null
        rpe: number | null
    }>
    coachSlug: string
}

export function WorkoutExecutionClient({ plan, logs, coachSlug }: Props) {
    const router = useRouter()
    const blocks = plan.workout_blocks.sort((a, b) => a.order_index - b.order_index)
    const [currentIndex, setCurrentIndex] = useState(0)
    const [direction, setDirection] = useState(0) // 1 for next, -1 for prev
    const [showTechnique, setShowTechnique] = useState(false)

    const currentBlock = blocks[currentIndex]
    const currentExercise = Array.isArray(currentBlock.exercises) ? currentBlock.exercises[0] : currentBlock.exercises

    const handleNext = () => {
        if (currentIndex < blocks.length - 1) {
            setDirection(1)
            setCurrentIndex(prev => prev + 1)
        } else {
            // Finish workout
            router.push(`/c/${coachSlug}/dashboard`)
        }
    }

    const handlePrev = () => {
        if (currentIndex > 0) {
            setDirection(-1)
            setCurrentIndex(prev => prev - 1)
        }
    }

    const progressPercentage = ((currentIndex + 1) / blocks.length) * 100

    const variants = {
        enter: (dir: number) => ({
            x: dir > 0 ? 100 : -100,
            opacity: 0,
            scale: 0.95
        }),
        center: {
            x: 0,
            opacity: 1,
            scale: 1,
            transition: { type: 'spring' as const, stiffness: 300, damping: 30 }
        },
        exit: (dir: number) => ({
            x: dir > 0 ? -100 : 100,
            opacity: 0,
            scale: 0.95,
            transition: { duration: 0.2 }
        })
    }

    return (
        <WorkoutTimerProvider>
            <div className="fixed inset-0 flex flex-col bg-background overflow-hidden overscroll-none animate-in fade-in-0 duration-1000">

                {/* Top Section (25% approx) - Fixed Header & Progress */}
                <div className="flex-none bg-card border-b border-border/50 shadow-sm z-20 pb-4 pt-safe animate-in fade-in-0 slide-in-from-top-5 duration-700 delay-500">
                    <div className="px-4 py-4 md:px-8 max-w-3xl mx-auto w-full">
                        <div className="flex items-center justify-between mb-4">
                            <Link href={`/c/${coachSlug}/dashboard`} className="p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors">
                                <ArrowLeft className="w-5 h-5" />
                            </Link>
                            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                                {currentIndex + 1} de {blocks.length}
                            </span>
                            <div className="w-9"></div> {/* Spacer for centering */}
                        </div>

                        <h1 className="text-xl md:text-2xl font-extrabold text-foreground truncate mb-4" style={{ fontFamily: 'var(--font-outfit)' }}>
                            {plan.title}
                        </h1>

                        {/* Progress Bar */}
                        <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
                            <motion.div 
                                className="h-full rounded-full" 
                                style={{ backgroundColor: 'var(--theme-primary)' }}
                                initial={{ width: 0 }}
                                animate={{ width: `${progressPercentage}%` }}
                                transition={{ duration: 0.3 }}
                            />
                        </div>
                    </div>
                </div>

                {/* Main Content Area (75% approx) - Carousel */}
                <div className="flex-1 relative overflow-hidden bg-muted/10 w-full">
                    <AnimatePresence initial={false} custom={direction} mode="wait">
                        <motion.div
                            key={currentIndex}
                            custom={direction}
                            variants={variants}
                            initial="enter"
                            animate="center"
                            exit="exit"
                            className="absolute inset-0 overflow-y-auto pb-32 pt-6 px-4 md:px-8 animate-in fade-in-0 slide-in-from-bottom-10 duration-700 delay-700"
                        >
                            <div className="max-w-xl mx-auto w-full space-y-6">
                                
                                {/* Exercise Header Card */}
                                <div className="bg-card border border-border rounded-3xl p-5 shadow-sm">
                                    <div className="flex items-start justify-between gap-4 mb-4">
                                        <div>
                                            <p className="text-xs font-bold text-primary mb-1 uppercase tracking-wider">{currentExercise.muscle_group}</p>
                                            <h2 className="text-2xl font-black text-foreground leading-tight">{currentExercise.name}</h2>
                                        </div>
                                        {(currentExercise.gif_url || currentExercise.video_url) && (
                                            <button 
                                                onClick={() => setShowTechnique(true)}
                                                className="flex flex-col items-center justify-center gap-1 w-14 h-14 rounded-2xl bg-secondary/50 text-primary hover:bg-secondary transition-colors flex-shrink-0 border border-border"
                                            >
                                                <Info className="w-5 h-5" />
                                                <span className="text-[9px] font-bold uppercase">Técnica</span>
                                            </button>
                                        )}
                                    </div>

                                    {/* Target Details Grid */}
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
                                        <div className="bg-muted/50 rounded-xl p-2.5 text-center border border-border/50">
                                            <p className="text-[10px] text-muted-foreground font-semibold uppercase mb-0.5">Series x Reps</p>
                                            <p className="font-bold text-sm text-foreground">{currentBlock.sets} × {currentBlock.reps}</p>
                                        </div>
                                        {currentBlock.target_weight_kg && (
                                            <div className="bg-emerald-500/10 rounded-xl p-2.5 text-center border border-emerald-500/20">
                                                <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold uppercase mb-0.5">Sugerido</p>
                                                <p className="font-bold text-sm text-emerald-700 dark:text-emerald-300">{currentBlock.target_weight_kg} Kg</p>
                                            </div>
                                        )}
                                        {currentBlock.rest_time && (
                                            <div className="bg-muted/50 rounded-xl p-2.5 text-center border border-border/50">
                                                <p className="text-[10px] text-muted-foreground font-semibold uppercase mb-0.5">Descanso</p>
                                                <p className="font-bold text-sm text-foreground">{currentBlock.rest_time}</p>
                                            </div>
                                        )}
                                        {currentBlock.tempo && (
                                            <div className="bg-muted/50 rounded-xl p-2.5 text-center border border-border/50">
                                                <p className="text-[10px] text-muted-foreground font-semibold uppercase mb-0.5">Tempo</p>
                                                <p className="font-bold text-sm text-foreground">{currentBlock.tempo}</p>
                                            </div>
                                        )}
                                    </div>

                                    {currentBlock.notes && (
                                        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
                                            <p className="text-xs font-bold text-amber-700 dark:text-amber-400 mb-1 flex items-center gap-1.5">
                                                <Zap className="w-3.5 h-3.5" /> Nota del Coach
                                            </p>
                                            <p className="text-sm text-amber-900/80 dark:text-amber-200/80 leading-relaxed">
                                                {currentBlock.notes}
                                            </p>
                                        </div>
                                    )}
                                </div>

                                {/* Logger Section */}
                                <div className="bg-card border border-border rounded-3xl p-2 md:p-4 shadow-sm">
                                    <div className="grid grid-cols-[auto_3.5rem_3.5rem_auto] md:grid-cols-[auto_1fr_1fr_auto] gap-2 px-3 pb-3 pt-2 text-[10px] font-bold text-muted-foreground uppercase tracking-wider border-b border-border/50">
                                        <div className="w-4 md:w-5 text-center">Set</div>
                                        <div className="text-center">Kg</div>
                                        <div className="text-center">Reps</div>
                                        <div className="w-10 md:w-8"></div>
                                    </div>

                                    <div className="space-y-1 pt-2">
                                        {Array.from({ length: currentBlock.sets }).map((_, i) => {
                                            const setNumber = i + 1
                                            const blockLogs = logs?.filter(l => l.block_id === currentBlock.id) || []
                                            const log = blockLogs.find(l => l.set_number === setNumber)
                                            return (
                                                <LogSetForm
                                                    key={setNumber}
                                                    blockId={currentBlock.id}
                                                    setNumber={setNumber}
                                                    restTimeStr={currentBlock.rest_time}
                                                    existingLog={log}
                                                />
                                            )
                                        })}
                                    </div>
                                </div>

                            </div>
                        </motion.div>
                    </AnimatePresence>
                </div>

                {/* Bottom Navigation Fixed Bar */}
                <div className="fixed bottom-0 left-0 right-0 bg-background/90 backdrop-blur-xl border-t border-border/20 p-4 z-40 pb-safe animate-in fade-in-0 slide-in-from-bottom-5 duration-700 delay-500">
                    <div className="max-w-xl mx-auto flex items-center gap-3">
                        <button
                            onClick={handlePrev}
                            disabled={currentIndex === 0}
                            className="h-14 px-4 flex items-center justify-center rounded-2xl border border-border bg-card text-foreground disabled:opacity-30 transition-all active:scale-95"
                        >
                            <ChevronLeft className="w-6 h-6" />
                        </button>
                        
                        {currentIndex === blocks.length - 1 ? (
                            <button
                                onClick={handleNext}
                                className="flex-1 h-14 flex items-center justify-center gap-2 rounded-2xl text-white font-bold text-base transition-transform active:scale-95 shadow-lg shadow-primary/20"
                                style={{ backgroundColor: 'var(--theme-primary)' }}
                            >
                                <Zap className="w-5 h-5 fill-current" />
                                Finalizar Entrenamiento
                            </button>
                        ) : (
                            <button
                                onClick={handleNext}
                                className="flex-1 h-14 flex items-center justify-center gap-2 rounded-2xl bg-secondary text-secondary-foreground font-bold text-base transition-transform active:scale-95 border border-border"
                            >
                                Siguiente Ejercicio
                                <ChevronRight className="w-5 h-5" />
                            </button>
                        )}
                    </div>
                </div>

                {/* Technique Modal */}
                <Dialog open={showTechnique} onOpenChange={setShowTechnique}>
                    <DialogContent className="bg-card border-border rounded-3xl overflow-hidden p-0 max-w-md w-[90vw]">
                        {/* Close button overlay - visible on mobile */}
                        <button
                            onClick={() => setShowTechnique(false)}
                            className="absolute top-4 right-4 z-50 w-10 h-10 rounded-full bg-background/80 backdrop-blur-sm flex items-center justify-center text-foreground hover:bg-background transition-colors border border-border/50"
                        >
                            <X className="w-5 h-5" />
                        </button>

                        {currentExercise.gif_url && (
                            <div className="relative w-full aspect-square bg-muted flex items-center justify-center">
                                <Image 
                                    src={currentExercise.gif_url} 
                                    alt={currentExercise.name}
                                    fill
                                    className="object-contain p-4"
                                    unoptimized
                                />
                            </div>
                        )}
                        {!currentExercise.gif_url && currentExercise.video_url && (
                            <div className="p-8 text-center bg-muted">
                                <a href={currentExercise.video_url} target="_blank" rel="noopener noreferrer" 
                                   className="inline-flex items-center gap-2 text-primary font-bold">
                                    <Play className="w-5 h-5" /> Ver Video Externo
                                </a>
                            </div>
                        )}
                        <div className="p-6 pt-14 md:pt-6">
                            <DialogHeader className="mb-4">
                                <DialogTitle className="text-xl font-bold">{currentExercise.name}</DialogTitle>
                            </DialogHeader>
                            {currentExercise.instructions && currentExercise.instructions.length > 0 ? (
                                <ol className="space-y-3 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                                    {currentExercise.instructions.map((step, i) => (
                                        <li key={i} className="flex gap-3 text-sm text-muted-foreground">
                                            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-xs mt-0.5">
                                                {i + 1}
                                            </span>
                                            <span className="leading-relaxed">{step.replace(/^Step:\d+\s*/i, '')}</span>
                                        </li>
                                    ))}
                                </ol>
                            ) : (
                                <p className="text-muted-foreground text-sm">No hay instrucciones detalladas disponibles para este ejercicio.</p>
                            )}
                            <button 
                                onClick={() => setShowTechnique(false)}
                                className="w-full mt-6 py-3 rounded-xl bg-secondary text-secondary-foreground font-bold"
                            >
                                Entendido
                            </button>
                        </div>
                    </DialogContent>
                </Dialog>

            </div>
        </WorkoutTimerProvider>
    )
}