'use client'

import { useState, useRef, useEffect } from 'react'
import { Plus, Trash2, CalendarHeart, Search, Users, Utensils, Info, Pencil, Check, Copy, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { deleteNutritionTemplate, assignTemplateToClients, duplicateNutritionTemplate } from './actions'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { Label } from '@/components/ui/label'

interface Template {
    id: string
    name: string
    description: string | null
    daily_calories: number | null
    protein_g: number | null
    carbs_g: number | null
    fats_g: number | null
    template_meals: {
        id: string
        name: string
    }[]
    assigned_clients?: {
        id: string
        full_name: string
    }[]
}

interface Props {
    templates: Template[]
    coachId: string
    availableClients?: { id: string, full_name: string, active_plan?: any }[]
    onCreateClick: () => void
    onEditClick: (template: Template) => void
}

export function NutritionTemplateList({ templates, coachId, availableClients = [], onCreateClick, onEditClick }: Props) {
    const [searchTerm, setSearchTerm] = useState('')
    const [isDeleting, setIsDeleting] = useState<string | null>(null)
    const [isDuplicating, setIsDuplicating] = useState<string | null>(null)
    
    // Asignación Modal State
    const [assigningTemplate, setAssigningTemplate] = useState<Template | null>(null)
    const [selectedClients, setSelectedClients] = useState<string[]>([])
    const [isAssigning, setIsAssigning] = useState(false)
    const [clientSearchTerm, setClientSearchTerm] = useState('')

    const containerRef = useRef<HTMLDivElement>(null)
    const [themeColor, setThemeColor] = useState<string>('')

    useEffect(() => {
        if (containerRef.current) {
            const color = getComputedStyle(containerRef.current).getPropertyValue('--theme-primary')
            if (color) setThemeColor(color.trim())
        }
    }, [])

    const filteredTemplates = templates.filter(t => 
        t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (t.description?.toLowerCase().includes(searchTerm.toLowerCase()))
    )

    const filteredClients = availableClients.filter(c => 
        c.full_name.toLowerCase().includes(clientSearchTerm.toLowerCase())
    )

    const handleDelete = async (id: string) => {
        if (!confirm('¿Estás seguro de eliminar este plan global? No afectará a los planes ya asignados a alumnos.')) return
        
        setIsDeleting(id)
        try {
            const result = await deleteNutritionTemplate(id, coachId)
            if (result.error) {
                toast.error(result.error)
            } else {
                toast.success('Plan global eliminado correctamente')
            }
        } finally {
            setIsDeleting(null)
        }
    }

    const handleDuplicate = async (id: string) => {
        setIsDuplicating(id)
        try {
            const result = await duplicateNutritionTemplate(id, coachId)
            if (result.error) {
                toast.error(result.error)
            } else {
                toast.success('Plan global duplicado correctamente')
            }
        } finally {
            setIsDuplicating(null)
        }
    }

    const openAssignModal = (template: Template) => {
        setAssigningTemplate(template)
        setSelectedClients([])
        setClientSearchTerm('')
    }

    const toggleClientSelection = (clientId: string) => {
        setSelectedClients(prev => 
            prev.includes(clientId) 
                ? prev.filter(id => id !== clientId)
                : [...prev, clientId]
        )
    }

    const handleAssignTemplate = async () => {
        if (!assigningTemplate || selectedClients.length === 0) return
        setIsAssigning(true)
        try {
            const result = await assignTemplateToClients(assigningTemplate.id, coachId, selectedClients)
            if (result.error) {
                toast.error(result.error)
            } else {
                toast.success(`Plantilla asignada correctamente a ${selectedClients.length} alumno(s)`)
                setAssigningTemplate(null)
            }
        } finally {
            setIsAssigning(false)
        }
    }

    const someClientHasActivePlan = selectedClients.some(clientId => {
        const client = availableClients.find(c => c.id === clientId)
        return client && client.active_plan
    })

    return (
        <div ref={containerRef} className="space-y-6">
            <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
                <div className="relative w-full max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                        placeholder="Buscar planes..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-9 h-11 rounded-xl bg-white dark:bg-card border-slate-200 dark:border-border/60 text-slate-900 dark:text-foreground"
                    />
                </div>
            </div>

            {filteredTemplates.length === 0 ? (
                <div className="text-center py-20 bg-blue-50/30 dark:bg-blue-950/20 border border-dashed border-blue-200 dark:border-blue-900/50 rounded-2xl">
                    <div className="bg-muted w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                        <CalendarHeart className="w-8 h-8 text-muted-foreground" />
                    </div>
                    <h3 className="text-lg font-bold">No hay planes globales</h3>
                    <p className="text-muted-foreground max-w-xs mx-auto mt-1">Crea plantillas de nutrición para asignarlas rápidamente a tus alumnos.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {filteredTemplates.map((template) => (
                        <Card key={template.id} className="overflow-hidden bg-card/50 backdrop-blur-sm transition-all duration-500 group rounded-2xl border-border/50" style={{ '--hover-border': 'var(--theme-primary)' } as any}>
                            <CardContent className="p-5 group-hover:border-[var(--hover-border)] border border-transparent transition-colors rounded-2xl h-full">
                                <div className="flex justify-between items-start mb-4">
                                    <div className="min-w-0">
                                        <h3 className="font-bold text-lg truncate group-hover:text-primary transition-colors">
                                            {template.name}
                                        </h3>
                                        {template.description && (
                                            <p className="text-sm text-muted-foreground line-clamp-1">{template.description}</p>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                        <Button 
                                            variant="ghost" 
                                            size="icon" 
                                            className="h-8 w-8 rounded-lg text-muted-foreground hover:text-primary"
                                            onClick={() => onEditClick(template)}
                                        >
                                            <Pencil className="w-4 h-4" />
                                        </Button>
                                        <Button 
                                            variant="ghost" 
                                            size="icon" 
                                            className="h-8 w-8 rounded-lg text-muted-foreground hover:text-primary"
                                            onClick={() => handleDuplicate(template.id)}
                                            disabled={isDuplicating === template.id}
                                            title="Duplicar Plantilla"
                                        >
                                            <Copy className="w-4 h-4" />
                                        </Button>
                                        <Button 
                                            variant="ghost" 
                                            size="icon" 
                                            className="h-8 w-8 rounded-lg text-muted-foreground hover:text-destructive"
                                            onClick={() => handleDelete(template.id)}
                                            disabled={isDeleting === template.id}
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </div>
                                </div>

                                <div className="grid grid-cols-4 gap-2 mb-4">
                                    <div className="bg-orange-500/10 dark:bg-orange-500/20 border border-orange-500/20 dark:border-orange-500/30 rounded-lg p-1.5 text-center">
                                        <p className="text-[9px] font-bold text-orange-600 dark:text-orange-400 uppercase">Kcal</p>
                                        <p className="text-xs font-bold text-orange-700 dark:text-orange-300">{template.daily_calories || 0}</p>
                                    </div>
                                    <div className="bg-blue-500/10 dark:bg-blue-500/20 border border-blue-500/20 dark:border-blue-500/30 rounded-lg p-1.5 text-center">
                                        <p className="text-[9px] font-bold text-blue-600 dark:text-blue-400 uppercase">P</p>
                                        <p className="text-xs font-bold text-blue-700 dark:text-blue-300">{template.protein_g || 0}g</p>
                                    </div>
                                    <div className="bg-emerald-500/10 dark:bg-emerald-500/20 border border-emerald-500/20 dark:border-emerald-500/30 rounded-lg p-1.5 text-center">
                                        <p className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 uppercase">C</p>
                                        <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300">{template.carbs_g || 0}g</p>
                                    </div>
                                    <div className="bg-purple-500/10 dark:bg-purple-500/20 border border-purple-500/20 dark:border-purple-500/30 rounded-lg p-1.5 text-center">
                                        <p className="text-[9px] font-bold text-purple-600 dark:text-purple-400 uppercase">G</p>
                                        <p className="text-xs font-bold text-purple-700 dark:text-purple-300">{template.fats_g || 0}g</p>
                                    </div>
                                </div>

                                <div className="flex flex-wrap items-center justify-between gap-4 text-xs text-muted-foreground mt-4 pt-4 border-t border-border/50">
                                    <div className="flex flex-col gap-2">
                                        <div className="flex items-center gap-1">
                                            <Utensils className="w-3 h-3" />
                                            <span>{template.template_meals?.length || 0} Comidas</span>
                                        </div>
                                        {template.assigned_clients && template.assigned_clients.length > 0 && (
                                            <div className="flex items-center gap-1 bg-primary/10 text-primary px-2 py-0.5 rounded-full w-fit">
                                                <Users className="w-3 h-3" />
                                                <span className="font-medium text-[10px] uppercase tracking-widest">
                                                    {template.assigned_clients.length} Activos
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                    <Button 
                                        variant="default" 
                                        size="sm"
                                        className="h-8 text-[10px] font-black uppercase tracking-widest text-white transition-all shadow-[0_0_15px_-3px_var(--theme-primary)] hover:scale-105"
                                        style={{ backgroundColor: 'var(--theme-primary)' }}
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            openAssignModal(template)
                                        }}
                                    >
                                        Asignar a Alumno
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            {/* Modal de Asignación */}
            <Dialog open={!!assigningTemplate} onOpenChange={(open) => !open && setAssigningTemplate(null)}>
                <DialogContent 
                    className="sm:max-w-md bg-white dark:bg-zinc-950 border-slate-200 dark:border-white/10 p-6"
                    style={{ '--theme-primary': themeColor || 'inherit' } as React.CSSProperties}
                >
                    <DialogHeader className="mb-2">
                        <DialogTitle className="text-xl font-black uppercase tracking-tight flex items-center gap-2">
                            <Users className="w-5 h-5" style={{ color: 'var(--theme-primary)' }} />
                            Asignar Protocolo
                        </DialogTitle>
                    </DialogHeader>

                    <div className="space-y-5">
                        <div className="p-4 rounded-xl border bg-primary/5 border-primary/10" style={{ backgroundColor: 'color-mix(in srgb, var(--theme-primary) 5%, transparent)', borderColor: 'color-mix(in srgb, var(--theme-primary) 10%, transparent)' }}>
                            <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--theme-primary)' }}>Plantilla Seleccionada:</p>
                            <p className="text-base font-black text-slate-900 dark:text-white">{assigningTemplate?.name}</p>
                        </div>

                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                    Seleccionar Alumnos ({selectedClients.length})
                                </Label>
                                {availableClients.length > 0 && (
                                    <button 
                                        type="button"
                                        className="text-[10px] font-bold hover:underline"
                                        onClick={() => {
                                            if (selectedClients.length === availableClients.length) {
                                                setSelectedClients([])
                                            } else {
                                                setSelectedClients(availableClients.map(c => c.id))
                                            }
                                        }}
                                        style={{ color: 'var(--theme-primary)' }}
                                    >
                                        {selectedClients.length === availableClients.length ? 'Deseleccionar todos' : 'Seleccionar todos'}
                                    </button>
                                )}
                            </div>
                            
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                <Input
                                    placeholder="Buscar por nombre..."
                                    value={clientSearchTerm}
                                    onChange={(e) => setClientSearchTerm(e.target.value)}
                                    className="pl-9 h-10 bg-slate-50 dark:bg-black/20 border-slate-200 dark:border-white/10"
                                />
                            </div>

                            <div className="max-h-[300px] overflow-y-auto space-y-1.5 pr-2 custom-scrollbar">
                                {filteredClients.length === 0 ? (
                                    <div className="p-6 text-center text-sm text-muted-foreground border rounded-xl border-dashed">
                                        No hay alumnos disponibles
                                    </div>
                                ) : (
                                    filteredClients.map(client => {
                                        const isSelected = selectedClients.includes(client.id)
                                        return (
                                            <div 
                                                key={client.id} 
                                                onClick={() => toggleClientSelection(client.id)}
                                                className={cn(
                                                    "flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all",
                                                    isSelected 
                                                        ? "border-transparent" 
                                                        : "bg-white dark:bg-zinc-900 border-slate-100 dark:border-white/5 hover:border-slate-300 dark:hover:border-slate-700"
                                                )}
                                                style={isSelected ? { backgroundColor: 'color-mix(in srgb, var(--theme-primary) 5%, transparent)', borderColor: 'color-mix(in srgb, var(--theme-primary) 20%, transparent)' } : {}}
                                            >
                                                <div 
                                                    className={cn(
                                                        "w-5 h-5 rounded-md border flex items-center justify-center transition-colors shrink-0",
                                                        isSelected 
                                                            ? "border-transparent" 
                                                            : "border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-zinc-800"
                                                    )}
                                                    style={isSelected ? { backgroundColor: 'var(--theme-primary)', borderColor: 'var(--theme-primary)' } : {}}
                                                >
                                                    {isSelected && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <p className="font-bold text-sm truncate text-slate-900 dark:text-white">{client.full_name}</p>
                                                    {client.active_plan && (
                                                        <p className="text-[10px] text-amber-600 dark:text-amber-500 font-medium">Tiene plan activo</p>
                                                    )}
                                                </div>
                                            </div>
                                        )
                                    })
                                )}
                            </div>
                            
                            {someClientHasActivePlan && (
                                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex gap-3 text-amber-700 dark:text-amber-500 animate-in fade-in">
                                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                                    <p className="text-xs font-medium">
                                        Algunos alumnos seleccionados ya tienen un plan activo. Será <span className="font-bold">reemplazado</span> por esta plantilla.
                                    </p>
                                </div>
                            )}
                        </div>

                        <Button 
                            className="w-full h-12 font-black uppercase tracking-widest gap-2 text-white border-none transition-all hover:opacity-90 shadow-lg"
                            disabled={isAssigning || selectedClients.length === 0}
                            onClick={handleAssignTemplate}
                            style={{ backgroundColor: 'var(--theme-primary)' }}
                        >
                            {isAssigning ? 'Procesando...' : `Confirmar Asignación ${selectedClients.length > 0 ? `(${selectedClients.length})` : ''}`}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}
