'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import {
  NutrientTargetsService,
  type NutrientTargetRow,
} from '@/services/nutrient-targets.service'

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
