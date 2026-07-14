'use client'

import type { CSSProperties } from 'react'
import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { BookOpen, Plus } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TemplateLibrary, type TemplateLibraryItem } from './TemplateLibrary'
import { ActivePlansBoard } from './ActivePlansBoard'
import { NutritionRosterMasterDetail } from './NutritionRosterMasterDetail'
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
  nutritionProEnabled: boolean
}

export function NutritionHub({
  templates,
  activePlans,
  assignClients,
  clientsWithoutPlan,
  foods,
  recipes,
  coachId,
  nutritionProEnabled,
}: Props) {
  const searchParams = useSearchParams()
  const initialTab = searchParams.get('tab')
  const [hubTab, setHubTab] = useState(
    ['templates', 'clients', 'foods', 'recipes'].includes(initialTab ?? '') ? initialTab! : 'clients',
  )
  const hasClients = assignClients.length > 0
  const showCreate = hubTab === 'clients' || hubTab === 'templates'

  const hubTabs: { value: string; label: string; shortLabel?: string; count: number }[] = [
    { value: 'templates', label: 'Plantillas', shortLabel: 'Planes', count: templates.length },
    { value: 'clients', label: 'Alumnos', count: activePlans.length },
    { value: 'foods', label: 'Alimentos', count: foods.total },
    { value: 'recipes', label: 'Recetas', count: recipes.length },
  ]

  const actions = (
    <>
      <Link
        href="/coach/meal-groups"
        title="Grupos de comidas"
        aria-label="Grupos de comidas"
        className="eva-press hidden h-9 w-9 items-center justify-center rounded-control border-[1.5px] border-[color:var(--border-default)] bg-[var(--surface-card)] text-[var(--text-strong)] transition-colors hover:bg-[var(--surface-sunken)] md:inline-flex"
      >
        <BookOpen className="h-[17px] w-[17px]" />
      </Link>
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
    </>
  )

  return (
    <div className="mx-auto flex w-full max-w-[2000px] animate-fade-in flex-col gap-5">
      <div className="flex items-start justify-between gap-4 px-1 md:hidden">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-extrabold leading-tight text-[var(--text-strong)]">
            Nutrición
          </h1>
          <p className="mt-0.5 text-[13px] text-[var(--text-muted)]">Planes, alimentos y recetas</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      </div>

      <Tabs value={hubTab} onValueChange={setHubTab} className="flex w-full flex-col gap-5">
        <div className="sticky top-[var(--coach-mobile-content-top-offset)] z-20 -mx-4 flex justify-center bg-background/80 px-4 pb-4 pt-2 backdrop-blur-md md:top-0 md:mx-0 md:flex-wrap md:items-center md:justify-start md:gap-x-6 md:gap-y-3 md:px-0 md:py-2">
          <div className="hidden min-w-0 shrink-0 md:block">
            <h1 className="font-display text-2xl font-extrabold leading-tight text-[var(--text-strong)]">
              Nutrición
            </h1>
            <p className="mt-0.5 text-[13px] text-[var(--text-muted)]">Planes, alimentos y recetas</p>
          </div>
          <div className="flex w-full max-w-2xl items-center md:w-auto md:min-w-0 md:max-w-none md:shrink-0">
            <TabsList
              className="flex h-auto w-full gap-1 rounded-control bg-surface-sunken p-[3px] md:w-auto"
              style={{ '--theme-primary': 'var(--theme-primary)' } as CSSProperties}
            >
              {hubTabs.map((tab) => (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className="group/tab flex h-[46px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-[11px] px-1 transition-[background-color,box-shadow] duration-150 data-active:bg-surface-card data-active:shadow-sm md:min-w-[88px] md:flex-none md:px-4"
                >
                  <span className="max-w-full truncate text-[12.5px] font-semibold leading-none text-[var(--text-muted)] group-data-[active]/tab:font-extrabold group-data-[active]/tab:text-[var(--text-strong)]">
                    {tab.shortLabel ? (
                      <>
                        <span className="hidden sm:inline">{tab.label}</span>
                        <span className="sm:hidden">{tab.shortLabel}</span>
                      </>
                    ) : tab.label}
                  </span>
                  <span className="font-mono text-[10.5px] font-bold leading-none tabular-nums text-[var(--text-subtle)] group-data-[active]/tab:text-[color:var(--theme-primary)]">
                    {tab.count}
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          <div className="hidden shrink-0 items-center gap-2 md:ml-auto md:flex">{actions}</div>
        </div>

        <TabsContent value="templates" className="mt-0 focus-visible:outline-none">
          <div className="space-y-4">
            {templates.length === 0 && (
              <NutritionOnboarding
                coachId={coachId}
                hasClients={hasClients}
                onAssign={() => setHubTab('clients')}
                onFoods={() => setHubTab('foods')}
              />
            )}
            <TemplateLibrary templates={templates} coachId={coachId} clients={assignClients} />
          </div>
        </TabsContent>

        <TabsContent value="clients" className="mt-0 focus-visible:outline-none">
          <div className="md:hidden">
            <ActivePlansBoard
              coachId={coachId}
              activePlans={activePlans}
              clientsWithoutPlan={clientsWithoutPlan}
            />
          </div>
          <div className="hidden md:block">
            <NutritionRosterMasterDetail
              coachId={coachId}
              activePlans={activePlans}
              clientsWithoutPlan={clientsWithoutPlan}
            />
          </div>
        </TabsContent>

        <TabsContent value="foods" className="mt-0 focus-visible:outline-none">
          <FoodLibrary initialFoods={foods.foods} totalFoods={foods.total} coachId={coachId} />
        </TabsContent>

        <TabsContent value="recipes" className="mt-0 focus-visible:outline-none">
          <div className="space-y-3">
            <div className="flex items-start gap-2.5 rounded-card bg-surface-sunken px-3.5 py-3">
              <TierBadge tier={nutritionProEnabled ? 'pro' : 'base'} />
              <span className="text-xs leading-relaxed text-[var(--text-muted)]">
                {nutritionProEnabled
                  ? 'Ideas Base para inspirar y recetas Pro cuantificables con porciones, ingredientes y macros.'
                  : 'Las ideas Base inspiran a tus alumnos y no afectan macros. Activa Nutrición Pro para recetas cuantificables.'}
              </span>
            </div>
            <RecipeLibrary
              recipes={recipes}
              clients={assignClients}
              nutritionProEnabled={nutritionProEnabled}
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
