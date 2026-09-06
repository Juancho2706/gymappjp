import {
  NUTRITION_ITEM_SUBSTITUTION_SELECT,
  describeItemSubstitutions,
  formatItemQuantity,
  formatNutritionAmount,
  formatNutritionCalories,
  mapNutritionItemSubstitutionRow,
  planSubstitutionsByItem,
  resolveItemDisplayNote,
  type NutritionPlanReadModel,
  type PlanItemSubstitutionLike,
  type PlanSubstitutionsByItem,
} from '@eva/nutrition-v2'
import { MacroChipRow, NutritionCard, PrescribedPortionChips } from '@/components/nutrition-v2'
import { createClient } from '@/lib/supabase/server'
import { NutritionFoodRow } from './NutritionFoodRow'
import { resolveFoodImageUrl } from './food-result-image'

/**
 * Estructura prescrita de UNA variante de día (franjas, alimentos, porciones), en modo lectura.
 *
 * Vive en `_components` (y ya no dentro de `page.tsx`) porque la comparten el tab "Plan" — que
 * ahora muestra una sola card, la del día elegido en el selector semanal — y la vista previa de
 * un día FUTURO del tab "Hoy". Una sola pieza: el alumno ve exactamente la misma prescripción
 * mire donde mire, sin dos markups que se desincronizan.
 *
 * Ya NO pinta la tira Lu-Do por card (auditoría P1-10 / Q9): con 7 variantes eran 49 pastillas
 * diciendo fracciones de lo mismo. Esa información ahora la da UN solo selector arriba, que
 * además navega. Componente de servidor: cero estado, cero controles de registro.
 *
 * SUB-T10: sigue siendo `async` por el FALLBACK de reemplazos (`fetchPlanSubstitutionsByItem`),
 * que solo corre si el RPC del plan no trae `substitutions`. Con el RPC vigente no hay ninguna
 * consulta extra. Sus dos llamadores (`page.tsx` y `FutureDayPreview`) son Server Components, así
 * que la espera la resuelve React.
 */

export type PlanVariant = NutritionPlanReadModel['dayVariants'][number]
export type PlanSlot = PlanVariant['mealSlots'][number]
export type PlanItem = PlanSlot['prescriptionItems'][number]

/** Base pública de Storage para resolver la ilustración del producto (server-side, NEXT_PUBLIC). */
const SUPABASE_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL ?? null

/** Mapa `prescriptionItemId → reemplazos`. Vive en `@eva/nutrition-v2` (lo comparten web y RN). */
export type { PlanSubstitutionsByItem }

const NO_SUBSTITUTIONS: PlanItemSubstitutionLike[] = []

/**
 * FALLBACK: reemplazos autorizados del coach (F-02) para los items de UNA variante.
 *
 * Desde la migración `20260902220850_nutrition_v2_plan_read_substitutions`, `substitutions` viaja
 * dentro de `get_nutrition_plan_read_v2` y esta consulta NO se ejecuta. Sigue acá solo para el
 * caso "clave ausente" (RPC viejo, p. ej. un rollback de la función), que `planSubstitutionsByItem`
 * detecta devolviendo `null`.
 *
 * Lectura directa RLS-scoped de `nutrition_item_substitutions_v2` (policy `can_read_version`: el
 * propio alumno sobre versiones `published`/`superseded`). Se filtra por los ids de items que la
 * tarjeta ya tiene en la mano y NO por `version_id`, que el read-model del plan no expone a nivel
 * de variante; el índice `nis_prescription_item_id_idx (prescription_item_id, order_index)` cubre
 * exactamente ese acceso, así que es UNA consulta indexada por card.
 *
 * No-bloqueante por diseño: cualquier fallo degrada a mapa vacío — la línea de reemplazos es
 * informativa y jamás debe tumbar la vista del plan.
 */
