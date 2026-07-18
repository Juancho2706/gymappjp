#!/usr/bin/env tsx
/**
 * Conversion dark V1 -> V2 (driver / I/O). Lee el arbol de un plan de nutricion V1
 * (nutrition_plans -> nutrition_meals -> food_items -> foods), lo mapea con el modulo
 * PURO `@eva/nutrition-v2/conversion`, escribe las filas V2 con service-role espejando
 * `persistAndPublishDraft`, publica por el RPC canonico impersonando al coach dueño
 * (wrapper `public.nutrition_v2_convert_publish`) e inscribe el link de trazabilidad.
 *
 * Reglas cerradas: specs/nutrition-v2-conversion/SPEC.md. Arquitectura: PLAN.md fase 3.
 *
 * SEGURIDAD:
 *  - service-role SOLO vive aca (script offline); jamas en apps/. Nunca se loguea la key.
 *  - `--dry-run` es el DEFAULT: no escribe NADA. `--apply` es explicito y ademas exige
 *    el env NUTRITION_V2_CONVERT_CONFIRM='yes' (doble gate, como los seeds del repo).
 *  - El publish pasa por el wrapper que valida `can_manage_client` ANTES de impersonar;
 *    el flag fail-closed de rollout mantiene lo escrito invisible para alumnos/coaches.
 *
 * Uso (PowerShell):
 *   # Dry-run (default, no escribe): reporte MD+JSON en ./tmp/nutrition-v2-conversion
 *   node --import tsx scripts/nutrition-v2-conversion/convert-v1-plans.ts
 *   node --import tsx scripts/nutrition-v2-conversion/convert-v1-plans.ts --coach josefit
 *   # Orden de corrida (SPEC R7: Alan y ali de jotap primero) — ids de CLIENTE V1, no de plan:
 *   node --import tsx scripts/nutrition-v2-conversion/convert-v1-plans.ts --priority <alanClientId>,<aliClientId>
 *   # Apply (escribe en dark):
 *   $env:NUTRITION_V2_CONVERT_CONFIRM='yes'; node --import tsx scripts/nutrition-v2-conversion/convert-v1-plans.ts --apply
 *
 * Flags: --dry-run (default) | --apply | --coach <slug> | --out <dir> | --priority <id1,id2,...>
 *        | --allow-unmapped-exchanges
 *
 * Porciones (planes `exchanges`, SPEC R7/T3.2) — gate fail-closed:
 *   Si un plan tiene targets de porciones no mapeables (`fidelity.unmappedExchangeTargets`:
 *   grupo/base sin resolver o fuera de la grilla 0,5), el driver NO lo aplica por default
 *   (outcome `blocked_unmapped` en apply, `would_block_unmapped` en dry-run). El reporte
 *   MD+JSON siempre lista el desglose por comida/grupo (porciones-in V1 vs mapeadas), sin
 *   inventar el dato faltante. `--allow-unmapped-exchanges` es el override EXPLICITO y
 *   documentado (SPEC/T3.2): permite escribir el resto del plan a sabiendas de que esos
 *   targets puntuales quedan fuera — usar solo tras revision manual del reporte.
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (apps/web/.env.local o .env.local).
 * IDEMPOTENTE: re-ejecutar sin cambios en V1 = no-op (link + publish_idempotency_key).
 * Re-sync: si nutrition_plans.updated_at avanzo, genera nueva version V2 (supersede del RPC).
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { mkdirSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  mapV1PlanToV2Conversion,
  type ConversionBundle,
  type ConversionExchangeGroup,
  type ConversionFidelity,
  type V1FoodItemRow,
  type V1MealExchangeTargetRow,
  type V1MealRow,
  type V1PlanRow,
  type V1PlanTree,
} from '@eva/nutrition-v2/conversion'
import {
  buildGroupLookup,
  declaredPortionsByGroupCode,
  isFailClosedBlocked,
  mealExchangeBreakdown,
  parsePriorityIds,
  renderGroupComparisonLine,
  renderMealExchangeTable,
  reorderByPriority,
  type MealExchangeTargetView,
} from './report.ts'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
config({ path: resolve(__dirname, '../../apps/web/.env.local') })
config({ path: resolve(__dirname, '../../.env.local'), override: false })

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function flagValue(name: string): string | undefined {
  const idx = process.argv.indexOf(name)
  if (idx === -1) return undefined
  const value = process.argv[idx + 1]
  if (!value || value.startsWith('--')) return undefined
  return value
}

const APPLY = process.argv.includes('--apply')
const DRY_RUN = !APPLY // dry-run es el default
const COACH_SLUG = flagValue('--coach') ?? null
const OUT_DIR = flagValue('--out') ?? resolve(__dirname, '../../tmp/nutrition-v2-conversion')
// Orden de corrida parametrizable (SPEC R7: Alan y ali de jotap primero) — ids de client_id V1.
const PRIORITY_CLIENT_IDS = parsePriorityIds(flagValue('--priority'))
// Override EXPLICITO y documentado del gate fail-closed de porciones no mapeables (T3.2).
const ALLOW_UNMAPPED_EXCHANGES = process.argv.includes('--allow-unmapped-exchanges')

/** Fecha local de Santiago (YYYY-MM-DD) del dia de la corrida. */
function santiagoToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date())
}

