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

  const { db, userId } = auth
  const row = { quantity: parsed.data.quantity, unit: parsed.data.unit, updated_at: new Date().toISOString() }

  try {
    // El `coach_id` sale del actor autenticado, nunca del payload. La RLS lo vuelve a exigir, y
    // el guard del insert ademas comprueba que el alumno sea propio y el alimento legible.
    await (db as unknown as {
      from: (table: string) => {
        upsert: (
          values: Record<string, unknown>[],
          options: { onConflict: string },
        ) => Promise<{ error: unknown }>
      }
    })
      .from('coach_food_last_qty')
      .upsert(
        [
          { coach_id: userId, food_id: parsed.data.foodId, client_id: parsed.data.clientId, ...row },
          { coach_id: userId, food_id: parsed.data.foodId, client_id: null, ...row },
        ],
        { onConflict: 'coach_id,food_id,client_id' },
      )
  } catch {
    // Silencio intencional: ver el docblock de arriba.
  }
}
