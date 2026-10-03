'use server'

import { headers } from 'next/headers'
import { getTodayInSantiago } from '@/lib/date-utils'
import { pdfBrandFromProxyHeaders } from '@/lib/nutrition-pdf-brand'
import { resolveBrandLogoDataUrlServer } from '@/lib/nutrition-pdf-logo.server'
import {
  getCurrentStudentNutritionScope,
  getCurrentStudentNutritionSession,
} from '@/services/auth/current-student-nutrition.service'
import { getNutritionTodayV2ForWeb } from '@/services/nutrition-v2-read.service'
import type { PlanPdfAssetsResult } from '@/components/nutrition-v2/PlanPdfDownload'

/**
 * Lo que el PDF de la pauta V2 necesita del servidor en la pestaña Plan del ALUMNO: la marca de su
 * coach (headers del proxy, misma regla del layout y del PDF V1: marca propia en todos los planes,
 * sello en Free), el logo en dataURL y las equivalencias del read-model del día, que es la única
 * lectura de listas que el alumno tiene (security definer, ya resuelta por precedencia).
 *
 * El `clientId` sale de la sesión, nunca del payload. Los `groupIds` del cliente se ignoran: el
 * read-model ya trae solo los grupos del plan del alumno.
 */
export async function loadStudentPlanPdfAssetsAction(): Promise<PlanPdfAssetsResult> {
  const { user, hasClientRow } = await getCurrentStudentNutritionSession()
  if (!user || !hasClientRow) return { ok: false, error: 'Tu sesión expiró. Vuelve a entrar.' }
  const scope = await getCurrentStudentNutritionScope(user.id)
  if (scope.orgId) return { ok: false, error: 'Esta experiencia aún no está disponible para Enterprise.' }

  try {
    const h = await headers()
    const brand = pdfBrandFromProxyHeaders(h)
    const { iso: todayIso } = getTodayInSantiago()
    const [logoDataUrl, today] = await Promise.all([
      brand.poweredByEva ? Promise.resolve(null) : resolveBrandLogoDataUrlServer(h.get('x-coach-logo-url')),
      getNutritionTodayV2ForWeb({ clientId: user.id, date: todayIso }),
    ])
    const equivalences = (today.exchangeFoods ?? []).map((food) => ({
      exchangeGroupId: food.exchangeGroupId,
      name: food.name,
      brand: food.brand,
      portionLabel: food.portionLabel,
      portionGrams: food.portionGrams,
    }))
    return { ok: true, brand, logoDataUrl, equivalences, todayIso }
  } catch {
    return { ok: false, error: 'No pudimos preparar el PDF. Inténtalo de nuevo.' }
  }
}
