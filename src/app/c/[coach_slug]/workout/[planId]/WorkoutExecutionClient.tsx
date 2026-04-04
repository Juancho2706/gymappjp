'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import confetti from 'canvas-confetti'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ChevronLeft, ChevronRight, Zap, Info, Dumbbell, Timer, Play, X, Settings } from 'lucide-react'
import { LogSetForm } from './LogSetForm'
import { WorkoutTimerProvider, useWorkoutTimer } from './WorkoutTimerProvider'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from '@/components/ui/dialog'
import Image from 'next/image'
import { ThemeToggle } from '@/components/ThemeToggle'
import { InfoTooltip } from '@/components/ui/info-tooltip'
import { useTranslation } from '@/lib/i18n/LanguageContext'

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
    day_of_week: number | null
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
    previousHistory?: Record<string, { weight_kg: number | null, reps_done: number | null, date: string }[]>
    coachSlug: string
}

function ManualTimerButton({ defaultTime, onSettingsClick }: { defaultTime: string | null, onSettingsClick: () => void }) {
    const { startRest } = useWorkoutTimer()
    return (
        <div className="flex items-center gap-1.5">
            <button
                onClick={() => startRest(defaultTime || '90')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-secondary-foreground text-xs font-bold transition-all hover:bg-secondary/80 active:scale-95"
            >
                <Timer className="w-3.5 h-3.5" />
                Descanso ({defaultTime || '90s'})
            </button>
            <button 
                onClick={onSettingsClick}
                className="p-1.5 rounded-lg text-muted-foreground hover:bg-secondary transition-colors"
                title="Configuración del Cronómetro"
            >
                <Settings className="w-4 h-4" />
            </button>
        </div>
    )
}

export function WorkoutExecutionClient({ plan, logs, previousHistory = {}, coachSlug }: Props) {
    const router = useRouter()
    const { t } = useTranslation()
    const blocks = plan.workout_blocks.sort((a, b) => a.order_index - b.order_index)
    const [currentIndex, setCurrentIndex] = useState(0)
    const [direction, setDirection] = useState(0) // 1 for next, -1 for prev
    const [showTechnique, setShowTechnique] = useState(false)
    const [showIntro, setShowIntro] = useState(true)
    const [mounted, setMounted] = useState(false)
    const [autoTimerEnabled, setAutoTimerEnabled] = useState(true)
    const [showTimerSettings, setShowTimerSettings] = useState(false)
    const [showCompleted, setShowCompleted] = useState(false)

    // Immersive Mode Logic & Haptic setup
    useEffect(() => {
        if (!showIntro && !showCompleted) {
            document.body.classList.add('immersive-workout-mode')
        } else {
            document.body.classList.remove('immersive-workout-mode')
        }
        return () => {
            document.body.classList.remove('immersive-workout-mode')
        }
    }, [showIntro, showCompleted])

    const vibrate = (pattern: number | number[]) => {
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
            navigator.vibrate(pattern)
        }
    }

    // auto‑dismiss intro after a short delay
    useEffect(() => {
        setMounted(true)
        const savedAutoTimer = localStorage.getItem('omni_autotimer')
        if (savedAutoTimer !== null) {
            setAutoTimerEnabled(savedAutoTimer === 'true')
        }
        const t = setTimeout(() => setShowIntro(false), 1200)
        return () => clearTimeout(t)
    }, [])

    const currentBlock = blocks[currentIndex]
    
    // Safety check: if no blocks exist (e.g. after a database cleanup), redirect or show error
    if (!currentBlock) {
        return (
            <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
                <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4 text-muted-foreground">
                    <Dumbbell className="w-8 h-8" />
                </div>
                <h1 className="text-xl font-bold text-foreground mb-2">Rutina sin ejercicios</h1>
                <p className="text-sm text-muted-foreground mb-6">Esta rutina ya no tiene ejercicios asociados. Tu coach probablemente esté actualizando tu plan.</p>
                <Link href={`/c/${coachSlug}/dashboard`} className="px-6 py-2 bg-primary text-primary-foreground rounded-xl font-bold shadow-lg shadow-primary/20 transition-all hover:-translate-y-0.5">
                    Volver al Dashboard
                </Link>
            </div>
        )
    }

    const rawExercise = Array.isArray(currentBlock.exercises) ? currentBlock.exercises[0] : currentBlock.exercises
    
    // Safety check for deleted exercises
    if (!rawExercise) {
        return (
            <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
                <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4 text-muted-foreground">
                    <Zap className="w-8 h-8 text-amber-500" />
                </div>
                <h1 className="text-xl font-bold text-foreground mb-2">Ejercicio no encontrado</h1>
                <p className="text-sm text-muted-foreground mb-6">Este ejercicio ha sido removido del catálogo global. Por favor contacta a tu coach para que lo actualice.</p>
                <Link href={`/c/${coachSlug}/dashboard`} className="px-6 py-2 bg-primary text-primary-foreground rounded-xl font-bold shadow-lg shadow-primary/20 transition-all hover:-translate-y-0.5">
                    Volver al Dashboard
                </Link>
            </div>
        )
    }

    const currentExercise = rawExercise as ExerciseType

    const handleNext = () => {
        if (currentIndex < blocks.length - 1) {
            setDirection(1)
            setCurrentIndex(prev => prev + 1)
        } else {
            // Finish workout
            setShowCompleted(true)
            confetti({
                particleCount: 150,
                spread: 70,
                origin: { y: 0.6 },
                colors: ['#10B981', '#3B82F6', '#8B5CF6']
            })
            setTimeout(() => {
                router.push(`/c/${coachSlug}/dashboard`)
            }, 3000)
        }
    }

    const handlePrev = () => {
        if (currentIndex > 0) {
            setDirection(-1)
            setCurrentIndex(prev => prev - 1)
        }
    }

    const progressPercentage = ((currentIndex + 1) / blocks.length) * 100

    const toggleAutoTimer = () => {
        const newValue = !autoTimerEnabled
        setAutoTimerEnabled(newValue)
        localStorage.setItem('omni_autotimer', String(newValue))
    }

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
            <div className="fixed inset-0 flex flex-col bg-background overflow-hidden overscroll-none">

                {/* intro overlay */}
                {mounted ? createPortal(
                    <AnimatePresence>
                        {showIntro && (
                            <motion.div
                                initial={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.8, ease: "easeInOut" }}
                                className="fixed inset-0 z-[9999] bg-black flex items-center justify-center"
                            >
                                <motion.h1
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.6, delay: 0.2 }}
                                    className="text-white text-3xl font-bold text-center px-6"
                                    style={{ fontFamily: 'var(--font-outfit)' }}
                                >
                                    {plan.title}
                                </motion.h1>
                            </motion.div>
                        )}
                    </AnimatePresence>,
                    document.body
                ) : null}

                {/* Top Section - Fixed Header & Progress */}
                <motion.div 
                    initial={{ y: -50, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ duration: 0.6, delay: 1.2, ease: "easeOut" }}
                    className="flex-none bg-card border-b border-border/50 shadow-sm z-20 pb-4 pt-safe"
                >
                    <div className="px-4 py-3 md:px-8 max-w-3xl mx-auto w-full">
                        {/* Custom Header */}
                        <div className="flex items-center justify-between mb-4">
                            <Link href={`/c/${coachSlug}/dashboard`} className="p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors">
                                <ArrowLeft className="w-6 h-6" />
                            </Link>
                            <h1 className="text-lg md:text-xl font-bold text-foreground truncate px-2" style={{ fontFamily: 'var(--font-outfit)' }}>
                                {plan.title}
                            </h1>
                            <div className="flex items-center gap-2">
                                <ThemeToggle />
                            </div>
                        </div>

                        {/* Progress and Timer */}
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                                Ejercicio {currentIndex + 1} de {blocks.length}
                            </span>
                            <ManualTimerButton defaultTime={currentBlock.rest_time} onSettingsClick={() => setShowTimerSettings(true)} />
                        </div>

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
                </motion.div>

                {/* Main Content Area (75% approx) - Carousel */}
                <motion.div 
                    initial={{ y: 50, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ duration: 0.6, delay: 1.3, ease: "easeOut" }}
                    className="flex-1 relative overflow-hidden bg-muted/10 w-full"
                >
                    <AnimatePresence initial={false} custom={direction} mode="wait">
                        <motion.div
                            key={currentIndex}
                            custom={direction}
                            variants={variants}
                            initial="enter"
                            animate="center"
                            exit="exit"
                            className="absolute inset-0 overflow-y-auto pb-32 pt-6 px-4 md:px-8"
                        >
                            <div className="max-w-xl mx-auto w-full space-y-6">
                                
                                {/* Exercise Header Card */}
                                <div className="bg-card border border-border rounded-3xl p-5 shadow-sm">
                                    <div className="flex items-start justify-between gap-4 mb-4">
                                        <div>
                                            <p className="text-xs font-bold mb-1 uppercase tracking-wider" style={{ color: 'var(--theme-primary)' }}>{currentExercise.muscle_group}</p>
                                            <h2 className="text-2xl font-black text-foreground leading-tight">{currentExercise.name}</h2>
                                        </div>
                                        {(currentExercise.gif_url || currentExercise.video_url) && (
                                            <button 
                                                onClick={() => setShowTechnique(true)}
                                                className="flex flex-col items-center justify-center gap-1 w-14 h-14 rounded-2xl bg-secondary/50 hover:bg-secondary transition-colors flex-shrink-0 border border-border"
                                                style={{ color: 'var(--theme-primary)' }}
                                            >
                                                <Info className="w-5 h-5" />
                                                <span className="text-[9px] font-bold uppercase">Técnica</span>
                                            </button>
                                        )}
                                    </div>

                                    {/* Target Details Grid */}
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
                                        <div className="bg-muted/50 rounded-xl p-2.5 text-center border border-border/50">
                                            <p className="text-[10px] text-muted-foreground font-semibold uppercase mb-0.5 flex items-center justify-center gap-1">
                                                Series x Reps <InfoTooltip content={t('tooltip.reps')} />
                                            </p>
                                            <p className="font-bold text-sm text-foreground">{currentBlock.sets} × {currentBlock.reps}</p>
                                        </div>
                                        {currentBlock.target_weight_kg && (
                                            <div className="bg-emerald-500/10 rounded-xl p-2.5 text-center border border-emerald-500/20">
                                                <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold uppercase mb-0.5 flex items-center justify-center gap-1">
                                                    Sugerido <InfoTooltip content={t('tooltip.weight')} />
                                                </p>
                                                <p className="font-bold text-sm text-emerald-700 dark:text-emerald-300">{currentBlock.target_weight_kg} Kg</p>
                                            </div>
                                        )}
                                        {currentBlock.rest_time && (
                                            <div className="bg-muted/50 rounded-xl p-2.5 text-center border border-border/50">
                                                <p className="text-[10px] text-muted-foreground font-semibold uppercase mb-0.5 flex items-center justify-center gap-1">
                                                    Descanso <InfoTooltip content={t('tooltip.rest')} />
                                                </p>
                                                <p className="font-bold text-sm text-foreground">{currentBlock.rest_time}</p>
                                            </div>
                                        )}
                                        {currentBlock.tempo && (
                                            <div className="bg-muted/50 rounded-xl p-2.5 text-center border border-border/50">
                                                <p className="text-[10px] text-muted-foreground font-semibold uppercase mb-0.5 flex items-center justify-center gap-1">
                                                    Tempo <InfoTooltip content={t('tooltip.tempo')} />
                                                </p>
                                                <p className="font-bold text-sm text-foreground">{currentBlock.tempo}</p>
                                            </div>
                                        )}
                                    </div>

                                    {currentBlock.notes && (
                                        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
                                            <p className="text-xs font-bold text-amber-700 dark:text-amber-400 mb-1 flex items-center gap-1.5">
                                                <Zap className="w-3.5 h-3.5" /> Nota del Coach <InfoTooltip content={t('tooltip.notes')} />
                                            </p>
                                            <p className="text-sm text-amber-900/80 dark:text-amber-200/80 leading-relaxed">
                                                {currentBlock.notes}
                                            </p>
                                        </div>
                                    )}
                                    
                                    {previousHistory[currentExercise.id] && previousHistory[currentExercise.id].length > 0 && (
                                        <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 mt-2">
                                            <p className="text-[10px] font-bold text-primary mb-1.5 flex items-center gap-1.5 uppercase tracking-wider">
                                                <Timer className="w-3.5 h-3.5" /> Sesión Anterior ({new Date(previousHistory[currentExercise.id][0].date + 'T12:00:00Z').toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })})
                                            </p>
                                            <div className="flex flex-wrap gap-1.5">
                                                {previousHistory[currentExercise.id].map((log, idx) => (
                                                    <span key={idx} className="text-xs font-medium bg-background border border-border px-2 py-1 rounded-md text-muted-foreground shadow-sm">
                                                        S{idx + 1}: {log.weight_kg ? `${log.weight_kg}kg` : '-'} × {log.reps_done || '-'}
                                                    </span>
                                                ))}
                                            </div>
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
                                                    autoTimerEnabled={autoTimerEnabled}
                                                />
                                            )
                                        })}
                                    </div>
                                </div>

                            </div>
                        </motion.div>
                    </AnimatePresence>
                </motion.div>

                {/* Bottom Navigation Fixed Bar */}
                <motion.div 
                    initial={{ y: 50, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ duration: 0.6, delay: 1.4, ease: "easeOut" }}
                    className="fixed bottom-0 left-0 right-0 bg-background/90 backdrop-blur-xl border-t border-border/20 p-4 z-40 pb-safe"
                >
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
                </motion.div>

                {/* Timer Settings Modal */}
                <Dialog open={showTimerSettings} onOpenChange={setShowTimerSettings}>
                    <DialogContent className="max-w-xs rounded-3xl p-6 bg-card border-border">
                        <DialogHeader>
                            <DialogTitle className="text-xl font-bold">Cronómetro Automático</DialogTitle>
                        </DialogHeader>
                        <p className="text-sm text-muted-foreground mt-2 mb-6">
                            Si está activado, el cronómetro de descanso comenzará a correr automáticamente cada vez que guardes una serie.
                        </p>
                        
                        <button
                            onClick={() => {
                                toggleAutoTimer()
                            }}
                            className="w-full flex items-center justify-between p-4 rounded-2xl border border-border bg-secondary/50 hover:bg-secondary transition-colors"
                        >
                            <span className="font-semibold">{autoTimerEnabled ? 'Activado' : 'Desactivado'}</span>
                            <div className={`w-12 h-7 rounded-full transition-colors flex items-center px-1 ${autoTimerEnabled ? 'bg-primary' : 'bg-muted-foreground/30'}`} style={autoTimerEnabled ? { backgroundColor: 'var(--theme-primary)' } : {}}>
                                <motion.div 
                                    className="w-5 h-5 bg-white rounded-full shadow-sm"
                                    animate={{ x: autoTimerEnabled ? 20 : 0 }}
                                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                                />
                            </div>
                        </button>
                        <button
                            onClick={() => setShowTimerSettings(false)}
                            className="w-full mt-4 py-3 rounded-xl bg-secondary text-secondary-foreground font-bold"
                        >
                            Cerrar
                        </button>
                    </DialogContent>
                </Dialog>

                {/* Workout Completed Overlay */}
                {mounted ? createPortal(
                    <AnimatePresence>
                        {showCompleted && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="fixed inset-0 z-[9999] bg-background flex flex-col items-center justify-center"
                            >
                                <motion.div
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    transition={{ type: "spring", stiffness: 200, damping: 20, delay: 0.2 }}
                                    className="w-24 h-24 rounded-full flex items-center justify-center mb-6"
                                    style={{ backgroundColor: 'color-mix(in srgb, var(--theme-primary) 15%, transparent)' }}
                                >
                                    <Zap className="w-12 h-12" style={{ color: 'var(--theme-primary)' }} />
                                </motion.div>
                                <motion.h1
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.5, delay: 0.4 }}
                                    className="text-3xl font-extrabold text-center px-6 mb-2"
                                    style={{ fontFamily: 'var(--font-outfit)' }}
                                >
                                    ¡Entrenamiento Terminado!
                                </motion.h1>
                                <motion.p
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ duration: 0.5, delay: 0.6 }}
                                    className="text-muted-foreground font-medium"
                                >
                                    {plan.title}
                                </motion.p>
                            </motion.div>
                        )}
                    </AnimatePresence>,
                    document.body
                ) : null}

                {/* Technique Modal */}
                <Dialog open={showTechnique} onOpenChange={setShowTechnique}>
                    <DialogContent 
                        showCloseButton={false}
                        className="bg-card border-border rounded-3xl overflow-hidden p-0 max-w-md w-[90vw] max-h-[85vh] flex flex-col focus:outline-none"
                    >
                        {(() => {
                            const isYouTube = currentExercise.video_url?.includes('youtube.com') || currentExercise.video_url?.includes('youtu.be');
                            
                            const getYouTubeId = (url: string) => {
                                const match = url.match(/(?:v=|\/)([a-zA-Z0-9_-]{11})/);
                                return match ? match[1] : null;
                            };
                            
                            const ytId = isYouTube && currentExercise.video_url ? getYouTubeId(currentExercise.video_url) : null;
                            
                            if (isYouTube && ytId) {
                                return (
                                    <div className="relative w-full h-48 md:h-64 shrink-0 bg-black/5 dark:bg-black/20 flex items-center justify-center">
                                        <iframe
                                            className="w-full h-full"
                                            src={`https://www.youtube-nocookie.com/embed/${ytId}?autoplay=1&mute=1&loop=1&playlist=${ytId}&modestbranding=1&rel=0&showinfo=0&controls=1`}
                                            title={currentExercise.name}
                                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                            allowFullScreen
                                        />
                                    </div>
                                );
                            }
                            
                            if (currentExercise.gif_url) {
                                return (
                                    <div className="relative w-full h-48 md:h-64 shrink-0 bg-muted flex items-center justify-center">
                                        <Image 
                                            src={currentExercise.gif_url} 
                                            alt={currentExercise.name}
                                            fill
                                            className="object-contain p-4"
                                            unoptimized
                                        />
                                    </div>
                                );
                            }
                            
                            if (currentExercise.video_url) {
                                return (
                                    <div className="p-8 text-center bg-muted shrink-0">
                                        <a href={currentExercise.video_url} target="_blank" rel="noopener noreferrer" 
                                           className="inline-flex items-center gap-2 text-primary font-bold">
                                            <Play className="w-5 h-5" /> Ver Video Externo
                                        </a>
                                    </div>
                                );
                            }
                            
                            return null;
                        })()}
                        <div className="p-6 pt-6 flex-1 overflow-y-auto custom-scrollbar">
                            <DialogHeader className="mb-4">
                                <div className="flex items-start justify-between gap-4">
                                    <DialogTitle className="text-xl font-extrabold text-foreground">{currentExercise.name}</DialogTitle>
                                    <DialogClose className="p-2 -mr-2 -mt-2 rounded-full hover:bg-muted transition-colors shrink-0">
                                        <X className="w-5 h-5 text-muted-foreground" />
                                    </DialogClose>
                                </div>
                            </DialogHeader>
                                    {currentExercise.instructions && currentExercise.instructions.length > 0 ? (
                                        <ol className="space-y-3">
                                            {currentExercise.instructions.map((step, i) => (
                                                <li key={i} className="flex gap-3 text-sm text-muted-foreground">
                                                    <span 
                                                        className="flex-shrink-0 w-6 h-6 rounded-full font-bold flex items-center justify-center text-xs mt-0.5"
                                                        style={{ 
                                                            backgroundColor: 'color-mix(in srgb, var(--theme-primary) 15%, transparent)',
                                                            color: 'var(--theme-primary)'
                                                        }}
                                                    >
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
                                className="w-full mt-6 py-3 rounded-xl bg-secondary text-secondary-foreground font-bold shrink-0"
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