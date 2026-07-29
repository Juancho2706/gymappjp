'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTransition, type ReactNode } from 'react'
import { ArrowUpRight, LoaderCircle, Plus } from 'lucide-react'
import { formatNutritionCalories, nutritionProgressPercent } from '@eva/nutrition-v2'
import { NutritionCard, NutritionStatePanel, StrategyBadge } from '@/components/nutrition-v2'
import { cn } from '@/lib/utils'
import type { NutritionTabV2ViewModel } from './nutritionTabV2.logic'

/**
 * Tab Nutrición V2 embebido en la ficha principal del alumno (coach/clients/[clientId]).
 *
 * Se monta SOLO cuando la page resolvió el canary V2 (surface webCoach) server-side; para
 * quien no tiene canary la ficha sigue mostrando `NutritionTabB5` (V1) sin cambio alguno.
 *
 * Poda 2026-07-29: este tab dejó de clonar la ficha completa (`/coach/nutrition-v2/[clientId]`).
 * La auditoría de redundancia lo encontró como un subconjunto ESTRICTO y degradado de la ficha
 * (plan vigente / hoy / últimos días, las cuatro cards repetidas a mano en tres archivos). Ahora
 * es UNA tarjeta-resumen: semana en dots + energía de hoy + racha + un único CTA a la ficha. El
 * detalle completo (estructura, notas, historial) vive a un clic de distancia.
 *
 * Es puramente presentacional: recibe el view model ya mapeado (`buildNutritionTabV2ViewModel`)
 * y usa las primitivas del kit `@/components/nutrition-v2` (tokens theme-aware -> claro/oscuro/
 * white-label sin ramas extra). Importar el kit V2 en esta ruta V1 no viola el boundary checker
 * (solo prohíbe montar los shells V1 dentro de rutas V2, no el kit V2 dentro de V1).
 */
/**
 * Link con feedback de navegación: al hacer click muestra spinner + label de espera
 * hasta que el router transiciona (la ficha V2 tarda en resolver server-side; sin
 * esto el coach quedaba mirando la pantalla sin saber si cargaba — QA CEO 2026-07-17).
 * El destino además tiene loading.tsx, así el skeleton aparece apenas transiciona.
 */
function PendingNavLink({
  href,
  className,
  pendingLabel,
  children,
}: {
  href: string
  className: string
  pendingLabel: string
  children: ReactNode
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  return (
    <Link
      href={href}
      aria-busy={isPending}
      className={`${className}${isPending ? ' pointer-events-none opacity-70' : ''}`}
      onClick={(e) => {
        e.preventDefault()
        startTransition(() => router.push(href))
      }}
    >
      {isPending ? (
        <>
          <LoaderCircle className="h-4 w-4 animate-spin" />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </Link>
  )
}

/** Los 7 puntos de la semana en curso del resumen (mockup "flujos podados" sección 01, frame 3).
 *  Reusa la clasificación de la view model: verde = dentro de rango, ámbar = con registro pero
 *  fuera de rango, punto tenue = pasado sin registro, contorno = futuro. */
function NutritionTabWeekDots({ week }: { week: NutritionTabV2ViewModel['week'] }) {
  if (week.length === 0) return null
  return (
    <div
      aria-label="Días de la semana en curso"
      className="grid grid-cols-7 gap-1"
      role="group"
    >
      {week.map((day) => (
        <div
          className={cn(
            'flex flex-col items-center gap-1 rounded-control border py-1.5',
            day.isToday ? 'border-primary/50 bg-primary/5' : 'border-transparent',
          )}
          key={day.isoDate}
        >
          <span className="text-[9px] font-semibold uppercase tracking-wide text-subtle">
            {day.shortLabel}
          </span>
          <span
            aria-hidden="true"
            className={cn(
              'h-1.5 w-1.5 rounded-full',
              day.status === 'done' && 'bg-emerald-500 dark:bg-emerald-400',
              day.status === 'partial' && 'bg-amber-500 dark:bg-amber-400',
              day.status === 'none' && 'bg-border-default',
              day.status === 'future' && 'border border-border-default bg-transparent',
            )}
          />
        </div>
      ))}
    </div>
  )
}

export function NutritionTabV2({ view }: { view: NutritionTabV2ViewModel }) {
  const caloriesPercent = nutritionProgressPercent(
    view.today.calories.consumed,
    view.today.calories.target,
  )

  return (
    <section className="min-w-0 space-y-4">
      <header className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted">
            Nutrición · V2
          </p>
          <h2 className="mt-1 font-display text-xl font-bold text-strong">
            Ficha nutricional
          </h2>
        </div>
        {view.strategy ? <StrategyBadge strategy={view.strategy} /> : null}
      </header>

      {!view.hasActivePlan ? (
        <NutritionStatePanel
          illustration="sin-plan"
          title="Sin plan V2 vigente"
          description="Este alumno todavía no tiene una versión publicada de su plan de nutrición. Crea la primera para ver metas, franjas y adherencia."
          icon="empty"
          action={
            <Link
              href={view.builderHref}
              className="inline-flex min-h-11 items-center gap-2 rounded-control bg-ember-500 px-4 text-sm font-semibold text-white transition-colors hover:bg-ember-600"
            >
              <Plus className="h-4 w-4" />
              {view.builderCtaLabel}
            </Link>
          }
        />
      ) : (
        <NutritionCard>
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-display text-sm font-semibold text-strong">Esta semana</h3>
          </div>
          <div className="mt-2">
            <NutritionTabWeekDots week={view.week} />
          </div>

          <div className="mt-4 flex flex-wrap items-end justify-between gap-2 border-t border-border-subtle pt-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-subtle">Hoy</p>
              <p className="mt-1 font-display text-xl font-bold tabular-nums text-strong">
                {formatNutritionCalories(view.today.calories.consumed)}
                <span className="ml-1 text-sm font-medium text-muted">
                  / {formatNutritionCalories(view.today.calories.target)}
                </span>
              </p>
            </div>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-pill bg-surface-sunken">
            <div
              className="h-full rounded-pill bg-primary transition-[width] duration-[var(--dur-base)]"
              style={{ width: `${caloriesPercent}%` }}
            />
          </div>

          <p className="mt-3 text-sm tabular-nums text-muted">
            {view.completedCount} cumplido{view.completedCount === 1 ? '' : 's'} ·{' '}
            {view.partialCount} parcial{view.partialCount === 1 ? '' : 'es'} · racha{' '}
            {view.streakDays}
          </p>

          <PendingNavLink
            href={view.detailHref}
            className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-control border border-primary/40 px-4 text-sm font-semibold text-primary transition-colors hover:bg-primary/10"
            pendingLabel="Abriendo ficha…"
          >
            Abrir ficha de nutrición
            <ArrowUpRight className="h-4 w-4" />
          </PendingNavLink>
        </NutritionCard>
      )}
    </section>
  )
}
