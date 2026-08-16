import 'server-only'

import { createClient } from '@/lib/supabase/server'

/**
 * Porcion pegajosa (T2.6 F4) — la ultima cantidad que el coach fijo para cada alimento.
 *
 * Se resuelve SERVER-SIDE en la page y baja por props, igual que las señales dietarias del
 * picker (`client-food-prefs.data.ts`). La alternativa —una consulta por cada alimento que el
 * coach agrega— pondria un viaje de red en el gesto MAS repetido de la autoria, que es
 * exactamente lo que esta tanda vino a acelerar.
 *
 * PRECEDENCIA. `coach_food_last_qty` guarda dos clases de fila por alimento: la del alumno
 * (`client_id` con valor) y la general del coach (`client_id` null). Gana la del alumno. Se
 * resuelve en SQL con `order by client_id nulls last` + `distinct on`, no en TypeScript: traer
 * las dos y descartar una en la app seria pedir el doble de filas para tirar la mitad.
 *
 * `server-only`: nada de esto puede colarse al bundle del cliente.
 */

/** Cantidad recordada, ya lista para precargar el campo del builder. */
export interface RememberedQuantity {
  quantity: string
  unit: 'g' | 'ml' | 'un'
}

/** Mapa `foodId -> cantidad recordada`. Vacio = todos los alimentos caen al catalogo. */
export type RememberedQuantities = Record<string, RememberedQuantity>

/**
 * Tope de filas. Es una AYUDA de autoria: un coach con miles de alimentos usados no puede
 * pagar el peso de bajarlos todos al cliente. Con el tope alcanzado, los alimentos que quedan
 * afuera simplemente se precargan desde el catalogo, que es el comportamiento historico.
 */
const MAX_REMEMBERED = 500

export async function fetchRememberedQuantities(clientId: string): Promise<RememberedQuantities> {
  try {
    const db = await createClient()
    // El coach NO viaja como parametro: la RPC lo toma de `auth.uid()`. Confiar en un id que
    // manda la UI seria darle a cualquiera la memoria de autoria de otro coach.
    //
    // El cast es la deuda conocida del modulo: `database.types.ts` no tiene la firma de esta RPC
    // hasta el regen completo (13 errores en 7 archivos V1), asi que se tipa el retorno a mano —
    // mismo patron que el `V2ReadClient` de T1.1. El cast va INLINE a proposito (gotcha del repo:
    // extraerlo a una variable pierde el tipo).
    const { data, error } = await (
      db as unknown as {
        rpc: (
          fn: string,
          args: Record<string, unknown>,
        ) => Promise<{ data: Array<{ food_id: string; quantity: number; unit: string }> | null; error: unknown }>
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
    // Fail-soft a proposito: sin memoria el builder se comporta como siempre (catalogo). Nunca
    // puede tirar la pagina del coach por una comodidad.
    return {}
  }
}

/** El campo del builder es texto: "150", no "150.00". Se recorta el cero decimal inutil. */
function formatQuantity(value: number): string {
  if (!Number.isFinite(value)) return ''
  return String(Number(value.toFixed(2)))
}
