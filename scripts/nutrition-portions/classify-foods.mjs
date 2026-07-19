#!/usr/bin/env tsx
/**
 * Driver `classify-foods` del pipeline de clasificacion masiva del catalogo de
 * `foods` por grupo de intercambio (SPEC R8 pasos 4-5, TASKS T4.2). I/O + gating;
 * la matematica pura vive en `./classify-lib.ts` (que envuelve `./heuristics.ts`
 * de T4.1) y esta 100% testeada aparte.
 *
 * Patron: espeja `scripts/nutrition-v2-conversion/convert-v1-plans.ts` (mismo estilo
 * de envs + cliente service-role + doble gate del apply). Se corre con tsx igual que
 * ese driver: `node --import tsx scripts/nutrition-portions/classify-foods.mjs`.
 *
 * MODOS:
 *   (default) DRY-RUN — cero escrituras. Lee foods + exchange_groups, re-verifica los
 *     ref_* del fixture contra la DB (ABORTA si difieren), clasifica y emite el dataset
 *     a JSON en tmp/nutrition-portions/ (ruta gitignoreada).
 *   --apply   Escribe. UPDATE de `foods` SOLO `where exchange_group_id is null` (jamas
 *     pisa clasificacion manual V1 — hallazgo D3) y SOLO tiers aprobados
 *     (--tiers=alto | alto,medio; default alto). ANTES del UPDATE escribe el respaldo
 *     JSON con los valores previos (fuente autoritativa del --down) + el SQL del
 *     _bak DB-side para el runbook. Doble gate: flag --apply + env
 *     NUTRITION_PORTIONS_CONFIRM='yes'.
 *   --down    Restaura desde el respaldo JSON (--backup <path>, o el mas reciente en
 *     tmp/). Mismo doble gate que --apply.
 *
 * COORDINACION (SPEC R8 paso 5 / hallazgo D3): el --apply corre DESPUES del apply de la
 * conversion de los 6 planes exchanges (no mover el suelo bajo ellos). Usa service-role
 * (nunca cliente admin crudo). NADA de esto se corre en fase de build: la corrida real
 * es operacion post-conversion con GO del CEO.
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (apps/web/.env.local o .env.local).
 *
 * Flags: --apply | --down | --tiers=alto[,medio] | --backup <path> | --out <dir>
 */

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  verifyGroupRefs,
  systemGroupIdByCode,
  classifyDataset,
  summarizeDataset,
  parseTiersFlag,
  filterForApply,
  buildUpdatePayload,
  buildBackupRow,
  stampDate,
  backupFileName,
  backupDdlSql,
} from './classify-lib.ts'

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

