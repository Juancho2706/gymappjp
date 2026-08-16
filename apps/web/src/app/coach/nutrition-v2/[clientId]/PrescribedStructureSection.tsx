'use client'

import { useMemo, useState } from 'react'
import {
  NUTRITION_PLAN_DOW_UNIFORM_NOTE,
  buildNutritionPlanDowStrip,
  describeNutritionPlanDowSelection,
  initialNutritionPlanDow,
  isNutritionPlanDowUniform,
  type NutritionPlanReadModel,
} from '@eva/nutrition-v2'
import { NutritionCard, PlanDowSelector, PrescribedPortionChips } from '@/components/nutrition-v2'
import { foodCategoryIconUrl, foodCategoryIconUrlFromName } from '@/lib/food-image'
import { cn } from '@/lib/utils'
import { FoodThumb } from '../_components/FoodImage'
import { resolveFoodImageUrl } from '../_components/food-card-presentation'

type PlanDayVariant = NutritionPlanReadModel['dayVariants'][number]

/**
 * "Estructura prescrita" de la ficha del coach — selector de día + UNA card (SPEC punto 12).
 *
 * Antes: una card por variante APILADA, cada una con su tira Lu-Do, repitiendo cinco veces el
 * mismo día base. Ahora: strip Lu-Do del PLAN (7 celdas con kcal, punto lleno = día propio, punto
 * hueco = hereda el base, hoy marcado sutil) + la card del día elegido + una barra de contexto que
 * dice qué está mirando ("Lunes sigue el Día base · Igual que Ma · Mi · Ju · Vi").
 *
 * Read-only: el único camino de edición sigue siendo el lápiz global del quick-edit en el header.
 * Acá no hay "Personalizar", ni menú ⋮, ni "+ Agregar día" (eso vive en el creador/quick-edit).
 *
 * Estado local (no URL): `?date=` ya significa "día de SEGUIMIENTO" en esta pantalla (tira de
 * fechas de arriba) y meter un segundo parámetro de día haría ambiguo el link que el coach se
 * manda. Cuando la tira de seguimiento está en un día FUTURO, la ficha entra con ese día ya
 * elegido acá (`initialDow`), que es el ancla del enlace "Ver la estructura de …".
 *
 * Cero fetch y cero cálculo nuevo: todo sale de `plan.dayVariants`, que ya viajó en el render.
 */
