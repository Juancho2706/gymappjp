#!/usr/bin/env node
/**
 * backfill-usda-household.mjs
 *
 * Tren «Cantidades honestas» (Nutrición V2), W2.4 — SPEC §5.6.
 * Propone medida casera (household_label/household_grams) para los alimentos del
 * catálogo con `catalog_source = 'usda'` que todavía no la tienen, consultando
 * USDA FoodData Central (`GET /v1/food/{fdcId}`, `source_ref` guarda el fdcId —
 * ver `scripts/import-food-catalog-cl.mjs`) y leyendo su `foodPortions[]`.
 *
 * SOLO LEE la base (Supabase) y SOLO LEE la API de USDA. Nunca escribe en la DB:
 * la salida son archivos (.sql para revisión + .csv para auditoría) que el owner
 * aplica manualmente después de revisarlos. Patrón de envs/cliente/logs calcado
 * de `scripts/audit-fresh-foods.mjs` y `scripts/nutrition-portions/classify-foods.mjs`.
 *
 * Uso:
 *   node scripts/nutrition-household/backfill-usda-household.mjs [--dry-run] [--write]
 *     [--limit N] [--offset N] [--pause-ms N] [--max-retries N] [--out <dir>]
 *
 * Modos:
 *   (default / --dry-run) Cero escrituras a disco: imprime el resumen por consola.
 *   --write               Además escribe supabase/data/household-backfill-usda-<fecha>.sql
 *                         y su .csv gemelo. Los UPDATE del .sql son idempotentes
 *                         (`where household_grams is null`) pero NUNCA se ejecutan
 *                         desde este script — el owner decide cuándo aplicarlos.
 *
 * Variables de entorno (mismas que el resto de scripts/nutrition-*):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   USDA_FDC_API_KEY   → clave real (gratis): https://fdc.nal.usda.gov/api-key-signup.html
 *                         Sin ella se usa `DEMO_KEY` (documentada por USDA/api.data.gov
 *                         con un límite mucho más bajo, ~30 req/hora). Con `DEMO_KEY`
 *                         usa `--limit` chico y `--pause-ms` alto o vas a pegar contra
 *                         el 429 (el script reintenta con backoff, pero no hace milagros).
 */

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
// Mismo orden que scripts/nutrition-portions/classify-foods.mjs: web primero, raíz sin pisar.
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

function intFlag(name, fallback) {
  const raw = flagValue(name)
  if (raw === undefined) return fallback
  const n = Number(raw)
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

const WRITE = process.argv.includes('--write')
const LIMIT = intFlag('--limit', undefined)
const OFFSET = intFlag('--offset', 0)
const OUT_DIR = flagValue('--out') ?? resolve(__dirname, '../../supabase/data')
const MAX_RETRIES = intFlag('--max-retries', 4)

// La clave viene SIEMPRE por env (sin fallback literal en código: regla de `docs:check`).
// La demo pública de USDA (ver README) es MUCHO más restrictiva que una clave real (~30 req/h
// documentadas vs. las ~1.000 req/h de una clave propia): con demo el pausado por default es
// bien conservador; con clave real alcanza con no saturar la API.
const USDA_API_KEY = process.env.USDA_FDC_API_KEY
if (!USDA_API_KEY) {
  console.error('Falta USDA_FDC_API_KEY (clave propia de FoodData Central o la demo pública; ver scripts/nutrition-household/README.md).')
  process.exit(1)
}
const USING_DEMO_KEY = /^demo_key$/i.test(USDA_API_KEY)
const PAUSE_MS = intFlag('--pause-ms', USING_DEMO_KEY ? 4000 : 350)

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const USDA_BASE = 'https://api.nal.usda.gov/fdc/v1'

function requireEnv() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY (apps/web/.env.local o .env.local).')
    process.exit(1)
  }
}

// ---------------------------------------------------------------------------
// Cliente Supabase — mismo patrón que classify-foods.mjs: service-role real,
// nunca cliente admin crudo (gotcha memoria "Admin client no bypasea RLS").
// ---------------------------------------------------------------------------

