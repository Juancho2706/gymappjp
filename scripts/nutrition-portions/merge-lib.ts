/**
 * Helpers PUROS del driver `merge-foods` (fusion de alimentos DUPLICADOS CON USO en
 * `public.foods`). Cero IO, cero Supabase: toda la logica de decision (agrupacion de
 * duplicados exactos + eleccion del canonico —reusadas de `cleanup-lib`—, calculo del
 * enriquecimiento del canonico, y la CLASIFICACION de cada fila referenciante en
 * "remapear (UPDATE al canonico)" vs "borrar duplicado" cuando una restriccion unica
 * incluye la columna FK) vive aca para testearla con vitest FOCALIZADO sin tocar la red.
 *
 * El driver (`merge-foods.mjs`) hace SOLO la parte de IO: enumera FKs y PKs desde el
 * OpenAPI de PostgREST, lee `foods` + las tablas referenciantes con service-role, llama
 * a estos helpers, escribe el respaldo JSON (autoritativo del --down) + reporte MD/JSON
 * y, con --apply, corre los UPDATE de remapeo, el enriquecimiento y los DELETE.
 *
 * RELACION CON `cleanup-lib`:
 *   `cleanup-foods` ya BORRO los duplicados SIN referencias (0 refs). Este script toma los
 *   grupos que quedaron (duplicados CON uso: la seccion "requiere merge" de aquel reporte),
 *   REMAPEA sus FKs al canonico y recien ahi borra la copia. Reusamos su agrupacion exacta
 *   y su eleccion de canonico para que ambos scripts coincidan 1:1 en que es "el mismo".
 *
 * GOTCHAS REALES (verificados contra la DB viva, 2026-07-18):
 *   - `foods` NO tiene `created_at` — el desempate del canonico cae a `id` ascendente
 *     (uuid deterministico), igual que en `cleanup-lib.chooseCanonical`. (La consigna pedia
 *     "created_at mas antiguo"; esa columna no existe, el fallback estable es `id`.)
 *   - PKs COMPUESTAS: `client_food_preferences` tiene PK (client_id, food_id) —la columna FK
 *     ES parte de la PK—, sin columna `id`. Por eso el remapeo direcciona filas por
 *     (pk_sin_fk + columna_fk), no por un `id` suelto. `parsePrimaryKeys` lo enumera bien.
 *   - RESTRICCIONES UNICAS que incluyen la FK a foods (remapear crearia duplicado):
 *       client_food_preferences  UNIQUE/PK (client_id, food_id)
 *       food_media               UNIQUE (food_id, object_path)  [+ indice parcial unique(food_id)
 *                                where is_primary — conflicto extra que SOLO cubre el apply via 23505]
 *       nutrition_meal_food_swaps UNIQUE (daily_log_id, meal_id, original_food_id)
 *     En esos casos, remapear la copia al canonico chocaria con una fila ya existente ->
 *     la fila duplicada de la copia se BORRA en vez de updatear. El resto (9 tablas) tiene
 *     PK `id` y ninguna unica sobre la FK -> siempre UPDATE.
 *   - Semantica NULL de Postgres: en una unique, dos NULL no colisionan. `buildRemapTuple`
 *     devuelve null (no-colisionable) si cualquier componente de la clave es null.
 */

import {
  groupExactDuplicates,
  chooseCanonical,
  type FoodFullRow,
  type FkRef,
  type PostgrestOpenApi,
} from './cleanup-lib.ts'

export type { FoodFullRow, FkRef, PostgrestOpenApi }

// ---------------------------------------------------------------------------
// Enumeracion de PRIMARY KEYS desde el OpenAPI de PostgREST
// ---------------------------------------------------------------------------

/** Marcador maquina que PostgREST embebe en la descripcion de una columna PK. */
const PK_MARKER = /<pk\s*\/>/i

/**
 * Enumera las columnas PK por tabla leyendo el OpenAPI de PostgREST (misma reflexion de
 * `pg_constraint` que usa `parseFkRefsToFoods`). Cubre PKs compuestas (marca cada columna).
 * Orden = orden de aparicion de las propiedades (estable). Devuelve solo tablas con PK.
 */
