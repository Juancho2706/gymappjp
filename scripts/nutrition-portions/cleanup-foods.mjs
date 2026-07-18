#!/usr/bin/env node
/**
 * Driver `cleanup-foods`: limpieza del catalogo `public.foods` (SPEC porciones,
 * pasada de saneamiento previa/paralela a la clasificacion). I/O + gating; toda la
 * matematica de decision vive en `./cleanup-lib.ts` y esta 100% testeada aparte.
 *
 * Patron: espeja EXACTO a `./classify-foods.mjs` (mismo estilo de envs + cliente
 * service-role + paginacion .range(1000) + doble gate del apply). Se corre con node
 * pelado (type-stripping de Node 24): `node scripts/nutrition-portions/cleanup-foods.mjs`.
 * IMPORTS RELATIVOS SIEMPRE CON EXTENSION .ts EXPLICITA (gotcha real del type-stripping).
 *
 * QUE LIMPIA (recon del orquestador — dimensiones reales del catalogo):
 *   (a) DUPLICADOS EXACTOS: mismo lower(btrim(name)) Y mismo lower(coalesce(btrim(brand),'')).
 *       Canonico a conservar: mas referencias -> exchange_group_id no nulo -> id mas bajo
 *       (foods NO tiene created_at). Los demas: BORRAR si cero referencias; con refs ->
 *       'requiere merge' (remapear FKs es una pasada POSTERIOR, este script NO lo hace).
 *   (b) NO-LATINOS: name con caracteres CJK/coreano/thai/cirilico/arabe — borrar si cero refs.
 *   (c) SUPLEMENTOS COMPUESTOS: nombres de aminoacidos/quimicos puros — borrar si cero refs.
 *
 * REFERENCIAS (sin hardcode de tablas): enumera TODAS las FKs a `foods.id` desde el
 * OpenAPI de PostgREST (reflexion del catalogo pg_constraint que hace el propio PostgREST;
 * information_schema no esta expuesto y no hay RPC exec_sql). Cuenta filas referenciantes
 * por food_id sobre cada FK, asi V1, V2, recetas, favoritos, medios, etc. quedan cubiertos.
 *
 * MODOS:
 *   (default) DRY-RUN — cero escrituras. Enumera FKs, lee foods (select *), cuenta refs,
 *     arma el plan y emite respaldo-preview + reporte MD/JSON a tmp/nutrition-portions/.
 *   --apply   Borra. Antes escribe el respaldo JSON (select * de todo lo borrable = fuente
 *     del --down) + SQL _bak DB-side para el runbook. SOLO borra filas con CERO referencias
 *     (re-verifica en el momento). Doble gate: flag --apply + env NUTRITION_PORTIONS_CONFIRM='yes'.
 *   --down    Re-inserta las filas del respaldo JSON tal cual (mismos ids), excluyendo la
 *     columna generada name_search. Mismo doble gate que --apply.
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (apps/web/.env.local o .env.local).
 *
 * Flags: --apply | --down | --backup <path> | --out <dir>
 */

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  parseFkRefsToFoods,
  groupExactDuplicates,
  junkCategory,
  buildCleanupPlan,
  stripGeneratedColumns,
  stampDate,
  backupFileName,
  backupTableName,
  renderReportMarkdown,
} from './cleanup-lib.ts'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
config({ path: resolve(__dirname, '../../apps/web/.env.local') })
config({ path: resolve(__dirname, '../../.env.local'), override: false })

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function flagValue(name) {
  const idx = process.argv.indexOf(name)
  if (idx === -1) return undefined
  const value = process.argv[idx + 1]
  if (!value || value.startsWith('--')) return undefined
  return value
}

const APPLY = process.argv.includes('--apply')
const DOWN = process.argv.includes('--down')
const OUT_DIR = flagValue('--out') ?? resolve(__dirname, '../../tmp/nutrition-portions')
const BACKUP_ARG = flagValue('--backup') ?? null

if (APPLY && DOWN) {
  console.error('--apply y --down son mutuamente excluyentes.')
  process.exit(1)
}

const MODE = APPLY ? 'APPLY' : DOWN ? 'DOWN' : 'DRY-RUN'

// ---------------------------------------------------------------------------
// Cliente service-role (bypass real de RLS; nunca cliente admin crudo)
// ---------------------------------------------------------------------------

