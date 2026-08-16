/**
 * Porcion pegajosa (T2.6 F4) en RN — la ultima cantidad que el coach fijo para cada alimento.
 *
 * Port del par web (`_data/last-quantity.data.ts` + `_actions/last-quantity.actions.ts`) sobre
 * las MISMAS dos RPC que ya viven en LIVE. Cerraba el hueco declarado en MOBILE_PARITY: las RPC
 * estaban, el `ADD_CATALOG_ITEM` compartido ya aceptaba `prefill`, y a RN le faltaba el camino
 * de datos.
 *
 * PRECEDENCIA (alumno > coach) se resuelve en SQL dentro de `coach_food_last_qty_for_client`
 * (`order by client_id nulls last` + `distinct on`); aca no se decide nada.
 *
 * SEGURIDAD: el coach NUNCA viaja como parametro — las dos funciones lo toman de `auth.uid()`.
 * La escritura va por RPC guardada y no por upsert: PostgREST arma el `ON CONFLICT DO UPDATE`
 * con las columnas de identidad, que a proposito no tienen grant de UPDATE (403 en LIVE, visto
 * en `edge_logs` durante el QA web).
 *
 * Todo es best-effort: sin memoria, el alta cae al `servingSize` del catalogo — el
 * comportamiento historico. Una comodidad de autoria jamas puede romper la pantalla.
 */

import type { NutritionV2WriteClient } from './nutrition-v2-builder'

/** Cantidad recordada, lista para precargar el campo del editor. */
export interface RememberedQuantity {
  quantity: string
  unit: 'g' | 'ml' | 'un'
}

/** Mapa `foodId -> cantidad recordada`. Vacio = todos los alimentos caen al catalogo. */
export type RememberedQuantities = Record<string, RememberedQuantity>

/**
 * Tope de filas: es una AYUDA de autoria y no puede costar el peso de miles de filas en un
 * telefono. Lo que queda afuera se precarga del catalogo, como siempre.
 */
const MAX_REMEMBERED = 500

/** El campo es texto: "150", no "150.00". */
function formatQuantity(value: number): string {
  if (!Number.isFinite(value)) return ''
  return String(Number(value.toFixed(2)))
}

export async function fetchRememberedQuantities(
  db: NutritionV2WriteClient,
  clientId: string,
): Promise<RememberedQuantities> {
  try {
    // Cast INLINE (gotcha del repo: extraerlo a una variable pierde el tipo): `database.types`
    // todavia no tiene la firma de esta RPC — deuda conocida del regen completo.
    const { data, error } = await (
      db as unknown as {
        rpc: (
          fn: string,
          args: Record<string, unknown>,
        ) => Promise<{
          data: Array<{ food_id: string; quantity: number; unit: string }> | null
          error: unknown
        }>
      }
    ).rpc('coach_food_last_qty_for_client', { p_client_id: clientId })

    if (error || !Array.isArray(data)) return {}

    const out: RememberedQuantities = {}
    for (const row of data.slice(0, MAX_REMEMBERED)) {
      if (row.unit !== 'g' && row.unit !== 'ml' && row.unit !== 'un') continue
      out[row.food_id] = { quantity: formatQuantity(row.quantity), unit: row.unit }
    }
    return out
  } catch {
    return {}
  }
}

/**
 * Recuerda la cantidad al fijarla (commit del campo). Fire-and-forget: si falla, la proxima
 * alta simplemente cae al catalogo y el coach no se entera de nada.
 */
export async function rememberFoodQuantity(
  db: NutritionV2WriteClient,
  input: { clientId: string; foodId: string; quantity: string; unit: string },
): Promise<void> {
  const quantity = Number(input.quantity.trim())
  if (!Number.isFinite(quantity) || quantity <= 0) return
  try {
    await (
      db as unknown as {
        rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error: unknown }>
      }
    ).rpc('coach_food_last_qty_remember', {
      p_client_id: input.clientId,
      p_food_id: input.foodId,
      p_quantity: quantity,
      p_unit: input.unit,
    })
  } catch {
    // Silencio intencional: ver el docblock del modulo.
  }
}
