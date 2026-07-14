#!/usr/bin/env node

/**
 * Importa un catálogo chileno PREPARADO a Supabase en lotes.
 *
 * Este script NO descarga datos ni llama proveedores externos. Recibe JSON/JSONL
 * local, normaliza nombres/GTIN y hace upsert por `catalog_key` después de que las
 * migraciones draft del catálogo hayan sido revisadas y aplicadas.
 *
 * Uso:
 *   pnpm catalog:import:cl -- ./catalogo-cl.json --dry-run
 *   pnpm catalog:import:cl -- ./catalogo-cl.jsonl --batch=200
 *
 * Variables para escritura real:
 *   NEXT_PUBLIC_SUPABASE_URL (o SUPABASE_URL)
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'
import { createClient } from '@supabase/supabase-js'

const args = process.argv.slice(2)
const inputArg = args.find((arg) => !arg.startsWith('--'))
const dryRun = args.includes('--dry-run')
const batchArg = args.find((arg) => arg.startsWith('--batch='))
const batchSize = clamp(Number(batchArg?.split('=')[1] ?? 200), 1, 500)

if (!inputArg) {
  fail('Falta el archivo de entrada. Usa JSON o JSONL.')
}

const inputPath = resolve(process.cwd(), inputArg)
const raw = await readFile(inputPath, 'utf8')
const sourceRows = parseInput(raw, inputPath)

const accepted = []
const rejected = []
const seenKeys = new Set()

for (let index = 0; index < sourceRows.length; index += 1) {
  try {
    const row = normalizeRow(sourceRows[index], index + 1)
    if (seenKeys.has(row.catalog_key)) {
      rejected.push({ row: index + 1, reason: `catalog_key duplicada en archivo: ${row.catalog_key}` })
      continue
    }
    seenKeys.add(row.catalog_key)
    accepted.push(row)
  } catch (error) {
    rejected.push({ row: index + 1, reason: error instanceof Error ? error.message : String(error) })
  }
}

console.log(`Archivo: ${inputPath}`)
console.log(`Filas leídas: ${sourceRows.length}`)
console.log(`Aceptadas: ${accepted.length}`)
console.log(`Rechazadas: ${rejected.length}`)
console.log(`Modo: ${dryRun ? 'DRY RUN (sin escritura)' : 'ESCRITURA'}`)

if (rejected.length > 0) {
  console.log('\nPrimeros rechazos:')
  for (const item of rejected.slice(0, 25)) {
    console.log(`  fila ${item.row}: ${item.reason}`)
  }
}

if (dryRun) {
  console.log('\nMuestra normalizada:')
  console.log(JSON.stringify(accepted.slice(0, 3), null, 2))
  process.exit(rejected.length > 0 ? 2 : 0)
}

if (accepted.length === 0) {
  fail('No hay filas válidas para importar.')
}

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseUrl || !serviceRoleKey) {
  fail('Faltan SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.')
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

let imported = 0
for (let start = 0; start < accepted.length; start += batchSize) {
  const batch = accepted.slice(start, start + batchSize)
  const { error } = await supabase
    .from('foods')
    .upsert(batch, { onConflict: 'catalog_key', ignoreDuplicates: false })

  if (error) {
    fail(`Falló lote ${start + 1}-${start + batch.length}: ${error.message}`)
  }

  imported += batch.length
  console.log(`Importadas ${imported}/${accepted.length}`)
}

console.log('\nImportación completada.')
console.log('No se realizaron llamadas a fuentes externas.')
console.log('Revisa una muestra en Supabase antes de habilitar barcode para usuarios.')

function parseInput(text, path) {
  if (path.toLowerCase().endsWith('.jsonl') || path.toLowerCase().endsWith('.ndjson')) {
    return text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, index) => {
        try {
          return JSON.parse(line)
        } catch {
          throw new Error(`JSON inválido en línea ${index + 1}`)
        }
      })
  }

  const value = JSON.parse(text)
  if (!Array.isArray(value)) throw new Error('El JSON raíz debe ser un array.')
  return value
}

function normalizeRow(input, rowNumber) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('La fila debe ser un objeto.')
  }

  const name = requiredText(input.name, 'name')
  const barcode = parseGtin(requiredText(input.barcode, 'barcode'))
  if (!barcode) throw new Error(`GTIN inválido: ${input.barcode ?? ''}`)

  const brand = optionalText(input.brand)
  const aliases = Array.isArray(input.aliases)
    ? input.aliases.map((value) => String(value).trim()).filter(Boolean)
    : []
  const servingSize = positiveNumber(input.serving_size, 'serving_size')
  const servingUnit = optionalText(input.serving_unit) ?? 'g'
  const calories = nonNegativeNumber(input.calories, 'calories')
  const protein = nonNegativeNumber(input.protein_g, 'protein_g')
  const carbs = nonNegativeNumber(input.carbs_g, 'carbs_g')
  const fats = nonNegativeNumber(input.fats_g, 'fats_g')

  return {
    catalog_key: `gtin:${barcode}`,
    barcode,
    name,
    brand,
    name_search: normalizeSearchText(name, brand, ...aliases),
    search_aliases: aliases,
    country_code: 'CL',
    catalog_source: optionalText(input.catalog_source) ?? 'import',
    source_ref: optionalText(input.source_ref),
    verification_status: optionalText(input.verification_status) ?? 'unverified',
    serving_size: Math.round(servingSize),
    serving_unit: servingUnit,
    calories: Math.round(calories),
    protein_g: Math.round(protein),
    carbs_g: Math.round(carbs),
    fats_g: Math.round(fats),
    fiber_g: optionalNonNegativeNumber(input.fiber_g),
    sodium_mg: optionalNonNegativeNumber(input.sodium_mg),
    sugar_g: optionalNonNegativeNumber(input.sugar_g),
    saturated_fat_g: optionalNonNegativeNumber(input.saturated_fat_g),
    is_liquid: Boolean(input.is_liquid ?? servingUnit === 'ml'),
    category: optionalText(input.category) ?? 'otro',
    household_grams: optionalNonNegativeNumber(input.household_grams),
    household_label: optionalText(input.household_label),
    package_quantity: optionalNonNegativeNumber(input.package_quantity),
    package_unit: optionalText(input.package_unit),
    product_image_path: optionalText(input.product_image_path),
    coach_id: null,
    org_id: null,
    updated_at: new Date().toISOString(),
    _source_row: rowNumber,
  }
}

function normalizeSearchText(...parts) {
  return parts
    .flat()
    .filter((part) => typeof part === 'string' && part.trim())
    .join(' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-CL')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function parseGtin(value) {
  const digits = String(value ?? '').replace(/\D/g, '')
  if (![8, 12, 13, 14].includes(digits.length)) return null
  const body = digits.slice(0, -1)
  let sum = 0
  let weight = 3
  for (let index = body.length - 1; index >= 0; index -= 1) {
    sum += Number(body[index]) * weight
    weight = weight === 3 ? 1 : 3
  }
  const check = (10 - (sum % 10)) % 10
  return check === Number(digits.at(-1)) ? digits : null
}

function requiredText(value, field) {
  const text = optionalText(value)
  if (!text) throw new Error(`${field} es obligatorio.`)
  return text
}

function optionalText(value) {
  if (value == null) return null
  const text = String(value).trim()
  return text || null
}

function positiveNumber(value, field) {
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0) throw new Error(`${field} debe ser > 0.`)
  return number
}

function nonNegativeNumber(value, field) {
  const number = Number(value)
  if (!Number.isFinite(number) || number < 0) throw new Error(`${field} debe ser >= 0.`)
  return number
}

function optionalNonNegativeNumber(value) {
  if (value == null || value === '') return null
  const number = Number(value)
  if (!Number.isFinite(number) || number < 0) return null
  return number
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, Math.trunc(value)))
}

function fail(message) {
  console.error(`ERROR: ${message}`)
  process.exit(1)
}