function epochOf(iso: string): number {
  return Math.floor(Date.parse(iso) / 1000)
}

// ---------------------------------------------------------------------------
// Tipos del reporte
// ---------------------------------------------------------------------------

type PlanOutcome =
  | 'converted' // nuevo plan V2 publicado (apply)
  | 'resynced' // nueva version por drift de updated_at (apply)
  | 'noop' // link vigente sin cambios (idempotente)
  | 'would_convert' // dry-run: se convertiria (nuevo)
  | 'would_resync' // dry-run: se re-sincronizaria
  | 'blocked_unmapped' // apply: gate fail-closed — targets de porciones no mapeables, NO se escribio (T3.2)
  | 'would_block_unmapped' // dry-run: idem, se bloquearia si se corriera --apply asi
  | 'skipped' // fuera de alcance / anomalia de datos
  | 'error' // fallo de escritura

type PlanReport = {
  v1PlanId: string
  clientId: string
  coachId: string
  coachSlug: string | null
  planName: string
  outcome: PlanOutcome
  reason?: string
  detail?: string
  idempotencyKey?: string
  v2PlanId?: string
  v2VersionId?: string
  fidelity?: ConversionFidelity
  /** Desglose por comida/grupo de los targets de porciones DECLARADOS en V1 (T3.2, criterio 9). */
  exchangeBreakdown?: MealExchangeTargetView[]
}

// ---------------------------------------------------------------------------
// Lectura del arbol V1
// ---------------------------------------------------------------------------

type RawExchangeTarget = {
  id: string
  exchange_group_id: string
  portions: number | string
  notes: string | null
}
type RawPlan = V1PlanRow & { is_active: boolean; meals: RawMeal[] | null }
type RawMeal = V1MealRow & { items: V1FoodItemRow[] | null; exchange_targets: RawExchangeTarget[] | null }

const PLAN_SELECT = `
  id, client_id, coach_id, org_id, name, plan_mode,
  daily_calories, protein_g, carbs_g, fats_g, instructions, updated_at, is_active,
  hydration_target_ml, steps_target, sleep_target_hours, fasting_target_hours,
  supplement_guidance, protocol_notes,
  meals:nutrition_meals (
    id, name, description, order_index, day_of_week,
    items:food_items (
      id, food_id, quantity, unit, swap_options,
      food:foods ( id, name, calories, protein_g, carbs_g, fats_g, fiber_g, serving_size, serving_unit )
    ),
    exchange_targets:meal_exchange_targets ( id, exchange_group_id, portions, notes )
  )
`

function toTree(raw: RawPlan): V1PlanTree {
  const meals: V1MealRow[] = (raw.meals ?? []).map((m) => ({
    id: m.id,
    name: m.name,
    description: m.description,
    order_index: m.order_index,
    day_of_week: m.day_of_week,
    items: (m.items ?? []).map((it) => ({
      id: it.id,
      food_id: it.food_id,
      quantity: it.quantity,
      unit: it.unit,
      swap_options: it.swap_options,
      food: it.food ?? null,
    })),
    // Porciones (R7): targets por comida embebidos, ordenados por id para un order_index
    // determinista entre corridas (meal_exchange_targets no tiene columna de orden).
    exchangeTargets: (m.exchange_targets ?? [])
      .slice()
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(
        (t): V1MealExchangeTargetRow => ({
          id: t.id,
          exchange_group_id: t.exchange_group_id,
          portions: Number(t.portions),
          notes: t.notes,
        }),
      ),
  }))
  return {
    plan: {
      id: raw.id,
      client_id: raw.client_id,
      coach_id: raw.coach_id,
      org_id: raw.org_id ?? null,
      // nutrition_plans V1 NO tiene team_id (verificado contra prod); el scope de
      // team en V2 se resuelve por can_manage_client, no por esta columna.
      team_id: null,
      name: raw.name,
      plan_mode: raw.plan_mode,
      daily_calories: raw.daily_calories,
      protein_g: raw.protein_g,
      carbs_g: raw.carbs_g,
      fats_g: raw.fats_g,
      instructions: raw.instructions,
      updated_at: raw.updated_at,
      hydration_target_ml: raw.hydration_target_ml ?? null,
      steps_target: raw.steps_target ?? null,
      sleep_target_hours: raw.sleep_target_hours ?? null,
      fasting_target_hours: raw.fasting_target_hours ?? null,
      supplement_guidance: raw.supplement_guidance ?? null,
      protocol_notes: raw.protocol_notes ?? null,
    },
    meals,
  }
}

// ---------------------------------------------------------------------------
// Catalogo de grupos de intercambio (plumbing de grupos al mapper PURO — hallazgo B6)
// ---------------------------------------------------------------------------

type RawExchangeGroup = {
  id: string
  code: string
  name: string
  ref_calories: number | string
  ref_protein_g: number | string
  ref_carbs_g: number | string
  ref_fats_g: number | string
  composed_of: unknown
  macros_confirmed: boolean
  is_system: boolean
}

