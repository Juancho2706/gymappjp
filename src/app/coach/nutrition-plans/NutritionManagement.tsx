'use client'

import { useState } from 'react'
import { LayoutGrid, CalendarHeart, ArrowLeft, Users, Apple, Search, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { NutritionTemplateList } from './NutritionTemplateList'
import { NutritionPlanBuilder } from './NutritionPlanBuilder'
import { NutritionActivePlans } from './NutritionActivePlans'
import { NutritionFoodCatalog } from './NutritionFoodCatalog'

interface Props {
    coachId: string
    initialTemplates: any[]
    initialGroups: any[]
    availableClients: any[]
    initialFoods: any[]
}

export function NutritionManagement({ 
    coachId, 
    initialTemplates, 
    initialGroups, 
    availableClients,
    initialFoods
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
        <div className="max-w-[1400px] mx-auto animate-fade-in space-y-8">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div className="space-y-2">
                    <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tighter font-display leading-none">Nutrición</h1>
                    <p className="text-muted-foreground font-bold text-sm uppercase tracking-widest flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse shrink-0" />
                        Centro de Mando de Protocolos y Alimentos
                    </p>
                </div>
                <Button 
                    onClick={() => setView('create-plan')}
                    className="h-14 px-8 bg-primary text-primary-foreground font-black uppercase tracking-widest text-xs hover:bg-primary/90 shadow-xl rounded-2xl group"
                >
                    <Plus className="w-4 h-4 mr-2 group-hover:rotate-90 transition-transform duration-300" />
                    Nueva Plantilla
                </Button>
            </div>

            <Tabs defaultValue="templates" className="flex flex-col gap-8">
                <div className="sticky top-0 z-20 bg-background/80 backdrop-blur-md pb-4 pt-2 -mx-4 px-4 md:mx-0 md:px-0 flex justify-center">
                    <TabsList className="bg-muted/50 p-1.5 h-auto flex gap-1 w-full max-w-2xl rounded-2xl border border-border/50 shadow-sm">
                        <TabsTrigger 
                            value="templates" 
                            className="flex-1 h-12 rounded-xl data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-lg transition-all duration-300 font-bold uppercase tracking-widest text-[10px] gap-2"
                        >
                            <LayoutGrid className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Plantillas</span>
                            <span className="sm:hidden text-[8px]">Planes</span>
                        </TabsTrigger>
                        <TabsTrigger 
                            value="active" 
                            className="flex-1 h-12 rounded-xl data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-lg transition-all duration-300 font-bold uppercase tracking-widest text-[10px] gap-2"
                        >
                            <Users className="w-3.5 h-3.5" />
                            Alumnos
                        </TabsTrigger>
                        <TabsTrigger 
                            value="catalog" 
                            className="flex-1 h-12 rounded-xl data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-lg transition-all duration-300 font-bold uppercase tracking-widest text-[10px] gap-2"
                        >
                            <Apple className="w-3.5 h-3.5" />
                            Alimentos
                        </TabsTrigger>
                    </TabsList>
                </div>

                <div className="w-full">
                    <TabsContent value="templates" className="mt-0 animate-in fade-in-50 slide-in-from-bottom-4 duration-500 focus-visible:outline-none">
                        <div className="space-y-6">
                            <div className="flex items-center gap-4 pb-2 border-b-2 border-primary/20">
                                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                                    <CalendarHeart className="w-5 h-5 text-primary" />
                                </div>
                                <h2 className="text-xl font-black uppercase tracking-tight font-display">Protocolos Maestros</h2>
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
                    </TabsContent>

                    <TabsContent value="active" className="mt-0 animate-in fade-in-50 slide-in-from-bottom-4 duration-500 focus-visible:outline-none">
                        <div className="space-y-6">
                            <div className="flex items-center gap-4 pb-2 border-b-2 border-primary/20">
                                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                                    <Users className="w-5 h-5 text-primary" />
                                </div>
                                <h2 className="text-xl font-black uppercase tracking-tight font-display">Seguimiento de Alumnos</h2>
                            </div>
                            <NutritionActivePlans clients={availableClients} />
                        </div>
                    </TabsContent>

                    <TabsContent value="catalog" className="mt-0 animate-in fade-in-50 slide-in-from-bottom-4 duration-500 focus-visible:outline-none">
                        <div className="space-y-6">
                            <div className="flex items-center gap-4 pb-2 border-b-2 border-primary/20">
                                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                                    <Apple className="w-5 h-5 text-primary" />
                                </div>
                                <h2 className="text-xl font-black uppercase tracking-tight font-display">Biblioteca Nutricional</h2>
                            </div>
                            <NutritionFoodCatalog foods={initialFoods} />
                        </div>
                    </TabsContent>
                </div>
            </Tabs>
        </div>
    )
}
