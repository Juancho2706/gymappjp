'use client'

import type { CSSProperties, ReactNode } from 'react'
import Link from 'next/link'
import { LayoutTemplate, Users, Apple, Plus, HelpCircle } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { TemplateLibrary, type TemplateLibraryItem } from './TemplateLibrary'
import { ActivePlansBoard } from './ActivePlansBoard'
import type { ActivePlanBoardRow } from '../_data/nutrition-coach.queries'
import { FoodLibrary } from './FoodLibrary'
import type { AssignModalClient } from './AssignModal'
import { NutritionOnboarding } from './NutritionOnboarding'

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
  coachId: string
}

export function NutritionHub({
  templates,
  activePlans,
  assignClients,
  clientsWithoutPlan,
  foods,
  coachId,
}: Props) {
  return (
    <div className="w-full max-w-[2000px] mx-auto animate-fade-in space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tighter font-display leading-none">Nutrición</h1>
            <Dialog>
              <DialogTrigger
                render={
                  <button
                    type="button"
                    className="w-8 h-8 rounded-full bg-amber-400 hover:bg-amber-500 shadow-[0_0_15px_rgba(251,191,36,0.5)] flex items-center justify-center text-amber-950 transition-all hover:scale-110 active:scale-95 group relative"
                  >
                    <HelpCircle className="w-5 h-5 fill-amber-400 stroke-amber-950" />
                  </button>
                }
              />
              <DialogContent className="sm:max-w-2xl bg-white dark:bg-zinc-950 border-slate-200 dark:border-white/10">
                <DialogHeader>
                  <DialogTitle className="text-2xl font-black uppercase tracking-tighter flex items-center gap-2">
                    <Apple className="w-6 h-6 text-emerald-500" />
                    Logística de nutrición
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-6 pt-4 max-h-[70vh] overflow-y-auto pr-2">
                  <div className="space-y-3">
                    <h3 className="text-lg font-black uppercase text-primary">1. Plantillas (moldes)</h3>
                    <p className="text-sm text-slate-600 dark:text-muted-foreground leading-relaxed">
                      Las plantillas son moldes globales. No pertenecen a un alumno hasta que las{' '}
                      <span className="font-bold">asignas</span>. Si editas una plantilla y guardas,{' '}
                      <span className="font-bold text-amber-600 dark:text-amber-500">
                        los alumnos sincronizados se actualizan con ese molde
                      </span>
                      .
                    </p>
                  </div>
                  <div className="space-y-3">
                    <h3 className="text-lg font-black uppercase text-emerald-500">2. Alumnos (planes activos)</h3>
                    <p className="text-sm text-slate-600 dark:text-muted-foreground leading-relaxed">
                      Al asignar una plantilla, el plan queda{' '}
                      <span className="text-xs bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-400 px-1 py-0.5 rounded">
                        SYNCED
                      </span>
                      .
                    </p>
                  </div>
                  <div className="space-y-3">
                    <h3 className="text-lg font-black uppercase text-rose-500">3. Edición individual (custom)</h3>
                    <p className="text-sm text-slate-600 dark:text-muted-foreground leading-relaxed">
                      Si ajustas el plan solo para un alumno, pasa a{' '}
                      <span className="font-bold">personalizado (CUSTOM)</span> y deja de seguir el molde.
                    </p>
                    <div className="p-3 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-xl text-xs text-amber-800 dark:text-amber-400 font-medium">
                      Si luego editas el molde global, el plan custom de ese alumno no cambia.
                    </div>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
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

      <Tabs defaultValue="templates" className="w-full flex flex-col gap-8">
        <div className="sticky top-0 z-20 bg-background/80 backdrop-blur-md pb-4 pt-2 -mx-4 px-4 md:mx-0 md:px-0 flex justify-center">
          <TabsList
            className="bg-muted/50 p-1.5 h-auto flex gap-1 w-full max-w-2xl rounded-2xl border border-border/50 shadow-sm"
            style={{ '--theme-primary': 'var(--theme-primary)' } as CSSProperties}
          >
            <TabsTrigger
              value="templates"
              className="flex-1 h-12 rounded-xl data-[state=active]:bg-background data-[state=active]:text-[var(--theme-primary)] data-[state=active]:shadow-lg transition-all duration-300 font-bold uppercase tracking-widest text-[10px] gap-2"
            >
              <LayoutTemplate className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Plantillas</span>
              <span className="sm:hidden text-[8px]">Planes</span>
            </TabsTrigger>
            <TabsTrigger
              value="clients"
              className="flex-1 h-12 rounded-xl data-[state=active]:bg-background data-[state=active]:text-[var(--theme-primary)] data-[state=active]:shadow-lg transition-all duration-300 font-bold uppercase tracking-widest text-[10px] gap-2"
            >
              <Users className="w-3.5 h-3.5" />
              Alumnos
            </TabsTrigger>
            <TabsTrigger
              value="foods"
              className="flex-1 h-12 rounded-xl data-[state=active]:bg-background data-[state=active]:text-[var(--theme-primary)] data-[state=active]:shadow-lg transition-all duration-300 font-bold uppercase tracking-widest text-[10px] gap-2"
            >
              <Apple className="w-3.5 h-3.5" />
              Alimentos
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="templates" className="mt-0 focus-visible:outline-none">
          <div className="space-y-6">
            <SectionHeading icon={<LayoutTemplate className="w-5 h-5" style={{ color: 'var(--theme-primary)' }} />} title="Protocolos maestros" />
            {templates.length === 0 && (
              <NutritionOnboarding hasClients={assignClients.length > 0} />
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
      </Tabs>
    </div>
  )
}

function SectionHeading({ icon, title }: { icon: ReactNode; title: string }) {
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
    </div>
  )
}