function createServiceRoleClient(url, key) {
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

/** Lee toda una tabla paginando (PostgREST tope 1000/pagina; foods ~4.900). */
async function selectAll(db, table, columns, filter) {
  const pageSize = 1000
  const rows = []
  for (let from = 0; ; from += pageSize) {
    let q = db.from(table).select(columns).range(from, from + pageSize - 1).order('id', { ascending: true })
    if (filter) q = filter(q)
    const { data, error } = await q
    if (error) throw new Error(`select ${table}: ${error.message}`)
    const batch = data ?? []
    rows.push(...batch)
    if (batch.length < pageSize) break
  }
  return rows
}

// ---------------------------------------------------------------------------
// Salida a disco (gitignoreada: tmp/)
// ---------------------------------------------------------------------------

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

function writeJson(path, payload) {
  mkdirSync(OUT_DIR, { recursive: true })
  writeFileSync(path, JSON.stringify(payload, null, 2), 'utf8')
}

function writeText(path, text) {
  mkdirSync(OUT_DIR, { recursive: true })
  writeFileSync(path, text, 'utf8')
}

// ---------------------------------------------------------------------------
// Guardas comunes
// ---------------------------------------------------------------------------

function requireEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY (apps/web/.env.local o .env.local).')
    process.exit(1)
  }
  return { url, key }
}

function requireWriteConfirm() {
  if (process.env.NUTRITION_PORTIONS_CONFIRM !== 'yes') {
    console.error(
      `--${APPLY ? 'apply' : 'down'} escribe en la Supabase remota. Requiere AMBOS gates:\n` +
        `  1) flag --${APPLY ? 'apply' : 'down'}\n` +
        "  2) env NUTRITION_PORTIONS_CONFIRM='yes'\n" +
        'Abortando.',
    )
    process.exit(1)
  }
}

// ---------------------------------------------------------------------------
// Enumeracion de FKs a foods (OpenAPI de PostgREST) + conteo de referencias
// ---------------------------------------------------------------------------

/** Descarga el OpenAPI de PostgREST y devuelve las columnas FK a foods.id. */
async function fetchFkRefs(url, key) {
  const res = await fetch(`${url}/rest/v1/`, { headers: { apikey: key, authorization: `Bearer ${key}` } })
  if (!res.ok) throw new Error(`OpenAPI ${res.status}: ${res.statusText}`)
  const spec = await res.json()
  return parseFkRefsToFoods(spec)
}

function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

/**
 * Cuenta, por food_id, cuantas filas lo referencian sumando TODAS las columnas FK.
 * Solo consulta el conjunto candidato (dupes + junk) para no barrer tablas enteras.
 * Si CUALQUIER consulta FK falla, se aborta: subcontar llevaria a borrar filas referenciadas.
 */
async function countReferences(db, fkRefs, candidateIds) {
  const counts = new Map()
  for (const id of candidateIds) counts.set(id, 0)
  const idSet = new Set(candidateIds)
  const batches = chunk(candidateIds, 150)
  for (const { table, column } of fkRefs) {
    for (const batch of batches) {
      const { data, error } = await db.from(table).select(column).in(column, batch)
      if (error) throw new Error(`count refs ${table}.${column}: ${error.message}`)
      for (const row of data ?? []) {
        const fid = row[column]
        if (fid != null && idSet.has(fid)) counts.set(fid, (counts.get(fid) ?? 0) + 1)
      }
    }
  }
  return counts
}

// ---------------------------------------------------------------------------
// Nucleo compartido: enumerar FKs, leer foods, contar refs, armar el plan
// ---------------------------------------------------------------------------

const FOODS_COLUMNS = '*'

async function computePlan(db, url, key) {
  const fkRefs = await fetchFkRefs(url, key)
  const foods = await selectAll(db, 'foods', FOODS_COLUMNS)

  // Conjunto candidato: filas en algun grupo de duplicados exactos + filas junk.
  const dupGroups = groupExactDuplicates(foods)
  const candidateSet = new Set()
  for (const bucket of dupGroups.values()) for (const r of bucket) candidateSet.add(r.id)
  for (const f of foods) if (junkCategory(f.name)) candidateSet.add(f.id)
  const candidateIds = Array.from(candidateSet)

  const refCountById = await countReferences(db, fkRefs, candidateIds)
  const plan = buildCleanupPlan(foods, refCountById)
  return { fkRefs, foods, plan, candidateIds }
}

