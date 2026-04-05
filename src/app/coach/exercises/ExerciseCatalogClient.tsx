'use client'

import { useState, useMemo } from 'react'
import Image from 'next/image'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogClose,
} from '@/components/ui/dialog'
import { Dumbbell, Globe, User, ExternalLink, Play, Zap, Target, Wrench, Search, Filter, X, Copy, ChevronDown, ChevronUp } from 'lucide-react'
import type { Tables } from '@/lib/database.types'
import { MUSCLE_GROUPS } from '@/lib/constants'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { filterExercises } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'

type Exercise = Tables<'exercises'>

interface ExerciseCatalogClientProps {
    globalExercises: Exercise[]
    customExercises: Exercise[]
    byMuscle: Record<string, Exercise[]>
}

export function ExerciseCatalogClient({ globalExercises, customExercises, byMuscle }: ExerciseCatalogClientProps) {
    const [selected, setSelected] = useState<Exercise | null>(null)
    const [search, setSearch] = useState('')
    const [muscleFilter, setMuscleFilter] = useState<string>('Todos')
    const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})

    const toggleGroup = (muscle: string) => {
        setCollapsedGroups(prev => ({
            ...prev,
            [muscle]: !prev[muscle]
        }))
    }

    const allExercises = useMemo(() => [...globalExercises, ...customExercises], [globalExercises, customExercises])

    const filteredExercises = useMemo(() => {
        return filterExercises(allExercises, search, muscleFilter)
    }, [allExercises, search, muscleFilter])

    const groupedByMuscle = useMemo(() => {
        const groups: Record<string, Exercise[]> = {}
        
        // Use the master list to define order and ensure important groups appear
        MUSCLE_GROUPS.forEach(m => {
            groups[m] = []
        })

        filteredExercises.forEach(ex => {
            const muscle = ex.muscle_group || 'Otro'
            if (!groups[muscle]) groups[muscle] = []
            groups[muscle].push(ex)
        })

        // Remove empty groups unless it's a filtered view
        if (search || muscleFilter !== 'Todos') {
            return Object.fromEntries(Object.entries(groups).filter(([_, list]) => list.length > 0))
        }
        
        return Object.fromEntries(Object.entries(groups).filter(([_, list]) => list.length > 0))
    }, [filteredExercises, search, muscleFilter])

    return (
        <div className="space-y-6">
            {/* Filters Section */}
            <div className="bg-card border border-border rounded-2xl p-4 shadow-sm flex flex-col md:flex-row gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                        placeholder="Buscar ejercicio..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-9 bg-background border-border text-foreground"
                    />
                </div>
                <div className="w-full md:w-64">
                    <Select value={muscleFilter} onValueChange={(val) => setMuscleFilter(val || 'Todos')}>
                        <SelectTrigger className="bg-muted/50 border-border">
                            <Filter className="w-4 h-4 mr-2 text-muted-foreground" />
                            <SelectValue placeholder="Grupo muscular" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="Todos">Todos</SelectItem>
                            {MUSCLE_GROUPS.map(m => (
                                <SelectItem key={m} value={m}>{m}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* Right: global catalog by muscle group */}
            <div className="lg:col-span-2 space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                        <Globe className="w-4 h-4" />
                        Catálogo de ejercicios
                        <Badge variant="secondary" className="ml-2 font-mono">
                            {filteredExercises.length}
                        </Badge>
                    </h2>
                </div>

                {Object.keys(groupedByMuscle).length > 0 ? (
                    Object.entries(groupedByMuscle).map(([muscle, exList]) => {
                        const isCollapsed = collapsedGroups[muscle]
                        return (
                            <div key={muscle} className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm transition-all hover:shadow-md">
                                <button 
                                    onClick={() => toggleGroup(muscle)}
                                    className="w-full px-5 py-3 border-b border-border bg-muted/30 flex items-center gap-2 cursor-pointer hover:bg-muted/50 transition-colors"
                                >
                                    <div className="w-2 h-2 rounded-full bg-primary shrink-0" />
                                    <span className="text-xs font-bold text-foreground uppercase tracking-wider">
                                        {muscle}
                                    </span>
                                    <div className="ml-auto flex items-center gap-3">
                                        <span className="text-xs text-muted-foreground bg-background px-2 py-0.5 rounded-full border border-border">
                                            {exList.length}
                                        </span>
                                        <div className="text-muted-foreground">
                                            {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                                        </div>
                                    </div>
                                </button>
                                <AnimatePresence initial={false}>
                                    {!isCollapsed && (
                                        <motion.div 
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: "auto", opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            transition={{ duration: 0.2 }}
                                            className="px-5 py-4 flex flex-wrap gap-2"
                                        >
                                            {exList.map(ex => (
                                                <button
                                                    key={ex.id}
                                                    onClick={() => setSelected(ex)}
                                                    className="group inline-flex items-center px-4 py-2 rounded-xl text-xs font-medium bg-background text-foreground border border-border hover:border-primary/40 hover:bg-primary/5 hover:text-primary transition-all duration-200 cursor-pointer shadow-sm hover:shadow"
                                                >
                                                    {(ex.video_url || ex.gif_url) && (
                                                        <div className="mr-2 w-2 h-2 rounded-full bg-primary animate-pulse group-hover:animate-none" />
                                                    )}
                                                    {ex.name}
                                                </button>
                                            ))}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        )
                    })
                ) : (
                    <div className="py-20 text-center bg-card border border-dashed border-border rounded-2xl">
                        <Dumbbell className="w-12 h-12 text-muted-foreground/20 mx-auto mb-4" />
                        <p className="text-muted-foreground font-medium">No se encontraron ejercicios</p>
                        <button 
                            onClick={() => { setSearch(''); setMuscleFilter('Todos'); }}
                            className="mt-4 text-xs text-primary hover:underline font-bold"
                        >
                            Limpiar filtros
                        </button>
                    </div>
                )}
            </div>

            {/* Exercise Preview Modal */}
            <ExercisePreviewModal
                exercise={selected}
                open={!!selected}
                onClose={() => setSelected(null)}
            />
        </div>
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

    const displayVideo = exercise.video_url || exercise.gif_url
    const isYouTube = displayVideo?.includes('youtube.com') || displayVideo?.includes('youtu.be')
    const hasInstructions = exercise.instructions && exercise.instructions.length > 0
    const hasEquipment = !!exercise.equipment
    const hasSecondary = exercise.secondary_muscles && exercise.secondary_muscles.length > 0

    // Extract YouTube ID
    const getYouTubeId = (url: string) => {
        const match = url.match(/(?:v=|\/)([a-zA-Z0-9_-]{11})/)
        return match ? match[1] : null
    }
    const ytId = isYouTube ? getYouTubeId(displayVideo!) : null
    
    // Check if it's a direct GIF or image from our bucket/ExerciseDB
    const isGif = !!exercise.gif_url || (exercise.video_url && (exercise.video_url.toLowerCase().endsWith('.gif') || exercise.video_url.includes('supabase')))
    const gifSource = exercise.gif_url || exercise.video_url

    // Build YouTube embed URL with trimming parameters
    const getEmbedUrl = () => {
        if (!ytId) return ''
        let url = `https://www.youtube-nocookie.com/embed/${ytId}?autoplay=1&mute=1&loop=1&playlist=${ytId}&modestbranding=1&rel=0&showinfo=0&controls=1`
        
        // Add start time if present (assuming video_start_time is in seconds)
        if (exercise.video_start_time) {
            url += `&start=${exercise.video_start_time}`
        }
        
        // Add end time if present
        if (exercise.video_end_time) {
            url += `&end=${exercise.video_end_time}`
        }
        
        return url
    }

    return (
        <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
            <DialogContent 
                showCloseButton={false}
                className="bg-card border border-border text-foreground max-w-lg rounded-2xl shadow-2xl p-0 overflow-y-auto custom-scrollbar max-h-[85vh] focus:outline-none"
            >
                {/* Media demonstration area */}
                <div className="sticky top-0 relative w-full bg-white flex items-center justify-center border-b border-border h-56 md:h-72 shrink-0 overflow-hidden z-10">
                    {isYouTube && ytId ? (
                        <iframe
                            className="w-full h-full"
                            src={getEmbedUrl()}
                            title={exercise.name}
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                            allowFullScreen
                        />
                    ) : isGif && gifSource ? (
                        <Image
                            src={gifSource}
                            alt={`Demostración: ${exercise.name}`}
                            fill
                            className="object-contain"
                            unoptimized
                        />
                    ) : (
                        <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground opacity-30">
                            <Dumbbell className="w-12 h-12" />
                            <p className="text-xs font-medium">Sin previsualización</p>
                        </div>
                    )}
                </div>

                <div className="p-6 space-y-5 flex-1">
                    <DialogHeader>
                        <div className="flex items-start justify-between gap-4">
                            <DialogTitle className="text-xl font-extrabold text-foreground">
                                {exercise.name}
                            </DialogTitle>
                            <DialogClose className="p-2 -mr-2 -mt-2 rounded-full hover:bg-muted transition-colors shrink-0">
                                <X className="w-5 h-5 text-muted-foreground" />
                            </DialogClose>
                        </div>
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
                                {isYouTube && ytId ? (
                                    <div className="relative w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 bg-black/5 dark:bg-black/20">
                                        <Image
                                            src={`https://img.youtube.com/vi/${ytId}/mqdefault.jpg`}
                                            alt={exercise.name}
                                            fill
                                            className="object-cover"
                                            unoptimized
                                        />
                                    </div>
                                ) : isGif && gifSource ? (
                                    <div className="relative w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 bg-black/5 dark:bg-black/20">
                                        <Image
                                            src={gifSource}
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
