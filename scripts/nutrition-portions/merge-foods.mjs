#!/usr/bin/env node
/**
 * Driver `merge-foods`: FUSION de alimentos DUPLICADOS CON USO en `public.foods`. Segunda
 * pasada del saneamiento del catalogo (SPEC porciones): `cleanup-foods` ya borro los
 * duplicados SIN referencias; este toma los grupos que quedaron (mismo lower(name)+lower(brand)
 * pero YA referenciados por registros de alumnos/planes), REMAPEA todas sus FKs al canonico,
 * ENRIQUECE el canonico con datos que solo tenia la copia, y recien ahi BORRA la copia.
 *
 * Patron: espeja EXACTO a `./cleanup-foods.mjs` (mismos envs + cliente service-role +
 * paginacion .range(1000) + doble gate del apply + respaldos a tmp/). Se corre con node
 * pelado (type-stripping de Node 24): `node scripts/nutrition-portions/merge-foods.mjs`.
 * IMPORTS RELATIVOS SIEMPRE CON EXTENSION .ts EXPLICITA (gotcha real del type-stripping).
 *
 * QUE HACE (por grupo de duplicados exactos con 2+ filas):
 *   1) CANONICO: mas referencias totales -> exchange_group_id no nulo -> id mas bajo
 *      (`foods` no tiene created_at; el id uuid es el desempate estable). Reusa cleanup-lib.
 *   2) REMAPEO: enumera dinamicamente TODAS las FKs a foods (OpenAPI de PostgREST, igual que
 *      cleanup) y TODAS las PKs. Por cada copia no-canonica, reapunta cada fila referenciante
 *      al canonico con UPDATE tabla-por-tabla. RESTRICCIONES UNICAS: si el remapeo crearia un
 *      duplicado (p.ej. client_food_preferences unique(client_id,food_id), food_media
 *      unique(food_id,object_path), nutrition_meal_food_swaps unique(daily_log_id,meal_id,
 *      original_food_id)), esa fila de la copia se BORRA en vez de updatear. El apply ademas
 *      degrada a DELETE cualquier UPDATE que reciba 23505 en vivo (red de seguridad).
 *   3) ENRIQUECIMIENTO: solo si el canonico tiene la columna VACIA y una copia tiene dato,
 *      se rellena exchange_group_id / exchange_portion_grams / exchange_portion_label /
 *      product_image_path (imagen). Nada mas se pisa.
 *   4) DELETE de la copia (ya sin referencias).
 *
 * MODOS:
 *   (default) DRY-RUN — cero escrituras. Enumera FKs/PKs, lee foods + tablas referenciantes,
 *     arma el PLAN DE REMAPEO COMPLETO y lo emite como JSON + reporte MD/JSON a tmp/. Reporta
 *     grupos, copias a borrar, filas a remapear por tabla y conflictos de unica detectados.
 *   --apply   Ejecuta. Antes escribe el respaldo JSON AUTORITATIVO (filas foods copias + campos
 *     enriquecibles previos del canonico + mapa de remapeo por tabla con las PKs afectadas +
 *     filas duplicadas borradas COMPLETAS). Doble gate: flag --apply + env
 *     NUTRITION_PORTIONS_CONFIRM='yes'.
 *   --down    Revierte desde el respaldo: re-inserta copias y duplicados borrados, des-remapea
 *     los UPDATE (columna FK de vuelta a la copia) y des-enriquece el canonico. Mismo doble gate.
 *
 * ATOMICIDAD: PostgREST/supabase-js no exponen transacciones multi-statement, igual que
 * cleanup-foods. El respaldo AUTORITATIVO se escribe ANTES de cualquier mutacion y el orden de
 * ops (deletes de conflicto -> updates de remapeo -> enriquecimiento -> delete de copias) es
 * recuperable via --down ante una falla a mitad de camino. El orquestador corre el --apply.
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (apps/web/.env.local o .env.local).
 * Flags: --apply | --down | --backup <path> | --out <dir>
 */

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseFkRefsToFoods } from './cleanup-lib.ts'
import {
  parsePrimaryKeys,
  keyColsForRemap,
  uniqueKeysFor,
  classifyReferencingRows,
  buildMergeGroups,
  ENRICHABLE_COLUMNS,
  stampDate,
  stripGeneratedColumns,
  mergeBackupFileName,
  mergeBackupTableName,
  renderMergeReportMarkdown,
} from './merge-lib.ts'
import { groupExactDuplicates } from './cleanup-lib.ts'

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

