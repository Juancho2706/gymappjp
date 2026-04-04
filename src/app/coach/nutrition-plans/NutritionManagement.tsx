'use client'

import { useState } from 'react'
import { LayoutGrid, CalendarHeart, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { NutritionTemplateList } from './NutritionTemplateList'
import { NutritionPlanBuilder } from './NutritionPlanBuilder'
import { MealGroupLibraryClient } from '../meal-groups/MealGroupLibraryClient'

interface Props {
    coachId: string
    initialTemplates: any[]
    initialGroups: any[]
    availableClients: any[]
}

export function NutritionManagement({ 
    coachId, 
    initialTemplates, 
    initialGroups, 
    availableClients 
}: Props) {
    const [view, setView] = useState<'management' | 'create-plan' | 'edit-plan'>('management')
    const [editingTemplate, setEditingTemplate] = useState<any>(null)

    if (view === 'create-plan' || view === 'edit-plan') {
        return (
            <div className="max-w-[1200px] mx-auto animate-fade-in space-y-10">
                <div className="flex items-center gap-6">
                    <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => {
                            setView('management')
                            setEditingTemplate(null)
                        }}
                        className="rounded-xl border border-border/50 bg-background/50 hover:bg-background"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </Button>
                    <div>
                        <h1 className="text-3xl font-black uppercase tracking-tighter font-display leading-none">
                            {view === 'create-plan' ? 'Nueva Plantilla' : `Editar Plantilla`}
                        </h1>
                        <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em] mt-2">Configuración de Protocolo Maestro</p>
                    </div>
                </div>
                
                <NutritionPlanBuilder 
                    coachId={coachId} 
                    availableClients={availableClients}
                    initialData={editingTemplate}
                    onCancel={() => {
                        setView('management')
                        setEditingTemplate(null)
                    }}
                />
            </div>
        )
    }

    return (
        <div className="max-w-[1200px] mx-auto animate-fade-in space-y-10">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div className="space-y-2">
                    <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tighter font-display leading-none">Planes de Nutrición</h1>
                    <p className="text-muted-foreground font-bold text-sm uppercase tracking-widest flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                        Gestión Centralizada de Plantillas y Macros
                    </p>
                </div>
                <Button 
                    onClick={() => setView('create-plan')}
                    className="h-14 px-8 bg-primary text-primary-foreground font-black uppercase tracking-widest text-xs hover:bg-primary/90 shadow-xl"
                >
                    Crear Nueva Plantilla
                </Button>
            </div>

            <div className="grid grid-cols-1 gap-12">
                {/* Global Plans Section */}
                <div className="space-y-6">
                    <div className="flex items-center gap-4 pb-2 border-b-2 border-primary/20">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                            <CalendarHeart className="w-5 h-5 text-primary" />
                        </div>
                        <h2 className="text-xl font-black uppercase tracking-tight font-display">Plantillas de Protocolos</h2>
                    </div>
                    <NutritionTemplateList 
                        templates={initialTemplates} 
                        coachId={coachId}
                        onCreateClick={() => setView('create-plan')}
                        onEditClick={(template) => {
                            setEditingTemplate(template)
                            setView('edit-plan')
                        }}
                    />
                </div>
            </div>
        </div>
    )
}