async function fetchPlanSubstitutionsByItem(itemIds: string[]): Promise<PlanSubstitutionsByItem> {
  if (itemIds.length === 0) return {}
  try {
    const client = await createClient()
    const { data, error } = await client
      .from('nutrition_item_substitutions_v2')
      .select(NUTRITION_ITEM_SUBSTITUTION_SELECT)
      .in('prescription_item_id', itemIds)
      .order('order_index', { ascending: true })
    if (error || !data) {
      if (error) {
        console.error('nutrition_v2_web_read', {
          table: 'nutrition_item_substitutions_v2',
          ok: false,
          errorCode: error.code ?? 'READ_ERROR',
        })
      }
      return {}
    }
    const rows = data as unknown as Parameters<typeof mapNutritionItemSubstitutionRow>[0][]
    const byItem: Record<string, PlanItemSubstitutionLike[]> = {}
    for (const row of rows) {
      const mapped = mapNutritionItemSubstitutionRow(row)
      const bucket = byItem[mapped.prescriptionItemId] ?? (byItem[mapped.prescriptionItemId] = [])
      bucket.push({ name: mapped.name, quantity: mapped.quantity, unit: mapped.unit })
    }
    return byItem
  } catch {
    return {}
  }
}

export async function PlanVariantCard({
  variant,
  showTargets = false,
}: {
  variant: PlanVariant
  /**
   * Metas de la variante como chips bajo el título. El tab "Plan" las pinta arriba en su propia
   * card ("Metas del día"), así que ahí va en `false` para no repetir la misma cifra dos veces.
   */
  showTargets?: boolean
}) {
  // SUB-T10 cierre: los reemplazos ya vienen en el read-model del plan (migración
  // `20260902220850_nutrition_v2_plan_read_substitutions`) ⇒ cero consultas extra. `null` solo si
  // el RPC no trae la clave; ahí sí cae al select directo (una lectura por card, como antes).
  const substitutionsByItem =
    planSubstitutionsByItem([variant]) ??
    (await fetchPlanSubstitutionsByItem(
      variant.mealSlots.flatMap((slot) => slot.prescriptionItems.map((item) => item.id)),
    ))
  return (
    <NutritionCard>
      {/* Auditoría P2/P3: fuera el chip "Por defecto" (concepto interno del builder, el alumno no
          sabe qué es) y la línea "N franjas · kcal" (las kcal ya están 40 px arriba en "Metas del
          día"; el conteo de franjas se ve solo, listándolas abajo). */}
      <h3 className="font-display text-lg font-semibold text-strong">{variant.label}</h3>
      {showTargets ? (
        <span className="mt-2 block">
          <MacroChipRow
            calories={variant.targets.calories}
            proteinG={variant.targets.proteinG}
            carbsG={variant.targets.carbsG}
            fatsG={variant.targets.fatsG}
            size="sm"
          />
        </span>
      ) : null}
      <div className="mt-2 space-y-4">
        {variant.mealSlots.length === 0 ? (
          <p className="text-sm text-muted">
            Plan sin franjas fijas: sigue tus metas diarias y registra lo que comas.
          </p>
        ) : (
          variant.mealSlots.map((slot) => (
            <PlanSlotBlock key={slot.id} slot={slot} substitutionsByItem={substitutionsByItem} />
          ))
        )}
      </div>
    </NutritionCard>
  )
}

