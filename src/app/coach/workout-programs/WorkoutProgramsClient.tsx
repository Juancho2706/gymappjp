'use client'

import { useState, useTransition, useMemo } from 'react'
import { 
    Plus, Search, Dumbbell, User, MoreVertical, Copy, Trash2, LayoutGrid, List as ListIcon, 
    Loader2, ArrowRight, Eye, Filter, Check, Folder, ChevronRight, ChevronDown, Repeat, ChevronsUpDown
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/components/ui/command'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { assignProgramToClientsAction, deleteWorkoutProgramAction, duplicateWorkoutProgramAction } from '../builder/[clientId]/actions'
import { AnimatePresence, motion } from 'framer-motion'

interface Program {
    id: string
    name: string
    client_id: string | null
    weeks_to_repeat: number
    start_date: string | null
    created_at: string
    client?: {
        id: string
        full_name: string
    } | null
    workout_plans?: {
        id: string
        day_of_week: number
        title: string
        workout_blocks: {
            id: string
            exercise: { name: string }
            sets: number
            reps: string
        }[]
    }[]
}

interface Client {
    id: string
    full_name: string
    workout_programs?: {
        id: string
        name: string
    }[] | null
}

interface WorkoutProgramsClientProps {
    initialPrograms: any[]
    availableClients: Client[]
}

export function WorkoutProgramsClient({ initialPrograms, availableClients }: WorkoutProgramsClientProps) {
    const router = useRouter()
    const [search, setSearch] = useState('')
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
    const [filterType, setFilterType] = useState<'all' | 'templates' | 'assigned'>('all')
    const [programs, setPrograms] = useState<Program[]>(initialPrograms)
    const [isTemplatesOpen, setIsTemplatesOpen] = useState(true)
    const [isAssignOpen, setIsAssignOpen] = useState(false)
    const [selectedProgram, setSelectedProgram] = useState<Program | null>(null)
    const [selectedClients, setSelectedClients] = useState<string[]>([])
    const [isPending, startTransition] = useTransition()
    const [isPreviewOpen, setIsPreviewOpen] = useState(false)
    const [programToPreview, setProgramToPreview] = useState<Program | null>(null)
    const [clientSearch, setClientSearch] = useState('')

    const [showConfirmOverwrite, setShowConfirmOverwrite] = useState(false)
    const [clientsWithExistingPlans, setClientsWithExistingPlans] = useState<Client[]>([])

    const [openPopover, setOpenPopover] = useState(false)

    const activeAssignedPrograms = useMemo(() => {
        const assigned = programs.filter(p => p.client_id)
        const programsByClient = assigned.reduce((acc, curr) => {
            if (!curr.client_id) return acc
            if (!acc[curr.client_id]) {
                acc[curr.client_id] = []
            }
            acc[curr.client_id].push(curr)
            return acc
        }, {} as Record<string, Program[]>)
        
        return Object.values(programsByClient).map(clientPrograms => {
            return clientPrograms.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
        })
    }, [programs])

    const filtered = programs.filter((p: Program) => {
        const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase()) ||
            p.client?.full_name?.toLowerCase().includes(search.toLowerCase())
        
        if (filterType === 'templates') return matchesSearch && !p.client_id
        if (filterType === 'assigned') return matchesSearch && p.client_id && activeAssignedPrograms.some(ap => ap.id === p.id)
        return matchesSearch
    })

    const handleAssign = (force = false) => {
        if (!selectedProgram || selectedClients.length === 0) {
            toast.error('Selecciona al menos un alumno')
            return
        }

        if (!force) {
            const clientsToOverwrite = availableClients.filter(c => 
                selectedClients.includes(c.id) && 
                c.workout_programs && 
                c.workout_programs.length > 0 &&
                c.workout_programs[0].id !== selectedProgram.id
            )

            if (clientsToOverwrite.length > 0) {
                setClientsWithExistingPlans(clientsToOverwrite)
                setShowConfirmOverwrite(true)
                return
            }
        }

        setShowConfirmOverwrite(false)

        startTransition(async () => {
            const result = await assignProgramToClientsAction(selectedProgram.id, selectedClients)
            if (result.error) {
                toast.error(result.error)
            } else {
                toast.success('Programa asignado correctamente')
                setIsAssignOpen(false)
                setSelectedClients([])
                window.location.reload()
            }
        })
    }

    const handleDuplicate = (program: Program) => {
        startTransition(async () => {
            const result = await duplicateWorkoutProgramAction(program.id)
            if (result.error) {
                toast.error(result.error)
            } else {
                toast.success('Programa duplicado correctamente')
                router.refresh()
            }
        })
    }

    const handleDelete = (program: Program) => {
        if (!confirm(`¿Estás seguro de que quieres eliminar el programa "${program.name}"?`)) return

        startTransition(async () => {
            const result = await deleteWorkoutProgramAction(program.id, program.client_id || '')
            if (result.error) {
                toast.error(result.error)
            } else {
                toast.success('Programa eliminado')
                setPrograms(prev => prev.filter(p => p.id !== program.id))
                router.refresh()
            }
        })
    }

    const toggleClient = (clientId: string) => {
        setSelectedClients(prev => 
            prev.includes(clientId) 
                ? prev.filter(id => id !== clientId)
                : [...prev, clientId]
        )
    }

    return (
        <div className="space-y-6">
            <AlertDialog open={showConfirmOverwrite} onOpenChange={setShowConfirmOverwrite}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>¿Sobreescribir programas de entrenamiento?</AlertDialogTitle>
                        <AlertDialogDescription>
                            <span className="block mt-2">Los siguientes alumnos ya tienen un programa activo:</span>
                            <span className="block mt-2 font-medium text-foreground">
                                {clientsWithExistingPlans.map(c => (
                                    <span key={c.id} className="block ml-4">
                                        • {c.full_name} ({c.workout_programs?.[0]?.name})
                                    </span>
                                ))}
                            </span>
                            <span className="block mt-4">
                                Si continúas, se les desactivará su programa actual y se les asignará este nuevo programa. ¿Deseas continuar?
                            </span>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction 
                            onClick={() => handleAssign(true)}
                            className="bg-primary text-primary-foreground hover:bg-primary/90"
                        >
                            Continuar y Sobreescribir
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Biblioteca de Programas</h1>
                    <p className="text-muted-foreground">Gestiona tus plantillas y programas asignados.</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button onClick={() => router.push('/coach/workout-programs/builder')} className="gap-2">
                        <Plus className="w-4 h-4" />
                        Nueva Plantilla
                    </Button>
                </div>
            </div>

            <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-card p-4 rounded-xl border border-border shadow-sm">
                <div className="flex flex-1 items-center gap-4 w-full">
                    <div className="relative flex-1 md:max-w-96">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                            placeholder="Buscar programas..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="pl-9 bg-background/50"
                        />
                    </div>
                    
                    <Tabs value={filterType} onValueChange={(val: any) => setFilterType(val)} className="hidden sm:block">
                        <TabsList className="bg-background/50 border">
                            <TabsTrigger value="all">Todos</TabsTrigger>
                            <TabsTrigger value="templates">Plantillas</TabsTrigger>
                            <TabsTrigger value="assigned">Asignados</TabsTrigger>
                        </TabsList>
                    </Tabs>
                </div>

                <div className="flex items-center gap-2 border rounded-lg p-1 bg-background/50">
                    <Button 
                        variant={viewMode === 'grid' ? 'secondary' : 'ghost'} 
                        size="sm" 
                        onClick={() => setViewMode('grid')}
                        className="h-8 w-8 p-0"
                    >
                        <LayoutGrid className="w-4 h-4" />
                    </Button>
                    <Button 
                        variant={viewMode === 'list' ? 'secondary' : 'ghost'} 
                        size="sm" 
                        onClick={() => setViewMode('list')}
                        className="h-8 w-8 p-0"
                    >
                        <ListIcon className="w-4 h-4" />
                    </Button>
                </div>
            </div>

            {/* Program Sections */}
            <div className="space-y-8">
                {filtered.length === 0 ? (
                    <div className="text-center py-12 bg-muted/20 rounded-xl border border-dashed">
                        <p className="text-muted-foreground">No se encontraron programas.</p>
                    </div>
                ) : (
                    <div className="space-y-8">
                        {/* Templates Folder Section */}
                        {(filterType === 'all' || filterType === 'templates') && (
                            <div className="space-y-4">
                                <button 
                                    onClick={() => setIsTemplatesOpen(!isTemplatesOpen)}
                                    className="flex items-center gap-3 w-full p-4 bg-primary/5 hover:bg-primary/10 rounded-xl border border-primary/20 transition-all group"
                                >
                                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                                        <Folder className={cn("w-5 h-5 text-primary", isTemplatesOpen ? "fill-primary/20" : "")} />
                                    </div>
                                    <div className="flex-1 text-left">
                                        <h3 className="font-bold text-lg">Biblioteca de Plantillas</h3>
                                        <p className="text-xs text-muted-foreground">
                                            {filtered.filter(p => !p.client_id).length} plantillas guardadas
                                        </p>
                                    </div>
                                    {isTemplatesOpen ? <ChevronDown className="w-5 h-5 text-muted-foreground" /> : <ChevronRight className="w-5 h-5 text-muted-foreground" />}
                                </button>

                                <AnimatePresence initial={false}>
                                    {isTemplatesOpen && (
                                        <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: "auto", opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            transition={{ duration: 0.3, ease: "easeInOut" }}
                                            className="overflow-hidden"
                                        >
                                            <div className={viewMode === 'grid' ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-2" : "space-y-2 pt-2"}>
                                                {filtered.filter(p => !p.client_id).map(program => (
                                                    <ProgramCard 
                                                        key={program.id} 
                                                        program={program} 
                                                        viewMode={viewMode}
                                                        onAssign={() => {
                                                            setSelectedProgram(program)
                                                            setIsAssignOpen(true)
                                                        }}
                                                        onDuplicate={() => handleDuplicate(program)}
                                                        onDelete={() => handleDelete(program)}
                                                        onPreview={() => {
                                                            setProgramToPreview(program)
                                                            setIsPreviewOpen(true)
                                                        }}
                                                        isPending={isPending}
                                                    />
                                                ))}
                                                {filtered.filter(p => !p.client_id).length === 0 && (
                                                    <p className="text-sm text-muted-foreground italic p-4">No hay plantillas que coincidan con la búsqueda.</p>
                                                )}
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        )}

                        {/* Active Plans Section */}
                        {(filterType === 'all' || filterType === 'assigned') && (
                            <div className="space-y-4">
                                <div className="flex items-center gap-3 px-2">
                                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                                    <h3 className="font-bold text-lg">Planes Activos (Asignados)</h3>
                                    <Badge variant="outline" className="ml-auto">
                                        {activeAssignedPrograms.length} alumnos
                                    </Badge>
                                </div>
                                
                                <div className={viewMode === 'grid' ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" : "space-y-2"}>
                                    {activeAssignedPrograms.map(program => (
                                        <ProgramCard 
                                            key={program.id} 
                                            program={program} 
                                            viewMode={viewMode}
                                            onAssign={() => {
                                                setSelectedProgram(program)
                                                setIsAssignOpen(true)
                                            }}
                                            onDuplicate={() => handleDuplicate(program)}
                                            onDelete={() => handleDelete(program)}
                                            onPreview={() => {
                                                setProgramToPreview(program)
                                                setIsPreviewOpen(true)
                                            }}
                                            isPending={isPending}
                                        />
                                    ))}
                                    {activeAssignedPrograms.length === 0 && (
                                        <div className="col-span-full py-8 text-center bg-muted/10 rounded-xl border border-dashed">
                                            <p className="text-sm text-muted-foreground">No hay alumnos con planes activos que coincidan con la búsqueda.</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Assign Dialog */}
            <Dialog open={isAssignOpen} onOpenChange={setIsAssignOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>Asignar Programa</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Programa: <span className="text-primary font-bold">{selectedProgram?.name}</span></label>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Alumnos ({selectedClients.length})</label>
                            <Popover open={openPopover} onOpenChange={setOpenPopover}>
                                <PopoverTrigger
                                    className="w-full justify-between h-auto py-2 min-h-[44px] flex items-center px-3 rounded-md border border-input bg-background text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    <span className="truncate">
                                        {selectedClients.length > 0 
                                            ? `${selectedClients.length} seleccionados`
                                            : "Seleccionar alumnos..."}
                                    </span>
                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </PopoverTrigger>
                                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                                    <div className="p-1 space-y-1 bg-popover rounded-lg border shadow-md">
                                        <div className="px-3 py-2 border-b flex items-center gap-2">
                                            <Search className="h-4 w-4 shrink-0 opacity-50" />
                                            <input 
                                                className="w-full bg-transparent outline-none text-sm h-8"
                                                placeholder="Buscar alumno..."
                                                value={clientSearch}
                                                onChange={(e) => setClientSearch(e.target.value)}
                                            />
                                        </div>
                                        <div className="max-h-[300px] overflow-y-auto">
                                            {availableClients.filter(c => c.full_name.toLowerCase().includes(clientSearch.toLowerCase())).length === 0 ? (
                                                <div className="py-6 text-center text-sm text-muted-foreground">
                                                    No se encontraron alumnos.
                                                </div>
                                            ) : (
                                                availableClients.filter(c => c.full_name.toLowerCase().includes(clientSearch.toLowerCase())).map((client) => (
                                                    <div
                                                        key={client.id}
                                                        onClick={() => toggleClient(client.id)}
                                                        className="relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground transition-colors"
                                                    >
                                                        <div className={cn(
                                                            "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                                                            selectedClients.includes(client.id)
                                                                ? "bg-primary text-primary-foreground"
                                                                : "opacity-50"
                                                        )}>
                                                            {selectedClients.includes(client.id) && (
                                                                <Check className="h-3 w-3" />
                                                            )}
                                                        </div>
                                                        {client.full_name}
                                                        {client.workout_programs && client.workout_programs.length > 0 && (
                                                            <span className="ml-2 text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full shrink-0">
                                                                Plan: {client.workout_programs[0].name}
                                                            </span>
                                                        )}
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                </PopoverContent>
                            </Popover>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsAssignOpen(false)}>Cancelar</Button>
                        <Button onClick={() => handleAssign(false)} disabled={isPending || selectedClients.length === 0}>
                            {isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                            Asignar a {selectedClients.length} Alumnos
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Preview Dialog */}
            <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
                <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Eye className="w-5 h-5 text-primary" />
                            Vista Previa: {programToPreview?.name}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-6 py-4">
                        {programToPreview?.workout_plans?.sort((a,b) => a.day_of_week - b.day_of_week).map((plan) => (
                            <div key={plan.id} className="space-y-2">
                                <h3 className="font-bold text-sm bg-muted p-2 rounded flex justify-between">
                                    <span>Día {plan.day_of_week}: {plan.title}</span>
                                    <span className="text-muted-foreground font-normal">{plan.workout_blocks.length} ejercicios</span>
                                </h3>
                                <div className="grid grid-cols-1 gap-1 pl-2">
                                    {plan.workout_blocks.map((block) => (
                                        <div key={block.id} className="text-sm flex justify-between border-b border-border/50 py-1 last:border-0">
                                            <span className="font-medium">{block.exercise.name}</span>
                                            <span className="text-muted-foreground">{block.sets}x{block.reps}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                        {(!programToPreview?.workout_plans || programToPreview.workout_plans.length === 0) && (
                            <p className="text-center text-muted-foreground">Este programa no tiene ejercicios configurados.</p>
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}

function ProgramCard({ program, viewMode, onAssign, onDuplicate, onDelete, onPreview, isPending }: { 
    program: Program, 
    viewMode: 'grid' | 'list',
    onAssign: () => void,
    onDuplicate: () => void,
    onDelete: () => void,
    onPreview: () => void,
    isPending: boolean
}) {
    if (viewMode === 'list') {
        return (
            <div className="flex items-center justify-between p-4 bg-card border rounded-xl hover:shadow-md transition-shadow">
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Dumbbell className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                        <h3 className="font-bold">{program.name}</h3>
                        <p className="text-xs text-muted-foreground">
                            {program.weeks_to_repeat} semanas • 
                            {program.client ? ` Alumno: ${program.client.full_name}` : ' Plantilla'}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={onPreview} title="Vista previa">
                        <Eye className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={onDuplicate} title="Duplicar">
                        <Copy className="w-4 h-4" />
                    </Button>
                    <Button variant="outline" size="sm" onClick={onAssign} className="gap-2">
                        <User className="w-4 h-4" />
                        Asignar
                    </Button>
                    <Link href={program.client_id ? `/coach/builder/${program.client_id}?programId=${program.id}` : `/coach/workout-programs/builder?programId=${program.id}`}>
                        <Button variant="ghost" size="sm">Editar</Button>
                    </Link>
                    <Button variant="ghost" size="sm" onClick={onDelete} className="text-destructive hover:text-destructive">
                        <Trash2 className="w-4 h-4" />
                    </Button>
                </div>
            </div>
        )
    }

    return (
        <Card className={cn(
            "hover:shadow-md transition-all overflow-hidden group relative border-l-4",
            program.client_id ? "border-l-green-500" : "border-l-primary"
        )}>
            <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                    <div className="flex gap-2">
                        <div className={cn(
                            "w-12 h-12 rounded-xl flex items-center justify-center mb-2",
                            program.client_id ? "bg-green-500/10" : "bg-primary/10"
                        )}>
                            <Dumbbell className={cn("w-6 h-6", program.client_id ? "text-green-600" : "text-primary")} />
                        </div>
                    </div>
                    <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onPreview} title="Vista previa">
                            <Eye className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onDuplicate} title="Duplicar">
                            <Copy className="w-4 h-4" />
                        </Button>
                        <Badge 
                            variant={program.client_id ? "secondary" : "default"} 
                            className={cn(
                                "font-bold",
                                program.client_id && "bg-green-100 text-green-700 hover:bg-green-100"
                            )}
                        >
                            {program.client_id ? 'Asignado' : 'Plantilla'}
                        </Badge>
                    </div>
                </div>
                <CardTitle className="line-clamp-1 text-base">{program.name}</CardTitle>
                <CardDescription className="flex flex-col gap-1 mt-2">
                    <span className="flex items-center gap-2 text-xs">
                        <Repeat className="w-3 h-3" />
                        {program.weeks_to_repeat} semanas
                    </span>
                    <span className="flex items-center gap-2 truncate text-xs font-medium">
                        <User className={cn("w-3.5 h-3.5", program.client_id ? "text-green-600" : "text-muted-foreground")} />
                        {program.client?.full_name || 'Sin asignar'}
                    </span>
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="flex gap-2">
                    <Button onClick={onAssign} className={cn("flex-1 gap-2", program.client_id && "bg-green-600 hover:bg-green-700")} size="sm">
                        <User className="w-4 h-4" />
                        {program.client_id ? 'Re-asignar' : 'Asignar'}
                    </Button>
                    <Link href={program.client_id ? `/coach/builder/${program.client_id}?programId=${program.id}` : `/coach/workout-programs/builder?programId=${program.id}`} className="flex-1">
                        <Button variant="secondary" className="w-full" size="sm">Editar</Button>
                    </Link>
                    <Button variant="ghost" size="icon" onClick={onDelete} className="text-muted-foreground hover:text-destructive h-9 w-9 shrink-0">
                        <Trash2 className="w-4 h-4" />
                    </Button>
                </div>
            </CardContent>
        </Card>
    )
}
