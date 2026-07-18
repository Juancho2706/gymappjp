/**
 * Helpers PUROS del driver `classify-foods` (T4.2 · SPEC R8 pasos 4-5). Cero IO,
 * cero Supabase: todo lo que el driver decide (armado de updates, filtrado por tier,
 * verificacion de refs contra la DB, naming del respaldo) vive aca para poder
 * testearlo con vitest FOCALIZADO sin tocar la red.
 *
 * El driver (`classify-foods.mjs`) hace SOLO la parte de IO: lee `foods` +
 * `exchange_groups` con service-role, llama a estos helpers, escribe el dataset
 * clasificado a JSON (gitignoreado) y, con `--apply`, corre los UPDATE guardados.
 */

import { GROUP_REFS, type FoodRow, type ExchangeGroupCode, type ClassificationTier } from './heuristics.ts'
import { classifyFoodWithOverrides } from './heuristics-overrides.ts'

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

/** Fila cruda de `public.foods` que el driver lee (incluye id para el UPDATE). */
export interface FoodDbRow extends FoodRow {
  id: string
  /** Clasificacion manual V1 vigente: si NO es null, la fila JAMAS se pisa (hallazgo D3). */
  exchange_group_id?: string | null
  exchange_portion_grams?: number | string | null
  exchange_portion_label?: string | null
}

/** Fila de `public.exchange_groups` (subset) que el driver lee para re-verificar refs. */
export interface ExchangeGroupDbRow {
  id: string
  code: string
  name?: string | null
  is_system: boolean
  ref_calories: number | string
  ref_protein_g: number | string
  ref_carbs_g: number | string
  ref_fats_g: number | string
  /** Grupos compuestos (LEG = 1P+1C): sus ref_* en DB son 0 y el perfil efectivo
   *  se deriva de las bases. El fixture guarda el perfil EFECTIVO (es el que usa
   *  el clasificador), asi que la verificacion los compara contra la suma. */
  composed_of?: Array<{ code: string; portions: number }> | null
  deleted_at?: string | null
}

/** Una fila del dataset clasificado (lo que se emite al JSON de dry-run). */
export interface ClassifiedRow {
  foodId: string
  name: string
  category: string | null
  group: ExchangeGroupCode | null
  tier: ClassificationTier
  grams: number | null
  label: string | null
  signals: { category: ExchangeGroupCode | null; keyword: ExchangeGroupCode | null; macro: ExchangeGroupCode | null }
  reason: string
}

export interface DatasetSummary {
  total: number
  classified: number
  byTier: Record<ClassificationTier, number>
  byGroup: Record<string, number>
  /** Foods sin grupo (group=null): quedan sin clasificar. */
  unclassified: number
}

// ---------------------------------------------------------------------------
// Verificacion de refs: fixture T4.1 vs `exchange_groups` system de la DB
// ---------------------------------------------------------------------------

export interface RefMismatch {
  code: string
  field: 'missing_in_db' | 'missing_in_fixture' | 'ref_calories' | 'ref_protein_g' | 'ref_carbs_g' | 'ref_fats_g'
  fixture?: number
  db?: number
}

export interface RefVerification {
  ok: boolean
  mismatches: RefMismatch[]
}

function toNum(value: number | string | null | undefined): number {
  const n = typeof value === 'string' ? Number(value) : value
  return typeof n === 'number' && Number.isFinite(n) ? n : NaN
}

const REF_EPSILON = 1e-9

/**
 * Re-verifica que los `ref_*` hardcodeados en `GROUP_REFS` (fixture congelado de
 * T4.1) coincidan con los grupos SYSTEM vivos de `exchange_groups`. Si difieren, el
 * driver ABORTA: el fixture quedo viejo y clasificar con refs desactualizados
 * produciria porciones equivocadas. Solo mira grupos system NO soft-borrados.
 */
