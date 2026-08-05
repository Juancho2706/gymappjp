'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTransition, type ReactNode } from 'react'
import { ArrowUpRight, LoaderCircle, Plus } from 'lucide-react'
import { formatNutritionCalories, nutritionProgressPercent } from '@eva/nutrition-v2'
import { NutritionCard, NutritionStatePanel, StrategyBadge } from '@/components/nutrition-v2'
import { AdherenceWeekDots } from '@/components/nutrition/AdherenceWeekDots'
import { ADHERENCE_WEEK_FORMULA_TITLE } from '@/components/nutrition/adherence-week'
import type { NutritionTabV2ViewModel } from './nutritionTabV2.logic'

/**
 * Tab Nutrición V2 embebido en la ficha principal del alumno (coach/clients/[clientId]).
 *
 * Es el ÚNICO camino del tab desde la poda 2026-07-29 (decisión del owner "V1 al olvido"):
 * el tab V1 (`NutritionTabB5`) y el canary `webCoach` que decidía el swap en esta superficie
 * fueron borrados. Si la resolución server-side falla, el tab pinta `NutritionTabV2Unavailable`
 * (estado honesto + CTA), nunca V1.
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

/** Encabezado compartido por el resumen y su estado degradado. */
function NutritionTabHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-center gap-2">
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-black uppercase tracking-widest text-muted">
          Nutrición · V2
        </p>
        <h2 className="mt-1 font-display text-xl font-bold text-strong">Ficha nutricional</h2>
      </div>
      {children}
    </header>
  )
}

/**
 * Estado degradado del tab: la resolución server-side del resumen falló (workspace sin
 * resolver, RPC scoped caído). Con V1 borrado no hay fallback al que caer, así que el tab
 * dice la verdad y ofrece la ficha completa, que resuelve por su cuenta.
 */
export function NutritionTabV2Unavailable({ clientId }: { clientId: string }) {
  return (
    <section className="min-w-0 space-y-4">
      <NutritionTabHeader />
      <NutritionStatePanel
        icon="error"
        tone="warning"
        title="No pudimos cargar el resumen"
        description="Hubo un problema al leer la nutrición de este alumno. Vuelve a intentar en unos segundos o abre la ficha de nutrición completa."
        action={
          <Link
            href={`/coach/nutrition-v2/${clientId}`}
            className="inline-flex min-h-11 items-center gap-2 rounded-control border border-primary/40 px-4 text-sm font-semibold text-primary transition-colors hover:bg-primary/10"
          >
            Abrir ficha de nutrición
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        }
      />
    </section>
  )
}

export function NutritionTabV2({ view }: { view: NutritionTabV2ViewModel }) {
  const caloriesPercent = nutritionProgressPercent(
    view.today.calories.consumed,
    view.today.calories.target,
  )

  return (
    <section className="min-w-0 space-y-4">
      <NutritionTabHeader>
        {view.strategy ? <StrategyBadge strategy={view.strategy} /> : null}
      </NutritionTabHeader>

      {!view.hasActivePlan ? (
        <NutritionStatePanel
          illustration="sin-plan"
          title="Sin plan publicado"
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
          {/* Mismos puntos, mismos umbrales y misma línea "X/7 registrados · Y/Z en meta" que el
              hub y la ficha: el primitivo compartido es la única fuente (nada de un código de
              colores propio por superficie). El ancla es el DOMINGO de la semana en curso porque
              esta card habla de la semana Lu-Do, no de los últimos 7 días. */}
          {view.weekAnchorIso != null ? (
            <div className="mt-2" title={ADHERENCE_WEEK_FORMULA_TITLE}>
              <AdherenceWeekDots days7d={view.adherenceWeek} todayIso={view.weekAnchorIso} />
            </div>
          ) : null}

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

          {/* "N cumplidos · M parciales" salió de acá: era la MISMA lectura que ahora entrega la
              línea del primitivo ("X/7 registrados · Y/Z en meta"), con otro fraseo y otro
              denominador. Queda solo la racha, que el primitivo no cubre. */}
          <p className="mt-3 text-sm tabular-nums text-muted">
            Racha {view.streakDays} día{view.streakDays === 1 ? '' : 's'}
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
