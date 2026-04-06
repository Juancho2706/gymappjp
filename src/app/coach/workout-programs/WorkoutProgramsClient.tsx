'use client'

import { useState, useTransition, useMemo } from 'react'
import { 
    Plus, Search, Dumbbell, User, MoreVertical, Copy, Trash2, LayoutGrid, List as ListIcon, 
    Loader2, ArrowRight, Eye, Filter, Check, Folder, ChevronRight, ChevronDown, Repeat, ChevronsUpDown,
    Calendar, Users, Clock, Settings2, Pencil, ExternalLink
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
                // Forzar recarga de datos en el cliente para actualización "en vivo"
                window.location.reload()
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
                    <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">Biblioteca de Programas</h1>
                    <p className="text-muted-foreground mt-1">Crea, gestiona y asigna planes de entrenamiento de alto nivel.</p>
                </div>
                <div className="flex items-center gap-3">
                    <Button onClick={() => router.push('/coach/workout-programs/builder')} className="gap-2 h-11 px-6 rounded-xl shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all active:scale-95">
                        <Plus className="w-5 h-5" />
                        Nueva Plantilla
                    </Button>
                </div>
            </div>

            <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-card/40 backdrop-blur-md p-2 rounded-2xl border border-border/50 shadow-sm">
                <div className="flex flex-1 items-center gap-3 w-full px-2">
                    <div className="relative flex-1 md:max-w-md group">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                        <Input
                            placeholder="Buscar programas o alumnos..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="pl-9 bg-background/50 border-none ring-1 ring-border focus-visible:ring-2 focus-visible:ring-primary h-10 rounded-xl transition-all"
                        />
                    </div>
                    
                    <Tabs value={filterType} onValueChange={(val: any) => setFilterType(val)} className="hidden lg:block">
                        <TabsList className="bg-background/50 border-none p-1 h-10 rounded-xl ring-1 ring-border">
                            <TabsTrigger value="all" className="rounded-lg px-4 data-[state=active]:bg-card data-[state=active]:shadow-sm">Todos</TabsTrigger>
                            <TabsTrigger value="templates" className="rounded-lg px-4 data-[state=active]:bg-card data-[state=active]:shadow-sm">Plantillas</TabsTrigger>
                            <TabsTrigger value="assigned" className="rounded-lg px-4 data-[state=active]:bg-card data-[state=active]:shadow-sm">Asignados</TabsTrigger>
                        </TabsList>
                    </Tabs>
                </div>

                <div className="flex items-center gap-2 px-2">
                    <div className="flex items-center gap-1 border rounded-xl p-1 bg-background/50 ring-1 ring-border h-10">
                        <Button 
                            variant={viewMode === 'grid' ? 'secondary' : 'ghost'} 
                            size="sm" 
                            onClick={() => setViewMode('grid')}
                            className={cn("h-8 w-8 p-0 rounded-lg transition-all", viewMode === 'grid' && "shadow-sm bg-card")}
                        >
                            <LayoutGrid className="w-4 h-4" />
                        </Button>
                        <Button 
                            variant={viewMode === 'list' ? 'secondary' : 'ghost'} 
                            size="sm" 
                            onClick={() => setViewMode('list')}
                            className={cn("h-8 w-8 p-0 rounded-lg transition-all", viewMode === 'list' && "shadow-sm bg-card")}
                        >
                            <ListIcon className="w-4 h-4" />
                        </Button>
                    </div>
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
                                    className="flex items-center gap-4 w-full p-2 pr-6 bg-card/50 backdrop-blur-sm hover:bg-card/80 rounded-2xl border border-border/50 transition-all group ring-1 ring-border/5 shadow-sm"
                                >
                                    <div className={cn(
                                        "w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-300",
                                        isTemplatesOpen ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20 scale-105" : "bg-primary/10 text-primary"
                                    )}>
                                        <Folder className={cn("w-6 h-6 transition-transform", isTemplatesOpen ? "fill-current/20 scale-110" : "group-hover:scale-110")} />
                                    </div>
                                    <div className="flex-1 text-left">
                                        <h3 className="font-bold text-base tracking-tight">Biblioteca de Plantillas</h3>
                                        <div className="flex items-center gap-2 mt-0.5">
                                            <Badge variant="secondary" className="text-[10px] h-4 px-1.5 bg-primary/5 text-primary border-none">
                                                {filtered.filter(p => !p.client_id).length} items
                                            </Badge>
                                            <span className="text-[11px] text-muted-foreground font-medium">Modelos base para nuevos alumnos</span>
                                        </div>
                                    </div>
                                    <div className="w-8 h-8 rounded-full flex items-center justify-center bg-secondary/50 group-hover:bg-secondary transition-colors">
                                        {isTemplatesOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                                    </div>
                                </button>

                                <AnimatePresence initial={false}>
                                    {isTemplatesOpen && (
                                        <motion.div
                                            initial={{ height: 0, opacity: 0, y: -10 }}
                                            animate={{ height: "auto", opacity: 1, y: 0 }}
                                            exit={{ height: 0, opacity: 0, y: -10 }}
                                            transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
                                            className="overflow-hidden"
                                        >
                                            <div className={cn(
                                                "p-1",
                                                viewMode === 'grid' 
                                                    ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 pt-2" 
                                                    : "space-y-3 pt-2"
                                            )}>
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
                                                    <div className="col-span-full py-10 text-center bg-muted/10 rounded-2xl border border-dashed border-border/50">
                                                        <p className="text-sm text-muted-foreground italic">No hay plantillas que coincidan con la búsqueda.</p>
                                                    </div>
                                                )}
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        )}

                        {/* Active Plans Section */}
                        {(filterType === 'all' || filterType === 'assigned') && (
                            <div className="space-y-6 pt-4">
                                <div className="flex items-center justify-between px-2">
                                    <div className="flex items-center gap-3">
                                        <div className="relative">
                                            <div className="w-3 h-3 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                                            <div className="absolute inset-0 w-3 h-3 rounded-full bg-emerald-500 animate-ping opacity-40" />
                                        </div>
                                        <h3 className="font-bold text-lg tracking-tight">Programas en Curso</h3>
                                        <Badge className="bg-emerald-500 hover:bg-emerald-600 text-white border-none px-2 rounded-lg">
                                            {activeAssignedPrograms.length}
                                        </Badge>
                                    </div>
                                    <p className="text-xs text-muted-foreground font-medium hidden sm:block">Planes actualmente seguidos por alumnos</p>
                                </div>
                                
                                <div className={cn(
                                    "p-1",
                                    viewMode === 'grid' 
                                        ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5" 
                                        : "space-y-3"
                                )}>
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
                                        <div className="col-span-full py-16 text-center bg-card/30 rounded-3xl border-2 border-dashed border-border/40 backdrop-blur-sm">
                                            <div className="w-16 h-16 rounded-full bg-muted/20 flex items-center justify-center mx-auto mb-4">
                                                <Users className="w-8 h-8 text-muted-foreground/50" />
                                            </div>
                                            <h4 className="font-semibold text-muted-foreground">Sin planes activos</h4>
                                            <p className="text-sm text-muted-foreground/60 max-w-xs mx-auto mt-1">Asigna una plantilla a un alumno para verla aparecer en esta sección.</p>
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
                <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto p-0 border-none bg-background shadow-2xl">
                    <DialogHeader className="p-6 pb-2 sticky top-0 bg-background/80 backdrop-blur-lg z-10 border-b">
                        <DialogTitle className="flex items-center gap-3 text-xl font-bold">
                            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                                <Eye className="w-5 h-5 text-primary" />
                            </div>
                            <div className="flex flex-col">
                                <span className="text-foreground">Vista Previa</span>
                                <span className="text-sm font-medium text-muted-foreground">{programToPreview?.name}</span>
                            </div>
                        </DialogTitle>
                    </DialogHeader>
                    <div className="p-6 space-y-6">
                        {programToPreview?.workout_plans?.sort((a,b) => a.day_of_week - b.day_of_week).map((plan) => (
                            <div key={plan.id} className="group/day bg-card border rounded-2xl overflow-hidden shadow-sm transition-all hover:shadow-md">
                                <div className="bg-muted/50 p-4 flex justify-between items-center border-b">
                                    <h3 className="font-bold text-base flex items-center gap-2 text-foreground">
                                        <div className="w-7 h-7 rounded-lg bg-primary text-primary-foreground flex items-center justify-center text-xs">
                                            {plan.day_of_week}
                                        </div>
                                        Día {plan.day_of_week}: {plan.title}
                                    </h3>
                                    <Badge variant="secondary" className="bg-background/80 text-muted-foreground font-semibold px-2">
                                        {plan.workout_blocks.length} ejercicios
                                    </Badge>
                                </div>
                                <div className="divide-y divide-border/40">
                                    {plan.workout_blocks.map((block) => (
                                        <div key={block.id} className="p-4 flex justify-between items-center hover:bg-muted/20 transition-colors">
                                            <div className="flex flex-col gap-0.5">
                                                <span className="font-semibold text-foreground leading-tight">{block.exercise.name}</span>
                                                <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
                                                    <Repeat className="w-3 h-3" />
                                                    Enfoque técnico
                                                </div>
                                            </div>
                                            <div className="flex flex-col items-end gap-1">
                                                <span className="text-sm font-bold text-primary bg-primary/5 px-3 py-1 rounded-full border border-primary/10">
                                                    {block.sets} <span className="text-[10px] text-primary/60 font-medium uppercase tracking-wider">sets</span> x {block.reps}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                        {(!programToPreview?.workout_plans || programToPreview.workout_plans.length === 0) && (
                            <div className="py-20 text-center space-y-3">
                                <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto text-muted-foreground">
                                    <Dumbbell className="w-8 h-8 opacity-20" />
                                </div>
                                <p className="text-muted-foreground font-medium italic">Este programa no tiene ejercicios configurados aún.</p>
                            </div>
                        )}
                    </div>
                    <div className="p-4 bg-muted/30 border-t flex justify-end">
                        <Button variant="outline" onClick={() => setIsPreviewOpen(false)} className="rounded-xl font-semibold">
                            Cerrar Vista Previa
                        </Button>
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
    const isAssigned = !!program.client_id;

    if (viewMode === 'list') {
        return (
            <div className="flex items-center justify-between p-4 bg-card/50 backdrop-blur-sm border rounded-xl hover:shadow-lg hover:border-primary/30 transition-all group">
                <div className="flex items-center gap-4">
                    <div className={cn(
                        "w-12 h-12 rounded-xl flex items-center justify-center transition-colors",
                        isAssigned ? "bg-emerald-500/10 text-emerald-600" : "bg-primary/10 text-primary"
                    )}>
                        <Dumbbell className="w-6 h-6" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-base tracking-tight">{program.name}</h3>
                            {isAssigned ? (
                                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] py-0 h-4">Activo</Badge>
                            ) : (
                                <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 text-[10px] py-0 h-4">Plantilla</Badge>
                            )}
                        </div>
                        <div className="flex items-center gap-3 mt-1">
                            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <Clock className="w-3 h-3" />
                                {program.weeks_to_repeat} semanas
                            </span>
                            <span className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
                                <User className={cn("w-3 h-3", isAssigned ? "text-emerald-600" : "text-muted-foreground")} />
                                {program.client?.full_name || 'Sin alumno'}
                            </span>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-1.5">
                    <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity" onClick={onPreview} title="Vista previa">
                        <Eye className="w-4 h-4 text-muted-foreground" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity" onClick={onDuplicate} title="Duplicar">
                        <Copy className="w-4 h-4 text-muted-foreground" />
                    </Button>
                    <div className="w-px h-4 bg-border mx-1 opacity-0 group-hover:opacity-100 transition-opacity" />
                    
                    {!isAssigned && (
                        <Button variant="ghost" size="sm" onClick={onAssign} className="gap-2 h-9 px-3 text-primary hover:text-primary hover:bg-primary/10 rounded-lg">
                            <Users className="w-4 h-4" />
                            <span className="hidden sm:inline">Asignar</span>
                        </Button>
                    )}
                    
                    <Link href={isAssigned ? `/coach/builder/${program.client_id}?programId=${program.id}` : `/coach/workout-programs/builder?programId=${program.id}`}>
                        <Button variant="ghost" size="sm" className="h-9 px-3 gap-2 rounded-lg">
                            <Pencil className="w-4 h-4" />
                            <span className="hidden sm:inline">Editar</span>
                        </Button>
                    </Link>
                    
                    <Button variant="ghost" size="icon" onClick={onDelete} className="h-9 w-9 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10">
                        <Trash2 className="w-4 h-4" />
                    </Button>
                </div>
            </div>
        )
    }

    return (
        <Card className={cn(
            "group relative overflow-hidden transition-all duration-300 border-none ring-1",
            "shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_20px_50px_rgba(59,130,246,0.12)] dark:hover:shadow-[0_20px_50px_rgba(139,92,246,0.15)]",
            isAssigned 
                ? "ring-emerald-500/20 bg-gradient-to-br from-card via-card to-emerald-50/40 dark:to-emerald-500/5" 
                : "ring-border bg-gradient-to-br from-card via-card to-primary/5 hover:ring-primary/30"
        )}>
            {/* Sombras y difuminados de marca sutiles */}
            <div className="absolute -right-10 -top-10 w-32 h-32 bg-primary/5 blur-3xl rounded-full group-hover:bg-primary/10 transition-colors" />
            <div className="absolute -left-10 -bottom-10 w-32 h-32 bg-blue-500/5 blur-3xl rounded-full group-hover:bg-blue-500/10 transition-colors" />
            
            {/* Glassmorphism subtle overlay */}
            <div className="absolute inset-0 bg-white/40 dark:bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
            
            <CardHeader className="pb-4 relative">
                <div className="flex justify-between items-start mb-4">
                    <div className={cn(
                        "w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-300 group-hover:scale-110 group-hover:rotate-3 shadow-sm",
                        isAssigned ? "bg-emerald-500 text-white" : "bg-primary text-primary-foreground"
                    )}>
                        <Dumbbell className="w-6 h-6" />
                    </div>
                    <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-background/80" onClick={onPreview} title="Vista previa">
                            <Eye className="w-4 h-4 text-muted-foreground" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-background/80" onClick={onDuplicate} title="Duplicar">
                            <Copy className="w-4 h-4 text-muted-foreground" />
                        </Button>
                    </div>
                </div>
                
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <CardTitle className="text-lg font-bold tracking-tight line-clamp-1">{program.name}</CardTitle>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1.5 pt-1">
                        <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground bg-secondary/50 px-2 py-0.5 rounded-full">
                            <Calendar className="w-3 h-3" />
                            {program.weeks_to_repeat} semanas
                        </span>
                        {isAssigned ? (
                            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-full">
                                <User className="w-3 h-3" />
                                {program.client?.full_name}
                            </span>
                        ) : (
                            <span className="flex items-center gap-1.5 text-[11px] font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                                <Settings2 className="w-3 h-3" />
                                Plantilla
                            </span>
                        )}
                    </div>
                </div>
            </CardHeader>

            <CardContent className="pt-2 relative">
                <div className="flex gap-2">
                    {!isAssigned ? (
                        <Button 
                            onClick={onAssign} 
                            className="flex-1 gap-2 bg-primary hover:bg-primary/90 shadow-sm rounded-xl h-10"
                        >
                            <Users className="w-4 h-4" />
                            Asignar
                        </Button>
                    ) : (
                        <div className="flex-1" /> // Placeholder to keep layout if needed or just use the space
                    )}
                    
                    <Link href={isAssigned ? `/coach/builder/${program.client_id}?programId=${program.id}` : `/coach/workout-programs/builder?programId=${program.id}`} className={isAssigned ? "w-full" : "flex-1"}>
                        <Button variant="secondary" className="w-full gap-2 rounded-xl h-10 border-none bg-secondary/80 hover:bg-secondary" size="sm">
                            <Pencil className="w-4 h-4" />
                            Editar
                        </Button>
                    </Link>
                    
                    <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={onDelete} 
                        className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-xl h-10 w-10 shrink-0 transition-colors"
                    >
                        <Trash2 className="w-4 h-4" />
                    </Button>
                </div>
            </CardContent>
        </Card>
    )
}