/** Parsea composed_of jsonb -> [{code, portions}] | null (forma cruda, sin ref). */
function parseComposedOf(raw: unknown): Array<{ code: string; portions: number }> | null {
  if (!Array.isArray(raw) || raw.length === 0) return null
  const parts: Array<{ code: string; portions: number }> = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const code = (entry as Record<string, unknown>).code
    const portions = Number((entry as Record<string, unknown>).portions)
    if (typeof code === 'string' && code.trim() !== '' && Number.isFinite(portions) && portions > 0) {
      parts.push({ code: code.trim(), portions })
    }
  }
  return parts.length > 0 ? parts : null
}

/**
 * Carga TODOS los grupos de intercambio (system + custom de cualquier coach). Se cargan
 * incluso los soft-borrados (deleted_at): un plan viejo puede referenciar un grupo que el
 * builder ya no ofrece y el freeze debe resolverlo por id igual (hallazgo B5). El mapper es
 * PURO: recibe este catalogo por `opts.exchangeGroups` y resuelve por id sin tocar la DB.
 */
async function loadExchangeGroups(db: SupabaseClient): Promise<ConversionExchangeGroup[]> {
  const { data, error } = await db
    .from('exchange_groups')
    .select('id, code, name, ref_calories, ref_protein_g, ref_carbs_g, ref_fats_g, composed_of, macros_confirmed, is_system')
  if (error) throw new Error(`load exchange_groups: ${error.message}`)
  return ((data ?? []) as RawExchangeGroup[]).map((g) => ({
    id: g.id,
    code: g.code,
    name: g.name,
    refCalories: Number(g.ref_calories),
    refProteinG: Number(g.ref_protein_g),
    refCarbsG: Number(g.ref_carbs_g),
    refFatsG: Number(g.ref_fats_g),
    composedOf: parseComposedOf(g.composed_of),
    macrosConfirmed: g.macros_confirmed,
    isSystem: g.is_system,
  }))
}

// ---------------------------------------------------------------------------
// Escritura V2 (service-role) — espejo del orden de persistAndPublishDraft
// ---------------------------------------------------------------------------

async function insertRows(db: SupabaseClient, table: string, rows: Record<string, unknown>[]): Promise<void> {
  if (rows.length === 0) return
  const { error } = await db.from(table).insert(rows)
  if (error) throw new Error(`insert ${table}: ${error.message}`)
}

/**
 * Escribe plan(opcional)/version/variantes/franjas/items con service-role y publica por
 * el wrapper impersonador. Devuelve el version_id publicado.
 */
async function persistAndPublish(
  db: SupabaseClient,
  bundle: ConversionBundle,
  actorCoachId: string,
  v2PlanId: string,
  effectiveFrom: string,
): Promise<string> {
  if (bundle.planRow) await insertRows(db, 'nutrition_plans_v2', [bundle.planRow])
  await insertRows(db, 'nutrition_plan_versions_v2', [bundle.versionRow])
  await insertRows(db, 'nutrition_day_variants_v2', bundle.variantRows)
  await insertRows(db, 'nutrition_meal_slots_v2', bundle.slotRows)
  await insertRows(db, 'nutrition_prescription_items_v2', bundle.itemRows)
  // Targets de porciones DESPUES de los slots (FK compuesta meal_slot_id+version_id) y
  // ANTES de publicar. Snapshot ENRIQUECIDO ya congelado por el mapper (R7).
  await insertRows(db, 'nutrition_slot_exchange_targets_v2', bundle.exchangeTargetRows)

  const { data, error } = await db.rpc('nutrition_v2_convert_publish', {
    p_actor: actorCoachId,
    p_plan_id: v2PlanId,
    p_version_id: bundle.versionRow.id as string,
    p_effective_from: effectiveFrom,
    p_idempotency_key: bundle.idempotencyKey,
  })
  if (error) throw new Error(`publish wrapper: ${error.message}`)
  const publishedVersionId = (data as { version_id?: string } | null)?.version_id
  if (!publishedVersionId) throw new Error('publish wrapper: respuesta sin version_id')
  return publishedVersionId
}

// ---------------------------------------------------------------------------
// Estado auxiliar (links + V2 activos por cliente)
// ---------------------------------------------------------------------------

type ExistingLink = {
  id: string
  v1_plan_id: string
  v2_plan_id: string
  last_synced_v1_updated_at: string
}

async function loadLinks(db: SupabaseClient): Promise<Map<string, ExistingLink>> {
  const { data, error } = await db
    .from('nutrition_v2_conversion_links')
    .select('id, v1_plan_id, v2_plan_id, last_synced_v1_updated_at')
  if (error) throw new Error(`load links: ${error.message}`)
  const byV1 = new Map<string, ExistingLink>()
  for (const row of (data ?? []) as ExistingLink[]) byV1.set(row.v1_plan_id, row)
  return byV1
}

/** Clientes que YA tienen un plan V2 activo (canary josefit): fuente de verdad ahi. */
async function loadClientsWithActiveV2(db: SupabaseClient): Promise<Set<string>> {
  const { data, error } = await db
    .from('nutrition_plans_v2')
    .select('client_id')
    .eq('lifecycle_status', 'active')
    .not('current_published_version_id', 'is', null)
  if (error) throw new Error(`load active v2: ${error.message}`)
  const set = new Set<string>()
  for (const row of (data ?? []) as { client_id: string }[]) set.add(row.client_id)
  return set
}

