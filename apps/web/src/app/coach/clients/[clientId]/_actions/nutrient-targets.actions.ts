'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import {
  NutrientTargetsService,
  type NutrientTargetRow,
} from '@/services/nutrient-targets.service'
import { hasModule } from '@/services/entitlements.service'

/**
 * Server actions del COACH para targets de nutrientes (feature A-base).
 * 'use server' → SOLO async functions exportadas.
 * El `coach_id` SIEMPRE proviene de la sesión (getClaims), nunca del body; las
 * policies RLS hacen cumplir la pertenencia coach↔alumno. Zod v4 server-side.
 */

const UpsertNutrientTargetSchema = z
  .object({
    clientId: z.string().min(1),
    nutrientKey: z.string().trim().min(1).max(64),
    floorValue: z.number().nonnegative().nullish(),
    targetValue: z.number().nonnegative().nullish(),
    ceilingValue: z.number().nonnegative().nullish(),
    intent: z.enum(['aimup', 'cap']),
    provenance: z.string().trim().max(120).nullish(),
  })
  .refine(
    (v) =>
      v.floorValue != null || v.targetValue != null || v.ceilingValue != null,
    { message: 'Define al menos un umbral (piso, meta o techo).' }
  )

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string }

/** Nutrientes avanzados gateados por "Nutrición Pro" (módulo nutrition_exchanges). */
const PRO_NUTRIENT_KEYS = new Set(['sugar_g', 'saturated_fat_g', 'unsaturated_fat_g'])

/**
 * Gate server-side (no confiar en la UI): los nutrientes avanzados solo se pueden
 * definir si el contexto del RECURSO del alumno tiene "Nutrición Pro" ON (team del
 * pool manda; si no, el coach dueño). Fail-closed. Los nutrientes base nunca se gatean.
 */
async function assertProNutrientAllowed(
  supabase: Awaited<ReturnType<typeof createClient>>,
  clientId: string,
  nutrientKey: string
): Promise<boolean> {
  if (!PRO_NUTRIENT_KEYS.has(nutrientKey)) return true
  const { data: row } = await supabase
    .from('clients')
    .select('team_id, org_id, coach_id')
    .eq('id', clientId)
    .maybeSingle()
  if (!row || row.org_id) return false
  const ctx = row.team_id ? { teamId: row.team_id } : { coachId: row.coach_id }
  return hasModule(supabase, 'nutrition_exchanges', ctx)
}

async function sessionCoachId(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<string | null> {
  const { data } = await supabase.auth.getClaims()
  return (data?.claims?.sub as string | undefined) ?? null
}

export async function upsertClientNutrientTarget(input: {
  clientId: string
  nutrientKey: string
  floorValue?: number | null
  targetValue?: number | null
  ceilingValue?: number | null
  intent: 'aimup' | 'cap'
  provenance?: string | null
}): Promise<ActionResult<NutrientTargetRow>> {
  const parsed = UpsertNutrientTargetSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' }
  }

  const supabase = await createClient()
  const coachId = await sessionCoachId(supabase)
  if (!coachId) return { ok: false, error: 'No autorizado.' }

  if (!(await assertProNutrientAllowed(supabase, parsed.data.clientId, parsed.data.nutrientKey))) {
    return { ok: false, error: 'Nutrición Pro requerida para este micronutriente.' }
  }

  const service = new NutrientTargetsService(supabase)
  try {
    const data = await service.upsertNutrientTarget(coachId, {
      clientId: parsed.data.clientId,
      nutrientKey: parsed.data.nutrientKey,
      floorValue: parsed.data.floorValue ?? null,
      targetValue: parsed.data.targetValue ?? null,
      ceilingValue: parsed.data.ceilingValue ?? null,
      intent: parsed.data.intent,
      provenance: parsed.data.provenance ?? 'manual',
    })
    revalidatePath(`/coach/clients/${parsed.data.clientId}`)
    return { ok: true, data }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'No se pudo guardar el umbral.',
    }
  }
}