export function PrescribedStructureSection({
  variants,
  todayIso,
  supabaseBaseUrl,
  anchorId,
  initialDow,
}: {
  variants: readonly PlanDayVariant[]
  todayIso: string
  /** `NEXT_PUBLIC_SUPABASE_URL` resuelta en el servidor (foto del catálogo). */
  supabaseBaseUrl: string | null
  anchorId?: string
  /** Día con el que abrir (dow 0-6). Sin dato abre en hoy. */
  initialDow?: number | null
}) {
  const cells = useMemo(
    () => buildNutritionPlanDowStrip({ variants, todayIso }),
    [variants, todayIso],
  )
  const uniform = useMemo(() => isNutritionPlanDowUniform(cells), [cells])
  const [selectedDow, setSelectedDow] = useState<number>(
    () => initialDow ?? initialNutritionPlanDow(cells) ?? 1,
  )
  const selection = useMemo(
    () => describeNutritionPlanDowSelection({ cells, dayOfWeek: selectedDow }),
    [cells, selectedDow],
  )
  const selectedCell = cells.find((cell) => cell.dayOfWeek === selectedDow) ?? null

  if (variants.length === 0 || selection == null) return null

  const variant = selection.variant
  // Día heredado: manda con quién comparte la estructura (mockup); día propio: sus cifras.
  const contextLine =
    selection.kind === 'inherited'
      ? (selection.sharedLabel ?? selection.statsLabel)
      : selection.statsLabel

  return (
    <section className="scroll-mt-24 space-y-3" id={anchorId}>
      <h2 className="font-display text-xl font-semibold text-strong">Estructura prescrita</h2>

      {/* Plan de un solo día: el selector no aporta (los 7 días reciben lo mismo) y se dice. */}
      {uniform ? (
        <p className="text-sm text-muted">{NUTRITION_PLAN_DOW_UNIFORM_NOTE}</p>
      ) : (
        <PlanDowSelector
          cells={cells}
          label="Días del plan del alumno"
          onSelect={setSelectedDow}
          selectedDow={selectedDow}
        />
      )}

      {/* Barra de contexto: qué día se está mirando y de dónde sale su estructura. Con plan de un
          solo día no se repite (la nota de arriba ya lo dijo). */}
      {uniform ? null : (
        <div
          className={cn(
            'flex flex-wrap items-center gap-x-3 gap-y-1 rounded-control border bg-surface-card px-3 py-2.5',
            selection.kind === 'own' ? 'border-border-subtle' : 'border-dashed border-border-default',
          )}
        >
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-strong">{selection.title}</p>
            {contextLine ? (
              <p className="mt-0.5 text-xs tabular-nums text-muted">{contextLine}</p>
            ) : null}
          </div>
          {selectedCell?.isToday ? (
            <span className="shrink-0 rounded-pill border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary dark:border-primary/40 dark:bg-primary/15">
              Hoy
            </span>
          ) : null}
        </div>
      )}

      {variant == null ? (
        <NutritionCard>
          <p className="text-sm text-muted">
            El plan vigente no prescribe una estructura para este día.
          </p>
        </NutritionCard>
      ) : (
        <NutritionCard>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display text-base font-semibold text-strong">{variant.label}</h3>
            {uniform && selection.statsLabel ? (
              <span className="text-xs tabular-nums text-muted">{selection.statsLabel}</span>
            ) : null}
          </div>
          {variant.mealSlots.length === 0 ? (
            <p className="mt-2 text-sm text-muted">Plan flexible: sin franjas prescritas.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {variant.mealSlots.map((slot) => (
                <li
                  key={slot.id}
                  className="rounded-control border border-border-subtle bg-surface-card p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-strong">{slot.name}</span>
                    {slot.startTime ? (
                      <span className="text-xs tabular-nums text-muted">{slot.startTime}</span>
                    ) : null}
                  </div>
                  {slot.prescriptionItems.length > 0 ? (
                    <ul className="mt-2 space-y-2">
                      {slot.prescriptionItems.map((item) => {
                        const itemName = item.name || 'Alimento'
                        return (
                          <li key={item.id} className="flex items-center gap-2 text-sm text-body">
                            {/* Miniatura SIEMPRE (regla transversal del owner): foto del catálogo
                                si `media` la trae, icono por categoría si no. */}
                            <FoodThumb
                              alt={itemName}
                              iconUrl={
                                item.category
                                  ? foodCategoryIconUrl(item.category)
                                  : foodCategoryIconUrlFromName(itemName)
                              }
                              imageUrl={resolveFoodImageUrl(item.media ?? null, supabaseBaseUrl)}
                            />
                            <span className="min-w-0 flex-1 truncate">
                              {itemName} · {item.quantity} {item.unit}
                            </span>
                            <span className="shrink-0 text-xs tabular-nums text-muted">
                              {Math.round(item.macros.calories ?? 0)} kcal
                            </span>
                          </li>
                        )
                      })}
                    </ul>
                  ) : null}
                  {/* Capa de porciones (P0-3): la franja puede prescribir SOLO porciones, o
                      porciones además de los alimentos fijos. Sin targets no pinta nada. */}
                  <PrescribedPortionChips className="mt-2" targets={slot.exchangeTargets} />
                  {slot.prescriptionItems.length === 0 &&
                  (slot.exchangeTargets?.length ?? 0) === 0 ? (
                    <p className="mt-2 text-xs text-muted">Sin alimentos prescritos en esta franja.</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </NutritionCard>
      )}
    </section>
  )
}