export function verifyGroupRefs(dbGroups: ExchangeGroupDbRow[]): RefVerification {
  const mismatches: RefMismatch[] = []
  const dbSystem = new Map<string, ExchangeGroupDbRow>()
  for (const g of dbGroups) {
    if (!g.is_system) continue
    if (g.deleted_at) continue
    dbSystem.set(g.code, g)
  }

  const fixtureCodes = new Set<string>()
  for (const ref of GROUP_REFS) {
    fixtureCodes.add(ref.code)
    const db = dbSystem.get(ref.code)
    if (!db) {
      mismatches.push({ code: ref.code, field: 'missing_in_db' })
      continue
    }
    // Grupo compuesto (composed_of poblado, p.ej. LEG=1P+1C): sus ref_* en DB son 0
    // por diseno — el perfil efectivo es la suma portions x ref de las bases. El
    // fixture guarda ese perfil efectivo (el clasificador matchea contra el), asi
    // que aqui se compara contra la suma derivada de la DB, no contra los 0s.
    let dbCal = toNum(db.ref_calories)
    let dbProt = toNum(db.ref_protein_g)
    let dbCarb = toNum(db.ref_carbs_g)
    let dbFat = toNum(db.ref_fats_g)
    if (Array.isArray(db.composed_of) && db.composed_of.length > 0) {
      dbCal = 0; dbProt = 0; dbCarb = 0; dbFat = 0
      for (const part of db.composed_of) {
        const base = dbSystem.get(part.code)
        if (!base) {
          mismatches.push({ code: ref.code, field: 'missing_in_db' })
          dbCal = Number.NaN
          break
        }
        dbCal += part.portions * toNum(base.ref_calories)
        dbProt += part.portions * toNum(base.ref_protein_g)
        dbCarb += part.portions * toNum(base.ref_carbs_g)
        dbFat += part.portions * toNum(base.ref_fats_g)
      }
      if (Number.isNaN(dbCal)) continue
    }
    const checks: Array<[RefMismatch['field'], number, number]> = [
      ['ref_calories', ref.refCalories, dbCal],
      ['ref_protein_g', ref.refProteinG, dbProt],
      ['ref_carbs_g', ref.refCarbsG, dbCarb],
      ['ref_fats_g', ref.refFatsG, dbFat],
    ]
    for (const [field, fixture, dbVal] of checks) {
      if (Number.isNaN(dbVal) || Math.abs(fixture - dbVal) > REF_EPSILON) {
        mismatches.push({ code: ref.code, field, fixture, db: Number.isNaN(dbVal) ? undefined : dbVal })
      }
    }
  }

  // Grupo system nuevo en la DB que el fixture no conoce: tambien es drift (la
  // clasificacion masiva ignoraria un grupo valido).
  for (const code of dbSystem.keys()) {
    if (!fixtureCodes.has(code)) mismatches.push({ code, field: 'missing_in_fixture' })
  }

  return { ok: mismatches.length === 0, mismatches }
}

/** Mapa code -> id de los grupos SYSTEM vivos (para armar el UPDATE de foods). */
export function systemGroupIdByCode(dbGroups: ExchangeGroupDbRow[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const g of dbGroups) {
    if (g.is_system && !g.deleted_at) map.set(g.code, g.id)
  }
  return map
}

// ---------------------------------------------------------------------------
// Clasificacion del dataset (envuelve `classifyFood` puro)
// ---------------------------------------------------------------------------

export function classifyDataset(foods: FoodDbRow[]): ClassifiedRow[] {
  return foods.map((food) => {
    // Paso PREVIO de overrides curados (heuristics-overrides.ts); si ninguno matchea,
    // cae al clasificador puro de 3 senales (classifyFood).
    const c = classifyFoodWithOverrides(food)
    return {
      foodId: food.id,
      name: food.name ?? '',
      category: food.category ?? null,
      group: c.group,
      tier: c.tier,
      grams: c.exchangePortionGrams,
      label: c.exchangePortionLabel,
      signals: c.signals,
      reason: c.reason,
    }
  })
}

export function summarizeDataset(rows: ClassifiedRow[]): DatasetSummary {
  const byTier: Record<ClassificationTier, number> = { alto: 0, medio: 0, bajo: 0 }
  const byGroup: Record<string, number> = {}
  let classified = 0
  let unclassified = 0
  for (const r of rows) {
    byTier[r.tier] += 1
    if (r.group === null) {
      unclassified += 1
    } else {
      classified += 1
      byGroup[r.group] = (byGroup[r.group] ?? 0) + 1
    }
  }
  return { total: rows.length, classified, byTier, byGroup, unclassified }
}

// ---------------------------------------------------------------------------
// Filtrado por tier para `--apply`
// ---------------------------------------------------------------------------

export const APPLYABLE_TIERS: readonly ClassificationTier[] = ['alto', 'medio']

/**
 * Parsea `--tiers=alto` | `--tiers=alto,medio`. Default (flag ausente) = solo `alto`.
 * `bajo` NUNCA es aplicable (queda sin clasificar por diseno). Lanza en token invalido
 * para fallar cerrado antes de tocar la DB.
 */
export function parseTiersFlag(value: string | undefined | null): Set<ClassificationTier> {
  if (value == null || value.trim() === '') return new Set<ClassificationTier>(['alto'])
  const tokens = value
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t !== '')
  if (tokens.length === 0) return new Set<ClassificationTier>(['alto'])
  const out = new Set<ClassificationTier>()
  for (const t of tokens) {
    if (t !== 'alto' && t !== 'medio') {
      throw new Error(`--tiers invalido: '${t}' (permitidos: alto, medio; 'bajo' nunca se aplica)`)
    }
    out.add(t)
  }
  return out
}

