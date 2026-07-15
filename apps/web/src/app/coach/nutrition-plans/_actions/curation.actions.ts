'use server'

import type { SupabaseClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

const ResolveMissingCodeSchema = z.object({
  missingCodeId: z.guid(),
  resolvedFoodId: z.guid(),
})

/**
 * Vincula un GTIN escaneado sin match local con una fila del catalogo.
 * Antes esto se hacia con un UPDATE directo por PostgREST desde el cliente; ahora
 * pasa por el server client con el coach derivado de la sesion (getClaims => sub del JWT),
 * y RLS sigue siendo la frontera de autorizacion sobre food_catalog_missing_codes.
 */
export async function resolveMissingFoodCodeAction(
  raw: z.input<typeof ResolveMissingCodeSchema>,
): Promise<{ success: boolean; error?: string }> {
  const parsed = ResolveMissingCodeSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos invalidos.' }
  }

  const supabase = await createClient()
  const { data: claims } = await supabase.auth.getClaims()
  const coachId = claims?.claims?.sub as string | undefined
  if (!coachId) return { success: false, error: 'No autorizado' }

  const { data: coachRow } = await supabase
    .from('coaches')
    .select('id')
    .eq('id', coachId)
    .maybeSingle()
  if (!coachRow) return { success: false, error: 'No autorizado' }

  const { error } = await (supabase as unknown as SupabaseClient)
    .from('food_catalog_missing_codes')
    .update({
      resolved_food_id: parsed.data.resolvedFoodId,
      resolved_at: new Date().toISOString(),
    })
    .eq('id', parsed.data.missingCodeId)

  if (error) return { success: false, error: error.message }

  revalidatePath('/coach/nutrition-plans')
  return { success: true }
}
