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
    const [view, setView] = useState<'management' | 'create-plan'>('management')

    if (view === 'create-plan') {
        return (
            <div className="space-y-6">
                <div className="flex items-center gap-4">
                    <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => setView('management')}
                        className="rounded-full"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </Button>
                    <h1 className="text-2xl font-bold">Crear Plan Global</h1>
                </div>
                <NutritionPlanBuilder 
                    coachId={coachId} 
                    availableGroups={initialGroups} 
                    availableClients={availableClients}
                    onCancel={() => setView('management')}
                />
            </div>
        )
    }

    return (
        <div className="space-y-8 animate-fade-in">
            <div>
                <h1 className="text-3xl font-bold">Plan Nutricional</h1>
                <p className="text-muted-foreground mt-1">
                    Gestiona tus plantillas de planes y grupos de alimentos en un solo lugar.
                </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
                {/* Left Column: Global Plans */}
                <div className="space-y-6 border-r-0 lg:border-r border-border/40 lg:pr-8">
                    <div className="flex items-center gap-2 pb-2 border-b border-border/60">
                        <CalendarHeart className="w-5 h-5 text-primary" />
                        <h2 className="text-xl font-bold">Planes Globales</h2>
                    </div>
                    <NutritionTemplateList 
                        templates={initialTemplates} 
                        coachId={coachId}
                        onCreateClick={() => setView('create-plan')}
                    />
                </div>

                {/* Right Column: Meal Groups */}
                <div className="space-y-6">
                    <div className="flex items-center gap-2 pb-2 border-b border-border/60">
                        <LayoutGrid className="w-5 h-5 text-primary" />
                        <h2 className="text-xl font-bold">Grupos de Alimentos</h2>
                    </div>
                    <MealGroupLibraryClient 
                        initialGroups={initialGroups} 
                        coachId={coachId} 
                    />
                </div>
            </div>
        </div>
    )
}
