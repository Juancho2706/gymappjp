import Link from 'next/link'
import { ListChecks } from 'lucide-react'
import { formatNutritionCalories, formatNutritionWeekPlanLinkLabel } from '@eva/nutrition-v2'
import {
  MacroChipRow,
  MacroProgress,
  NutritionCard,
  NutritionStatePanel,
} from '@/components/nutrition-v2'
import { SelectedDayBanner } from './SelectedDayBanner'
import { formatPastDayHeadline, type StudentNutritionWeekCell } from './week-nav.logic'

/**
 * Un día PASADO de la semana, en modo lectura estricta.
 *
 * Todo lo que muestra sale de la celda ya compuesta (`buildNutritionWeek`) con datos que YA
 * viajaron: el snapshot congelado del historial manda sobre cualquier proyección del plan
 * vigente, así que republicar el plan no reescribe lo que el alumno realmente tuvo. Acá NO se
 * llama a `get_nutrition_today_v2` con otra fecha: ese RPC es `volatile` (materializa snapshots)
 * y usarlo para mirar el pasado inventaría jornadas que nunca existieron.
 *
 * Cero controles de registro: hoy es la única superficie donde se registra (decisión SPEC). Y
 * cero rojo: `consumed = null` significa "sin registro", no "cero", y un día sin datos se cuenta
 * sin reproche.
 */
export function PastDaySummary({
  cell,
  backHref,
  backLabel,
  planHref = null,
}: {
  cell: StudentNutritionWeekCell
  /** URL de retorno (canónica de hoy, sin `?date=`; o del historial cuando se abre desde ahí). */
  backHref: string
  /** Copy del link de vuelta (default "Volver a hoy"; el historial pasa "Volver al historial"). */
  backLabel?: string
  /**
   * Tab Plan abierto en ESE día (`?view=plan&dow=N`). Opcional: el detalle de un día del
   * historial no lo pasa, porque su semana ya no es la vigente y el Plan solo conoce la actual.
   */
  planHref?: string | null
}) {
  const legacy = cell.legacy
  const legacyOnly = cell.isLegacy === true && legacy?.legacyOnly === true
  const consumed = cell.consumed
  const targets = cell.targets
  const entryCount = consumed?.entryCount ?? cell.historyDay?.activeEntryCount ?? 0

  return (
    <>
      <SelectedDayBanner backHref={backHref} backLabel={backLabel} headline={formatPastDayHeadline(cell)} tone="past" />

      {legacyOnly ? (
        <LegacyDayCard legacy={legacy} />
      ) : cell.state === 'past-empty' ? (
        <NutritionStatePanel
          illustration="historial-vacio"
          title="Sin registros ese día"
          description="No quedó ningún registro de esa jornada. Lo que comas hoy sí puedes registrarlo desde el día actual."
        />
      ) : consumed != null ? (
        <ConsumedDayCard consumed={consumed} entryCount={entryCount} targets={targets} />
      ) : (
        <NutritionCard>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-subtle">Ese día</p>
          <p className="mt-1 text-sm tabular-nums text-body">
            {entryCount} registro{entryCount === 1 ? '' : 's'} · sin detalle de macros guardado.
          </p>
        </NutritionCard>
      )}

      {/* Día mixto: registros V2 + rastro del sistema anterior. El detalle clásico se muestra
          debajo del consumo real, nunca en vez de él. */}
      {cell.isLegacy === true && !legacyOnly && legacy != null ? (
        <LegacyTrailCard legacy={legacy} />
      ) : null}

      {/* Puente al tab Plan (22-08). Este resumen muestra el RESULTADO congelado del día; la
          prescripción de esa jornada no se puede proyectar sin mentir (el plan pudo cambiar de
          versión). "¿Qué alimentos tengo el lunes?" la contesta el patrón semanal VIGENTE. */}
      {planHref ? (
        <Link
          className="inline-flex min-h-11 items-center gap-2 rounded-control border border-border-subtle bg-surface-card px-4 text-sm font-semibold text-primary hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          href={planHref}
        >
          <ListChecks aria-hidden="true" className="h-4 w-4 shrink-0" />
          {formatNutritionWeekPlanLinkLabel(cell)}
        </Link>
      ) : null}
    </>
  )
}

