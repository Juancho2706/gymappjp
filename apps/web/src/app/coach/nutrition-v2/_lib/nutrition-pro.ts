import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { NutritionPlanDraft } from '@eva/nutrition-v2'
import type { WorkspaceSummary } from '@/domain/auth/types'
import type { Database } from '@/lib/database.types'
import { assertModule, hasModule } from '@/services/entitlements.service'

/**
 * Gating comercial del addon "Nutricion Pro" en Nutricion V2.
 *
 * El addon es el MISMO module key que V1 (`nutrition_exchanges`); el motor de
 * entitlements (`@/services/entitlements.service`) resuelve pool/team vs coach
 * standalone y el kill-switch de operador. Importar ese servicio NO viola el
 * boundary de V2: el guard (`scripts/check-nutrition-v2-boundaries.mjs`) solo
 * prohibe montar los shells V1 (NutritionShell/NutritionHub/PlanBuilder), no los
 * servicios de dominio.
 *
 * FRONTERA (decision CEO 2026-07-15):
 *   BASE (sin addon): strategy 'structured' | 'flexible', UNA variante de dia,
 *     visible_notes, registro del alumno, catalogo/scanner/ficha, hub, e historial
 *     del alumno limitado a ~30 dias para el coach.
 *   PRO (addon `nutrition_exchanges`): strategy 'hybrid'; MAS de una variante;
 *     private_notes; protocol_notes; historico clinico completo (>30 dias con la
 *     cadena de correcciones en la ficha coach).
 *
 * Regla de oro (heredada de V1): el servidor SIEMPRE re-valida el entitlement
 * (assertNutritionProV2 / requiredNutritionProFeature) antes de escribir. La UI
 * solo espeja el estado para mostrar/deshabilitar; nunca es la barrera.
 */

export const NUTRITION_PRO_MODULE_KEY = 'nutrition_exchanges' as const

/** Ventana de historial (dias) visible para el coach base, sin el addon Pro. */
export const NUTRITION_PRO_HISTORY_DAYS_BASE = 30

/** Ruta canonica de upgrade de plan (los modulos vienen incluidos en los planes pagos). */
export const NUTRITION_PRO_UPGRADE_HREF = '/coach/subscription'

/** Contexto de recurso para resolver el entitlement (pool manda; si no, el coach). */
export type NutritionProCtx = { coachId?: string | null; teamId?: string | null }

/** Capacidad Pro que dispara el gate de un draft, para el error tipado UPGRADE_REQUIRED. */
export type NutritionProFeature = 'hybrid_strategy' | 'multi_variant' | 'private_notes' | 'protocol_notes'

/** Copy corto por capacidad para el mensaje del coach (sin precio, anti-hostigamiento). */
export const NUTRITION_PRO_FEATURE_LABEL: Record<NutritionProFeature, string> = {
  hybrid_strategy: 'la estrategia hibrida',
  multi_variant: 'multiples variantes de dia',
  private_notes: 'las notas privadas',
  protocol_notes: 'el protocolo profesional',
}

function hasContent(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0
}

/**
 * PURA: devuelve la primera capacidad Pro que un draft requiere, o null si el draft
 * cae por completo dentro de BASE. Es el contrato del gate de `publishPlanAction`:
 * BASE puede publicar structured/flexible con UNA variante y sin notas privadas/protocolo.
 */
export function requiredNutritionProFeature(draft: NutritionPlanDraft): NutritionProFeature | null {
  if (draft.strategy === 'hybrid') return 'hybrid_strategy'
  if (draft.dayVariants.length > 1) return 'multi_variant'
  if (hasContent(draft.privateNotes)) return 'private_notes'
  if (hasContent(draft.protocolNotes)) return 'protocol_notes'
  return null
}

/** Resta `days` dias a una fecha ISO (YYYY-MM-DD) en UTC; el orden lexicografico = cronologico. */
function subtractIsoDays(isoDate: string, days: number): string {
  const parsed = new Date(`${isoDate}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return isoDate
  parsed.setUTCDate(parsed.getUTCDate() - days)
  return parsed.toISOString().slice(0, 10)
}

/**
 * PURA: recorta una lista de dias de historial a la ventana BASE (por defecto 30 dias
 * hasta `today`, inclusive). Se usa server-side POST-fetch porque los RPC de lectura
 * (`get_nutrition_client_detail_scoped_v2`) NO aceptan limite temporal: la barrera del
 * addon vive en la app, no en el RPC. Los ISO dates comparan lexicograficamente.
 */
export function filterHistoryDaysToBaseWindow<T extends { localDate: string }>(
  days: T[],
  today: string,
  windowDays: number = NUTRITION_PRO_HISTORY_DAYS_BASE,
): T[] {
  const cutoff = subtractIsoDays(today, windowDays)
  return days.filter((day) => day.localDate >= cutoff)
}

type EntitlementsDb = SupabaseClient<Database>

/** No-throw: para RSC/UI y para el recorte de historial server-side. Fail-closed (default false). */
export async function hasNutritionProV2(
  db: SupabaseClient,
  ctx: NutritionProCtx,
): Promise<boolean> {
  return hasModule(db as unknown as EntitlementsDb, NUTRITION_PRO_MODULE_KEY, ctx)
}

/** Throwing guard para el tope de una server action Pro (paridad con `assertModule` V1). */
export async function assertNutritionProV2(db: SupabaseClient, ctx: NutritionProCtx): Promise<void> {
  await assertModule(db as unknown as EntitlementsDb, NUTRITION_PRO_MODULE_KEY, ctx)
}

/**
 * Resuelve el contexto de entitlement desde el workspace activo del coach (RSC/actions):
 * pool/team => decide el team; standalone/enterprise => los modulos del propio coach
 * (paridad exacta con `requireNutritionPro` de guidance.actions V1).
 */
export function nutritionProCtxFromWorkspace(
  coachId: string,
  workspace: WorkspaceSummary | null,
): NutritionProCtx {
  const teamId = workspace?.type === 'coach_team' ? workspace.teamId : null
  return { coachId, teamId }
}