export function parsePrimaryKeys(spec: PostgrestOpenApi): Map<string, string[]> {
  const defs = spec?.definitions ?? {}
  const out = new Map<string, string[]>()
  for (const table of Object.keys(defs)) {
    const props = defs[table]?.properties ?? {}
    const pks: string[] = []
    for (const column of Object.keys(props)) {
      const desc = props[column]?.description ?? ''
      if (PK_MARKER.test(desc)) pks.push(column)
    }
    if (pks.length > 0) out.set(table, pks)
  }
  return out
}

/**
 * Columnas que direccionan una fila referenciante para el remapeo: la PK MENOS la columna
 * FK (que va en el filtro aparte con su valor from/to). Si la PK es solo la FK (no ocurre en
 * este esquema), cae a la PK completa para no perder unicidad.
 */
export function keyColsForRemap(pkCols: string[], column: string): string[] {
  const rest = pkCols.filter((c) => c !== column)
  return rest.length > 0 ? rest : pkCols.slice()
}

// ---------------------------------------------------------------------------
// Restricciones unicas que incluyen la FK a foods (para PREDECIR conflictos en dry-run)
// ---------------------------------------------------------------------------

/**
 * Snapshot de las restricciones UNICAS (constraint o indice) que incluyen una columna FK a
 * `foods`, derivado de `pg_constraint`/`pg_index` de la DB viva. SOLO alimenta la PREDICCION
 * del dry-run: cuantas filas referenciantes chocarian al remapear y por ende se borrarian.
 * El APPLY NO depende de esta lista — remapea con UPDATE y, si Postgres tira 23505 (unique
 * violation), degrada esa fila a DELETE en vivo. Asi, si el esquema cambia, el apply sigue
 * correcto y solo la prediccion del dry-run podria quedar algo desfasada (se documenta).
 */
export interface UniqueKeySpec {
  table: string
  column: string
  /** Claves unicas (arrays de columnas) que incluyen `column`. Vacio -> nunca colisiona. */
  uniqueKeys: string[][]
  note?: string
}

export const UNIQUE_KEYS_WITH_FOOD_FK: readonly UniqueKeySpec[] = [
  { table: 'client_food_preferences', column: 'food_id', uniqueKeys: [['client_id', 'food_id']] },
  {
    table: 'food_media',
    column: 'food_id',
    uniqueKeys: [['food_id', 'object_path']],
    note: 'ademas indice parcial unique(food_id) where is_primary; ese conflicto extra lo cubre el apply via 23505',
  },
  {
    table: 'nutrition_meal_food_swaps',
    column: 'original_food_id',
    uniqueKeys: [['daily_log_id', 'meal_id', 'original_food_id']],
  },
]

/** Devuelve las claves unicas que incluyen `column` para (table, column), o [] si ninguna. */
export function uniqueKeysFor(table: string, column: string): string[][] {
  const spec = UNIQUE_KEYS_WITH_FOOD_FK.find((s) => s.table === table && s.column === column)
  return spec ? spec.uniqueKeys : []
}

// ---------------------------------------------------------------------------
// Clasificacion de filas referenciantes: remapear (UPDATE) vs borrar duplicado (DELETE)
// ---------------------------------------------------------------------------

export interface ReferencingRow {
  [key: string]: unknown
}

export interface RemapClassification {
  /** Filas cuya FK se puede reapuntar al canonico sin violar unicas. */
  updates: ReferencingRow[]
  /** Filas que, al remapear, chocarian con una fila ya existente del canonico -> borrar. */
  deletes: ReferencingRow[]
}

/**
 * Tupla de una clave unica para una fila, PROYECTANDO la columna FK al valor dado (para
 * simular "como quedaria tras el remapeo"). Semantica NULL de Postgres: si cualquier
 * componente es null/undefined, la tupla NO colisiona (dos NULL son distintos) -> null.
 */
export function buildRemapTuple(
  row: ReferencingRow,
  keyCols: string[],
  column: string,
  projectedFkValue: string,
): string | null {
  const parts: unknown[] = []
  for (const col of keyCols) {
    const value = col === column ? projectedFkValue : row[col]
    if (value === null || value === undefined) return null
    parts.push(value)
  }
  return JSON.stringify(parts)
}

/**
 * Clasifica las filas referenciantes de las copias de UN grupo en updates vs deletes.
 *   - `uniqueKeys` vacio -> todo es UPDATE (ninguna unica involucra la FK).
 *   - Si no -> se "reserva" el espacio del canonico: primero las tuplas de las filas que YA
 *     apuntan al canonico (`canonRows`), luego se procesan `copyRows` en orden; si la tupla
 *     proyectada de una copia ya esta reservada (por el canonico o por otra copia previa),
 *     esa fila se DELETE; si no, se UPDATE y su tupla queda reservada.
 * Determinista dado el orden de entrada (el driver ordena copyRows por PK antes de llamar).
 */
