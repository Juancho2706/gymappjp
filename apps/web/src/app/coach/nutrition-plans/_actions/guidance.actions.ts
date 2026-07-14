'use server'

import type { SupabaseClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { resolvePreferredWorkspace } from '@/services/auth/workspace.service'
import { assertModule } from '@/services/entitlements.service'

const GuidanceSchema = z.object({
  planId: z.guid(),
  hydrationTargetMl: z.number().int().min(0).max(20000).nullable(),
  stepsTarget: z.number().int().min(0).max(100000).nullable(),
  sleepTargetHours: z.number().min(0).max(24).nullable(),
  fastingTargetHours: z.number().min(0).max(24).nullable(),
  supplementGuidance: z.array(z.string().trim().min(1).max(160)).max(30),
  protocolNotes: z.string().trim().max(8000).nullable(),
})

const GetGuidanceSchema = z.object({ planId: z.guid() })

export type NutritionPlanGuidance = {
  planId: string
  hydrationTargetMl: number | null
  stepsTarget: number | null
  sleepTargetHours: number | null
  fastingTargetHours: number | null
  supplementGuidance: string[]
  protocolNotes: string | null
}

type LooseClient = SupabaseClient

async function requireNutritionPro() {
  const supabase = await createClient()
  const { data: claims } = await supabase.auth.getClaims()
  const coachId = claims?.claims?.sub as string | undefined
  if (!coachId) throw new Error('No autorizado')
  const workspace = await resolvePreferredWorkspace(supabase, coachId)
  const teamId = workspace?.type === 'coach_team' ? workspace.teamId : null
  await assertModule(supabase, 'nutrition_exchanges', { coachId, teamId })
  return { supabase: supabase as unknown as LooseClient }
}

export async function getNutritionPlanGuidanceAction(
  input: z.input<typeof GetGuidanceSchema>,
): Promise<{ success: boolean; guidance?: NutritionPlanGuidance; error?: string }> {
  const parsed = GetGuidanceSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message }

  try {
    const { supabase } = await requireNutritionPro()
    const { data, error } = await supabase
      .from('nutrition_plans')
      .select('id, hydration_target_ml, steps_target, sleep_target_hours, fasting_target_hours, supplement_guidance, protocol_notes')
      .eq('id', parsed.data.planId)
      .maybeSingle()

    if (error || !data) {
      return { success: false, error: error?.message ?? 'Plan no encontrado o sin permiso.' }
    }

    return {
      success: true,
      guidance: {
        planId: String(data.id),
        hydrationTargetMl: data.hydration_target_ml == null ? null : Number(data.hydration_target_ml),
        stepsTarget: data.steps_target == null ? null : Number(data.steps_target),
        sleepTargetHours: data.sleep_target_hours == null ? null : Number(data.sleep_target_hours),
        fastingTargetHours: data.fasting_target_hours == null ? null : Number(data.fasting_target_hours),
        supplementGuidance: Array.isArray(data.supplement_guidance)
          ? data.supplement_guidance.map(String)
          : [],
        protocolNotes: data.protocol_notes == null ? null : String(data.protocol_notes),
      },
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo cargar el protocolo.'
    return {
      success: false,
      error: message.includes('Modulo no habilitado')
        ? 'Activa Nutrición Pro para configurar objetivos y protocolos.'
        : message,
    }
  }
}

export async function updateNutritionPlanGuidanceAction(
  input: z.input<typeof GuidanceSchema>,
): Promise<{ success: boolean; error?: string }> {
  const parsed = GuidanceSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues.map((issue) => issue.message).join('. ') }
  }

  try {
    const { supabase } = await requireNutritionPro()
    const { data, error } = await supabase
      .from('nutrition_plans')
      .update({
        hydration_target_ml: parsed.data.hydrationTargetMl,
        steps_target: parsed.data.stepsTarget,
        sleep_target_hours: parsed.data.sleepTargetHours,
        fasting_target_hours: parsed.data.fastingTargetHours,
        supplement_guidance: parsed.data.supplementGuidance,
        protocol_notes: parsed.data.protocolNotes,
        updated_at: new Date().toISOString(),
      })
      .eq('id', parsed.data.planId)
      .select('id')
      .maybeSingle()

    if (error || !data) {
      return { success: false, error: error?.message ?? 'Plan no encontrado o sin permiso.' }
    }

    revalidatePath('/coach/nutrition-plans')
    revalidatePath('/coach/clients')
    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo guardar el protocolo.'
    return {
      success: false,
      error: message.includes('Modulo no habilitado')
        ? 'Activa Nutrición Pro para configurar objetivos y protocolos.'
        : message,
    }
  }
}