/** Recupera una version ya publicada por su idempotency key (robustez ante reintentos). */
async function findVersionByKey(
  db: SupabaseClient,
  key: string,
): Promise<{ id: string; plan_id: string } | null> {
  const { data, error } = await db
    .from('nutrition_plan_versions_v2')
    .select('id, plan_id')
    .eq('publish_idempotency_key', key)
    .maybeSingle()
  if (error) throw new Error(`lookup key: ${error.message}`)
  return (data as { id: string; plan_id: string } | null) ?? null
}

/**
 * effective_from (DATE) de la version vigente del plan V2. El RPC de publish exige que la
 * nueva effective_from sea ESTRICTAMENTE mayor (granularidad DATE): si la vigente ya es de
 * hoy, un re-sync hoy fallaria con nutrition_v2_effective_date_must_follow_current_version.
 */
async function currentPublishedEffectiveFrom(db: SupabaseClient, v2PlanId: string): Promise<string | null> {
  const { data, error } = await db
    .from('nutrition_plan_versions_v2')
    .select('effective_from')
    .eq('plan_id', v2PlanId)
    .eq('status', 'published')
    .is('effective_to', null)
    .maybeSingle()
  if (error) throw new Error(`current effective_from: ${error.message}`)
  return (data as { effective_from: string | null } | null)?.effective_from ?? null
}

/**
 * Limpia el draft recien insertado cuando el publish falla, para no dejar huerfanos
 * invisibles (version/variantes/franjas/items). Borrar la version cascada a sus hijos
 * (FKs on delete cascade en la migracion del dominio V2). Guardas: solo toca versiones en
 * 'draft' (jamas una publicada) y solo borra el plan nuevo si quedo sin versiones y sin
 * puntero de version publicada. Best-effort: no re-lanza (el error real de escritura se
 * reporta por el catch externo).
 */
async function cleanupFailedDraft(db: SupabaseClient, versionId: string, newPlanId: string | null): Promise<void> {
  try {
    await db.from('nutrition_plan_versions_v2').delete().eq('id', versionId).eq('status', 'draft')
    if (newPlanId) {
      const { data } = await db
        .from('nutrition_plan_versions_v2')
        .select('id')
        .eq('plan_id', newPlanId)
        .limit(1)
      if (!data || data.length === 0) {
        await db
          .from('nutrition_plans_v2')
          .delete()
          .eq('id', newPlanId)
          .is('current_published_version_id', null)
      }
    }
  } catch {
    // Best-effort: no enmascarar el error original de escritura.
  }
}

async function nextVersionNumber(db: SupabaseClient, v2PlanId: string): Promise<number> {
  const { data, error } = await db
    .from('nutrition_plan_versions_v2')
    .select('version_number')
    .eq('plan_id', v2PlanId)
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`next version: ${error.message}`)
  return ((data as { version_number: number } | null)?.version_number ?? 0) + 1
}

async function upsertLink(
  db: SupabaseClient,
  input: {
    existingLinkId: string | null
    v1PlanId: string
    v2PlanId: string
    v2VersionId: string
    coachId: string
    clientId: string
    lastSynced: string
    status: 'converted' | 'resynced'
    fidelity: ConversionFidelity
  },
): Promise<void> {
  if (input.existingLinkId) {
    const { error } = await db
      .from('nutrition_v2_conversion_links')
      .update({
        v2_version_id: input.v2VersionId,
        last_synced_v1_updated_at: input.lastSynced,
        status: input.status,
        fidelity: input.fidelity,
      })
      .eq('id', input.existingLinkId)
    if (error) throw new Error(`update link: ${error.message}`)
    return
  }
  const { error } = await db.from('nutrition_v2_conversion_links').insert({
    id: randomUUID(),
    v1_plan_id: input.v1PlanId,
    v2_plan_id: input.v2PlanId,
    v2_version_id: input.v2VersionId,
    coach_id: input.coachId,
    client_id: input.clientId,
    last_synced_v1_updated_at: input.lastSynced,
    status: input.status,
    fidelity: input.fidelity,
  })
  if (error) throw new Error(`insert link: ${error.message}`)
}

// ---------------------------------------------------------------------------
// Reporte
// ---------------------------------------------------------------------------

function macroLine(f: ConversionFidelity): string {
  const v1 = f.v1Totals
  const v2 = f.v2Totals
  // 'consistente' = el cross-check de materializacion (v1Totals suma la fuente, v2Totals los
  // items deduplicados del fan-out) cuadra. NO es un read-back de la DB: ambos derivan del
  // mismo snapshotItemMacros, asi que solo detecta bugs de materializacion/dedup, no lo que
  // realmente quedo escrito en V2 (eso lo cubren los CHECK al insertar + el test de paridad).
  const match =
    v1.calories === v2.calories && v1.proteinG === v2.proteinG && v1.carbsG === v2.carbsG && v1.fatsG === v2.fatsG
  return `V1 ${v1.calories}kcal / V2 ${v2.calories}kcal ${match ? 'consistente' : 'DRIFT'} · comidas ${f.mealCount} · slots ${f.slotCount} · items ${f.itemCount}`
}

/** Metadata de la corrida, ecoada en el header del reporte para trazabilidad (T3.2). */
type RunMeta = {
  priorityClientIds: string[]
  allowUnmappedExchanges: boolean
}

