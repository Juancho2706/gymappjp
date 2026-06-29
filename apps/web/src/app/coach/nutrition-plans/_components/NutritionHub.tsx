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

  const hubTabs: { value: string; label: string; shortLabel?: string; count: number }[] = [
    { value: 'templates', label: 'Plantillas', shortLabel: 'Planes', count: templates.length },
    { value: 'clients', label: 'Alumnos', count: activePlans.length },
    { value: 'foods', label: 'Alimentos', count: foods.total },
    { value: 'recipes', label: 'Recetas', count: recipes.length },
  ]

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
          <p className="text-[var(--text-muted)] font-bold text-sm uppercase tracking-widest flex items-center gap-2">
            <span
              className="w-1.5 h-1.5 rounded-full animate-pulse shrink-0"
              style={{ backgroundColor: 'var(--accent-nutrition)' }}
            />
            Planes, alimentos y recetas
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

      <Tabs value={hubTab} onValueChange={setHubTab} className="w-full flex flex-col gap-8">
        <div className="sticky top-[var(--coach-mobile-content-top-offset)] md:top-0 z-20 bg-background/80 backdrop-blur-md pb-4 pt-2 -mx-4 px-4 md:mx-0 md:px-0 flex justify-center">
          <TabsList
            className="bg-surface-sunken p-[3px] h-auto flex gap-1 w-full max-w-2xl rounded-control"
            style={{ '--theme-primary': 'var(--theme-primary)' } as CSSProperties}
          >
            {hubTabs.map((t) => (
              <TabsTrigger
                key={t.value}
                value={t.value}
                className="group/tab flex-1 min-w-0 h-[46px] flex flex-col items-center justify-center gap-0.5 rounded-[11px] px-1 transition-[background-color,box-shadow] duration-150 data-active:bg-surface-card data-active:shadow-sm"
              >
                <span className="max-w-full truncate text-[12.5px] leading-none font-semibold text-[var(--text-muted)] group-data-[active]/tab:font-extrabold group-data-[active]/tab:text-[var(--text-strong)]">
                  {t.shortLabel ? (
                    <>
                      <span className="hidden sm:inline">{t.label}</span>
                      <span className="sm:hidden">{t.shortLabel}</span>
                    </>
                  ) : (
                    t.label
                  )}
                </span>
                <span className="font-mono text-[10.5px] leading-none font-bold tabular-nums text-[var(--text-subtle)] group-data-[active]/tab:text-[color:var(--theme-primary)]">
                  {t.count}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="templates" className="mt-0 focus-visible:outline-none">
          <div className="space-y-6">
            <SectionHeading icon={<LayoutTemplate className="w-5 h-5 text-[var(--ember-600)]" />} title="Protocolos maestros" />
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
            <SectionHeading icon={<Users className="w-5 h-5 text-[var(--ember-600)]" />} title="Seguimiento de alumnos" />
            <ActivePlansBoard
              coachId={coachId}
              activePlans={activePlans}
              clientsWithoutPlan={clientsWithoutPlan}
            />
          </div>
        </TabsContent>

        <TabsContent value="foods" className="mt-0 focus-visible:outline-none">
          <div className="space-y-6">
            <SectionHeading icon={<Apple className="w-5 h-5 text-[var(--ember-600)]" />} title="Biblioteca nutricional" />
            <FoodLibrary initialFoods={foods.foods} totalFoods={foods.total} coachId={coachId} />
          </div>
        </TabsContent>

        <TabsContent value="recipes" className="mt-0 focus-visible:outline-none">
          <div className="space-y-6">
            <SectionHeading
              icon={<ChefHat className="w-5 h-5 text-[var(--ember-600)]" />}
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
    <div className="flex items-center gap-4 pb-2 border-b-2 border-[color:var(--ember-100)]">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[var(--ember-100)]">
        {icon}
      </div>
      <h2 className="text-xl font-black uppercase tracking-tight font-display">{title}</h2>
      {trailing ? <div className="flex items-center gap-1.5">{trailing}</div> : null}
    </div>
  )
}