/** Lee toda una tabla paginando (PostgREST tope 1000/pagina). */
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

/**
 * Lee filas de `table` donde `column` esta en `ids`, paginando por chunk (un food popular
 * puede tener >1000 filas referenciantes). No ordena por id (algunas tablas tienen PK
 * compuesta sin columna id); el orden estable lo impone el llamador al clasificar.
 */
async function selectWhereIn(db, table, columns, column, ids) {
  const rows = []
  const pageSize = 1000
  for (const batch of chunk(ids, 100)) {
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await db.from(table).select(columns).in(column, batch).range(from, from + pageSize - 1)
      if (error) throw new Error(`select ${table} in ${column}: ${error.message}`)
      const page = data ?? []
      rows.push(...page)
      if (page.length < pageSize) break
    }
  }
  return rows
}

function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
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
// Enumeracion de FKs + PKs (OpenAPI de PostgREST) y conteo de referencias
// ---------------------------------------------------------------------------

async function fetchOpenApi(url, key) {
  const res = await fetch(`${url}/rest/v1/`, { headers: { apikey: key, authorization: `Bearer ${key}` } })
  if (!res.ok) throw new Error(`OpenAPI ${res.status}: ${res.statusText}`)
  return res.json()
}

/** Cuenta, por food_id, cuantas filas lo referencian sumando TODAS las columnas FK. */
async function countReferences(db, fkRefs, candidateIds) {
  const counts = new Map()
  for (const id of candidateIds) counts.set(id, 0)
  const idSet = new Set(candidateIds)
  for (const { table, column } of fkRefs) {
    for (const batch of chunk(candidateIds, 150)) {
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
// Nucleo: grupos a fusionar + plan de remapeo tabla-por-tabla
// ---------------------------------------------------------------------------

async function loadGroups(db, url, key) {
  const spec = await fetchOpenApi(url, key)
  const fkRefs = parseFkRefsToFoods(spec)
  const pkByTable = parsePrimaryKeys(spec)
  const foods = await selectAll(db, 'foods', '*')

  // Candidatos = todos los miembros de grupos de duplicados exactos (para elegir canonico).
  const dupGroups = groupExactDuplicates(foods)
  const memberIds = new Set()
  for (const bucket of dupGroups.values()) for (const r of bucket) memberIds.add(r.id)
  const refCountById = await countReferences(db, fkRefs, Array.from(memberIds))

  const groups = buildMergeGroups(foods, refCountById)
  return { spec, fkRefs, pkByTable, foods, groups }
}

/** Columnas a leer de una tabla FK para clasificar: PK + columna FK + columnas de claves unicas. */
function selectColsFor(table, column, pkCols) {
  const cols = new Set([...pkCols, column])
  for (const key of uniqueKeysFor(table, column)) for (const c of key) cols.add(c)
  return Array.from(cols).join(',')
}

function pkObject(row, pkCols) {
  const pk = {}
  for (const c of pkCols) pk[c] = row[c]
  return pk
}

/** Ordena filas referenciantes por su PK (JSON) para clasificacion determinista. */
function sortByPk(rows, pkCols) {
  return [...rows].sort((a, b) => {
    const ka = JSON.stringify(pkCols.map((c) => a[c]))
    const kb = JSON.stringify(pkCols.map((c) => b[c]))
    return ka < kb ? -1 : ka > kb ? 1 : 0
  })
}

/**
 * Construye el plan de remapeo global leyendo cada tabla FK UNA vez (batch de todos los
 * copyIds / canonicalIds). Devuelve ops de UPDATE y DELETE + resumen por tabla.
 */
async function computeRemapPlan(db, fkRefs, pkByTable, groups) {
  const copyToCanonical = new Map()
  const allCopyIds = []
  const allCanonicalIds = []
  for (const g of groups) {
    allCanonicalIds.push(g.canonicalId)
    for (const cid of g.copyIds) {
      copyToCanonical.set(cid, g.canonicalId)
      allCopyIds.push(cid)
    }
  }

  const updateOps = []
  const deleteOps = []
  const tableSummaries = []

  for (const { table, column } of fkRefs) {
    const pkCols = pkByTable.get(table)
    if (!pkCols || pkCols.length === 0) throw new Error(`sin PK enumerada para ${table}; no se puede remapear con seguridad`)
    const uniqueKeys = uniqueKeysFor(table, column)
    const conflictProne = uniqueKeys.length > 0
    const selectCols = selectColsFor(table, column, pkCols)

    const copyRefRows = allCopyIds.length ? await selectWhereIn(db, table, selectCols, column, allCopyIds) : []
    const canonRefRows =
      conflictProne && allCanonicalIds.length ? await selectWhereIn(db, table, selectCols, column, allCanonicalIds) : []

    // Agrupa filas por canonico destino.
    const copyRowsByCanonical = new Map()
    for (const row of copyRefRows) {
      const canonicalId = copyToCanonical.get(row[column])
      if (!canonicalId) continue
      if (!copyRowsByCanonical.has(canonicalId)) copyRowsByCanonical.set(canonicalId, [])
      copyRowsByCanonical.get(canonicalId).push(row)
    }
    const canonRowsByCanonical = new Map()
    for (const row of canonRefRows) {
      const canonicalId = row[column]
      if (!canonRowsByCanonical.has(canonicalId)) canonRowsByCanonical.set(canonicalId, [])
      canonRowsByCanonical.get(canonicalId).push(row)
    }

    let updates = 0
    let deletes = 0
    for (const [canonicalId, rows] of copyRowsByCanonical) {
      const sorted = sortByPk(rows, pkCols)
      const cls = classifyReferencingRows({
        copyRows: sorted,
        canonRows: canonRowsByCanonical.get(canonicalId) ?? [],
        column,
        canonicalId,
        uniqueKeys,
      })
      const keyCols = keyColsForRemap(pkCols, column)
      for (const row of cls.updates) {
        const kc = {}
        for (const c of keyCols) kc[c] = row[c]
        updateOps.push({ table, column, keyCols: kc, from: row[column], to: canonicalId })
        updates += 1
      }
      for (const row of cls.deletes) {
        deleteOps.push({ table, column, pk: pkObject(row, pkCols), from: row[column], to: canonicalId })
        deletes += 1
      }
    }

    tableSummaries.push({ table, column, updates, deletes, conflictProne })
  }

  const totalUpdates = updateOps.reduce((n) => n + 1, 0)
  const totalConflictDeletes = deleteOps.length
  return { updateOps, deleteOps, tableSummaries, totalUpdates, totalConflictDeletes }
}

function buildSummary(foods, groups, remap) {
  const copyCount = groups.reduce((n, g) => n + g.copyIds.length, 0)
  return {
    totalFoods: foods.length,
    groupCount: groups.length,
    copyCount,
    remapByTable: remap.tableSummaries,
    totalUpdates: remap.updateOps.length,
    totalConflictDeletes: remap.deleteOps.length,
    enrichedGroupCount: groups.filter((g) => g.enrichment.fields.length > 0).length,
    groups: groups.map((g) => ({
      canonicalId: g.canonicalId,
      name: g.name,
      brand: g.brand,
      copyIds: g.copyIds,
      enrichmentFields: g.enrichment.fields.map((f) => f.column),
    })),
  }
}

// ---------------------------------------------------------------------------
// DRY-RUN
// ---------------------------------------------------------------------------

function logSummary(summary, fkRefs) {
  console.log(`\nFKs a foods.id enumeradas (${fkRefs.length}):`)
  for (const r of fkRefs) console.log(`  - ${r.table}.${r.column}`)
  console.log(`\nFoods totales: ${summary.totalFoods}`)
  console.log(`Grupos a fusionar: ${summary.groupCount} · copias a borrar: ${summary.copyCount}`)
  console.log(`Filas a remapear (UPDATE): ${summary.totalUpdates}`)
  console.log(`Filas duplicadas a borrar por conflicto de unica (DELETE): ${summary.totalConflictDeletes}`)
  console.log(`Grupos con enriquecimiento del canonico: ${summary.enrichedGroupCount}`)
  console.log('\nRemapeo por tabla:')
  for (const t of summary.remapByTable) {
    console.log(`  - ${t.table}.${t.column}: UPDATE=${t.updates} DELETE=${t.deletes}${t.conflictProne ? ' [unica-sobre-FK]' : ''}`)
  }
}

async function runDryRun(db, url, key) {
  const { fkRefs, pkByTable, foods, groups } = await loadGroups(db, url, key)
  const remap = await computeRemapPlan(db, fkRefs, pkByTable, groups)
  const summary = buildSummary(foods, groups, remap)

  const generatedAt = new Date().toISOString()
  const meta = { generatedAt, target: url, mode: MODE }

  const planPayload = {
    ...meta,
    fkRefs,
    pkByTable: Object.fromEntries(pkByTable),
    summary,
    // Plan de remapeo COMPLETO emitido PRIMERO (consigna): ops tabla-por-tabla.
    remap: { updateOps: remap.updateOps, deleteOps: remap.deleteOps },
    enrichment: groups
      .filter((g) => g.enrichment.fields.length > 0)
      .map((g) => ({ canonicalId: g.canonicalId, updates: g.enrichment.updates, fields: g.enrichment.fields })),
  }

  const s = stamp()
  writeJson(resolve(OUT_DIR, `merge-${s}.json`), planPayload)
  writeJson(resolve(OUT_DIR, 'merge-latest.json'), planPayload)
  writeText(resolve(OUT_DIR, `merge-report-${s}.md`), renderMergeReportMarkdown(summary, meta))
  writeText(resolve(OUT_DIR, 'merge-report-latest.md'), renderMergeReportMarkdown(summary, meta))

  logSummary(summary, fkRefs)
  console.log(`\nDRY-RUN OK (cero escrituras).`)
  console.log(`Reporte MD: ${resolve(OUT_DIR, 'merge-report-latest.md')}`)
  console.log(`Plan JSON: ${resolve(OUT_DIR, 'merge-latest.json')}`)
}

// ---------------------------------------------------------------------------
// APPLY
// ---------------------------------------------------------------------------

function backupDdlSql(stampStr) {
  const table = mergeBackupTableName(stampStr)
  return [
    `-- Snapshot DB-side opcional de las copias de foods fusionadas por merge-foods (el respaldo`,
    `-- autoritativo del --down es el JSON del driver, que ademas guarda el mapa de remapeo).`,
    `create table if not exists public.${table} as`,
    `  select * from public.foods where id = any($1::uuid[]);  -- lista = copyIds del reporte`,
    ``,
  ].join('\n')
}

async function applyEq(query, filterObj) {
  let q = query
  for (const [k, v] of Object.entries(filterObj)) q = q.eq(k, v)
  return q
}

async function runApply(db, url, key) {
  const { fkRefs, pkByTable, foods, groups } = await loadGroups(db, url, key)
  const remap = await computeRemapPlan(db, fkRefs, pkByTable, groups)
  const summary = buildSummary(foods, groups, remap)
  const currentStamp = stampDate()

  // --- Respaldo AUTORITATIVO (antes de mutar) ---
  // Filas COMPLETAS de las copias a borrar + campos enriquecibles previos del canonico +
  // filas duplicadas a borrar (select * por PK) + mapa de UPDATE de remapeo.
  const deletedDuplicates = []
  for (const op of remap.deleteOps) {
    let q = db.from(op.table).select('*')
    q = await applyEq(q, op.pk)
    const { data, error } = await q.maybeSingle()
    if (error) throw new Error(`backup select ${op.table} ${JSON.stringify(op.pk)}: ${error.message}`)
    if (data) deletedDuplicates.push({ table: op.table, column: op.column, pkCols: pkByTable.get(op.table), row: data })
  }

  const backup = {
    generatedAt: new Date().toISOString(),
    target: url,
    stamp: currentStamp,
    fkRefs,
    pkByTable: Object.fromEntries(pkByTable),
    groups: groups.map((g) => {
      const canonicalBefore = {}
      for (const c of ENRICHABLE_COLUMNS) canonicalBefore[c] = g.canonical[c] ?? null
      return { canonicalId: g.canonicalId, canonicalBefore, copies: g.copies }
    }),
    remapUpdates: remap.updateOps,
    deletedDuplicates,
  }
  const backupPath = resolve(OUT_DIR, mergeBackupFileName(currentStamp))
  writeJson(backupPath, backup)
  writeText(resolve(OUT_DIR, `foods-merge-bak-${currentStamp}.sql`), backupDdlSql(currentStamp))

  logSummary(summary, fkRefs)
  console.log(`\nRespaldo autoritativo: ${backupPath}`)
  console.log('Continuando en 3 segundos... (Ctrl+C para abortar)')
  await new Promise((r) => setTimeout(r, 3000))

  const errors = []
  const fallbackDeletes = []
  let conflictDeleted = 0
  let remapped = 0
  let enriched = 0
  let copiesDeleted = 0

  // 1) Deletes de conflicto (liberan el espacio de la unica).
  for (const op of remap.deleteOps) {
    let q = db.from(op.table).delete()
    q = await applyEq(q, op.pk)
    const { error } = await q
    if (error) errors.push({ stage: 'conflict-delete', op, error: error.message })
    else conflictDeleted += 1
  }

  // 2) Updates de remapeo (con degradacion a DELETE si aparece 23505 en vivo).
  for (const op of remap.updateOps) {
    let q = db.from(op.table).update({ [op.column]: op.to })
    q = await applyEq(q, op.keyCols)
    q = q.eq(op.column, op.from)
    const { error } = await q
    if (!error) {
      remapped += 1
      continue
    }
    if (error.code === '23505') {
      // Conflicto no predicho: borrar la fila duplicada. Se respalda su fila completa aparte.
      const pk = { ...op.keyCols, [op.column]: op.from }
      let sel = db.from(op.table).select('*')
      sel = await applyEq(sel, pk)
      const { data: full } = await sel.maybeSingle()
      if (full) fallbackDeletes.push({ table: op.table, column: op.column, pkCols: pkByTable.get(op.table), row: full })
      let del = db.from(op.table).delete()
      del = await applyEq(del, pk)
      const { error: delErr } = await del
      if (delErr) errors.push({ stage: 'fallback-delete', op, error: delErr.message })
      else conflictDeleted += 1
    } else {
      errors.push({ stage: 'remap-update', op, error: error.message })
    }
  }

  // Si hubo fallback-deletes, ampliar el respaldo para que --down los restaure.
  if (fallbackDeletes.length > 0) {
    backup.deletedDuplicates.push(...fallbackDeletes)
    writeJson(backupPath, backup)
  }

  // 3) Enriquecimiento del canonico (solo columnas que estaban vacias).
  for (const g of groups) {
    if (g.enrichment.fields.length === 0) continue
    const { error } = await db.from('foods').update(g.enrichment.updates).eq('id', g.canonicalId)
    if (error) errors.push({ stage: 'enrich', canonicalId: g.canonicalId, error: error.message })
    else enriched += 1
  }

  // 4) Borrar las copias (ya sin referencias).
  for (const g of groups) {
    for (const copyId of g.copyIds) {
      const { data, error } = await db.from('foods').delete().eq('id', copyId).select('id')
      if (error) errors.push({ stage: 'delete-copy', copyId, error: error.message })
      else if (data && data.length > 0) copiesDeleted += 1
    }
  }

  const reportPath = resolve(OUT_DIR, `merge-apply-${stamp()}.json`)
  writeJson(reportPath, {
    generatedAt: new Date().toISOString(),
    target: url,
    backupPath,
    conflictDeleted,
    remapped,
    enriched,
    copiesDeleted,
    fallbackDeletes: fallbackDeletes.length,
    errors,
  })

  console.log(
    `\nAPPLY: remapeadas=${remapped} · conflicto-borradas=${conflictDeleted} · enriquecidos=${enriched} · copias-borradas=${copiesDeleted} · errores=${errors.length}`,
  )
  console.log(`Reporte: ${reportPath}`)
  if (errors.length > 0) process.exitCode = 1
}

// ---------------------------------------------------------------------------
// DOWN (revierte desde el respaldo JSON)
// ---------------------------------------------------------------------------

function resolveBackupPath() {
  if (BACKUP_ARG) return resolve(BACKUP_ARG)
  let entries
  try {
    entries = readdirSync(OUT_DIR)
  } catch {
    return null
  }
  const candidates = entries.filter((f) => f.startsWith('foods-merge-bak-') && f.endsWith('.json')).sort()
  if (candidates.length === 0) return null
  return resolve(OUT_DIR, candidates[candidates.length - 1])
}

async function runDown(db, url) {
  const backupPath = resolveBackupPath()
  if (!backupPath) {
    console.error('No hay respaldo para revertir. Pasa --backup <path> o deja un foods-merge-bak-*.json en tmp/.')
    process.exit(1)
  }
  const backup = JSON.parse(readFileSync(backupPath, 'utf8'))
  const groups = Array.isArray(backup?.groups) ? backup.groups : []
  const remapUpdates = Array.isArray(backup?.remapUpdates) ? backup.remapUpdates : []
  const deletedDuplicates = Array.isArray(backup?.deletedDuplicates) ? backup.deletedDuplicates : []

  console.log(`Revirtiendo desde ${backupPath}`)
  console.log(
    `  copias a re-insertar: ${groups.reduce((n, g) => n + (g.copies?.length ?? 0), 0)} · updates a des-remapear: ${remapUpdates.length} · duplicados a re-insertar: ${deletedDuplicates.length}`,
  )
  console.log('Continuando en 3 segundos... (Ctrl+C para abortar)')
  await new Promise((r) => setTimeout(r, 3000))

  const errors = []
  let copiesRestored = 0
  let dupsRestored = 0
  let unmapped = 0
  let unenriched = 0

  // 1) Re-insertar las copias de foods (para que las FK vuelvan a tener destino valido).
  for (const g of groups) {
    for (const row of g.copies ?? []) {
      const { error } = await db.from('foods').upsert(stripGeneratedColumns(row), { onConflict: 'id' })
      if (error) errors.push({ stage: 'restore-copy', id: row.id, error: error.message })
      else copiesRestored += 1
    }
  }

  // 2) Re-insertar filas duplicadas borradas (ahora la copia existe de nuevo).
  for (const d of deletedDuplicates) {
    const onConflict = Array.isArray(d.pkCols) ? d.pkCols.join(',') : 'id'
    const { error } = await db.from(d.table).upsert(d.row, { onConflict })
    if (error) errors.push({ stage: 'restore-dup', table: d.table, error: error.message })
    else dupsRestored += 1
  }

  // 3) Des-remapear: columna FK de vuelta a la copia (where keyCols + column=canonical).
  for (const op of remapUpdates) {
    let q = db.from(op.table).update({ [op.column]: op.from })
    for (const [k, v] of Object.entries(op.keyCols)) q = q.eq(k, v)
    q = q.eq(op.column, op.to)
    const { error } = await q
    if (error) errors.push({ stage: 'unmap', op, error: error.message })
    else unmapped += 1
  }

  // 4) Des-enriquecer el canonico (restaura los valores previos, incluidos NULL).
  for (const g of groups) {
    if (!g.canonicalBefore) continue
    const { error } = await db.from('foods').update(g.canonicalBefore).eq('id', g.canonicalId)
    if (error) errors.push({ stage: 'unenrich', canonicalId: g.canonicalId, error: error.message })
    else unenriched += 1
  }

  const reportPath = resolve(OUT_DIR, `merge-down-${stamp()}.json`)
  writeJson(reportPath, {
    generatedAt: new Date().toISOString(),
    target: url,
    backupPath,
    copiesRestored,
    dupsRestored,
    unmapped,
    unenriched,
    errors,
  })
  console.log(
    `\nDOWN: copias=${copiesRestored} · duplicados=${dupsRestored} · des-remapeadas=${unmapped} · des-enriquecidos=${unenriched} · errores=${errors.length}`,
  )
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
  console.error('Fallo merge-foods:', err instanceof Error ? err.message : err)
  process.exit(1)
})
