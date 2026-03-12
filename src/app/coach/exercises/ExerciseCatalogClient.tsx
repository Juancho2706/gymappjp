'use client'

import { useState } from 'react'
import Image from 'next/image'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Dumbbell, Globe, User, ExternalLink, Play, Zap, Target, Wrench } from 'lucide-react'
import type { Exercise } from '@/lib/database.types'

interface ExerciseCatalogClientProps {
    globalExercises: Exercise[]
    customExercises: Exercise[]
    byMuscle: Record<string, Exercise[]>
}

export function ExerciseCatalogClient({ globalExercises, customExercises, byMuscle }: ExerciseCatalogClientProps) {
    const [selected, setSelected] = useState<Exercise | null>(null)

    return (
        <>
            {/* Right: global catalog by muscle group */}
            <div className="lg:col-span-2 space-y-4">
                <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                    <Globe className="w-4 h-4" />
                    Catálogo global
                </h2>
                {Object.entries(byMuscle).map(([muscle, exList]) => (
                    <div key={muscle} className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
                        <div className="px-5 py-3 border-b border-border flex items-center gap-2">
                            <Dumbbell className="w-3.5 h-3.5 text-primary" />
                            <span className="text-xs font-bold text-foreground uppercase tracking-wider">
                                {muscle}
                            </span>
                            <span className="text-xs text-muted-foreground ml-auto">{exList.length}</span>
                        </div>
                        <div className="px-5 py-3 flex flex-wrap gap-2">
                            {exList.map(ex => (
                                <button
                                    key={ex.id}
                                    onClick={() => setSelected(ex)}
                                    className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium bg-muted text-foreground border border-border hover:border-primary/40 hover:bg-primary/5 hover:text-primary transition-all duration-150 cursor-pointer"
                                >
                                    {(ex.gif_url || ex.video_url) && <span className="mr-1.5 text-primary">●</span>}
                                    {ex.name}
                                </button>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            {/* Exercise Preview Modal */}
            <ExercisePreviewModal
                exercise={selected}
                open={!!selected}
                onClose={() => setSelected(null)}
            />
        </>
    )
}

function ExercisePreviewModal({
    exercise,
    open,
    onClose,
}: {
    exercise: Exercise | null
    open: boolean
    onClose: () => void
}) {
    if (!exercise) return null

    const displayGif = exercise.gif_url || exercise.video_url
    const isYouTube = displayGif?.includes('youtube.com') || displayGif?.includes('youtu.be')
    const hasGif = !!displayGif && !isYouTube
    const hasInstructions = exercise.instructions && exercise.instructions.length > 0
    const hasEquipment = !!exercise.equipment
    const hasSecondary = exercise.secondary_muscles && exercise.secondary_muscles.length > 0

    // Extract YouTube ID
    const getYouTubeId = (url: string) => {
        const match = url.match(/(?:v=|\/)([a-zA-Z0-9_-]{11})/)
        return match ? match[1] : null
    }
    const ytId = isYouTube ? getYouTubeId(displayGif!) : null

    return (
        <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
            <DialogContent className="bg-card border border-border text-foreground max-w-lg rounded-2xl shadow-2xl p-0 overflow-hidden max-h-[85vh] flex flex-col focus:outline-none">
                {/* Media demonstration area */}
                <div className="relative w-full bg-black/5 dark:bg-black/20 flex items-center justify-center border-b border-border h-56 md:h-72 shrink-0 overflow-hidden z-0">
                    {hasGif ? (
                        <Image
                            src={displayGif!}
                            alt={`Demostración: ${exercise.name}`}
                            fill
                            className="object-cover"
                            unoptimized
                        />
                    ) : isYouTube && ytId ? (
                        <iframe
                            className="w-full h-full"
                            src={`https://www.youtube.com/embed/${ytId}?autoplay=1&mute=1&loop=1&playlist=${ytId}&modestbranding=1&rel=0&showinfo=0&controls=1`}
                            title={exercise.name}
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                            allowFullScreen
                        />
                    ) : (
                        <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground opacity-30">
                            <Dumbbell className="w-12 h-12" />
                            <p className="text-xs font-medium">Sin previsualización</p>
                        </div>
                    )}
                    {hasGif && <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />}
                </div>

                <div className="p-6 space-y-5 flex-1 overflow-y-auto custom-scrollbar">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-extrabold text-foreground pr-6">
                            {exercise.name}
                        </DialogTitle>
                    </DialogHeader>

                    {/* Badges row */}
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-primary/10 text-primary border border-primary/20">
                            <Target className="w-3 h-3" />
                            {exercise.muscle_group}
                        </span>
                        {hasEquipment && (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground border border-border">
                                <Wrench className="w-3 h-3" />
                                {exercise.equipment}
                            </span>
                        )}
                        {hasSecondary && exercise.secondary_muscles!.map(m => (
                            <span key={m} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs text-muted-foreground bg-muted/60 border border-border">
                                {m}
                            </span>
                        ))}
                    </div>

                    {/* Instructions */}
                    {hasInstructions && (
                        <div className="space-y-3">
                            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                                <Zap className="w-4 h-4 text-primary" />
                                Instrucciones
                            </h3>
                            <ol className="space-y-2">
                                {exercise.instructions!.map((step, i) => {
                                    // Strip "Step:N " prefix from ExerciseDB data
                                    const cleanStep = step.replace(/^Step:\d+\s*/i, '')
                                    return (
                                        <li key={i} className="flex gap-3 text-sm text-muted-foreground">
                                            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center mt-0.5">
                                                {i + 1}
                                            </span>
                                            <span className="leading-relaxed">{cleanStep}</span>
                                        </li>
                                    )
                                })}
                            </ol>
                        </div>
                    )}

                    {/* Vista del alumno preview */}
                    <div className="bg-muted/50 border border-border rounded-xl p-4">
                        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">
                            Vista del alumno
                        </p>
                        <div className="bg-card border border-border rounded-xl p-4">
                            <div className="flex items-center gap-3">
                                {hasGif ? (
                                    <div className="relative w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 bg-black/5 dark:bg-black/20">
                                        <Image
                                            src={displayGif!}
                                            alt={exercise.name}
                                            fill
                                            className="object-cover"
                                            unoptimized
                                        />
                                    </div>
                                ) : (
                                    <div className="w-14 h-14 rounded-xl bg-primary/10 border border-primary/15 flex items-center justify-center flex-shrink-0">
                                        <Dumbbell className="w-6 h-6 text-primary" />
                                    </div>
                                )}
                                <div>
                                    <p className="text-sm font-semibold text-foreground">{exercise.name}</p>
                                    <p className="text-xs text-muted-foreground">{exercise.muscle_group}</p>
                                    {hasEquipment && (
                                        <p className="text-xs text-muted-foreground mt-0.5">🔧 {exercise.equipment}</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Source badge */}
                    <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
                        {exercise.coach_id ? (
                            <>
                                <User className="w-3.5 h-3.5" />
                                Ejercicio personalizado
                            </>
                        ) : (
                            <>
                                <Globe className="w-3.5 h-3.5" />
                                Catálogo global · ExerciseDB
                            </>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
