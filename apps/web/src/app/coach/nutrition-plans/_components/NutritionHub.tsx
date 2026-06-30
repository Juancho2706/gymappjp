'use client'

import type { CSSProperties } from 'react'
import { useState } from 'react'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TemplateLibrary, type TemplateLibraryItem } from './TemplateLibrary'
import { ActivePlansBoard } from './ActivePlansBoard'
import type { ActivePlanBoardRow } from '../_data/nutrition-coach.queries'
import { FoodLibrary } from './FoodLibrary'
import type { AssignModalClient } from './AssignModal'
import { NutritionOnboarding } from './NutritionOnboarding'
import { CoachNutritionGuideDialog } from './CoachNutritionGuideDialog'
import { RecipeLibrary } from './recipes/RecipeLibrary'
import type { RecipeRow } from '@/services/nutrition-recipes.service'
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
  const showCreate = hubTab === 'clients' || hubTab === 'templates'

  const hubTabs: { value: string; label: string; shortLabel?: string; count: number }[] = [
    { value: 'templates', label: 'Plantillas', shortLabel: 'Planes', count: templates.length },
    { value: 'clients', label: 'Alumnos', count: activePlans.length },
    { value: 'foods', label: 'Alimentos', count: foods.total },
    { value: 'recipes', label: 'Recetas', count: recipes.length },
  ]

  return (
    <div className="w-full max-w-[2000px] mx-auto animate-fade-in space-y-5">
      {/* TopBar — title + subtitle + acciones (1:1 diseño eva-app) */}
      <div className="flex items-start justify-between gap-4 px-1">
        <div className="min-w-0">
          <h1 className="font-display font-extrabold text-2xl md:text-3xl leading-tight text-[var(--text-strong)]">
            Nutrición
          </h1>
          <p className="text-[13px] text-[var(--text-muted)] mt-0.5">Planes, alimentos y recetas</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <CoachNutritionGuideDialog
            hasClients={hasClients}
            onAssign={() => setHubTab('clients')}
          />
          {showCreate && (
            <Link
              href="/coach/nutrition-plans/new"
              className="eva-press inline-flex h-9 items-center justify-center gap-1.5 rounded-control px-3.5 text-[13px] font-bold text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: 'var(--theme-primary)' }}
            >
              <Plus className="h-4 w-4" />
              Plantilla
            </Link>
          )}
        </div>
      </div>

      <Tabs value={hubTab} onValueChange={setHubTab} className="w-full flex flex-col gap-5">
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
          <div className="space-y-4">
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
          <ActivePlansBoard
            coachId={coachId}
            activePlans={activePlans}
            clientsWithoutPlan={clientsWithoutPlan}
          />
        </TabsContent>

        <TabsContent value="foods" className="mt-0 focus-visible:outline-none">
          <FoodLibrary initialFoods={foods.foods} totalFoods={foods.total} coachId={coachId} />
        </TabsContent>

        <TabsContent value="recipes" className="mt-0 focus-visible:outline-none">
          <div className="space-y-3">
            {/* Banner "Base" — recetas son inspiración (1:1 diseño) */}
            <div className="flex items-center gap-2.5 rounded-card bg-surface-sunken px-3.5 py-2.5">
              <TierBadge tier="base" />
              <span className="text-xs leading-snug text-[var(--text-muted)]">
                Vienen incluidas en el módulo. Son inspiración — no afectan macros ni adherencia.
              </span>
            </div>
            <RecipeLibrary recipes={recipes} clients={assignClients} />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
