'use server'

import { z } from 'zod'
import type { NutritionTodayReadModel } from '@eva/nutrition-v2'
import { getNutritionTodayV2ForWeb } from '@/services/nutrition-v2-read.service'
import {
  getCurrentStudentNutritionScope,
  getCurrentStudentNutritionSession,
} from '@/services/auth/current-student-nutrition.service'

/**
 * Read-model del Hoy FRESCO para el propio alumno, como server action de LECTURA.
 *
 * Existe porque las mutaciones del Hoy dejaron de llamar `router.refresh()`: un refresh del
 * router en vuelo que un click de navegación descarta deja al App Router con una promesa
 * huérfana y la pantalla no vuelve a navegar hasta recargar (familia de bugs abiertos de Next:
 * vercel/next.js#86055/#86151/#45830 — reproducido determinísticamente en el QA de T2.7 F4 con
 * "Retirar registro" → tab Historial muerto). La UI ahora reconcilia su estado base con ESTA
 * lectura, sin encolar ninguna acción del router.
 *
 * Autorización idéntica a `history.actions.ts`: sesión + `clientId` = `auth.uid()` + workspace
 * standalone/Team. Reusa el MISMO camino de lectura que la página (`get_nutrition_today_v2`);
 * `date` solo acepta el día que la pantalla ya muestra — el RPC igual valida su ventana.
 */

type Fail = { ok: false; error: string }

const TodaySchema = z.object({
  clientId: z.string().uuid(),
  date: z.string().date(),
})

export async function fetchNutritionTodayAction(
  input: unknown,
): Promise<{ ok: true; today: NutritionTodayReadModel } | Fail> {
  const parsed = TodaySchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Datos inválidos.' }
  const { clientId, date } = parsed.data

  const { user, hasClientRow } = await getCurrentStudentNutritionSession()
  if (!user || !hasClientRow) return { ok: false, error: 'Debes iniciar sesión.' }
  if (user.id !== clientId) return { ok: false, error: 'La cuenta no coincide.' }

  const scope = await getCurrentStudentNutritionScope(user.id)
  if (scope.orgId) return { ok: false, error: 'Esta experiencia aún no está disponible para Enterprise.' }

  const today = await getNutritionTodayV2ForWeb({ clientId, date })
  return { ok: true, today }
}