/** Una franja del plan: encabezado (hora), indicaciones, alimentos prescritos y subtotal. */
export function PlanSlotBlock({
  slot,
  substitutionsByItem = {},
}: {
  slot: PlanSlot
  /** Reemplazos autorizados por item (SUB-T10). Omitirlo ⇒ la franja se pinta como antes. */
  substitutionsByItem?: PlanSubstitutionsByItem
}) {
  const timeLabel = slot.startTime
    ? slot.endTime
      ? `${slot.startTime}–${slot.endTime}`
      : slot.startTime
    : null
  const subtotal = slot.prescriptionItems.reduce((sum, item) => sum + (item.macros.calories ?? 0), 0)
  const hasItems = slot.prescriptionItems.length > 0
  // Capa de porciones (P0-3): una franja puede prescribir SOLO porciones a elección; sin
  // esto la vista Plan la mostraba como "franja flexible sin alimentos prescritos".
  const hasPortions = (slot.exchangeTargets?.length ?? 0) > 0
  const targetChips =
    slot.targets.calories != null ||
    slot.targets.proteinG != null ||
    slot.targets.carbsG != null ||
    slot.targets.fatsG != null

  return (
    <div className="rounded-control border border-border-subtle bg-surface-sunken/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="font-display text-base font-semibold text-strong">{slot.name}</h4>
          {timeLabel ? <span className="font-mono text-xs text-muted">{timeLabel}</span> : null}
        </div>
        {hasItems && subtotal > 0 ? (
          <span className="font-mono text-xs font-semibold text-strong">{formatNutritionCalories(subtotal)}</span>
        ) : null}
      </div>
      {slot.instructions ? (
        <p className="mt-1 text-xs leading-5 text-subtle">{slot.instructions}</p>
      ) : null}
      {hasItems ? (
        <div className="mt-2 divide-y divide-border-subtle">
          {slot.prescriptionItems.map((item) => {
            // SUB-T10: los reemplazos ESTRUCTURADOS que el coach cargó en el builder. Sin ellos
            // (el caso de casi todo el catálogo vivo) la fila queda byte-idéntica a antes: la
            // guía sigue viviendo dentro de `NutritionFoodRow` y no se pinta nada más.
            const substitutions = substitutionsByItem[item.id] ?? NO_SUBSTITUTIONS
            const substitutionLine = describeItemSubstitutions({ substitutions })
            const guidance = describeItemGuidance(item, substitutions.length > 0)
            return (
              <div key={item.id}>
                <NutritionFoodRow
                  name={item.name ?? 'Alimento prescrito'}
                  detail={item.brand}
                  quantityLabel={`${formatItemQuantity({
                    quantity: item.quantity,
                    unit: item.unit,
                    householdLabel: item.householdLabel ?? null,
                    householdGrams: item.householdGrams ?? null,
                  })}${item.optional ? ' · opcional' : ''}`}
                  calories={item.macros.calories}
                  proteinG={item.macros.proteinG}
                  carbsG={item.macros.carbsG}
                  fatsG={item.macros.fatsG}
                  imageUrl={resolveFoodImageUrl(item.media ?? null, SUPABASE_BASE)}
                  category={item.category ?? undefined}
                  note={substitutionLine ? null : guidance}
                />
                {/* `pl-14` = miniatura (44 px) + gap (12 px): el renglón cuelga de la columna de
                    texto de la fila, igual que la afordancia ⇄ del "Hoy". El ⇄ es el MISMO
                    símbolo con el que el alumno cambia un alimento ese día, para que la opción
                    del plan y el gesto que la ejecuta se lean como lo mismo. */}
                {substitutionLine ? (
                  <div className="pb-3 pl-14">
                    <p className="text-[11px] leading-4 text-body">
                      <span aria-hidden="true">⇄ </span>
                      {substitutionLine}
                    </p>
                    {guidance ? <p className="mt-1 text-[11px] leading-4 text-subtle">{guidance}</p> : null}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      ) : targetChips ? (
        <div className="mt-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-subtle">Objetivo de la franja</p>
          <span className="mt-1 block">
            <MacroChipRow
              calories={slot.targets.calories}
              proteinG={slot.targets.proteinG}
              carbsG={slot.targets.carbsG}
              fatsG={slot.targets.fatsG}
              size="sm"
            />
          </span>
        </div>
      ) : null}
      {/* Porciones prescritas: se suman a los alimentos fijos o al objetivo de macros; el
          empty-state de abajo solo aparece cuando la franja no prescribe NADA. */}
      <PrescribedPortionChips className="mt-2" targets={slot.exchangeTargets} />
      {!hasItems && !targetChips && !hasPortions ? (
        <p className="mt-2 text-xs text-muted">Franja flexible sin alimentos prescritos.</p>
      ) : null}
    </div>
  )
}

/**
 * Nota de guía de un item prescrito: rango de cantidad ajustable + indicaciones del coach.
 *
 * `hasStructuredSubstitutions` (SUB-T10) calla el texto LEGADO "Alternativas: …" congelado en
 * `notes` cuando el item ya tiene reemplazos estructurados — si no, el alumno lee la misma lista
 * dos veces. Default `false` ⇒ comportamiento idéntico al de antes.
 */
export function describeItemGuidance(item: PlanItem, hasStructuredSubstitutions = false): string | null {
  const unit = item.unit
  const range =
    item.minimumQuantity != null && item.maximumQuantity != null
      ? `Ajustable entre ${formatNutritionAmount(item.minimumQuantity, unit)} y ${formatNutritionAmount(item.maximumQuantity, unit)}`
      : item.maximumQuantity != null
        ? `Hasta ${formatNutritionAmount(item.maximumQuantity, unit)}`
        : item.minimumQuantity != null
          ? `Desde ${formatNutritionAmount(item.minimumQuantity, unit)}`
          : null
  const note = resolveItemDisplayNote(item.notes, hasStructuredSubstitutions)
  return [range, note].filter(Boolean).join(' · ') || null
}