function createServiceRoleClient(url, key) {
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

// ---------------------------------------------------------------------------
// USDA FoodData Central: fetch con retry + backoff en 429
// ---------------------------------------------------------------------------

async function fetchUsdaFood(fdcId, attempt = 0) {
  const url = `${USDA_BASE}/food/${encodeURIComponent(fdcId)}?api_key=${USDA_API_KEY}`
  const res = await fetch(url)
  if (res.status === 429) {
    if (attempt >= MAX_RETRIES) {
      console.warn(`  429 persistente para fdcId=${fdcId} tras ${attempt} reintentos, se salta.`)
      return { error: 'rate_limited' }
    }
    const backoff = PAUSE_MS * 2 ** (attempt + 1)
    console.warn(`  429 para fdcId=${fdcId}, backoff ${backoff}ms (intento ${attempt + 1}/${MAX_RETRIES})…`)
    await sleep(backoff)
    return fetchUsdaFood(fdcId, attempt + 1)
  }
  if (!res.ok) {
    console.warn(`  USDA HTTP ${res.status} para fdcId=${fdcId}`)
    return { error: `http_${res.status}` }
  }
  const json = await res.json()
  return { data: json }
}

// ---------------------------------------------------------------------------
// Clasificación de foodPortions[] → medida casera es-CL
// ---------------------------------------------------------------------------

// Prioridad: unidad contable (huevo/unidad/rebanada) > taza > cucharada > cucharadita.
// SR Legacy trae la medida sobre todo en `modifier`; Foundation en `measureUnit.name`
// o, si viene vacío, en `portionDescription`. Por eso probamos measureUnit+modifier
// primero (campos estructurados) y portionDescription solo como último recurso.
const UNIT_RULES = [
  { tier: 1, label: 'huevo', pattern: /\beggs?\b/ },
  { tier: 1, label: 'rebanada', pattern: /\bslices?\b/ },
  { tier: 1, label: 'unidad', pattern: /\b(pieces?|units?|each)\b/ },
  { tier: 2, label: 'taza', pattern: /\bcups?\b/ },
  { tier: 3, label: 'cucharada', pattern: /\btablespoons?\b|\btbsp\b/ },
  { tier: 4, label: 'cucharadita', pattern: /\bteaspoons?\b|\btsp\b/ },
]
// oz / fl oz / "serving" a secas no son medidas caseras útiles para el alumno: se descartan.
const DISCARD_PATTERN = /\b(oz|ounces?|fl\.?\s*oz|fluid\s*ounces?|servings?)\b/
const SIZE_WORDS = /\b(medium|large|small)\b/
const PRODUCE_CATEGORIES = new Set(['fruta', 'verdura'])

function norm(value) {
  return String(value ?? '').toLowerCase().trim()
}

/** Busca la primera regla de UNIT_RULES (o medium/large/small+fruta/verdura) que matchee `text`. */
function matchUnitRules(text, category) {
  for (const rule of UNIT_RULES) {
    if (rule.pattern.test(text)) return { tier: rule.tier, label: rule.label }
  }
  if (SIZE_WORDS.test(text) && PRODUCE_CATEGORIES.has(category)) {
    return { tier: 1, label: 'unidad' }
  }
  return null
}

/**
 * Devuelve { tier, label, confidence, matchedFrom } o null (sin señal) o
 * { discard: true } (oz/serving: hay medida pero no es casera-útil).
 */
function classifyPortion(portion, category) {
  const measureName = norm(portion.measureUnit?.name)
  const modifier = norm(portion.modifier)
  const description = norm(portion.portionDescription)
  const structured = [measureName, modifier].filter(Boolean).join(' ')

  const structuredMatch = matchUnitRules(structured, category)
  if (structuredMatch) {
    // measureUnit.name es el campo más confiable (catálogo controlado de USDA);
    // modifier es texto libre (SR Legacy) → confianza media.
    const fromMeasureUnit = measureName && matchUnitRules(measureName, category)
    return {
      ...structuredMatch,
      confidence: fromMeasureUnit ? 'alta' : 'media',
      matchedFrom: fromMeasureUnit ? 'measureUnit.name' : 'modifier',
      rawText: structured,
    }
  }

  // Foundation: measureUnit/modifier suelen venir vacíos o "undetermined"; el
  // texto real está en portionDescription (puede venir vacío también → sin señal).
  if (!structured && description) {
    const descMatch = matchUnitRules(description, category)
    if (descMatch) {
      return { ...descMatch, confidence: 'media', matchedFrom: 'portionDescription', rawText: description }
    }
  }

  const haystack = [structured, description].filter(Boolean).join(' ')
  if (DISCARD_PATTERN.test(haystack)) return { discard: true, rawText: haystack }
  return null
}

/**
 * Normaliza gramWeight/amount y valida el rango [1, 1000] (regla dura del brief:
 * jamás sugerir una "porción casera" de 3 kg o de 0,2 g). `amount !== 1` se
 * normaliza dividiendo (ej. "2 cups, 240g" → 120g por taza); si no es posible
 * normalizar con sentido (amount <= 0 o no numérico) se descarta la fila.
 */
function normalizeGrams(portion) {
  const rawGrams = Number(portion.gramWeight)
  if (!Number.isFinite(rawGrams)) return null
  const rawAmount = Number(portion.amount)
  let grams = rawGrams
  let wasNormalized = false
  if (Number.isFinite(rawAmount) && rawAmount !== 1) {
    if (rawAmount <= 0) return null
    grams = rawGrams / rawAmount
    wasNormalized = true
  }
  if (!(grams >= 1 && grams <= 1000)) return null
  return { grams: Math.round(grams * 10) / 10, wasNormalized }
}

/** Elige UNA medida casera entre foodPortions[] para un alimento (o null si ninguna sirve). */
function pickHouseholdMeasure(foodPortions, category) {
  const candidates = []
  for (const portion of foodPortions ?? []) {
    const classified = classifyPortion(portion, category)
    if (!classified || classified.discard) continue
    const grams = normalizeGrams(portion)
    if (!grams) continue
    candidates.push({
      tier: classified.tier,
      label: classified.label,
      confidence: grams.wasNormalized ? 'media' : classified.confidence,
      matchedFrom: classified.matchedFrom,
      rawText: classified.rawText,
      grams: grams.grams,
    })
  }
  if (candidates.length === 0) return null
  // Prioridad de tier asc; a igual tier, preferir la que no necesitó normalizar
  // por amount y la de mayor confianza (alta > media).
  candidates.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier
    const confRank = { alta: 0, media: 1 }
    return confRank[a.confidence] - confRank[b.confidence]
  })
  return candidates[0]
}