// ---------------------------------------------------------------------------
// DRY-RUN
// ---------------------------------------------------------------------------

function logSummary(plan, fkRefs) {
  console.log(`\nFKs a foods.id enumeradas (${fkRefs.length}):`)
  for (const r of fkRefs) console.log(`  - ${r.table}.${r.column}`)
  console.log(`\nFoods totales: ${plan.totalFoods}`)
  console.log(`Duplicados exactos: ${plan.duplicates.groupCount} grupos · ${plan.duplicates.extraRows} filas extra`)
  console.log(`No-latinos: ${plan.junk.nonLatin.length} · Suplementos: ${plan.junk.supplement.length}`)
  console.log(`A BORRAR (cero refs, union unica): ${plan.deletableIds.length}`)
  console.log(`REQUIERE MERGE (con refs): ${plan.requiresMerge.length}`)
}

async function runDryRun(db, url, key) {
  const { fkRefs, foods, plan } = await computePlan(db, url, key)
  const foodsById = new Map(foods.map((f) => [f.id, f]))

  const generatedAt = new Date().toISOString()
  const meta = { generatedAt, target: url, mode: MODE }

  // Respaldo-preview: filas COMPLETAS de todo lo borrable (lo que --apply respaldaria).
  const backupRows = plan.deletableIds.map((id) => foodsById.get(id)).filter(Boolean)

  const summaryPayload = {
    ...meta,
    fkRefs,
    counts: {
      totalFoods: plan.totalFoods,
      dupGroups: plan.duplicates.groupCount,
      dupExtraRows: plan.duplicates.extraRows,
      nonLatin: plan.junk.nonLatin.length,
      supplements: plan.junk.supplement.length,
      deletable: plan.deletableIds.length,
      requiresMerge: plan.requiresMerge.length,
    },
    plan,
    backupPreviewCount: backupRows.length,
  }

  const s = stamp()
  writeJson(resolve(OUT_DIR, `cleanup-${s}.json`), summaryPayload)
  writeJson(resolve(OUT_DIR, 'cleanup-latest.json'), summaryPayload)
  writeText(resolve(OUT_DIR, `cleanup-report-${s}.md`), renderReportMarkdown(plan, meta))
  writeText(resolve(OUT_DIR, 'cleanup-report-latest.md'), renderReportMarkdown(plan, meta))
  // Preview del respaldo (no autoritativo; el autoritativo lo escribe --apply).
  writeJson(resolve(OUT_DIR, 'cleanup-backup-preview-latest.json'), { ...meta, count: backupRows.length, rows: backupRows })

  logSummary(plan, fkRefs)
  console.log(`\nDRY-RUN OK (cero escrituras).`)
  console.log(`Reporte MD: ${resolve(OUT_DIR, 'cleanup-report-latest.md')}`)
  console.log(`Resumen JSON: ${resolve(OUT_DIR, 'cleanup-latest.json')}`)
  console.log(`Respaldo-preview: ${resolve(OUT_DIR, 'cleanup-backup-preview-latest.json')}`)
}

// ---------------------------------------------------------------------------
// APPLY
// ---------------------------------------------------------------------------

function backupDdlSql(stampStr) {
  const table = backupTableName(stampStr)
  return [
    `-- Snapshot DB-side de las filas borradas por cleanup-foods (opcional; el respaldo`,
    `-- autoritativo de --down es el JSON del driver). Correr via MCP/SQL antes del apply.`,
    `-- Sustituir la lista de ids por plan.deletableIds del reporte.`,
    `create table if not exists public.${table} as`,
    `  select * from public.foods where id = any($1::uuid[]);`,
    ``,
    `-- Restore (equivalente al --down del driver, excluye la columna generada name_search):`,
    `-- insert into public.foods (<columnas sin name_search>)`,
    `--   select <columnas sin name_search> from public.${table};`,
    ``,
  ].join('\n')
}

