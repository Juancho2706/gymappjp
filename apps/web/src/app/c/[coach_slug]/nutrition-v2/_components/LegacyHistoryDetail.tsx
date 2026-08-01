import { History, Info } from 'lucide-react'
import {
  formatNutritionAmount,
  formatNutritionCalories,
  type NutritionLegacyHistoryDetailReadModel,
} from '@eva/nutrition-v2'
import { NutritionCard } from '@/components/nutrition-v2'

/**
 * Capa de lectura de V1 dentro de la pantalla V2. No recicla rutas ni controles
 * antiguos: la fuente se muestra distinguida y estrictamente sin mutaciones.
 */
export function LegacyHistoryDetail({ detail }: { detail: NutritionLegacyHistoryDetailReadModel }) {
  const hasContent =
    detail.targets.length > 0 || detail.meals.length > 0 || detail.swaps.length > 0 || detail.intakeEntries.length > 0
  if (!hasContent) return null

  return (
    <NutritionCard tone="warning">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <History className="mt-0.5 h-4 w-4 shrink-0 text-warning-700 dark:text-warning-300" aria-hidden="true" />
          <div>
            <h2 className="text-sm font-semibold text-strong">Historial anterior</h2>
            <p className="mt-0.5 text-xs text-muted">Sistema anterior · solo lectura</p>
          </div>
        </div>
        <span className="rounded-pill border border-warning-500/30 bg-warning-500/10 px-2 py-1 text-[11px] font-semibold text-warning-800 dark:text-warning-200">
          Sin edición
        </span>
      </div>

      {detail.targets.map((target, index) => (
        <section key={`${target.planName ?? 'plan'}-${index}`} className="mt-4 border-t border-warning-500/20 pt-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-subtle">
            Objetivos anteriores{target.planName ? ` · ${target.planName}` : ''}
          </p>
          <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
            {target.calories != null ? <Metric label="Energía" value={formatNutritionCalories(target.calories)} /> : null}
            {target.proteinG != null ? <Metric label="Proteína" value={formatNutritionAmount(target.proteinG, 'g')} /> : null}
            {target.carbsG != null ? <Metric label="Carbohidratos" value={formatNutritionAmount(target.carbsG, 'g')} /> : null}
            {target.fatsG != null ? <Metric label="Grasas" value={formatNutritionAmount(target.fatsG, 'g')} /> : null}
          </dl>
        </section>
      ))}

      {detail.meals.length > 0 ? (
        <section className="mt-4 border-t border-warning-500/20 pt-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-subtle">Comidas completadas</p>
          <div className="mt-2 space-y-3">
            {detail.meals.map((meal) => (
              <div key={meal.mealId}>
                <p className="text-sm font-semibold text-strong">{meal.mealName}</p>
                <p className="mt-0.5 text-xs text-muted">
                  Completada{meal.consumedQuantity != null ? ` · ${Math.round(meal.consumedQuantity)}%` : ''}
                </p>
                {meal.foods.map((food) => (
                  <p key={food.foodId} className="mt-1 text-sm text-body">
                    {food.name}
                    {food.brand ? ` · ${food.brand}` : ''} · {formatNutritionAmount(food.quantity, food.unit ?? 'g')}
                  </p>
                ))}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {detail.swaps.length > 0 ? (
        <section className="mt-4 border-t border-warning-500/20 pt-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-subtle">Cambios registrados</p>
          {detail.swaps.map((swap) => (
            <p key={`${swap.mealId}-${swap.originalFoodId}-${swap.createdAt}`} className="mt-1 text-sm text-body">
              {swap.originalFoodName} → {swap.swappedFoodName}
              {swap.quantity != null ? ` · ${formatNutritionAmount(swap.quantity, swap.unit ?? 'g')}` : ''}
            </p>
          ))}
        </section>
      ) : null}

      {detail.intakeEntries.length > 0 ? (
        <section className="mt-4 border-t border-warning-500/20 pt-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-subtle">Registros anteriores</p>
          {detail.intakeEntries.map((entry) => (
            <p key={entry.entryId} className="mt-1 text-sm text-body">
              {entry.foodName}
              {entry.brand ? ` · ${entry.brand}` : ''} · {formatNutritionAmount(entry.quantity, entry.unit)}
            </p>
          ))}
        </section>
      ) : null}

      <p className="mt-4 flex items-start gap-2 border-t border-warning-500/20 pt-3 text-xs leading-5 text-muted">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Este detalle se conserva como respaldo histórico; no cambia el plan ni el consumo actual.
      </p>
    </NutritionCard>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dd className="font-display text-sm font-semibold text-strong">{value}</dd>
      <dt className="text-[11px] text-muted">{label}</dt>
    </div>
  )
}