/**
 * Filas elegibles para escribir: con grupo, tier aprobado y porcion derivable. La
 * guarda `exchange_group_id is null` (no pisar clasificacion manual V1) la aplica el
 * driver EN EL UPDATE ademas de aca — doble cinturon (hallazgo D3).
 */
export function filterForApply(
  rows: ClassifiedRow[],
  approvedTiers: Set<ClassificationTier>,
  foodsById: Map<string, FoodDbRow>,
): ClassifiedRow[] {
  return rows.filter((r) => {
    if (r.group === null) return false
    if (!approvedTiers.has(r.tier)) return false
    if (r.grams === null) return false
    const food = foodsById.get(r.foodId)
    // Nunca tocar una fila ya clasificada a mano en V1.
    if (food && food.exchange_group_id != null) return false
    return true
  })
}

// ---------------------------------------------------------------------------
// Armado del UPDATE y del respaldo
// ---------------------------------------------------------------------------

export interface UpdatePayload {
  exchange_group_id: string
  exchange_portion_grams: number
  exchange_portion_label: string | null
}

/**
 * Construye el payload del UPDATE de una fila clasificada. Resuelve el grupo a su id
 * SYSTEM vigente. Devuelve null si el grupo no resuelve (no deberia pasar tras
 * `verifyGroupRefs`) o si falta la porcion — el driver salta esas filas.
 */
export function buildUpdatePayload(row: ClassifiedRow, codeToId: Map<string, string>): UpdatePayload | null {
  if (row.group === null || row.grams === null) return null
  const groupId = codeToId.get(row.group)
  if (!groupId) return null
  return {
    exchange_group_id: groupId,
    exchange_portion_grams: row.grams,
    exchange_portion_label: row.label,
  }
}

/** Fila del respaldo: valores PREVIOS de las columnas que el UPDATE va a tocar. */
export interface BackupRow {
  foodId: string
  exchange_group_id: string | null
  exchange_portion_grams: number | null
  exchange_portion_label: string | null
}

export function buildBackupRow(food: FoodDbRow): BackupRow {
  const grams = food.exchange_portion_grams
  return {
    foodId: food.id,
    exchange_group_id: food.exchange_group_id ?? null,
    exchange_portion_grams: grams == null ? null : Number(grams),
    exchange_portion_label: food.exchange_portion_label ?? null,
  }
}

// ---------------------------------------------------------------------------
// Naming del respaldo (patron _bak con fecha, como _bak_foods_global_20260715)
// ---------------------------------------------------------------------------

/** `YYYYMMDD` a partir de una fecha (default: hoy). Puro/determinista si se pasa fecha. */
export function stampDate(date: Date = new Date()): string {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}${m}${d}`
}

/** Nombre de la tabla de respaldo DB (patron _bak del repo). */
export function backupTableName(stamp: string): string {
  return `_bak_foods_portions_${stamp}`
}

/** Nombre del archivo JSON de respaldo (respaldo AUTORITATIVO de `--down`). */
export function backupFileName(stamp: string): string {
  return `foods-portions-bak-${stamp}.json`
}

/**
 * SQL de respaldo DB para el runbook de operacion (el driver NO corre DDL — supabase-js
 * es PostgREST; el `_bak` DB-side lo toma el operador via el mismo camino SQL/MCP del
 * dedup). El respaldo autoritativo del `--down` es el JSON. Estos strings se emiten a
 * disco para que el operador cree el snapshot DB-side si lo quiere.
 */
export function backupDdlSql(stamp: string): string {
  const table = backupTableName(stamp)
  return [
    `-- Snapshot DB-side de las columnas de porcion ANTES del apply (opcional; el respaldo`,
    `-- autoritativo de --down es el JSON del driver). Correr via MCP/SQL como el dedup.`,
    `create table if not exists public.${table} as`,
    `  select id, exchange_group_id, exchange_portion_grams, exchange_portion_label`,
    `  from public.foods`,
    `  where exchange_group_id is null;`,
    ``,
    `-- Restore (equivalente al --down del driver):`,
    `-- update public.foods f set`,
    `--   exchange_group_id     = b.exchange_group_id,`,
    `--   exchange_portion_grams = b.exchange_portion_grams,`,
    `--   exchange_portion_label = b.exchange_portion_label`,
    `-- from public.${table} b where b.id = f.id;`,
    ``,
  ].join('\n')
}
