#!/usr/bin/env node
/**
 * suggest-eva-household.mjs
 *
 * Tren «Cantidades honestas» (Nutrición V2), W2.4 — SPEC §5.6.
 * Para los alimentos `catalog_source = 'eva'` sin medida casera (≈158), propone
 * (label, grams) por diccionario de palabras clave del nombre. Open Food Facts
 * (`catalog_source = 'open_food_facts'`) queda fuera a propósito: esa fuente no
 * trae medidas caseras y adivinar por nombre de marca sería puro ruido.
 *
 * SOLO LEE la base (Supabase). No escribe nada en la DB ni genera SQL — a
 * diferencia de backfill-usda-household.mjs, esto es 100% heurística de nombre
 * (sin respaldo de una fuente externa verificable), así que la única salida es
 * un CSV para que una persona lo cure a mano antes de que exista cualquier UPDATE.
 * Patrón de envs/cliente/logs calcado de scripts/audit-fresh-foods.mjs y
 * scripts/nutrition-portions/classify-foods.mjs.
 *
 * Uso:
 *   node scripts/nutrition-household/suggest-eva-household.mjs [--limit N] [--offset N] [--out <dir>]
 *
 * Variables de entorno:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

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

function intFlag(name, fallback) {
  const raw = flagValue(name)
  if (raw === undefined) return fallback
  const n = Number(raw)
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

const LIMIT = intFlag('--limit', undefined)
const OFFSET = intFlag('--offset', 0)
const OUT_DIR = flagValue('--out') ?? resolve(__dirname, '../../supabase/data')

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

function requireEnv() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY (apps/web/.env.local o .env.local).')
    process.exit(1)
  }
}

function createServiceRoleClient(url, key) {
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

// ---------------------------------------------------------------------------
// Diccionario de palabras clave → medida casera es-CL
//
// Confianza 'alta': el nombre identifica una pieza discreta bastante estándar
// (huevo, pita, marraqueta, galleta, cucharada de un líquido/graso denso, etc.).
// Confianza 'media': la medida varía bastante en la práctica (una "manzana"
// puede pesar 120 o 200 g) o es un fallback por categoría, no por nombre
// (verduras sin palabra clave propia). Es solo una ayuda de priorización para
// quien cure el CSV a mano — ninguna fila se aplica sola.
//
// Orden importa: se evalúa de arriba hacia abajo y se usa la PRIMERA regla que
// matchea (por eso "pita" va antes que el "pan" genérico: "pan pita" no debe
// caer en la regla de pan de molde).
// ---------------------------------------------------------------------------

const RULES = [
  { id: 'huevo', pattern: /\bhuevos?\b/, label: 'huevo', grams: 58, confidence: 'alta' },
  { id: 'pita', pattern: /\bpitas?\b/, label: 'unidad', grams: 60, confidence: 'alta' },
  { id: 'marraqueta', pattern: /\bmarraquetas?\b/, label: 'unidad', grams: 100, confidence: 'alta' },
  { id: 'hallulla', pattern: /\bhallullas?\b/, label: 'unidad', grams: 100, confidence: 'alta' },
  // Genérico: cualquier otro "pan" (molde, integral, pan rallado queda mal
  // clasificado a propósito de forma leve — es curación manual, no aplica solo).
  { id: 'pan-generico', pattern: /\bpan\b/, label: 'rebanada', grams: 25, confidence: 'media' },
  { id: 'tortilla', pattern: /\btortillas?\b/, label: 'unidad', grams: 30, confidence: 'alta' },
  { id: 'galleta', pattern: /\bgalletas?\b/, label: 'unidad', grams: 8, confidence: 'alta' },
  { id: 'yogurt', pattern: /\byog(?:h)?urts?\b/, label: 'pote', grams: 125, confidence: 'alta' },
  { id: 'leche', pattern: /\blech(?:e|es)\b/, label: 'taza', grams: 200, confidence: 'media' },
  { id: 'jugo', pattern: /\bjugos?\b/, label: 'taza', grams: 200, confidence: 'media' },
  { id: 'bebida', pattern: /\bbebidas?\b/, label: 'taza', grams: 200, confidence: 'media' },
  { id: 'arroz', pattern: /\barroz(?:es)?\b/, label: 'taza', grams: 150, confidence: 'media' },
  { id: 'fideos', pattern: /\bfideos?\b|\bpastas?\b/, label: 'taza', grams: 150, confidence: 'media' },
  { id: 'quinoa', pattern: /\bquino?as?\b/, label: 'taza', grams: 150, confidence: 'media' },
  { id: 'aceite', pattern: /\baceites?\b/, label: 'cucharada', grams: 15, confidence: 'alta' },
  { id: 'mantequilla', pattern: /\bmantequillas?\b|\bmargarinas?\b/, label: 'cucharada', grams: 14, confidence: 'alta' },
  { id: 'mayonesa', pattern: /\bmayonesas?\b/, label: 'cucharada', grams: 15, confidence: 'alta' },
  { id: 'miel', pattern: /\bmiel(?:es)?\b/, label: 'cucharada', grams: 21, confidence: 'alta' },
  { id: 'azucar', pattern: /\bazucar(?:es)?\b/, label: 'cucharada', grams: 12, confidence: 'alta' },
  // Frutas enteras
  { id: 'manzana', pattern: /\bmanzanas?\b/, label: 'unidad', grams: 150, confidence: 'media' },
  { id: 'platano', pattern: /\bplatanos?\b|\bbananas?\b/, label: 'unidad', grams: 120, confidence: 'media' },
  { id: 'naranja', pattern: /\bnaranjas?\b/, label: 'unidad', grams: 130, confidence: 'media' },
  { id: 'kiwi', pattern: /\bkiwis?\b/, label: 'unidad', grams: 75, confidence: 'media' },
  { id: 'pera', pattern: /\bperas?\b/, label: 'unidad', grams: 160, confidence: 'media' },
  { id: 'durazno', pattern: /\bduraznos?\b/, label: 'unidad', grams: 150, confidence: 'media' },
  { id: 'ciruela', pattern: /\bciruelas?\b/, label: 'unidad', grams: 65, confidence: 'media' },
  { id: 'mandarina', pattern: /\bmandarinas?\b/, label: 'unidad', grams: 90, confidence: 'media' },
  { id: 'uva', pattern: /\buvas?\b/, label: 'taza', grams: 150, confidence: 'media' },
  // Verduras con regla propia (van ANTES del fallback por categoría)
  { id: 'palta', pattern: /\bpaltas?\b|\baguacates?\b/, label: 'unidad', grams: 130, confidence: 'alta' },
  { id: 'tomate', pattern: /\btomates?\b/, label: 'unidad', grams: 120, confidence: 'alta' },
]

// Fallback: verdura sin palabra clave propia → taza 100 (SPEC §5.6). Confianza
// 'media' porque es un default de categoría, no una lectura del nombre.
const VERDURA_FALLBACK = { id: 'categoria-verdura-default', label: 'taza', grams: 100, confidence: 'media' }

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function suggestFor(food) {
  const name = normalizeText(food.name)
  for (const rule of RULES) {
    if (rule.pattern.test(name)) {
      return { label: rule.label, grams: rule.grams, rule: `keyword:${rule.id}`, confidence: rule.confidence }
    }
  }
  if (food.category === 'verdura') {
    return {
      label: VERDURA_FALLBACK.label,
      grams: VERDURA_FALLBACK.grams,
      rule: VERDURA_FALLBACK.id,
      confidence: VERDURA_FALLBACK.confidence,
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

function csvEscape(value) {
  const s = String(value ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function buildCsv(rows) {
  const header = ['id', 'name', 'label', 'grams', 'regla', 'confianza']
  const lines = [header.join(',')]
  for (const r of rows) {
    lines.push([r.id, r.name, r.label, r.grams, r.rule, r.confidence].map(csvEscape).join(','))
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
    .select('id, name, category')
    .eq('catalog_source', 'eva')
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
  console.log(`limit=${LIMIT ?? '(todas)'} offset=${OFFSET}`)

  const db = createServiceRoleClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  const foods = await selectPendingFoods(db)
  console.log(`${foods.length} alimentos eva sin household_grams (a procesar en esta corrida).\n`)

  const suggested = []
  const unmatched = []

  for (const food of foods) {
    const suggestion = suggestFor(food)
    if (!suggestion) {
      unmatched.push(food)
      continue
    }
    console.log(`  ✅ "${food.name}" → ${suggestion.label} = ${suggestion.grams} g (${suggestion.rule}, confianza ${suggestion.confidence})`)
    suggested.push({ id: food.id, name: food.name, ...suggestion })
  }

  console.log(`\nResumen: procesados=${foods.length} · con sugerencia=${suggested.length} · sin sugerencia=${unmatched.length}`)
  if (unmatched.length > 0) {
    console.log('Sin sugerencia (revisar a mano, no tienen palabra clave ni son "verdura"):')
    for (const f of unmatched) console.log(`  - ${f.name} (${f.id}, categoría=${f.category ?? '—'})`)
  }
  const byConfidence = suggested.reduce((acc, s) => {
    acc[s.confidence] = (acc[s.confidence] ?? 0) + 1
    return acc
  }, {})
  console.log('Confianza de las sugerencias:', byConfidence)

  if (suggested.length === 0) {
    console.log('\nNada que escribir (0 sugerencias).')
    return
  }

  mkdirSync(OUT_DIR, { recursive: true })
  const csvPath = resolve(OUT_DIR, `household-suggest-eva-${stampDate()}.csv`)
  writeFileSync(csvPath, buildCsv(suggested), 'utf8')
  console.log(`\nEscrito: ${csvPath}`)
  console.log('Este CSV es SOLO para curación manual: no genera SQL ni se aplica nunca automáticamente.')
}

main().catch((err) => {
  console.error('Fallo suggest-eva-household:', err instanceof Error ? err.message : err)
  process.exit(1)
})
