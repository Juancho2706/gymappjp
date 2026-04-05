'use client'

import { useState } from 'react'
import { Plus, Trash2, CalendarHeart, Search, Users, Utensils, Info, Pencil, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { deleteNutritionTemplate, assignTemplateToClients } from './actions'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

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
    availableClients?: { id: string, full_name: string }[]
    onCreateClick: () => void
    onEditClick: (template: Template) => void
}

export function NutritionTemplateList({ templates, coachId, availableClients = [], onCreateClick, onEditClick }: Props) {
    const [searchTerm, setSearchTerm] = useState('')
    const [isDeleting, setIsDeleting] = useState<string | null>(null)
    
    // Asignación Modal State
    const [assigningTemplate, setAssigningTemplate] = useState<Template | null>(null)
    const [selectedClients, setSelectedClients] = useState<string[]>([])
    const [clientSearch, setClientSearch] = useState('')
    const [isAssigning, setIsAssigning] = useState(false)

    const filteredTemplates = templates.filter(t => 
        t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (t.description?.toLowerCase().includes(searchTerm.toLowerCase()))
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

    const openAssignModal = (template: Template) => {
        setAssigningTemplate(template)
        setSelectedClients(template.assigned_clients?.map(c => c.id) || [])
        setClientSearch('')
    }

    const handleAssignTemplate = async () => {
        if (!assigningTemplate) return
        setIsAssigning(true)
        try {
            const result = await assignTemplateToClients(assigningTemplate.id, coachId, selectedClients)
            if (result.error) {
                toast.error(result.error)
            } else {
                toast.success(`Plantilla asignada a ${selectedClients.length} alumnos`)
                setAssigningTemplate(null)
            }
        } finally {
            setIsAssigning(false)
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
                <div className="relative w-full max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                        placeholder="Buscar planes..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-9 h-11 rounded-xl bg-card border-border/60"
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
                        <Card key={template.id} className="overflow-hidden border-border/50 bg-card/50 backdrop-blur-sm hover:border-primary/40 hover:shadow-xl transition-all duration-500 group rounded-2xl">
                            <CardContent className="p-5">
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
                                        className="h-8 text-[10px] font-black uppercase tracking-widest bg-primary/10 text-primary hover:bg-primary hover:text-white border border-primary/20"
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
                <DialogContent className="sm:max-w-md bg-white dark:bg-zinc-950 border-slate-200 dark:border-white/10">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-black uppercase tracking-tight flex items-center gap-2">
                            <Users className="w-5 h-5 text-primary" />
                            Asignar Protocolo
                        </DialogTitle>
                    </DialogHeader>

                    <div className="space-y-4 pt-4">
                        <div className="bg-primary/5 p-4 rounded-xl border border-primary/10">
                            <p className="text-xs text-primary/80 font-bold uppercase tracking-widest mb-1">Plantilla Seleccionada:</p>
                            <p className="text-base font-black">{assigningTemplate?.name}</p>
                        </div>

                        <div className="space-y-2">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                <Input
                                    placeholder="Buscar alumno..."
                                    value={clientSearch}
                                    onChange={(e) => setClientSearch(e.target.value)}
                                    className="pl-9 h-10 bg-slate-50 dark:bg-black/20 border-slate-200 dark:border-white/10 text-slate-900 dark:text-foreground"
                                />
                            </div>

                            <div className="max-h-[300px] overflow-y-auto space-y-1 p-1">
                                {availableClients
                                    .filter(c => c.full_name.toLowerCase().includes(clientSearch.toLowerCase()))
                                    .map(client => {
                                        const isSelected = selectedClients.includes(client.id)
                                        return (
                                            <div 
                                                key={client.id}
                                                onClick={() => {
                                                    setSelectedClients(prev => 
                                                        isSelected ? prev.filter(id => id !== client.id) : [...prev, client.id]
                                                    )
                                                }}
                                                className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-white/5 cursor-pointer transition-colors border border-transparent hover:border-slate-200 dark:hover:border-white/10"
                                            >
                                                <div className={cn(
                                                    "w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors",
                                                    isSelected ? "bg-primary border-primary text-white" : "border-slate-300 dark:border-white/20"
                                                )}>
                                                    {isSelected && <Check className="w-3.5 h-3.5" />}
                                                </div>
                                                <span className="text-sm font-bold text-slate-700 dark:text-foreground">{client.full_name}</span>
                                            </div>
                                        )
                                })}
                                {availableClients.length === 0 && (
                                    <div className="text-center py-8 text-sm text-muted-foreground font-bold">
                                        No hay alumnos disponibles para asignar.
                                    </div>
                                )}
                            </div>
                        </div>

                        <Button 
                            className="w-full h-12 font-black uppercase tracking-widest gap-2"
                            disabled={isAssigning || selectedClients.length === 0}
                            onClick={handleAssignTemplate}
                        >
                            {isAssigning ? 'Procesando...' : `Confirmar Asignación (${selectedClients.length})`}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}