async function runApply(db, url, key) {
  const { fkRefs, foods, plan } = await computePlan(db, url, key)
  const foodsById = new Map(foods.map((f) => [f.id, f]))

  const currentStamp = stampDate()
  const backupPath = resolve(OUT_DIR, backupFileName(currentStamp))
  const backupRows = plan.deletableIds.map((id) => foodsById.get(id)).filter(Boolean)

  // Respaldo AUTORITATIVO (select * completo) ANTES de borrar.
  writeJson(backupPath, {
    generatedAt: new Date().toISOString(),
    target: url,
    count: backupRows.length,
    fkRefs,
    rows: backupRows,
  })
  writeText(resolve(OUT_DIR, `foods-cleanup-bak-${currentStamp}.sql`), backupDdlSql(currentStamp))

  logSummary(plan, fkRefs)
  console.log(`\nFilas a borrar: ${plan.deletableIds.length} · respaldo: ${backupPath}`)
  console.log('Continuando en 3 segundos... (Ctrl+C para abortar)')
  await new Promise((r) => setTimeout(r, 3000))

  let deleted = 0
  let skipped = 0
  const errors = []
  // Re-verifica cero refs en el momento del borrado (una FK pudo entrar entre el plan y el apply).
  const liveCounts = await countReferences(db, fkRefs, plan.deletableIds)
  for (const id of plan.deletableIds) {
    if ((liveCounts.get(id) ?? 0) > 0) {
      skipped += 1 // aparecio una referencia: no se borra
      continue
    }
    const { data, error } = await db.from('foods').delete().eq('id', id).select('id')
    if (error) {
      errors.push({ id, error: error.message })
      continue
    }
    if (data && data.length > 0) deleted += 1
    else skipped += 1
  }

  const reportPath = resolve(OUT_DIR, `cleanup-apply-${stamp()}.json`)
  writeJson(reportPath, {
    generatedAt: new Date().toISOString(),
    target: url,
    deleted,
    skipped,
    errors,
    backupPath,
    requiresMerge: plan.requiresMerge.length,
  })

  console.log(`\nAPPLY: borradas=${deleted} · saltadas=${skipped} · errores=${errors.length}`)
  console.log(`Reporte: ${reportPath}`)
  if (errors.length > 0) process.exitCode = 1
}

// ---------------------------------------------------------------------------
// DOWN (re-inserta desde el respaldo JSON)
// ---------------------------------------------------------------------------

function resolveBackupPath() {
  if (BACKUP_ARG) return resolve(BACKUP_ARG)
  let entries
  try {
    entries = readdirSync(OUT_DIR)
  } catch {
    return null
  }
  const candidates = entries.filter((f) => f.startsWith('foods-cleanup-bak-') && f.endsWith('.json')).sort()
  if (candidates.length === 0) return null
  return resolve(OUT_DIR, candidates[candidates.length - 1])
}

async function runDown(db, url) {
  const backupPath = resolveBackupPath()
  if (!backupPath) {
    console.error('No hay respaldo para restaurar. Pasa --backup <path> o deja un foods-cleanup-bak-*.json en tmp/.')
    process.exit(1)
  }
  const parsed = JSON.parse(readFileSync(backupPath, 'utf8'))
  const rows = Array.isArray(parsed?.rows) ? parsed.rows : []
  if (rows.length === 0) {
    console.error(`Respaldo ${backupPath} sin filas. Nada que restaurar.`)
    process.exit(1)
  }

  console.log(`Re-insertando ${rows.length} filas desde ${backupPath}`)
  console.log('Continuando en 3 segundos... (Ctrl+C para abortar)')
  await new Promise((r) => setTimeout(r, 3000))

  let restored = 0
  const errors = []
  for (const r of rows) {
    // Excluye columnas generadas (name_search) que Postgres rechaza en INSERT.
    const payload = stripGeneratedColumns(r)
    const { error } = await db.from('foods').upsert(payload, { onConflict: 'id' })
    if (error) errors.push({ id: r.id, error: error.message })
    else restored += 1
  }

  const reportPath = resolve(OUT_DIR, `cleanup-down-${stamp()}.json`)
  writeJson(reportPath, { generatedAt: new Date().toISOString(), target: url, backupPath, restored, errors })
  console.log(`\nDOWN: restauradas=${restored} · errores=${errors.length}`)
  console.log(`Reporte: ${reportPath}`)
  if (errors.length > 0) process.exitCode = 1
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const { url, key } = requireEnv()
  if (APPLY || DOWN) requireWriteConfirm()

  console.log(`Target: ${url}`)
  console.log(`Modo: ${MODE}`)

  const db = createServiceRoleClient(url, key)

  if (APPLY) await runApply(db, url, key)
  else if (DOWN) await runDown(db, url)
  else await runDryRun(db, url, key)
}

main().catch((err) => {
  console.error('Fallo cleanup-foods:', err instanceof Error ? err.message : err)
  process.exit(1)
})