/** Soporta --tiers=alto,medio (=) y --tiers alto,medio (espacio). */
function tiersArg() {
  const eq = process.argv.find((a) => a.startsWith('--tiers='))
  if (eq) return eq.slice('--tiers='.length)
  return flagValue('--tiers')
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
// Cliente service-role (patron del repo: service_role key = bypass real de RLS;
// nunca cliente admin crudo — gotcha memoria "Admin client RLS")
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

const FOODS_COLUMNS =
  'id, name, category, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, is_liquid, exchange_group_id, exchange_portion_grams, exchange_portion_label'
const GROUPS_COLUMNS = 'id, code, name, is_system, ref_calories, ref_protein_g, ref_carbs_g, ref_fats_g, composed_of, deleted_at'

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
// DRY-RUN
// ---------------------------------------------------------------------------

async function runDryRun(db, url) {
  const [foods, groups] = await Promise.all([
    selectAll(db, 'foods', FOODS_COLUMNS),
    selectAll(db, 'exchange_groups', GROUPS_COLUMNS),
  ])

  const refs = verifyGroupRefs(groups)
  if (!refs.ok) {
    console.error('ABORT: los ref_* del fixture (heuristics.ts) NO coinciden con exchange_groups system de la DB.')
    console.error('El fixture quedo viejo; actualiza GROUP_REFS antes de clasificar. Mismatches:')
    for (const m of refs.mismatches) {
      console.error(`  - ${m.code}.${m.field}: fixture=${m.fixture ?? '—'} db=${m.db ?? '—'}`)
    }
    process.exit(2)
  }

  const rows = classifyDataset(foods)
  const summary = summarizeDataset(rows)
  const outPath = resolve(OUT_DIR, `classified-${stamp()}.json`)
  const latestPath = resolve(OUT_DIR, 'classified-latest.json')
  const payload = { generatedAt: new Date().toISOString(), target: url, mode: MODE, refsVerified: true, summary, rows }
  writeJson(outPath, payload)
  writeJson(latestPath, payload)

  console.log(`\nDRY-RUN OK (cero escrituras). Foods: ${summary.total}`)
  console.log(`Clasificados: ${summary.classified} · sin clasificar: ${summary.unclassified}`)
  console.log(`Tiers: alto=${summary.byTier.alto} medio=${summary.byTier.medio} bajo=${summary.byTier.bajo}`)
  console.log('Por grupo:', summary.byGroup)
  console.log(`Dataset: ${outPath}`)
  console.log(`Dataset (latest): ${latestPath}`)
}

// ---------------------------------------------------------------------------
// APPLY
// ---------------------------------------------------------------------------

async function runApply(db, url) {
  const approvedTiers = parseTiersFlag(tiersArg())
  const [foods, groups] = await Promise.all([
    selectAll(db, 'foods', FOODS_COLUMNS),
    selectAll(db, 'exchange_groups', GROUPS_COLUMNS),
  ])

  const refs = verifyGroupRefs(groups)
  if (!refs.ok) {
    console.error('ABORT: ref_* del fixture != exchange_groups system. Actualiza GROUP_REFS. No se escribio nada.')
    for (const m of refs.mismatches) console.error(`  - ${m.code}.${m.field}: fixture=${m.fixture ?? '—'} db=${m.db ?? '—'}`)
    process.exit(2)
  }

  const codeToId = systemGroupIdByCode(groups)
  const foodsById = new Map(foods.map((f) => [f.id, f]))
  const rows = classifyDataset(foods)
  const toApply = filterForApply(rows, approvedTiers, foodsById)

  // Respaldo AUTORITATIVO (valores previos de las filas que se van a tocar) ANTES de escribir.
  const currentStamp = stampDate()
  const backupPath = resolve(OUT_DIR, backupFileName(currentStamp))
  const backupRows = toApply.map((r) => buildBackupRow(foodsById.get(r.foodId)))
  writeJson(backupPath, {
    generatedAt: new Date().toISOString(),
    target: url,
    tiers: Array.from(approvedTiers),
    count: backupRows.length,
    rows: backupRows,
  })
  // SQL del _bak DB-side para el runbook (el driver no corre DDL; ver classify-lib).
  const ddlPath = resolve(OUT_DIR, `foods-portions-bak-${currentStamp}.sql`)
  mkdirSync(OUT_DIR, { recursive: true })
  writeFileSync(ddlPath, backupDdlSql(currentStamp), 'utf8')

  console.log(`Tiers aprobados: ${Array.from(approvedTiers).join(', ')}`)
  console.log(`Filas a actualizar: ${toApply.length} · respaldo: ${backupPath}`)
  console.log('Continuando en 3 segundos... (Ctrl+C para abortar)')
  await new Promise((r) => setTimeout(r, 3000))

  let updated = 0
  let skipped = 0
  const errors = []
  for (const row of toApply) {
    const payload = buildUpdatePayload(row, codeToId)
    if (!payload) {
      skipped += 1
      continue
    }
    // Doble cinturon del hallazgo D3: la guarda `is('exchange_group_id', null)` en el
    // propio UPDATE garantiza no pisar una clasificacion manual que haya entrado entre
    // el SELECT y el UPDATE (ademas del filtro en filterForApply).
    const { data, error } = await db
      .from('foods')
      .update(payload)
      .eq('id', row.foodId)
      .is('exchange_group_id', null)
      .select('id')
    if (error) {
      errors.push({ foodId: row.foodId, error: error.message })
      continue
    }
    if (data && data.length > 0) updated += 1
    else skipped += 1 // ya tenia grupo (guarda del where): no se pisa
  }

  const reportPath = resolve(OUT_DIR, `apply-${stamp()}.json`)
  writeJson(reportPath, {
    generatedAt: new Date().toISOString(),
    target: url,
    tiers: Array.from(approvedTiers),
    updated,
    skipped,
    errors,
    backupPath,
    ddlPath,
  })

  console.log(`\nAPPLY: actualizados=${updated} · saltados=${skipped} · errores=${errors.length}`)
  console.log(`Reporte: ${reportPath}`)
  if (errors.length > 0) process.exitCode = 1
}

// ---------------------------------------------------------------------------
// DOWN (restaura desde el respaldo JSON)
// ---------------------------------------------------------------------------

function resolveBackupPath() {
  if (BACKUP_ARG) return resolve(BACKUP_ARG)
  // Mas reciente en OUT_DIR con el prefijo del respaldo.
  let entries
  try {
    entries = readdirSync(OUT_DIR)
  } catch {
    return null
  }
  const candidates = entries.filter((f) => f.startsWith('foods-portions-bak-') && f.endsWith('.json')).sort()
  if (candidates.length === 0) return null
  return resolve(OUT_DIR, candidates[candidates.length - 1])
}

async function runDown(db, url) {
  const backupPath = resolveBackupPath()
  if (!backupPath) {
    console.error('No hay respaldo para restaurar. Pasa --backup <path> o deja un foods-portions-bak-*.json en tmp/.')
    process.exit(1)
  }
  const parsed = JSON.parse(readFileSync(backupPath, 'utf8'))
  const rows = Array.isArray(parsed?.rows) ? parsed.rows : []
  if (rows.length === 0) {
    console.error(`Respaldo ${backupPath} sin filas. Nada que restaurar.`)
    process.exit(1)
  }

  console.log(`Restaurando ${rows.length} filas desde ${backupPath}`)
  console.log('Continuando en 3 segundos... (Ctrl+C para abortar)')
  await new Promise((r) => setTimeout(r, 3000))

  let restored = 0
  const errors = []
  for (const r of rows) {
    const { error } = await db
      .from('foods')
      .update({
        exchange_group_id: r.exchange_group_id ?? null,
        exchange_portion_grams: r.exchange_portion_grams ?? null,
        exchange_portion_label: r.exchange_portion_label ?? null,
      })
      .eq('id', r.foodId)
    if (error) errors.push({ foodId: r.foodId, error: error.message })
    else restored += 1
  }

  const reportPath = resolve(OUT_DIR, `down-${stamp()}.json`)
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

  if (APPLY) await runApply(db, url)
  else if (DOWN) await runDown(db, url)
  else await runDryRun(db, url)
}

main().catch((err) => {
  console.error('Fallo classify-foods:', err instanceof Error ? err.message : err)
  process.exit(1)
})
