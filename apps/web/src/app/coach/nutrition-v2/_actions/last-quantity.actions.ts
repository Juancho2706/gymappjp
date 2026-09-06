'use server'

import { z } from 'zod'
import { convertQuantityBetweenUnits, foodMagnitudeUnit, isHouseholdUnit } from '@eva/nutrition-v2'
import { authorizeCoach } from '@/app/coach/nutrition-v2/_actions/plan-persistence'

/**
 * Porcion pegajosa (T2.6 F4) — escritura de la ultima cantidad que el coach fijo.
 *
 * Se dispara al COMMIT del campo (blur), no en cada tecla: una fila por combinacion, no un log
 * de pulsaciones. Se escriben DOS memorias en el mismo gesto:
 *   · la del alumno  (`client_id` con valor) — "para Cata, 120 g";
 *   · la general del coach (`client_id` null) — "yo prescribo 120 g de esto".
 * La lectura prefiere la del alumno; la general es la que hace util el primer alimento que el
 * coach agrega a un alumno nuevo.
 *
 * BEST-EFFORT POR DISEÑO: es una comodidad para la proxima vez. Si falla, el coach no se entera
 * y nada se bloquea — jamas puede impedir editar o publicar un plan. Por eso devuelve `void` y
 * traga sus propios errores.
 */
const RememberInputSchema = z.object({
  clientId: z.string().uuid(),
  foodId: z.string().uuid(),
  // El campo del builder es texto libre; se valida y acota aca, no en la UI.
  quantity: z.coerce.number().finite().positive().max(9999),
  unit: z.enum(['g', 'ml', 'un']),
})

/**
 * La memoria vive en g/ml/un: el CHECK de `coach_food_last_qty` no admite `casera` y ampliarlo
 * obligaria a guardar tambien los gramos de la medida (o la memoria seria ambigua). Decision
 * R10/a10 de la auditoria W2.0: NO se amplia el dominio — se convierte a gramos aca, que es lo
 * unico que el proximo alta necesita. Sin gramaje utilizable no hay nada que recordar.
 * Espejo RN: `apps/mobile/lib/nutrition-v2-last-quantity.ts`.
 */
function toRememberableQuantity(input: {
  quantity: string
  unit: string
  servingUnit?: string | null
  householdGrams?: number | null
}): { quantity: string; unit: string } | null {
  if (!isHouseholdUnit(input.unit)) return { quantity: input.quantity, unit: input.unit }
  const grams = convertQuantityBetweenUnits({
    quantity: Number(String(input.quantity).trim()),
    from: input.unit,
    to: foodMagnitudeUnit(input.servingUnit),
    servingSize: null,
    householdGrams: input.householdGrams ?? null,
  })
  if (grams === null) return null
  return { quantity: String(grams), unit: foodMagnitudeUnit(input.servingUnit) }
}

export async function rememberFoodQuantityAction(input: {
  clientId: string
  foodId: string
  quantity: string
  unit: string
  /** `serving_unit` del alimento: decide si la medida casera se recuerda en g o en ml. */
  servingUnit?: string | null
  /** Gramos de la medida casera, para traducir `casera` antes de tocar el RPC (R10). */
  householdGrams?: number | null
}): Promise<void> {
  const rememberable = toRememberableQuantity(input)
  if (rememberable === null) return
  const parsed = RememberInputSchema.safeParse({ ...input, ...rememberable })
  if (!parsed.success) return

  /**
   * 🔴 Limiter LAXO a proposito, no el de escritura. Con `coach-write` —el cupo de publicar,
   * asignar y archivar— esta accion se comia la cuota del coach a fuerza de blurs: el QA en
   * preview lo mostro crudo, las primeras llamadas llegaban a la base y las siguientes se
   * frenaban en silencio. Recordar una cantidad no es una escritura de negocio: es una comodidad
   * de alta frecuencia, y jamas puede dejar al coach sin poder publicar su plan.
   */
  const auth = await authorizeCoach(parsed.data.clientId, 'catalog-search')
  if (!('ok' in auth) || !auth.ok) return

  const { db } = auth

  try {
    /**
     * 🔴 La escritura va por RPC guardada, NO por el upsert de PostgREST. Con upsert daba 403 en
     * LIVE (visto en `edge_logs` durante el QA en preview): PostgREST arma el `ON CONFLICT DO
     * UPDATE SET` con TODAS las columnas del payload —coach_id, food_id, client_id incluidas— y
     * esas no tienen grant de UPDATE a proposito, porque la identidad de la fila es inmutable
     * desde la app. El grant column-level que protege la tabla era justo lo que rechazaba la
     * escritura. La funcion resuelve el coach desde `auth.uid()` y comprueba adentro que el
     * alumno sea propio y el alimento legible.
     */
    await (
      db as unknown as {
        rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error: unknown }>
      }
    ).rpc('coach_food_last_qty_remember', {
      p_client_id: parsed.data.clientId,
      p_food_id: parsed.data.foodId,
      p_quantity: parsed.data.quantity,
      p_unit: parsed.data.unit,
    })
  } catch {
    // Silencio intencional: ver el docblock de arriba.
  }
}
