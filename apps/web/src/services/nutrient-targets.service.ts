import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'

/**
 * Nutrient targets (feature A-base): umbrales por nutriente que el coach fija
 * para un alumno (o como default propio cuando `client_id` es null).
 *
 * Tabla `nutrient_targets`: piso / objetivo / techo por `nutrient_key`
 * (ej. 'protein_g', 'fiber_g', 'sodium_mg') con un `intent`:
 *   - 'aimup' → apuntar hacia arriba (floor/target relevantes)
 *   - 'cap'   → tope a no superar (ceiling relevante)
 *
 * Escritura coach-scoped: el `coach_id` SIEMPRE proviene de la sesión, nunca del
 * body. Las policies RLS hacen cumplir la pertenencia coach→cliente.
 */

export type NutrientTargetRow = Database['public']['Tables']['nutrient_targets']['Row']

export type NutrientIntent = 'aimup' | 'cap'

export type UpsertNutrientTargetInput = {
  /** Null = default del coach (no atado a un alumno). */
  clientId?: string | null
  nutrientKey: string
  floorValue?: number | null
  targetValue?: number | null
  ceilingValue?: number | null
  intent: NutrientIntent
  /** Origen del valor (ej. 'manual', 'preset:high_protein'). */
  provenance?: string | null
}

export class NutrientTargetsService {
  constructor(private supabase: SupabaseClient<Database>) {}

  /**
   * Inserta o actualiza un target por (coach_id, client_id, nutrient_key).
   * `coachId` proviene de la sesión del caller.
   */
  async upsertNutrientTarget(
    coachId: string,
    input: UpsertNutrientTargetInput
  ): Promise<NutrientTargetRow> {
    const clientId = input.clientId ?? null

    // Busca la fila viva para ese alcance (coach + client null-safe + nutriente).
    let existingQuery = this.supabase
      .from('nutrient_targets')
      .select('id')
      .eq('coach_id', coachId)
      .eq('nutrient_key', input.nutrientKey)
    existingQuery = clientId
      ? existingQuery.eq('client_id', clientId)
      : existingQuery.is('client_id', null)
    const { data: existing } = await existingQuery.maybeSingle()

    const payload = {
      coach_id: coachId,
      client_id: clientId,
      nutrient_key: input.nutrientKey,
      floor_value: input.floorValue ?? null,
      target_value: input.targetValue ?? null,
      ceiling_value: input.ceilingValue ?? null,
      intent: input.intent,
      provenance: input.provenance ?? null,
      updated_at: new Date().toISOString(),
    }

    if (existing?.id) {
      const { data, error } = await this.supabase
        .from('nutrient_targets')
        .update(payload)
        .eq('id', existing.id)
        .select('*')
        .single()
      if (error) throw new Error(error.message)
      return data
    }

    const { data, error } = await this.supabase
      .from('nutrient_targets')
      .insert(payload)
      .select('*')
      .single()
    if (error) throw new Error(error.message)
    return data
  }

  /**
   * Lista targets por coach y/o cliente.
   * - Con `clientId`: devuelve targets específicos del alumno + los defaults del
   *   coach (client_id null), permitiendo que la UI haga merge.
   * - Sin `clientId`: solo los defaults del coach.
   */
  async listNutrientTargets(
    coachId: string,
    clientId?: string | null
  ): Promise<NutrientTargetRow[]> {
    let query = this.supabase
      .from('nutrient_targets')
      .select('*')
      .eq('coach_id', coachId)

    if (clientId) {
      query = query.or(`client_id.eq.${clientId},client_id.is.null`)
    } else {
      query = query.is('client_id', null)
    }

    const { data, error } = await query.order('nutrient_key', { ascending: true })
    if (error) throw new Error(error.message)
    return data ?? []
  }
}
