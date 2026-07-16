'use client'

import Link from 'next/link'
import { ArrowUpRight, LockKeyhole, Plus, Utensils } from 'lucide-react'
import {
  MacroBudget,
  NutritionCard,
  NutritionStatePanel,
  PlanVersionBadge,
  StrategyBadge,
} from '@/components/nutrition-v2'
import type { NutritionTabV2ViewModel } from './nutritionTabV2.logic'

/**
 * Tab Nutrición V2 embebido en la ficha principal del alumno (coach/clients/[clientId]).
 *
 * Se monta SOLO cuando la page resolvió el canary V2 (surface webCoach) server-side; para
 * quien no tiene canary la ficha sigue mostrando `NutritionTabB5` (V1) sin cambio alguno.
 *
 * Es puramente presentacional: recibe el view model ya mapeado (`buildNutritionTabV2ViewModel`)
 * y usa las primitivas del kit `@/components/nutrition-v2` (tokens theme-aware -> claro/oscuro/
 * white-label sin ramas extra). Importar el kit V2 en esta ruta V1 no viola el boundary checker
 * (solo prohíbe montar los shells V1 dentro de rutas V2, no el kit V2 dentro de V1).
 */
export function NutritionTabV2({ view }: { view: NutritionTabV2ViewModel }) {
  return (
    <section className="min-w-0 space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted">
            Nutrición · V2
          </p>
          <h2 className="mt-1 font-display text-xl font-bold text-strong">
            Ficha nutricional
          </h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={view.detailHref}
            className="inline-flex min-h-11 items-center gap-2 rounded-control border border-border-default bg-surface-card px-3 text-sm font-semibold text-strong transition-colors hover:bg-surface-sunken"
          >
            Abrir ficha nutrición completa
            <ArrowUpRight className="h-4 w-4" />
          </Link>
          <Link
            href={view.builderHref}
            className="inline-flex min-h-11 items-center gap-2 rounded-control bg-ember-500 px-4 text-sm font-semibold text-white transition-colors hover:bg-ember-600"
          >
            <Plus className="h-4 w-4" />
            {view.builderCtaLabel}
          </Link>
        </div>
      </header>

      {!view.hasActivePlan ? (
        <NutritionStatePanel
          illustration="sin-plan"
          title="Sin plan V2 vigente"
          description="Este alumno todavía no tiene una versión publicada de su plan de nutrición V2. Crea la primera para ver metas, franjas y adherencia canónica."
          icon="empty"
          action={
            <Link
              href={view.builderHref}
              className="inline-flex min-h-11 items-center gap-2 rounded-control bg-ember-500 px-4 text-sm font-semibold text-white transition-colors hover:bg-ember-600"
            >
              <Plus className="h-4 w-4" />
              Crear plan
            </Link>
          }
        />
      ) : (
        <div className="space-y-5">
          {view.plan ? (
            <div className="flex flex-wrap items-center gap-2">
              <StrategyBadge strategy={view.plan.strategy} />
              <PlanVersionBadge
                version={view.plan.versionNumber}
                status={view.plan.status}
                effectiveLabel={`desde ${view.plan.effectiveFromLabel}`}
              />
            </div>
          ) : null}

          <MacroBudget
            calories={view.today.calories}
            macros={view.today.macros}
          />

          <div className="grid gap-4 lg:grid-cols-2">
            <NutritionCard>
              <div className="flex items-center gap-2">
                <Utensils className="h-4 w-4 text-ember-600 dark:text-ember-300" />
                <h3 className="font-display text-base font-semibold text-strong">
                  Plan vigente
                </h3>
              </div>
              <p className="mt-2 text-sm font-medium text-strong">
                {view.plan?.name ?? 'Plan de nutrición'}
              </p>
              <p className="mt-2 text-sm leading-6 text-body">
                {view.plan?.visibleNotes || 'Sin indicaciones visibles para el alumno.'}
              </p>
            </NutritionCard>
            <NutritionCard>
              <h3 className="font-display text-base font-semibold text-strong">Hoy</h3>
              <p className="mt-2 text-sm text-muted">
                {view.today.entryCount} registro{view.today.entryCount === 1 ? '' : 's'} ·{' '}
                {view.today.mealSlotCount} franja{view.today.mealSlotCount === 1 ? '' : 's'}
              </p>
              <p className="mt-3 text-sm text-body">
                <span className="font-semibold text-strong">
                  {Math.round(view.today.remainingCalories)} kcal
                </span>{' '}
                restantes según el snapshot del día.
              </p>
            </NutritionCard>
          </div>

          <section>
            <h3 className="mb-3 font-display text-lg font-semibold text-strong">
              Últimos días
            </h3>
            {view.showHistoryUpgradeCta ? (
              <Link
                href={view.historyUpgradeHref}
                className="mb-3 inline-flex items-center gap-2 rounded-control border border-border-subtle bg-surface-sunken px-3 py-2 text-xs text-muted transition-colors hover:text-strong"
              >
                <LockKeyhole className="h-3.5 w-3.5 text-ember-600 dark:text-ember-300" />
                Histórico completo con Nutrición Pro
              </Link>
            ) : null}
            {view.recentDays.length === 0 ? (
              <NutritionCard tone="neutral">
                <p className="text-sm text-muted">
                  Aún no hay días registrados en la ventana visible.
                </p>
              </NutritionCard>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {view.recentDays.map((day) => (
                  <NutritionCard key={day.localDate}>
                    <p className="font-semibold text-strong">{day.label}</p>
                    <p className="mt-1 text-sm text-muted">
                      {Math.round(day.calories)} kcal · {day.entryCount} registro
                      {day.entryCount === 1 ? '' : 's'}
                    </p>
                  </NutritionCard>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </section>
  )
}