export function classifyReferencingRows(params: {
  copyRows: ReferencingRow[]
  canonRows: ReferencingRow[]
  column: string
  canonicalId: string
  uniqueKeys: string[][]
}): RemapClassification {
  const { copyRows, canonRows, column, canonicalId, uniqueKeys } = params
  if (uniqueKeys.length === 0) {
    return { updates: [...copyRows], deletes: [] }
  }
  // Un set de tuplas reservadas por cada clave unica.
  const claimed: Set<string>[] = uniqueKeys.map(() => new Set<string>())
  for (const row of canonRows) {
    uniqueKeys.forEach((keyCols, i) => {
      const t = buildRemapTuple(row, keyCols, column, canonicalId)
      if (t !== null) claimed[i].add(t)
    })
  }
  const updates: ReferencingRow[] = []
  const deletes: ReferencingRow[] = []
  for (const row of copyRows) {
    const tuples = uniqueKeys.map((keyCols) => buildRemapTuple(row, keyCols, column, canonicalId))
    const collides = tuples.some((t, i) => t !== null && claimed[i].has(t))
    if (collides) {
      deletes.push(row)
    } else {
      tuples.forEach((t, i) => {
        if (t !== null) claimed[i].add(t)
      })
      updates.push(row)
    }
  }
  return { updates, deletes }
}

// ---------------------------------------------------------------------------
// Enriquecimiento del canonico (solo campos NULL del canonico, tomados de una copia)
// ---------------------------------------------------------------------------

/**
 * Columnas del canonico que se pueden RELLENAR desde una copia si en el canonico estan
 * vacias. Solo estas se tocan; nada mas se pisa. `product_image_path` = imagen/icono.
 */
export const ENRICHABLE_COLUMNS: readonly string[] = [
  'exchange_group_id',
  'exchange_portion_grams',
  'exchange_portion_label',
  'product_image_path',
]

/** Presente = no null, no undefined y no cadena vacia. */
export function isPresent(value: unknown): boolean {
  return value !== null && value !== undefined && value !== ''
}

export interface EnrichmentField {
  column: string
  fromId: string
  value: unknown
}

export interface EnrichmentResult {
  /** Columnas -> valor a setear en el canonico (solo las que se rellenan). */
  updates: Record<string, unknown>
  fields: EnrichmentField[]
}

/**
 * Calcula el enriquecimiento del canonico: por cada columna enriquecible, si el canonico la
 * tiene vacia, toma el valor de la PRIMERA copia (en el orden dado) que si lo tenga. Campo a
 * campo (no exige que vengan juntos). Puro; no muta.
 */
export function computeEnrichment(canonical: FoodFullRow, copies: FoodFullRow[]): EnrichmentResult {
  const updates: Record<string, unknown> = {}
  const fields: EnrichmentField[] = []
  for (const col of ENRICHABLE_COLUMNS) {
    if (isPresent(canonical[col])) continue
    for (const copy of copies) {
      if (isPresent(copy[col])) {
        updates[col] = copy[col]
        fields.push({ column: col, fromId: copy.id, value: copy[col] })
        break
      }
    }
  }
  return { updates, fields }
}

// ---------------------------------------------------------------------------
// Armado de grupos a fusionar (duplicados exactos con 2+ filas)
// ---------------------------------------------------------------------------

export interface MergeGroup {
  key: string
  name: string
  brand: string
  canonicalId: string
  canonical: FoodFullRow
  /** Filas no-canonicas del grupo (a remapear y luego borrar). Orden estable por id. */
  copies: FoodFullRow[]
  copyIds: string[]
  enrichment: EnrichmentResult
}

/**
 * Agrupa duplicados exactos (reusando `cleanup-lib`) y arma, por grupo con 2+ filas, el plan
 * base de fusion: canonico + copias (ordenadas por id) + enriquecimiento calculado. El
 * conteo de referencias solo se usa para elegir el canonico (mas refs -> exchange_group_id
 * no nulo -> id asc). No hace IO: el remapeo tabla-por-tabla lo resuelve el driver.
 */
