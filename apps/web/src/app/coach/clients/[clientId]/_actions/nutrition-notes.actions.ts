'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import {
  NutritionNotesService,
  type MealCommentRow,
  type PrivateNoteRow,
} from '@/services/nutrition-notes.service'

/**
 * Server actions del COACH para notas de nutrición (feature E).
 * 'use server' → SOLO async functions exportadas.
 * - Comentario bidireccional (author_role='coach') sobre la bitácora del alumno.
 * - Notas privadas del coach (el alumno nunca las ve).
 * Zod v4 server-side; RLS hace cumplir coach↔alumno. coachId = uid de la sesión.
 */

const CoachMealCommentSchema = z
  .object({
    clientId: z.string().min(1),
    mealLogId: z.string().min(1).nullish(),
    logDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullish(),
    body: z.string().trim().min(1).max(2000),
  })
  .refine((v) => Boolean(v.mealLogId) || Boolean(v.logDate), {
    message: 'Se requiere mealLogId o logDate.',
  })

const PrivateNoteSchema = z.object({
  clientId: z.string().min(1),
  body: z.string().trim().min(1).max(5000),
})

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string }

async function sessionCoachId(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<string | null> {
  const { data } = await supabase.auth.getClaims()
  return (data?.claims?.sub as string | undefined) ?? null
}

export async function addCoachMealComment(input: {
  clientId: string
  mealLogId?: string | null
  logDate?: string | null
  body: string
}): Promise<ActionResult<MealCommentRow>> {
  const parsed = CoachMealCommentSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' }

  const supabase = await createClient()
  const service = new NutritionNotesService(supabase)
  try {
    const data = await service.addMealComment({
      clientId: parsed.data.clientId,
      mealLogId: parsed.data.mealLogId ?? null,
      logDate: parsed.data.logDate ?? null,
      body: parsed.data.body,
      authorRole: 'coach',
    })
    revalidatePath(`/coach/clients/${parsed.data.clientId}`)
    return { ok: true, data }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo guardar el comentario.' }
  }
}

export async function upsertCoachPrivateNote(input: {
  clientId: string
  body: string
}): Promise<ActionResult<PrivateNoteRow>> {
  const parsed = PrivateNoteSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' }

  const supabase = await createClient()
  const coachId = await sessionCoachId(supabase)
  if (!coachId) return { ok: false, error: 'No autorizado.' }

  const service = new NutritionNotesService(supabase)
  try {
    const data = await service.upsertPrivateNote(coachId, parsed.data.clientId, parsed.data.body)
    revalidatePath(`/coach/clients/${parsed.data.clientId}`)
    return { ok: true, data }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo guardar la nota.' }
  }
}