// ---------------------------------------------------------------------------
// SQL / CSV
// ---------------------------------------------------------------------------

function sqlEscapeDollar(text) {
  // household_label es texto plano en español sin "$$" — dollar-quoting evita
  // pelear con comillas simples. Si alguna vez trajera "$$" lo reventaría a propósito.
  if (String(text).includes('$$')) throw new Error(`household_label con "$$": ${text}`)
  return text
}

function buildUpdateSql(row) {
  return (
    `update public.foods set household_label = $$${sqlEscapeDollar(row.label)}$$, ` +
    `household_grams = ${row.grams} where id = '${row.id}' and household_grams is null;`
  )
}

function csvEscape(value) {
  const s = String(value ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function buildCsv(rows) {
  const header = ['id', 'name', 'fdcId', 'label', 'grams', 'fuente', 'confianza']
  const lines = [header.join(',')]
  for (const r of rows) {
    lines.push(
      [r.id, r.name, r.fdcId, r.label, r.grams, r.matchedFrom, r.confidence].map(csvEscape).join(','),
    )
  }
  return lines.join('\n') + '\n'
}

function stampDate() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function selectPendingFoods(db) {
  let query = db
    .from('foods')
    .select('id, name, category, serving_unit, source_ref')
    .eq('catalog_source', 'usda')
    .is('household_grams', null)
    .order('id', { ascending: true })

  if (LIMIT !== undefined) {
    query = query.range(OFFSET, OFFSET + LIMIT - 1)
  } else if (OFFSET > 0) {
    query = query.range(OFFSET, OFFSET + 999)
  }

  const { data, error } = await query
  if (error) throw new Error(`select foods: ${error.message}`)
  return data ?? []
}

async function main() {
  requireEnv()
  console.log(`Modo: ${WRITE ? 'WRITE (genera .sql/.csv)' : 'DRY-RUN (solo resumen)'}`)
  console.log(`USDA API key: ${USING_DEMO_KEY ? 'DEMO_KEY (⚠️ ~30 req/h, limitado)' : 'propia'}`)
  console.log(`pause-ms=${PAUSE_MS} max-retries=${MAX_RETRIES} limit=${LIMIT ?? '(todas)'} offset=${OFFSET}`)

  const db = createServiceRoleClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  const foods = await selectPendingFoods(db)
  console.log(`\n${foods.length} alimentos usda sin household_grams (a procesar en esta corrida).\n`)

  const matched = []
  const skipped = []

  for (const food of foods) {
    if (!food.source_ref) {
      console.log(`  ⏭️  "${food.name}" (${food.id}) sin source_ref (fdcId) — se salta.`)
      skipped.push({ id: food.id, name: food.name, reason: 'sin_source_ref' })
      continue
    }

    const { data, error } = await fetchUsdaFood(food.source_ref)
    if (error) {
      skipped.push({ id: food.id, name: food.name, reason: error })
      await sleep(PAUSE_MS)
      continue
    }

    const portions = data?.foodPortions ?? []
    if (portions.length === 0) {
      console.log(`  ⏭️  "${food.name}" (fdcId=${food.source_ref}) sin foodPortions.`)
      skipped.push({ id: food.id, name: food.name, reason: 'sin_portions' })
      await sleep(PAUSE_MS)
      continue
    }

    const pick = pickHouseholdMeasure(portions, food.category)
    if (!pick) {
      console.log(`  ⏭️  "${food.name}" (fdcId=${food.source_ref}) sin medida casera reconocible entre ${portions.length} portions.`)
      skipped.push({ id: food.id, name: food.name, reason: 'sin_medida_reconocible' })
      await sleep(PAUSE_MS)
      continue
    }

    console.log(
      `  ✅ "${food.name}" → ${pick.label} = ${pick.grams} g (fuente: ${pick.matchedFrom} · confianza: ${pick.confidence})`,
    )
    matched.push({
      id: food.id,
      name: food.name,
      fdcId: food.source_ref,
      label: pick.label,
      grams: pick.grams,
      matchedFrom: pick.matchedFrom,
      confidence: pick.confidence,
    })

    await sleep(PAUSE_MS)
  }

  console.log(`\nResumen: procesados=${foods.length} · con medida=${matched.length} · sin medida=${skipped.length}`)
  const skipReasons = skipped.reduce((acc, s) => {
    acc[s.reason] = (acc[s.reason] ?? 0) + 1
    return acc
  }, {})
  if (Object.keys(skipReasons).length > 0) console.log('Motivos de skip:', skipReasons)
  const byConfidence = matched.reduce((acc, m) => {
    acc[m.confidence] = (acc[m.confidence] ?? 0) + 1
    return acc
  }, {})
  console.log('Confianza de los matches:', byConfidence)

  if (!WRITE) {
    console.log('\nDRY-RUN: no se escribió ningún archivo. Corré con --write para generar el .sql y el .csv.')
    return
  }

  if (matched.length === 0) {
    console.log('\nNada que escribir (0 matches).')
    return
  }

  mkdirSync(OUT_DIR, { recursive: true })
  const stamp = stampDate()
  const sqlPath = resolve(OUT_DIR, `household-backfill-usda-${stamp}.sql`)
  const csvPath = resolve(OUT_DIR, `household-backfill-usda-${stamp}.csv`)

  let sql = `-- Backfill de medida casera para foods.catalog_source = 'usda' (SPEC W2.4).\n`
  sql += `-- Generado: ${new Date().toISOString()} · fuente: USDA FoodData Central (foodPortions).\n`
  sql += `-- NUNCA aplicado automáticamente. Revisar el .csv gemelo antes de correr esto.\n`
  sql += `-- Cada UPDATE es idempotente (where household_grams is null): correrlo dos veces no hace nada la segunda vez.\n\n`
  for (const row of matched) {
    sql += `-- ${row.name} (fdcId=${row.fdcId}, fuente=${row.matchedFrom}, confianza=${row.confidence})\n`
    sql += buildUpdateSql(row) + '\n\n'
  }

  writeFileSync(sqlPath, sql, 'utf8')
  writeFileSync(csvPath, buildCsv(matched), 'utf8')

  console.log(`\nEscrito: ${sqlPath}`)
  console.log(`Escrito: ${csvPath}`)
  console.log('Recordatorio: estos archivos se aplican SOLO con OK del owner, después de revisar el CSV.')
}

main().catch((err) => {
  console.error('Fallo backfill-usda-household:', err instanceof Error ? err.message : err)
  process.exit(1)
})
