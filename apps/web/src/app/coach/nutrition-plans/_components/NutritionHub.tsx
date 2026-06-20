'use client'

import type { CSSProperties, ReactNode } from 'react'
import { useState } from 'react'
import Link from 'next/link'
import { LayoutTemplate, Users, Apple, Plus, ChefHat } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AppOnlyBadge } from '@/components/AppOnlyBadge'
import { TemplateLibrary, type TemplateLibraryItem } from './TemplateLibrary'
import { ActivePlansBoard } from './ActivePlansBoard'
import type { ActivePlanBoardRow } from '../_data/nutrition-coach.queries'
import { FoodLibrary } from './FoodLibrary'
import type { AssignModalClient } from './AssignModal'
import { NutritionOnboarding } from './NutritionOnboarding'
import { CoachNutritionGuideDialog } from './CoachNutritionGuideDialog'
import { RecipeLibrary } from './recipes/RecipeLibrary'
import type { RecipeRow } from '@/services/nutrition-recipes.service'
import { InfoTooltip } from '@/components/ui/info-tooltip'
import { TierBadge } from '@/components/nutrition/TierBadge'

type FoodLib = {
  foods: {
    id: string
    name: string
    serving_size: number
    serving_unit: string | null
    calories: number
    protein_g: number
    carbs_g: number
    fats_g: number
    coach_id: string | null
    category: string | null
  }[]
  total: number
}

type Props = {
  templates: TemplateLibraryItem[]
  activePlans: ActivePlanBoardRow[]
  assignClients: AssignModalClient[]
  clientsWithoutPlan: { id: string; full_name: string }[]
  foods: FoodLib
  recipes: RecipeRow[]
  coachId: string
}