/** Linea de porciones (R7): estrategia + conteo + Σ macros derivados, cuando el plan las trae. */
function exchangeSummaryLine(f: ConversionFidelity): string | null {
  if (f.exchangeTargetCount === 0 && f.unmappedExchangeTargets.length === 0) return null
  const d = f.exchangeDerivedMacros
  return `porciones: estrategia ${f.strategy} · ${f.exchangeTargetCount} target(s) mapeados · derivado ${d.calories}kcal/${d.proteinG}P/${d.carbsG}C/${d.fatsG}G · ${f.unmappedExchangeTargets.length} no mapeable(s)`
}

function buildMarkdown(reports: PlanReport[], mode: string, effectiveFrom: string, meta: RunMeta): string {
  const byCoach = new Map<string, PlanReport[]>()
  for (const r of reports) {
    const key = r.coachSlug ?? r.coachId
    const list = byCoach.get(key) ?? []
    list.push(r)
    byCoach.set(key, list)
  }
  const counts = reports.reduce<Record<string, number>>((acc, r) => {
    acc[r.outcome] = (acc[r.outcome] ?? 0) + 1
    return acc
  }, {})

  const lines: string[] = []
  lines.push(`# Conversion nutricion V1 -> V2 — ${mode}`)
  lines.push('')
  lines.push(`- Fecha de corrida (Santiago): ${effectiveFrom}`)
  lines.push(`- Planes evaluados: ${reports.length}`)
  lines.push(`- Resumen: ${Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(' · ') || '—'}`)
  lines.push(
    `- Orden de corrida (--priority): ${meta.priorityClientIds.length > 0 ? meta.priorityClientIds.join(', ') : '(sin priorizar, orden natural)'}`,
  )
  lines.push(
    `- Gate fail-closed de porciones no mapeables: ${meta.allowUnmappedExchanges ? 'DESACTIVADO por --allow-unmapped-exchanges (override explicito — revisar el desglose de cada plan igual)' : 'activo (default) — un plan con targets no mapeables NO se aplica'}`,
  )
  if ((counts.blocked_unmapped ?? 0) > 0 || (counts.would_block_unmapped ?? 0) > 0) {
    lines.push(
      `- **ATENCION**: ${(counts.blocked_unmapped ?? 0) + (counts.would_block_unmapped ?? 0)} plan(es) con targets de porciones no mapeables — ver desglose por comida/grupo abajo antes de decidir override o correccion manual en V1.`,
    )
  }
  lines.push('')
  for (const [coach, list] of Array.from(byCoach.entries()).sort()) {
    lines.push(`## Coach ${coach}`)
    lines.push('')
    lines.push('| Plan | Alumno | Resultado | Fidelidad / motivo |')
    lines.push('| --- | --- | --- | --- |')
    for (const r of list.sort((a, b) => a.planName.localeCompare(b.planName))) {
      const info = r.fidelity
        ? macroLine(r.fidelity)
        : [r.reason, r.detail].filter(Boolean).join(' — ') || '—'
      lines.push(`| ${r.planName} | ${r.clientId} | ${r.outcome} | ${info} |`)
    }
    lines.push('')
    // No-acarreado / anomalias detalladas por plan + porciones (R7/T3.2).
    for (const r of list) {
      const f = r.fidelity
      if (!f) continue
      const notes: string[] = []
      if (f.noAcarreado.length > 0) notes.push(`no_acarreado: ${f.noAcarreado.join(', ')}`)
      if (f.textOnlySlots > 0) notes.push(`text_only slots: ${f.textOnlySlots}`)
      if (f.swapsAsNotes > 0) notes.push(`swaps_as_notes: ${f.swapsAsNotes}`)
      if (f.zeroQuantityItemsSkipped > 0) notes.push(`items qty<=0 saltados: ${f.zeroQuantityItemsSkipped}`)
      if (notes.length > 0) lines.push(`- **${r.planName}**: ${notes.join(' · ')}`)

      const exchangeLine = exchangeSummaryLine(f)
      if (exchangeLine) {
        const blocked = r.outcome === 'blocked_unmapped' || r.outcome === 'would_block_unmapped'
        lines.push(`- **${r.planName}** — ${exchangeLine}${blocked ? ' — **BLOQUEADO** (fail-closed, sin override)' : ''}`)
        const breakdown = r.exchangeBreakdown ?? []
        const comparison = renderGroupComparisonLine(
          declaredPortionsByGroupCode(breakdown),
          f.exchangeGroupPortions,
        )
        if (comparison) lines.push(`  - Por grupo (in declarado en V1 vs out mapeado): ${comparison}`)
        const table = renderMealExchangeTable(breakdown)
        if (table) {
          lines.push('')
          lines.push(
            table
              .split('\n')
              .map((line) => `  ${line}`)
              .join('\n'),
          )
          lines.push('')
        }
      }
    }
    lines.push('')
  }
  return lines.join('\n')
}

