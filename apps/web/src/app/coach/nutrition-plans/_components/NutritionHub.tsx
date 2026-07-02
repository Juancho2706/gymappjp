'use client'

import type { CSSProperties } from 'react'
import { useState } from 'react'
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
    <div className="w-full max-w-[2000px] mx-auto animate-fade-in flex flex-col gap-5">
      {/* Móvil: TopBar título + subtítulo + acciones (1:1 diseño eva-app). Desktop se
          integra en la fila del header sticky de abajo — se oculta acá. */}
      <div className="flex items-start justify-between gap-4 px-1 md:hidden">
        <div className="min-w-0">
          <h1 className="font-display font-extrabold text-2xl leading-tight text-[var(--text-strong)]">
            Nutrición
          </h1>
          <p className="text-[13px] text-[var(--text-muted)] mt-0.5">Planes, alimentos y recetas</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">{actions}</div>
      </div>

      <Tabs value={hubTab} onValueChange={setHubTab} className="w-full flex flex-col gap-5">
        {/* Header compacto: móvil = tabs centrados; desktop = título + strip de tabs CLAVADO a
            la derecha del título (left-aligned) + acciones en un slot derecho (md:ml-auto) que
            absorbe la diferencia de ancho entre pestañas (con/sin "+ Plantilla"). Así el strip
            no "baila" al cambiar de pestaña. */}
        <div className="sticky top-[var(--coach-mobile-content-top-offset)] md:top-0 z-20 bg-background/80 backdrop-blur-md -mx-4 px-4 md:mx-0 md:px-0 pb-4 pt-2 md:py-2 flex justify-center md:flex-wrap md:items-center md:justify-start md:gap-x-6 md:gap-y-3">
          <div className="hidden min-w-0 shrink-0 md:block">
            <h1 className="font-display font-extrabold text-2xl leading-tight text-[var(--text-strong)]">
              Nutrición
            </h1>
            <p className="text-[13px] text-[var(--text-muted)] mt-0.5">Planes, alimentos y recetas</p>
          </div>
          {/* Strip de tabs: móvil full-width centrado; desktop ancho de contenido, anclado
              junto al título (shrink-0 = nunca lo comprimen las acciones) */}
          <div className="flex w-full max-w-2xl items-center md:w-auto md:min-w-0 md:max-w-none md:shrink-0">
            <TabsList
              className="bg-surface-sunken p-[3px] h-auto flex gap-1 w-full md:w-auto rounded-control"
              style={{ '--theme-primary': 'var(--theme-primary)' } as CSSProperties}
            >
              {hubTabs.map((t) => (
                <TabsTrigger
                  key={t.value}
                  value={t.value}
                  className="group/tab flex-1 min-w-0 md:flex-none md:min-w-[88px] h-[46px] flex flex-col items-center justify-center gap-0.5 rounded-[11px] px-1 md:px-4 transition-[background-color,box-shadow] duration-150 data-active:bg-surface-card data-active:shadow-sm"
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
          {/* Acciones: slot derecho — md:ml-auto lo empuja a la orilla y absorbe la diferencia
              de ancho (con/sin "+ Plantilla") sin mover el strip de tabs */}
          <div className="hidden items-center gap-2 shrink-0 md:ml-auto md:flex">{actions}</div>
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
          {/* Móvil: board vertical (1:1 diseño móvil, sin tocar). Desktop (md+): master-detail
              espacioso — rail de alumnos (riesgo-first) + ficha de nutrición embebida. */}
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