export function NutritionHub({
  templates,
  activePlans,
  assignClients,
  clientsWithoutPlan,
  foods,
  recipes,
  coachId,
}: Props) {
  const [hubTab, setHubTab] = useState('clients')
  const hasClients = assignClients.length > 0

  return (
    <div className="w-full max-w-[2000px] mx-auto animate-fade-in space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tighter font-display leading-none">Nutrición</h1>
            <AppOnlyBadge>Gestiónalo desde el celular en la app de EVA</AppOnlyBadge>
            <CoachNutritionGuideDialog
              hasClients={hasClients}
              onAssign={() => setHubTab('clients')}
            />
          </div>
          <p className="text-muted-foreground font-bold text-sm uppercase tracking-widest flex items-center gap-2">
            <span
              className="w-1.5 h-1.5 rounded-full animate-pulse shrink-0"
              style={{ backgroundColor: 'var(--theme-primary)' }}
            />
            Centro de protocolos y alimentos
          </p>
        </div>
        <Link
          href="/coach/nutrition-plans/new"
          className="inline-flex items-center justify-center h-14 px-8 text-white font-black uppercase tracking-widest text-xs hover:opacity-90 shadow-xl rounded-2xl border-none transition-opacity group"
          style={{ backgroundColor: 'var(--theme-primary)' }}
        >
          <Plus className="w-4 h-4 mr-2 group-hover:rotate-90 transition-transform duration-300" />
          Nueva plantilla
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
        <div className="bg-card border border-border rounded-2xl px-4 py-3 text-center">
          <p className="text-2xl font-black text-foreground">{templates.length}</p>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Plantillas</p>
        </div>
        <div className="bg-card border border-border rounded-2xl px-4 py-3 text-center">
          <p className="text-2xl font-black text-foreground">{activePlans.length}</p>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Con plan</p>
        </div>
        <div className="bg-card border border-border rounded-2xl px-4 py-3 text-center">
          <p className="text-2xl font-black text-foreground">{foods.total}</p>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Alimentos</p>
        </div>
      </div>

      <Tabs value={hubTab} onValueChange={setHubTab} className="w-full flex flex-col gap-8">
        <div className="sticky top-0 z-20 bg-background/80 backdrop-blur-md pb-4 pt-2 -mx-4 px-4 md:mx-0 md:px-0 flex justify-center">
          <TabsList
            className="bg-muted/50 p-1.5 h-auto flex gap-1 w-full max-w-2xl rounded-2xl border border-border/50 shadow-sm"
            style={{ '--theme-primary': 'var(--theme-primary)' } as CSSProperties}
          >
            <TabsTrigger
              value="templates"
              className="flex-1 h-12 rounded-xl data-active:bg-background data-active:text-[var(--theme-primary)] data-active:shadow-lg data-active:font-black data-active:ring-1 data-active:ring-[var(--theme-primary)]/30 transition-all duration-300 font-bold uppercase tracking-widest text-[10px] gap-2"
            >
              <LayoutTemplate className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Plantillas</span>
              <span className="sm:hidden text-[8px]">Planes</span>
            </TabsTrigger>
            <TabsTrigger
              value="clients"
              className="flex-1 h-12 rounded-xl data-active:bg-background data-active:text-[var(--theme-primary)] data-active:shadow-lg data-active:font-black data-active:ring-1 data-active:ring-[var(--theme-primary)]/30 transition-all duration-300 font-bold uppercase tracking-widest text-[10px] gap-2"
            >
              <Users className="w-3.5 h-3.5" />
              Alumnos
            </TabsTrigger>
            <TabsTrigger
              value="foods"
              className="flex-1 h-12 rounded-xl data-active:bg-background data-active:text-[var(--theme-primary)] data-active:shadow-lg data-active:font-black data-active:ring-1 data-active:ring-[var(--theme-primary)]/30 transition-all duration-300 font-bold uppercase tracking-widest text-[10px] gap-2"
            >
              <Apple className="w-3.5 h-3.5" />
              Alimentos
            </TabsTrigger>
            <TabsTrigger
              value="recipes"
              className="flex-1 h-12 rounded-xl data-active:bg-background data-active:text-[var(--theme-primary)] data-active:shadow-lg data-active:font-black data-active:ring-1 data-active:ring-[var(--theme-primary)]/30 transition-all duration-300 font-bold uppercase tracking-widest text-[10px] gap-2"
            >
              <ChefHat className="w-3.5 h-3.5" />
              Recetas
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="templates" className="mt-0 focus-visible:outline-none">
          <div className="space-y-6">
            <SectionHeading icon={<LayoutTemplate className="w-5 h-5" style={{ color: 'var(--theme-primary)' }} />} title="Protocolos maestros" />
            {templates.length === 0 && (
              <NutritionOnboarding
                coachId={coachId}
                hasClients={hasClients}
                onAssign={() => setHubTab('clients')}
              />
            )}
            <TemplateLibrary templates={templates} coachId={coachId} clients={assignClients} />
          </div>
        </TabsContent>

        <TabsContent value="clients" className="mt-0 focus-visible:outline-none">
          <div className="space-y-6">
            <SectionHeading icon={<Users className="w-5 h-5" style={{ color: 'var(--theme-primary)' }} />} title="Seguimiento de alumnos" />
            <ActivePlansBoard
              coachId={coachId}
              activePlans={activePlans}
              clientsWithoutPlan={clientsWithoutPlan}
            />
          </div>
        </TabsContent>

        <TabsContent value="foods" className="mt-0 focus-visible:outline-none">
          <div className="space-y-6">
            <SectionHeading icon={<Apple className="w-5 h-5" style={{ color: 'var(--theme-primary)' }} />} title="Biblioteca nutricional" />
            <FoodLibrary initialFoods={foods.foods} totalFoods={foods.total} coachId={coachId} />
          </div>
        </TabsContent>

        <TabsContent value="recipes" className="mt-0 focus-visible:outline-none">
          <div className="space-y-6">
            <SectionHeading
              icon={<ChefHat className="w-5 h-5" style={{ color: 'var(--theme-primary)' }} />}
              title="Recetas"
              trailing={
                <>
                  <TierBadge tier="base" />
                  <InfoTooltip content="Ideas de recetas para inspirar a tus alumnos. Viene incluido en el módulo de nutrición (Base). No afectan macros ni adherencia." />
                </>
              }
            />
            <RecipeLibrary recipes={recipes} clients={assignClients} />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function SectionHeading({ icon, title, trailing }: { icon: ReactNode; title: string; trailing?: ReactNode }) {
  return (
    <div
      className="flex items-center gap-4 pb-2 border-b-2"
      style={{ borderColor: 'color-mix(in srgb, var(--theme-primary) 20%, transparent)' }}
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center"
        style={{ backgroundColor: 'color-mix(in srgb, var(--theme-primary) 10%, transparent)' }}
      >
        {icon}
      </div>
      <h2 className="text-xl font-black uppercase tracking-tight font-display">{title}</h2>
      {trailing ? <div className="flex items-center gap-1.5">{trailing}</div> : null}
    </div>
  )
}
