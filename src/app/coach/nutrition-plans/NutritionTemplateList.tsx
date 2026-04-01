'use client'

import { useState } from 'react'
import { Plus, Trash2, CalendarHeart, Search, Users, Utensils, Info, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { deleteNutritionTemplate } from './actions'
import { toast } from 'sonner'

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
    onCreateClick: () => void
    onEditClick: (template: Template) => void
}

export function NutritionTemplateList({ templates, coachId, onCreateClick, onEditClick }: Props) {
    const [searchTerm, setSearchTerm] = useState('')
    const [isDeleting, setIsDeleting] = useState<string | null>(null)

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
                // Note: The page will revalidate due to server action, 
                // but for better UX we might want local state update if needed.
                // In this setup, the parent handles the data.
            }
        } finally {
            setIsDeleting(null)
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
                <div className="relative w-full">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                        placeholder="Buscar planes..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-9 h-11 rounded-xl bg-card border-border/60"
                    />
                </div>
                <Button 
                    onClick={onCreateClick}
                    className="w-full sm:w-auto h-11 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold gap-2 px-6"
                >
                    <Plus className="w-5 h-5" />
                    Nuevo Plan
                </Button>
            </div>

            {filteredTemplates.length === 0 ? (
                <div className="text-center py-20 bg-card border border-dashed border-border rounded-2xl">
                    <div className="bg-muted w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                        <CalendarHeart className="w-8 h-8 text-muted-foreground" />
                    </div>
                    <h3 className="text-lg font-bold">No hay planes globales</h3>
                    <p className="text-muted-foreground max-w-xs mx-auto mt-1">Crea plantillas de nutrición para asignarlas rápidamente a tus alumnos.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-4">
                    {filteredTemplates.map((template) => (
                        <Card key={template.id} className="overflow-hidden border-border/60 hover:border-primary/40 transition-all group">
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
                                    <div className="bg-orange-500/5 border border-orange-500/10 rounded-lg p-1.5 text-center">
                                        <p className="text-[9px] font-bold text-orange-600 uppercase">Kcal</p>
                                        <p className="text-xs font-bold text-orange-700">{template.daily_calories || 0}</p>
                                    </div>
                                    <div className="bg-blue-500/5 border border-blue-500/10 rounded-lg p-1.5 text-center">
                                        <p className="text-[9px] font-bold text-blue-600 uppercase">P</p>
                                        <p className="text-xs font-bold text-blue-700">{template.protein_g || 0}g</p>
                                    </div>
                                    <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-lg p-1.5 text-center">
                                        <p className="text-[9px] font-bold text-emerald-600 uppercase">C</p>
                                        <p className="text-xs font-bold text-emerald-700">{template.carbs_g || 0}g</p>
                                    </div>
                                    <div className="bg-purple-500/5 border border-purple-500/10 rounded-lg p-1.5 text-center">
                                        <p className="text-[9px] font-bold text-purple-600 uppercase">G</p>
                                        <p className="text-xs font-bold text-purple-700">{template.fats_g || 0}g</p>
                                    </div>
                                </div>

                                <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                                    <div className="flex items-center gap-1">
                                        <Utensils className="w-3 h-3" />
                                        <span>{template.template_meals?.length || 0} Comidas</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <Info className="w-3 h-3" />
                                        <span className="truncate max-w-[150px]">
                                            {template.template_meals?.map(m => m.name).join(', ')}
                                        </span>
                                    </div>
                                    {template.assigned_clients && template.assigned_clients.length > 0 && (
                                        <div className="flex items-center gap-1 bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                                            <Users className="w-3 h-3" />
                                            <span className="font-medium">
                                                {template.assigned_clients.length} {template.assigned_clients.length === 1 ? 'Alumno' : 'Alumnos'}
                                            </span>
                                            <span className="text-[10px] ml-1 opacity-80 hidden sm:inline">
                                                ({template.assigned_clients.slice(0, 2).map(c => c.full_name.split(' ')[0]).join(', ')}
                                                {template.assigned_clients.length > 2 ? '...' : ''})
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    )
}
