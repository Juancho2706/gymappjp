'use server'

import { z } from 'zod'
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

export async function rememberFoodQuantityAction(input: {
  clientId: string
  foodId: string
  quantity: string
  unit: string
}): Promise<void> {
  const parsed = RememberInputSchema.safeParse(input)
  if (!parsed.success) return

  const auth = await authorizeCoach(parsed.data.clientId)
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