/** Consumo real del día contra las metas CONGELADAS del snapshot (no las del plan de hoy). */
function ConsumedDayCard({
  consumed,
  entryCount,
  targets,
}: {
  consumed: NonNullable<StudentNutritionWeekCell['consumed']>
  entryCount: number
  targets: StudentNutritionWeekCell['targets']
}) {
  const targetCalories = targets?.calories ?? null
  // Barras solo cuando el snapshot guardó las tres metas; si falta alguna, chips honestos con lo
  // consumido en vez de una barra contra un objetivo inventado.
  const macroTargets =
    targets != null && targets.proteinG != null && targets.carbsG != null && targets.fatsG != null
      ? { proteinG: targets.proteinG, carbsG: targets.carbsG, fatsG: targets.fatsG }
      : null

  return (
    <NutritionCard>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-subtle">Consumido ese día</p>
      <div className="mt-1 flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
        <p className="font-display text-2xl font-bold tabular-nums text-strong">
          {formatNutritionCalories(consumed.calories)}
          {targetCalories != null ? (
            <span className="ml-1 text-sm font-medium tabular-nums text-muted">
              / {formatNutritionCalories(targetCalories)}
            </span>
          ) : null}
        </p>
        <p className="text-xs tabular-nums text-muted">
          {entryCount} registro{entryCount === 1 ? '' : 's'}
        </p>
      </div>
      {macroTargets != null ? (
        <div className="mt-4 grid grid-cols-3 gap-3">
          <MacroProgress compact consumed={consumed.proteinG} macro="protein" target={macroTargets.proteinG} />
          <MacroProgress compact consumed={consumed.carbsG} macro="carbs" target={macroTargets.carbsG} />
          <MacroProgress compact consumed={consumed.fatsG} macro="fats" target={macroTargets.fatsG} />
        </div>
      ) : (
        <span className="mt-3 block">
          <MacroChipRow
            carbsG={consumed.carbsG}
            fatsG={consumed.fatsG}
            proteinG={consumed.proteinG}
            size="sm"
          />
        </span>
      )}
    </NutritionCard>
  )
}

/** Día que SOLO tiene datos del sistema anterior: sus cifras V2 son ceros y mentirían. */
function LegacyDayCard({ legacy }: { legacy: StudentNutritionWeekCell['legacy'] }) {
  if (legacy == null) return null
  return (
    <NutritionCard>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-subtle">Registro de ese día</p>
        <LegacyBadge />
      </div>
      {legacy.hasMacros && legacy.consumed != null ? (
        <>
          <p className="mt-1 font-display text-2xl font-bold tabular-nums text-strong">
            {formatNutritionCalories(legacy.consumed.calories)}
          </p>
          <span className="mt-2 block">
            <MacroChipRow
              carbsG={legacy.consumed.carbsG}
              fatsG={legacy.consumed.fatsG}
              proteinG={legacy.consumed.proteinG}
              size="sm"
            />
          </span>
        </>
      ) : (
        <p className="mt-1 text-sm tabular-nums text-body">
          {legacy.completionCount > 0 ? legacy.completionsLabel : 'Registrado en el sistema anterior'}
        </p>
      )}
      {legacy.mealsLabel ? <p className="mt-2 text-xs leading-5 text-subtle">{legacy.mealsLabel}</p> : null}
    </NutritionCard>
  )
}

/** Rastro del sistema anterior en un día que además tiene registros V2. */
function LegacyTrailCard({ legacy }: { legacy: NonNullable<StudentNutritionWeekCell['legacy']> }) {
  if (legacy.secondaryLabel == null && legacy.mealsLabel == null) return null
  return (
    <NutritionCard>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          {legacy.secondaryLabel ? (
            <p className="text-sm tabular-nums text-body">{legacy.secondaryLabel}</p>
          ) : null}
          {legacy.mealsLabel ? <p className="mt-1 text-xs leading-5 text-subtle">{legacy.mealsLabel}</p> : null}
        </div>
        <LegacyBadge />
      </div>
    </NutritionCard>
  )
}

/** Misma pastilla del historial, ahora con variante dark (auditoría P2-18). */
function LegacyBadge() {
  return (
    <span className="shrink-0 rounded-pill border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-800 dark:border-amber-700/50 dark:bg-amber-950/30 dark:text-amber-200">
      Historial anterior
    </span>
  )
}
