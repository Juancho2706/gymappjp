'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { NutritionNotesService, type MealCommentRow } from '@/services/nutrition-notes.service'

/**
 * Server action del ALUMNO: comentar en su propia bitácora (author_role='client').
 * 'use server' → SOLO async functions exportadas. clientId = uid de la sesión
 * (nunca del body); RLS refuerza que solo escriba en su hilo. Zod v4 server-side.
 */

const ClientMealCommentSchema = z
  .object({
    coachSlug: z.string().min(1),
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

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string }

export async function addClientMealComment(input: {
  coachSlug: string
  mealLogId?: string | null
  logDate?: string | null
  body: string
}): Promise<ActionResult<MealCommentRow>> {
  const parsed = ClientMealCommentSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' }

  const supabase = await createClient()
  const { data: __cl } = await supabase.auth.getClaims()
  const clientId = (__cl?.claims?.sub as string | undefined) ?? null
  if (!clientId) return { ok: false, error: 'No autorizado.' }

  const service = new NutritionNotesService(supabase)
  try {
    const data = await service.addMealComment({
      clientId,
      mealLogId: parsed.data.mealLogId ?? null,
      logDate: parsed.data.logDate ?? null,
      body: parsed.data.body,
      authorRole: 'client',
    })
    revalidatePath(`/c/${parsed.data.coachSlug}/nutrition`)
    return { ok: true, data }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo enviar el comentario.' }
  }
}
