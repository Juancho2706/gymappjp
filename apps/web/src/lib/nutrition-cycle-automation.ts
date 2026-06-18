import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/lib/database.types'
import { NutritionService } from '@/services/nutrition.service'
import { resolveNutritionCycleBlockForDate, type NutritionCycleBlock } from '@/lib/nutrition-plan-cycle-resolver'

type CycleRow = {
  id: string
  coach_id: string
  client_id: string
  start_date: string
  blocks: Json
  last_applied_week: number | null
  last_applied_template_id: string | null
}

function parseBlocks(raw: Json): NutritionCycleBlock[] {
  if (!Array.isArray(raw)) return []
  return raw.filter(
    (b): b is NutritionCycleBlock =>
      !!b &&
      typeof b === 'object' &&
      typeof (b as NutritionCycleBlock).template_id === 'string' &&
      typeof (b as NutritionCycleBlock).label === 'string' &&
      typeof (b as NutritionCycleBlock).week_start === 'number' &&
      typeof (b as NutritionCycleBlock).week_end === 'number'
  )
}

export async function runNutritionCyclesAutomation(
  supabase: SupabaseClient<Database>,
  todayIso: string
): Promise<{ scanned: number; applied: number; skipped: number }> {
  const { data: cycles } = await supabase
    .from('nutrition_plan_cycles')
    .select('id, coach_id, client_id, start_date, blocks, last_applied_week, last_applied_template_id')
    .eq('is_active', true)

  const rows = (cycles ?? []) as CycleRow[]
  let applied = 0
  let skipped = 0

  // El scope (org_id) NO vive en nutrition_plan_cycles -> leerlo del alumno. Sin esto,
  // propagateTemplateChanges recibe orgId=null y applyOrgScope fuerza is('org_id', null):
  // para un alumno ORG su plan activo (org_id set) NO matchea -> se trata como "cliente nuevo"
  // -> desactiva su plan y crea un plan_id nuevo (E1 violada + scope incorrecto). team/standalone
  // tienen org_id null, asi que null es correcto para ellos.
  const orgByClient = new Map<string, string | null>()
  const clientIds = [...new Set(rows.map((r) => r.client_id))]
  if (clientIds.length) {
    const { data: clientRows } = await supabase
      .from('clients')
      .select('id, org_id')
      .in('id', clientIds)
    for (const cr of clientRows ?? []) {
      orgByClient.set(cr.id as string, ((cr.org_id as string | null) ?? null))
    }
  }

  for (const c of rows) {
    const blocks = parseBlocks(c.blocks)
    const { weekIndex, block } = resolveNutritionCycleBlockForDate(c.start_date, blocks, todayIso)
    if (!block || weekIndex <= 0) {
      skipped++
      continue
    }
    if (c.last_applied_week === weekIndex && c.last_applied_template_id === block.template_id) {
      skipped++
      continue
    }
    const service = new NutritionService(supabase)
    const orgId = orgByClient.get(c.client_id) ?? null
    await service.propagateTemplateChanges(block.template_id, c.coach_id, JSON.stringify([c.client_id]), orgId)
    await supabase
      .from('nutrition_plan_cycles')
      .update({
        last_applied_week: weekIndex,
        last_applied_template_id: block.template_id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', c.id)
    applied++
  }

  return { scanned: rows.length, applied, skipped }
}

