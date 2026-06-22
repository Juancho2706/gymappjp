// Zona C (coach) extras de la ficha del alumno — paridad MOBILE con la web:
//   · Editor de umbrales de micronutrientes (nutrient_targets) — espejo de CoachNutrientTargetsEditor.
//   · Restricciones alimentarias del alumno (client_food_preferences) — espejo de ClientFoodRestrictionsCard.
//   · Override por-alumno de Funciones (client_feature_prefs.sections) — espejo de ClientFeaturePrefsPanel.
//   · Intake completo del alumno (clients + client_intake) — espejo de EditClientDataModal.
//
// Todo via el cliente `supabase` con la sesión del coach (RLS coach-scoped). Service-role NUNCA en RN.
// Grants verificados (database.types / migraciones):
//   - nutrient_targets:        GRANT SELECT/INSERT/UPDATE/DELETE authenticated + RLS coach↔alumno (20260618180001)
//   - client_food_preferences: GRANT ALL authenticated + RLS "coach manage client prefs" (20260619120000)
//   - client_feature_prefs:    GRANT SELECT/INSERT/UPDATE/DELETE authenticated + RLS coach-owner/manager (20260618200000)
//   - clients (full_name/phone/goal_weight_kg/subscription_start_date): GRANT UPDATE de columna (20260612140001)
//   - client_intake:           RLS client_intake_coach FOR ALL (coach dueño) — el web upsertea con sesión coach.

import { supabase } from './supabase'

// ──────────────────────────────────────────────────────────────────────────────
// 1 · Umbrales de micronutrientes (editor) — espejo de CoachNutrientTargetsEditor
// ──────────────────────────────────────────────────────────────────────────────

export type NutrientIntent = 'aimup' | 'cap'

export interface NutrientDef {
  key: string
  label: string
  unit: string
  intent: NutrientIntent
  fields: ('floor' | 'target' | 'ceiling')[]
  hint: string
}

/** Catálogo base (A). Disponible para todos los coaches — espejo verbatim del web. */
export const BASE_NUTRIENTS: NutrientDef[] = [
  {
    key: 'sodium_mg',
    label: 'Sodio',
    unit: 'mg',
    intent: 'cap',
    fields: ['target', 'ceiling'],
    hint: 'Tope diario sugerido ~2300 mg. Define el techo a no superar.',
  },
  {
    key: 'fiber_g',
    label: 'Fibra',
    unit: 'g',
    intent: 'aimup',
    fields: ['floor', 'target'],
    hint: 'Meta diaria sugerida 25–30 g. Define el piso/meta a alcanzar.',
  },
]

/** Catálogo avanzado — solo cuando "Nutrición Pro" (nutrition_exchanges) está ON. */
export const PRO_NUTRIENTS: NutrientDef[] = [
  {
    key: 'sugar_g',
    label: 'Azúcar',
    unit: 'g',
    intent: 'cap',
    fields: ['target', 'ceiling'],
    hint: 'Tope diario sugerido < 50 g (azúcares añadidos). Define el techo a no superar.',
  },
  {
    key: 'saturated_fat_g',
    label: 'Grasa saturada',
    unit: 'g',
    intent: 'cap',
    fields: ['target', 'ceiling'],
    hint: 'Tope diario sugerido < 10% de las kcal. Define el techo a no superar.',
  },
  {
    key: 'unsaturated_fat_g',
    label: 'Grasa insaturada',
    unit: 'g',
    intent: 'aimup',
    fields: ['floor', 'target'],
    hint: 'Prioriza grasas insaturadas (mono/poli). Define el piso/meta a alcanzar.',
  },
]

/**
 * Upsert de un umbral de micronutriente para ESTE alumno. coach_id sale de la sesión;
 * RLS hace cumplir coach↔alumno. find-then-update/insert (índice único parcial por
 * (client_id, nutrient_key) — onConflict no aplica con WHERE parcial vía PostgREST).
 * Espejo de upsertClientNutrientTarget (nutrient-targets.actions del web).
 */