function writeReport(
  reports: PlanReport[],
  mode: string,
  effectiveFrom: string,
  meta: RunMeta,
): { md: string; json: string } {
  mkdirSync(OUT_DIR, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const base = `conversion-${DRY_RUN ? 'dryrun' : 'apply'}-${stamp}`
  const mdPath = resolve(OUT_DIR, `${base}.md`)
  const jsonPath = resolve(OUT_DIR, `${base}.json`)
  writeFileSync(mdPath, buildMarkdown(reports, mode, effectiveFrom, meta), 'utf8')
  writeFileSync(jsonPath, JSON.stringify({ mode, effectiveFrom, meta, reports }, null, 2), 'utf8')
  return { md: mdPath, json: jsonPath }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY (apps/web/.env.local o .env.local).')
    process.exit(1)
  }
  if (APPLY && process.env.NUTRITION_V2_CONVERT_CONFIRM !== 'yes') {
    console.error(
      '--apply escribe en la Supabase remota (planes V2 en dark). Requiere AMBOS gates:\n' +
        '  1) flag --apply\n' +
        "  2) env NUTRITION_V2_CONVERT_CONFIRM='yes'\n" +
        'Abortando.',
    )
    process.exit(1)
  }

  const mode = DRY_RUN ? 'DRY-RUN (sin escritura)' : 'APPLY (escritura en dark)'
  const effectiveFrom = santiagoToday()
  console.log(`Target: ${url}`)
  console.log(`Modo: ${mode} · coach: ${COACH_SLUG ?? '(todos)'} · effective_from: ${effectiveFrom}`)
  console.log(
    `Orden (--priority): ${PRIORITY_CLIENT_IDS.length > 0 ? PRIORITY_CLIENT_IDS.join(', ') : '(sin priorizar)'} · ` +
      `gate porciones no mapeables: ${ALLOW_UNMAPPED_EXCHANGES ? 'DESACTIVADO (--allow-unmapped-exchanges)' : 'activo'}`,
  )
  if (APPLY) {
    console.log('Continuando en 3 segundos... (Ctrl+C para abortar)')
    await new Promise((r) => setTimeout(r, 3000))
  }

  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

  // Filtro opcional por coach slug.
  let coachIdFilter: string | null = null
  const coachSlugById = new Map<string, string>()
  if (COACH_SLUG) {
    const { data, error } = await db.from('coaches').select('id, slug').eq('slug', COACH_SLUG).maybeSingle()
    if (error) throw new Error(`coach lookup: ${error.message}`)
    if (!data) {
      console.error(`No existe coach con slug '${COACH_SLUG}'.`)
      process.exit(1)
    }
    coachIdFilter = (data as { id: string }).id
    coachSlugById.set((data as { id: string }).id, COACH_SLUG)
  }

  // Planes candidatos: is_active=true (la seleccion fina la hace el mapper).
  let query = db.from('nutrition_plans').select(PLAN_SELECT).eq('is_active', true)
  if (coachIdFilter) query = query.eq('coach_id', coachIdFilter)
  const { data: rawPlans, error: plansErr } = await query
  if (plansErr) throw new Error(`load plans: ${plansErr.message}`)
  // Orden de corrida parametrizable (SPEC R7): los client_id de --priority van primero, en su
  // orden; el resto conserva el orden natural devuelto por la query. Sin --priority, no-op.
  const plans = reorderByPriority((rawPlans ?? []) as RawPlan[], (p) => p.client_id, PRIORITY_CLIENT_IDS)

  // Resolver slugs de los coaches involucrados (para el reporte).
  const coachIds = Array.from(new Set(plans.map((p) => p.coach_id)))
  const missingSlug = coachIds.filter((id) => !coachSlugById.has(id))
  if (missingSlug.length > 0) {
    const { data: coaches } = await db.from('coaches').select('id, slug').in('id', missingSlug)
    for (const c of (coaches ?? []) as { id: string; slug: string }[]) coachSlugById.set(c.id, c.slug)
  }

  const links = await loadLinks(db)
  const clientsWithActiveV2 = await loadClientsWithActiveV2(db)
  // Catalogo de grupos para el mapper (planes exchanges — R7). Cargado una vez.
  const exchangeGroups = await loadExchangeGroups(db)
  // Indice id -> {code, name} para el desglose de fidelidad por comida/grupo del reporte (T3.2).
  const groupLookup = buildGroupLookup(exchangeGroups)

  // Duplicados: >1 plan activo por cliente -> gana max(updated_at); el resto skipped_duplicate.
  const byClient = new Map<string, RawPlan[]>()
  for (const p of plans) {
    const list = byClient.get(p.client_id) ?? []
    list.push(p)
    byClient.set(p.client_id, list)
  }
  const duplicateLoserIds = new Set<string>()
  for (const list of byClient.values()) {
    if (list.length < 2) continue
    const sorted = list.slice().sort((a, b) => epochOf(b.updated_at) - epochOf(a.updated_at))
    for (const loser of sorted.slice(1)) duplicateLoserIds.add(loser.id)
  }

  const reports: PlanReport[] = []

  for (const raw of plans) {
    const coachSlug = coachSlugById.get(raw.coach_id) ?? null
    const base: Pick<PlanReport, 'v1PlanId' | 'clientId' | 'coachId' | 'coachSlug' | 'planName'> = {
      v1PlanId: raw.id,
      clientId: raw.client_id,
      coachId: raw.coach_id,
      coachSlug,
      planName: raw.name,
    }

    if (duplicateLoserIds.has(raw.id)) {
      reports.push({ ...base, outcome: 'skipped', reason: 'skipped_duplicate', detail: 'no es el plan activo mas reciente' })
      continue
    }

    const link = links.get(raw.id)
    const isResync = Boolean(link)
    const versionNumber = link ? 0 : 1 // se recalcula en apply para re-sync
    const tree = toTree(raw)
    const result = mapV1PlanToV2Conversion(tree, {
      newId: randomUUID,
      versionNumber,
      effectiveFromLocalDate: effectiveFrom,
      existingV2PlanId: link?.v2_plan_id,
      exchangeGroups,
    })

    if (!result.ok) {
      const reason =
        result.reason === 'exchanges_manual' || result.reason.startsWith('invalid') || result.reason === 'missing_food'
          ? 'manual_required'
          : result.reason
      reports.push({ ...base, outcome: 'skipped', reason, detail: `${result.reason}${result.detail ? `: ${result.detail}` : ''}` })
      continue
    }

    // Desglose por comida/grupo de los targets de porciones DECLARADOS en V1 (T3.2, criterio 9).
    // Deterministico sobre `tree`+`result.fidelity.unmappedExchangeTargets`: idem para el re-map
    // de un re-sync (mismo arbol, misma resolucion de grupos), asi que se computa una sola vez.
    const exchangeBreakdown = mealExchangeBreakdown(tree.meals, groupLookup, result.fidelity.unmappedExchangeTargets)

    // Cliente con V2 activo pero SIN link a este plan V1. Dos casos, distinguidos por la
    // idempotency key determinista de la conversion:
    //  (a) canary josefit (V2 nativo, jamas convertido): no existe version con esta key -> saltar.
    //  (b) conversion cuyo publish quedo OK pero el INSERT del link fallo: la version SI
    //      existe con esta key -> backfill del link, en vez de mislabelear como
    //      'skipped_v2_exists' (que lo dejaria sin banner y sin re-sync para siempre, porque
    //      este guard se dispararia antes que la reconciliacion del bloque APPLY).
    if (!link && clientsWithActiveV2.has(raw.client_id)) {
      const orphanPublished = await findVersionByKey(db, result.idempotencyKey)
      if (!orphanPublished) {
        reports.push({ ...base, outcome: 'skipped', reason: 'skipped_v2_exists', detail: 'el alumno ya tiene plan V2 activo' })
        continue
      }
      if (DRY_RUN) {
        reports.push({
          ...base,
          outcome: 'noop',
          reason: 'link_backfill_pending',
          idempotencyKey: result.idempotencyKey,
          v2PlanId: orphanPublished.plan_id,
          v2VersionId: orphanPublished.id,
          fidelity: result.fidelity,
        })
        continue
      }
      try {
        await upsertLink(db, {
          existingLinkId: null,
          v1PlanId: raw.id,
          v2PlanId: orphanPublished.plan_id,
          v2VersionId: orphanPublished.id,
          coachId: raw.coach_id,
          clientId: raw.client_id,
          lastSynced: raw.updated_at,
          status: 'converted',
          fidelity: result.fidelity,
        })
        reports.push({
          ...base,
          outcome: 'converted',
          reason: 'link_backfilled',
          idempotencyKey: result.idempotencyKey,
          v2PlanId: orphanPublished.plan_id,
          v2VersionId: orphanPublished.id,
          fidelity: result.fidelity,
        })
      } catch (err) {
        reports.push({
          ...base,
          outcome: 'error',
          reason: 'link_backfill_failed',
          detail: err instanceof Error ? err.message : String(err),
        })
      }
      continue
    }

    // Idempotencia: link vigente sin drift -> no-op.
    if (link && epochOf(raw.updated_at) <= epochOf(link.last_synced_v1_updated_at)) {
      reports.push({
        ...base,
        outcome: 'noop',
        idempotencyKey: result.idempotencyKey,
        v2PlanId: link.v2_plan_id,
        fidelity: result.fidelity,
      })
      continue
    }

    // Re-sync que caeria el mismo dia: el RPC exige effective_from > la vigente (granularidad
    // DATE). Si la version vigente ya es de hoy, publicar hoy tiraria
    // effective_date_must_follow y (peor) dejaria el draft insertado como huerfano invisible.
    // Se salta ANTES de insertar nada; el re-sync corre recien manana.
    if (link) {
      const currentFrom = await currentPublishedEffectiveFrom(db, link.v2_plan_id)
      if (currentFrom && currentFrom >= effectiveFrom) {
        reports.push({
          ...base,
          outcome: 'skipped',
          reason: 'skipped_same_day_resync',
          detail: `version vigente effective_from=${currentFrom}; el re-sync corre recien manana`,
        })
        continue
      }
    }

    // Gate fail-closed (T3.2, criterio 9): un plan con targets de porciones no mapeables NO se
    // aplica salvo el override EXPLICITO --allow-unmapped-exchanges. Cero invencion: nunca se
    // completa el dato faltante, se bloquea el plan entero (o se deja pasar entero con el
    // override, y el reporte igual lista lo que quedo sin mapear).
    const exchangeBlocked = isFailClosedBlocked(result.fidelity.unmappedExchangeTargets.length, ALLOW_UNMAPPED_EXCHANGES)

    if (DRY_RUN) {
      reports.push({
        ...base,
        outcome: exchangeBlocked ? 'would_block_unmapped' : isResync ? 'would_resync' : 'would_convert',
        idempotencyKey: result.idempotencyKey,
        v2PlanId: link?.v2_plan_id,
        fidelity: result.fidelity,
        exchangeBreakdown,
      })
      continue
    }

    if (exchangeBlocked) {
      reports.push({
        ...base,
        outcome: 'blocked_unmapped',
        reason: 'blocked_unmapped_exchanges',
        detail: `${result.fidelity.unmappedExchangeTargets.length} target(s) de porciones no mapeables: ${result.fidelity.unmappedExchangeTargets.join('; ')} — usa --allow-unmapped-exchanges para forzar (override documentado, T3.2) o corrige el dato en V1`,
        idempotencyKey: result.idempotencyKey,
        fidelity: result.fidelity,
        exchangeBreakdown,
      })
      continue
    }

    // --- APPLY ---
    try {
      // Robustez ante reintentos: si la version ya se publico con esta key, no re-insertar.
      const already = await findVersionByKey(db, result.idempotencyKey)
      if (already) {
        await upsertLink(db, {
          existingLinkId: link?.id ?? null,
          v1PlanId: raw.id,
          v2PlanId: already.plan_id,
          v2VersionId: already.id,
          coachId: raw.coach_id,
          clientId: raw.client_id,
          lastSynced: raw.updated_at,
          status: isResync ? 'resynced' : 'converted',
          fidelity: result.fidelity,
        })
        reports.push({
          ...base,
          outcome: 'noop',
          idempotencyKey: result.idempotencyKey,
          v2PlanId: already.plan_id,
          v2VersionId: already.id,
          fidelity: result.fidelity,
        })
        continue
      }

      // Re-sync: recomputar version_number real y re-mapear sobre el plan V2 existente.
      let bundle: ConversionBundle = result
      let v2PlanId = (result.planRow?.id as string | undefined) ?? link?.v2_plan_id ?? ''
      if (isResync && link) {
        const vnum = await nextVersionNumber(db, link.v2_plan_id)
        const remapped = mapV1PlanToV2Conversion(tree, {
          newId: randomUUID,
          versionNumber: vnum,
          effectiveFromLocalDate: effectiveFrom,
          existingV2PlanId: link.v2_plan_id,
          exchangeGroups,
        })
        if (!remapped.ok) throw new Error(`remap re-sync fallo: ${remapped.reason}`)
        bundle = remapped
        v2PlanId = link.v2_plan_id
      }

      // Escritura+publish no son atomicos (5 inserts PostgREST + RPC). Si el publish falla
      // (p.ej. effective_date_must_follow por un re-sync same-day que la pre-check no atajo),
      // limpiar el draft insertado para no dejar huerfanos invisibles. Un fallo SOLO del
      // upsertLink de abajo NO entra aca: el publish ya quedo bueno y el backfill lo reconcilia.
      let publishedVersionId: string
      try {
        publishedVersionId = await persistAndPublish(db, bundle, raw.coach_id, v2PlanId, effectiveFrom)
      } catch (writeErr) {
        await cleanupFailedDraft(db, bundle.versionRow.id as string, bundle.planRow ? (bundle.planRow.id as string) : null)
        throw writeErr
      }

      await upsertLink(db, {
        existingLinkId: link?.id ?? null,
        v1PlanId: raw.id,
        v2PlanId,
        v2VersionId: publishedVersionId,
        coachId: raw.coach_id,
        clientId: raw.client_id,
        lastSynced: raw.updated_at,
        status: isResync ? 'resynced' : 'converted',
        fidelity: bundle.fidelity,
      })

      reports.push({
        ...base,
        outcome: isResync ? 'resynced' : 'converted',
        idempotencyKey: bundle.idempotencyKey,
        v2PlanId,
        v2VersionId: publishedVersionId,
        fidelity: bundle.fidelity,
        exchangeBreakdown,
      })
    } catch (err) {
      reports.push({
        ...base,
        outcome: 'error',
        reason: 'write_failed',
        detail: err instanceof Error ? err.message : String(err),
      })
    }
  }

  const runMeta: RunMeta = { priorityClientIds: PRIORITY_CLIENT_IDS, allowUnmappedExchanges: ALLOW_UNMAPPED_EXCHANGES }
  const paths = writeReport(reports, mode, effectiveFrom, runMeta)
  const counts = reports.reduce<Record<string, number>>((acc, r) => {
    acc[r.outcome] = (acc[r.outcome] ?? 0) + 1
    return acc
  }, {})
  console.log('\nResumen:', counts)
  console.log(`Reporte MD:   ${paths.md}`)
  console.log(`Reporte JSON: ${paths.json}`)
  // 'blocked_unmapped' es un fallo operativo (fail-closed): la corrida no convirtio ese plan.
  if (reports.some((r) => r.outcome === 'error' || r.outcome === 'blocked_unmapped')) process.exitCode = 1
}

main().catch((err) => {
  console.error('Fallo la conversion:', err instanceof Error ? err.message : err)
  process.exit(1)
})