export function buildMergeGroups(foods: FoodFullRow[], refCountById: Map<string, number>): MergeGroup[] {
  const groups: MergeGroup[] = []
  for (const [key, bucket] of groupExactDuplicates(foods)) {
    const { canonical, others } = chooseCanonical(bucket, refCountById)
    const copies = [...others].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    groups.push({
      key,
      name: (canonical.name ?? '').trim(),
      brand: (canonical.brand ?? '').trim(),
      canonicalId: canonical.id,
      canonical,
      copies,
      copyIds: copies.map((c) => c.id),
      enrichment: computeEnrichment(canonical, copies),
    })
  }
  // Orden estable por canonicalId para reportes/diffs reproducibles.
  groups.sort((a, b) => (a.canonicalId < b.canonicalId ? -1 : a.canonicalId > b.canonicalId ? 1 : 0))
  return groups
}

// ---------------------------------------------------------------------------
// Naming del respaldo (patron _bak con fecha, como cleanup-lib)
// ---------------------------------------------------------------------------

export { stampDate, stripGeneratedColumns } from './cleanup-lib.ts'

export function mergeBackupFileName(stamp: string): string {
  return `foods-merge-bak-${stamp}.json`
}

export function mergeBackupTableName(stamp: string): string {
  return `_bak_foods_merge_${stamp}`
}

// ---------------------------------------------------------------------------
// Render del reporte Markdown (a partir de un resumen ya computado por el driver)
// ---------------------------------------------------------------------------

export interface RemapTableSummary {
  table: string
  column: string
  updates: number
  deletes: number
  conflictProne: boolean
}

export interface MergeGroupSummary {
  canonicalId: string
  name: string
  brand: string
  copyIds: string[]
  enrichmentFields: string[]
}

export interface MergeSummary {
  totalFoods: number
  groupCount: number
  /** Total de copias no-canonicas a borrar (una vez remapeadas). */
  copyCount: number
  remapByTable: RemapTableSummary[]
  /** Total de filas a remapear (UPDATE) sumando todas las tablas. */
  totalUpdates: number
  /** Total de filas duplicadas a borrar por conflicto de unica, sumando todas las tablas. */
  totalConflictDeletes: number
  /** Grupos cuyo canonico recibe algun enriquecimiento. */
  enrichedGroupCount: number
  groups: MergeGroupSummary[]
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}

/** Reporte MD legible del plan de fusion. Puro. */
export function renderMergeReportMarkdown(
  summary: MergeSummary,
  meta: { generatedAt: string; target: string; mode: string },
): string {
  const L: string[] = []
  L.push('# Fusion de duplicados CON USO en `foods` — reporte')
  L.push('')
  L.push(`- Generado: ${meta.generatedAt}`)
  L.push(`- Target: ${meta.target}`)
  L.push(`- Modo: ${meta.mode}`)
  L.push(`- Foods totales: ${summary.totalFoods}`)
  L.push('')
  L.push('## Resumen')
  L.push('')
  L.push(`- Grupos a fusionar: ${summary.groupCount}`)
  L.push(`- Copias a borrar (tras remapear): ${summary.copyCount}`)
  L.push(`- Filas a remapear (UPDATE): ${summary.totalUpdates}`)
  L.push(`- Filas duplicadas a borrar por conflicto de unica (DELETE): ${summary.totalConflictDeletes}`)
  L.push(`- Grupos con enriquecimiento del canonico: ${summary.enrichedGroupCount}`)
  L.push('')
  L.push('## Remapeo por tabla FK')
  L.push('')
  L.push('| tabla | columna | UPDATE (remap) | DELETE (conflicto) | unica-sobre-FK |')
  L.push('|---|---|---:|---:|---|')
  for (const r of summary.remapByTable) {
    L.push(`| ${r.table} | ${r.column} | ${r.updates} | ${r.deletes} | ${r.conflictProne ? 'si' : 'no'} |`)
  }
  L.push('')
  L.push('## Grupos')
  L.push('')
  L.push('| canonico | nombre | marca | copias | enriquecimiento |')
  L.push('|---|---|---|---:|---|')
  for (const g of summary.groups) {
    const enr = g.enrichmentFields.length > 0 ? g.enrichmentFields.join(', ') : '—'
    L.push(
      `| ${g.canonicalId} | ${truncate((g.name || '').replace(/\|/g, '\\|'), 50)} | ${truncate((g.brand || '').replace(/\|/g, '\\|'), 28)} | ${g.copyIds.length} | ${enr} |`,
    )
  }
  L.push('')
  return L.join('\n')
}