export async function upsertClientNutrientTarget(input: {
  clientId: string
  nutrientKey: string
  floorValue: number | null
  targetValue: number | null
  ceilingValue: number | null
  intent: NutrientIntent
}): Promise<{ ok: boolean; error?: string }> {
  const { data: auth } = await supabase.auth.getUser()
  const coachId = auth.user?.id
  if (!coachId) return { ok: false, error: 'No autorizado.' }

  const { data: existing } = await supabase
    .from('nutrient_targets')
    .select('id')
    .eq('client_id', input.clientId)
    .eq('nutrient_key', input.nutrientKey)
    .maybeSingle()

  const row = {
    client_id: input.clientId,
    coach_id: coachId,
    nutrient_key: input.nutrientKey,
    floor_value: input.floorValue,
    target_value: input.targetValue,
    ceiling_value: input.ceilingValue,
    intent: input.intent,
    provenance: 'manual',
  }

  if ((existing as any)?.id) {
    const { error } = await supabase
      .from('nutrient_targets')
      .update(row)
      .eq('id', (existing as any).id)
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  }
  const { error } = await supabase.from('nutrient_targets').insert(row)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// ──────────────────────────────────────────────────────────────────────────────
// 2 · Restricciones alimentarias — espejo de ClientFoodRestrictionsCard
// ──────────────────────────────────────────────────────────────────────────────

export type ClientFoodRestrictionType = 'dislike' | 'allergy' | 'intolerance'
export interface ClientFoodRestriction {
  food_id: string
  name: string
  preference_type: ClientFoodRestrictionType
}

/** Restricciones del alumno (dislike/allergy/intolerance) con nombre del alimento. RLS coach-scoped. */
export async function getClientFoodRestrictions(clientId: string): Promise<ClientFoodRestriction[]> {
  const { data, error } = await supabase
    .from('client_food_preferences')
    .select('food_id, preference_type, foods ( name )')
    .eq('client_id', clientId)
    .in('preference_type', ['dislike', 'allergy', 'intolerance'])
  if (error) return []
  return ((data as any[]) ?? []).map((r) => {
    const foods = Array.isArray(r.foods) ? r.foods[0] : r.foods
    return {
      food_id: String(r.food_id),
      name: foods?.name ?? 'Alimento',
      preference_type: r.preference_type as ClientFoodRestrictionType,
    }
  })
}

/** Setea/limpia una restricción (null = limpiar). Upsert por (client_id, food_id). RLS coach-scoped. */
export async function setClientFoodRestriction(input: {
  clientId: string
  foodId: string
  preferenceType: ClientFoodRestrictionType | null
}): Promise<{ ok: boolean; error?: string }> {
  if (input.preferenceType === null) {
    const { error } = await supabase
      .from('client_food_preferences')
      .delete()
      .eq('client_id', input.clientId)
      .eq('food_id', input.foodId)
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  }
  const { error } = await supabase
    .from('client_food_preferences')
    .upsert(
      { client_id: input.clientId, food_id: input.foodId, preference_type: input.preferenceType },
      { onConflict: 'client_id,food_id' }
    )
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// ──────────────────────────────────────────────────────────────────────────────
// 3 · Override por-alumno de Funciones — espejo de ClientFeaturePrefsPanel
// ──────────────────────────────────────────────────────────────────────────────

export type SectionPrefs = Partial<Record<string, boolean>>

/** Override crudo guardado en client_feature_prefs.sections (key ausente = heredar). */
export async function getClientFeaturePrefsOverride(
  clientId: string,
  domain = 'nutrition'
): Promise<SectionPrefs> {
  const { data, error } = await supabase
    .from('client_feature_prefs')
    .select('sections')
    .eq('client_id', clientId)
    .eq('domain', domain)
    .maybeSingle()
  if (error) return {}
  const sections = (data as any)?.sections
  return sections && typeof sections === 'object' && !Array.isArray(sections) ? (sections as SectionPrefs) : {}
}

/**
 * Persiste el override por-alumno (escribe SOLO client_feature_prefs.sections). NUNCA toca
 * enabled_modules ni borra datos. RLS coach-owner/manager. La preferencia SOLO achica.
 * Espejo de setClientFeaturePrefs (feature-prefs.actions del web).
 */
export async function setClientFeaturePrefsOverride(input: {
  clientId: string
  sections: SectionPrefs
  domain?: string
}): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('client_feature_prefs').upsert(
    {
      client_id: input.clientId,
      domain: input.domain ?? 'nutrition',
      sections: input.sections,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'client_id,domain' }
  )
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// ──────────────────────────────────────────────────────────────────────────────
// 4 · Intake completo del alumno — espejo de EditClientDataModal
// ──────────────────────────────────────────────────────────────────────────────

export interface ClientIntakeData {
  full_name: string
  phone: string | null
  weight_kg: number | null
  height_cm: number | null
  goals: string | null
  experience_level: string | null
  availability: string | null
  injuries: string | null
  medical_conditions: string | null
}

/** Lee el intake del alumno (clients + client_intake) bajo la sesión coach. RLS coach-scoped. */
export async function getClientIntake(clientId: string): Promise<{ data?: ClientIntakeData; error?: string }> {
  const { data, error } = await supabase
    .from('clients')
    .select(
      'full_name, phone, client_intake ( weight_kg, height_cm, goals, experience_level, availability, injuries, medical_conditions )'
    )
    .eq('id', clientId)
    .maybeSingle()
  if (error) return { error: error.message }
  if (!data) return { error: 'Alumno no encontrado.' }
  const intake = Array.isArray((data as any).client_intake)
    ? (data as any).client_intake[0]
    : (data as any).client_intake
  return {
    data: {
      full_name: (data as any).full_name,
      phone: (data as any).phone ?? null,
      weight_kg: intake?.weight_kg ?? null,
      height_cm: intake?.height_cm ?? null,
      goals: intake?.goals ?? null,
      experience_level: intake?.experience_level ?? null,
      availability: intake?.availability ?? null,
      injuries: intake?.injuries ?? null,
      medical_conditions: intake?.medical_conditions ?? null,
    },
  }
}

/**
 * Actualiza nombre/teléfono (clients) + upsert del intake (client_intake) bajo la sesión coach.
 * Espejo de updateClientDataAction del web (también escribe goal_weight_kg / subscription_start_date
 * cuando se proveen, para no perder los campos que ya editaba la ficha mobile).
 */
export async function updateClientIntake(input: {
  clientId: string
  full_name: string
  phone: string | null
  weight_kg: number | null
  height_cm: number | null
  goals: string | null
  experience_level: string | null
  availability: string | null
  injuries: string | null
  medical_conditions: string | null
  goal_weight_kg?: number | null
  subscription_start_date?: string | null
}): Promise<{ ok: boolean; error?: string }> {
  const clientPatch: Record<string, unknown> = {
    full_name: input.full_name,
    phone: input.phone || null,
  }
  if (input.goal_weight_kg !== undefined) clientPatch.goal_weight_kg = input.goal_weight_kg
  if (input.subscription_start_date !== undefined)
    clientPatch.subscription_start_date = input.subscription_start_date || null

  const { error: clientErr } = await supabase.from('clients').update(clientPatch).eq('id', input.clientId)
  if (clientErr) return { ok: false, error: clientErr.message }

  // El intake es NOT NULL en varias columnas; el web coacciona a 0/'' como default.
  const intakePayload = {
    client_id: input.clientId,
    weight_kg: input.weight_kg != null ? input.weight_kg : 0,
    height_cm: input.height_cm != null ? input.height_cm : 0,
    goals: input.goals || '',
    experience_level: input.experience_level || '',
    availability: input.availability || '',
    injuries: input.injuries || null,
    medical_conditions: input.medical_conditions || null,
  }
  const { error: intakeErr } = await supabase
    .from('client_intake')
    .upsert(intakePayload, { onConflict: 'client_id' })
  if (intakeErr) return { ok: false, error: intakeErr.message }
  return { ok: true }
}
