#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import process from 'node:process'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })
dotenv.config({ path: path.resolve(process.cwd(), '.env') })

const argv = process.argv.slice(2)
const argValue = (name) => {
  const prefix = `${name}=`
  const found = argv.find((arg) => arg.startsWith(prefix))
  return found ? found.slice(prefix.length) : null
}
const hasFlag = (name) => argv.includes(name)

const fileArg = argValue('--file') ?? argv.find((arg) => !arg.startsWith('--')) ?? null
const batchSize = Math.max(1, Number(argValue('--batch-size') ?? argValue('--batch') ?? 250))
const source = argValue('--source') ?? 'import'
const dryRun = hasFlag('--dry-run')
const apply = hasFlag('--apply')
const allowRemote = hasFlag('--allow-remote')

if (!fileArg) {
  console.error(
    'Uso: pnpm catalog:import:cl -- --file=./catalog.json [--dry-run] [--apply] [--allow-remote] [--source=import] [--batch-size=250]',
  )
  process.exit(1)
}

const allowedSources = new Set([
  'import',
  'eva',
  'coach',
  'team',
  'open_food_facts',
  'usda',
  'other',
])
const allowedVerification = new Set([
  'unverified',
  'community',
  'coach_verified',
  'eva_verified',
  'rejected',
])

if (!allowedSources.has(source)) {
  console.error(`Fuente inválida: ${source}`)
  process.exit(1)
}

const inputPath = path.resolve(process.cwd(), fileArg)
if (!fs.existsSync(inputPath)) {
  console.error(`Archivo no encontrado: ${inputPath}`)
  process.exit(1)
}

const fileBuffer = fs.readFileSync(inputPath)
const fileText = fileBuffer.toString('utf8')
const checksum = crypto.createHash('sha256').update(fileBuffer).digest('hex')
const ext = path.extname(inputPath).toLowerCase()
const sourceRows = ext === '.jsonl'
  ? fileText.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line))
  : JSON.parse(fileText)

if (!Array.isArray(sourceRows)) {
  console.error('El archivo debe contener un arreglo JSON o líneas JSONL.')
  process.exit(1)
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function normalizedText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function gtinCheckDigit(body) {
  let sum = 0
  let weight = 3
  for (let index = body.length - 1; index >= 0; index -= 1) {
    sum += Number(body[index]) * weight
    weight = weight === 3 ? 1 : 3
  }
  return String((10 - (sum % 10)) % 10)
}

function normalizeGtin(value) {
  const digits = String(value ?? '').replace(/\D/g, '')
  if (![8, 12, 13, 14].includes(digits.length)) return null
  const body = digits.slice(0, -1)
  return gtinCheckDigit(body) === digits.slice(-1) ? digits : null
}

function slug(value) {
  return normalizedText(value).replace(/\s+/g, '-').replace(/^-|-$/g, '')
}

function catalogKey(row, index) {
  const supplied = row.catalog_key ?? row.catalogKey
  if (supplied) return String(supplied).trim()
  return [
    'cl',
    row.brand ? slug(row.brand) : 'sin-marca',
    slug(row.name ?? row.nombre),
    row.package_quantity ?? row.packageQuantity ?? row.serving_size ?? row.servingSize ?? index + 1,
    row.package_unit ?? row.packageUnit ?? row.serving_unit ?? row.servingUnit ?? 'g',
  ].filter(Boolean).join(':')
}

function normalizeMedia(raw) {
  if (!raw || typeof raw !== 'object') return null
  const objectPath = String(raw.object_path ?? raw.objectPath ?? '').trim()
  if (!objectPath) return null
  const kind = String(raw.kind ?? 'product_photo')
  const license = String(raw.license ?? 'unknown')
  if (!['product_photo', 'eva_illustration', 'category_fallback'].includes(kind)) return null
  if (!['eva_owned', 'supplier_authorized', 'public_domain', 'cc_by', 'cc_by_sa', 'unknown'].includes(license)) return null
  return {
    kind,
    bucket: 'food-media',
    object_path: objectPath,
    version: Math.max(1, Math.trunc(numberOrNull(raw.version) ?? 1)),
    width: numberOrNull(raw.width),
    height: numberOrNull(raw.height),
    mime_type: raw.mime_type ?? raw.mimeType ?? null,
    blurhash: raw.blurhash ?? null,
    license,
    source_url: raw.source_url ?? raw.sourceUrl ?? null,
    attribution: raw.attribution ?? null,
    is_primary: raw.is_primary ?? raw.isPrimary ?? true,
  }
}

function normalizeRow(row, index) {
  const name = String(row.name ?? row.nombre ?? '').trim()
  const servingSize = numberOrNull(row.serving_size ?? row.servingSize ?? row.porcion)
  const calories = numberOrNull(row.calories ?? row.kcal)
  const protein = numberOrNull(row.protein_g ?? row.proteinG ?? row.protein)
  const carbs = numberOrNull(row.carbs_g ?? row.carbsG ?? row.carbs)
  const fats = numberOrNull(row.fats_g ?? row.fatsG ?? row.fats)

  if (!name) return { error: 'name_required' }
  if (servingSize === null || servingSize <= 0) return { error: 'invalid_serving_size' }
  if ([calories, protein, carbs, fats].some((value) => value === null || value < 0)) {
    return { error: 'invalid_macros' }
  }

  const rawBarcode = row.barcode ?? row.gtin ?? null
  const barcode = rawBarcode ? normalizeGtin(rawBarcode) : null
  if (rawBarcode && !barcode) return { error: 'invalid_gtin' }

  const countryCode = String(row.country_code ?? row.countryCode ?? 'CL').toUpperCase()
  if (!/^[A-Z]{2}$/.test(countryCode)) return { error: 'invalid_country_code' }

  const verificationStatus = String(
    row.verification_status ?? row.verificationStatus ?? 'unverified',
  )
  if (!allowedVerification.has(verificationStatus)) {
    return { error: 'invalid_verification_status' }
  }

  const aliases = Array.isArray(row.search_aliases ?? row.searchAliases)
    ? (row.search_aliases ?? row.searchAliases).map(normalizedText).filter(Boolean)
    : []

  return {
    food: {
      name,
      serving_size: servingSize,
      calories,
      protein_g: protein,
      carbs_g: carbs,
      fats_g: fats,
      fiber_g: numberOrNull(row.fiber_g ?? row.fiberG ?? row.fiber),
      sodium_mg: numberOrNull(row.sodium_mg ?? row.sodiumMg ?? row.sodium),
      sugar_g: numberOrNull(row.sugar_g ?? row.sugarG),
      saturated_fat_g: numberOrNull(row.saturated_fat_g ?? row.saturatedFatG),
      serving_unit: row.serving_unit ?? row.servingUnit ?? 'g',
      category: row.category ?? row.categoria ?? 'otro',
      brand: row.brand ?? row.marca ?? null,
      barcode,
      country_code: countryCode,
      catalog_source: row.catalog_source ?? row.catalogSource ?? source,
      source_ref: row.source_ref ?? row.sourceRef ?? null,
      verification_status: verificationStatus,
      search_aliases: [...new Set(aliases)],
      package_quantity: numberOrNull(row.package_quantity ?? row.packageQuantity),
      package_unit: row.package_unit ?? row.packageUnit ?? null,
      catalog_key: catalogKey(row, index),
      updated_at: new Date().toISOString(),
    },
    media: normalizeMedia(row.media ?? row.image ?? null),
  }
}

const stagingRows = []
const accepted = []
const rejected = []
const seenKeys = new Set()
const seenGtins = new Set()

for (let index = 0; index < sourceRows.length; index += 1) {
  const normalized = normalizeRow(sourceRows[index], index)
  if (normalized.error) {
    rejected.push({ row: index + 1, reason: normalized.error })
    stagingRows.push({
      sourceRow: index + 1,
      payload: sourceRows[index],
      normalizedGtin: null,
      normalizedCatalogKey: null,
      status: 'rejected',
      rejectionReason: normalized.error,
    })
    continue
  }

  const { food, media } = normalized
  const duplicate = seenKeys.has(food.catalog_key)
    || (food.barcode && seenGtins.has(food.barcode))

  if (duplicate) {
    stagingRows.push({
      sourceRow: index + 1,
      payload: { food, media },
      normalizedGtin: food.barcode,
      normalizedCatalogKey: food.catalog_key,
      status: 'duplicate',
      rejectionReason: 'duplicate_in_file',
    })
    continue
  }

  seenKeys.add(food.catalog_key)
  if (food.barcode) seenGtins.add(food.barcode)
  accepted.push({ sourceRow: index + 1, food, media })
  stagingRows.push({
    sourceRow: index + 1,
    payload: { food, media },
    normalizedGtin: food.barcode,
    normalizedCatalogKey: food.catalog_key,
    status: 'accepted',
    rejectionReason: null,
  })
}

const duplicateCount = stagingRows.filter((row) => row.status === 'duplicate').length
console.log(JSON.stringify({
  input: sourceRows.length,
  accepted: accepted.length,
  rejected: rejected.length,
  duplicates: duplicateCount,
  mode: dryRun ? 'dry-run' : apply ? 'stage-and-apply' : 'stage-only',
  sampleRejections: rejected.slice(0, 10),
}, null, 2))

if (dryRun) process.exit(rejected.length > 0 ? 2 : 0)

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseUrl || !serviceRole) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(1)
}

const host = new URL(supabaseUrl).hostname
const isLocal = host === 'localhost' || host === '127.0.0.1'
if (!isLocal && !allowRemote) {
  console.error('Import remoto bloqueado. Revisa el staging y usa --allow-remote explícitamente.')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRole, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const { data: batch, error: batchError } = await supabase
  .from('food_catalog_import_batches')
  .insert({
    source,
    country_code: 'CL',
    file_name: path.basename(inputPath),
    checksum,
    status: 'validating',
    total_rows: sourceRows.length,
    accepted_rows: accepted.length,
    rejected_rows: rejected.length,
    duplicate_rows: duplicateCount,
    metadata: { mode: apply ? 'apply' : 'stage', scriptVersion: 2 },
  })
  .select('id')
  .single()

if (batchError || !batch) {
  console.error('No se pudo crear el lote:', batchError)
  process.exit(1)
}

for (let index = 0; index < stagingRows.length; index += batchSize) {
  const chunk = stagingRows.slice(index, index + batchSize).map((row) => ({
    batch_id: batch.id,
    source_row: row.sourceRow,
    payload: row.payload,
    normalized_gtin: row.normalizedGtin,
    normalized_catalog_key: row.normalizedCatalogKey,
    status: row.status,
    rejection_reason: row.rejectionReason,
  }))
  const { error } = await supabase.from('food_catalog_import_rows').insert(chunk)
  if (error) {
    await supabase.from('food_catalog_import_batches')
      .update({ status: 'failed', completed_at: new Date().toISOString() })
      .eq('id', batch.id)
    console.error(`Falló staging en filas ${index + 1}-${index + chunk.length}:`, error)
    process.exit(1)
  }
}

if (!apply) {
  await supabase.from('food_catalog_import_batches')
    .update({ status: 'ready', completed_at: new Date().toISOString() })
    .eq('id', batch.id)
  console.log(`Lote ${batch.id} listo para revisión. No se publicaron alimentos.`)
  process.exit(rejected.length > 0 ? 2 : 0)
}

const resolvedByCatalogKey = new Map()
for (let index = 0; index < accepted.length; index += batchSize) {
  const chunk = accepted.slice(index, index + batchSize)
  const { data, error } = await supabase
    .from('foods')
    .upsert(chunk.map(({ food }) => food), { onConflict: 'catalog_key' })
    .select('id, catalog_key')

  if (error) {
    await supabase.from('food_catalog_import_batches')
      .update({ status: 'failed', completed_at: new Date().toISOString() })
      .eq('id', batch.id)
    console.error(`Falló aplicación en filas ${index + 1}-${index + chunk.length}:`, error)
    process.exit(1)
  }

  for (const row of data ?? []) resolvedByCatalogKey.set(row.catalog_key, row.id)
}

const mediaRows = accepted
  .filter(({ media }) => media)
  .map(({ food, media }) => ({ ...media, food_id: resolvedByCatalogKey.get(food.catalog_key) }))
  .filter((row) => row.food_id)

if (mediaRows.length > 0) {
  const foodIds = [...new Set(mediaRows.filter((row) => row.is_primary).map((row) => row.food_id))]
  if (foodIds.length > 0) {
    const { error } = await supabase.from('food_media')
      .update({ is_primary: false })
      .in('food_id', foodIds)
      .eq('is_primary', true)
    if (error) {
      console.error('No se pudieron preparar imágenes primarias:', error)
      process.exit(1)
    }
  }

  for (let index = 0; index < mediaRows.length; index += batchSize) {
    const chunk = mediaRows.slice(index, index + batchSize)
    const { error } = await supabase
      .from('food_media')
      .upsert(chunk, { onConflict: 'food_id,object_path' })
    if (error) {
      console.error('No se pudieron aplicar metadatos de imágenes:', error)
      process.exit(1)
    }
  }
}

for (const row of accepted) {
  const foodId = resolvedByCatalogKey.get(row.food.catalog_key)
  if (!foodId) continue
  const { error } = await supabase.from('food_catalog_import_rows')
    .update({ resolved_food_id: foodId })
    .eq('batch_id', batch.id)
    .eq('source_row', row.sourceRow)
  if (error) {
    console.error(`No se pudo enlazar staging fila ${row.sourceRow}:`, error)
    process.exit(1)
  }
}

await supabase.from('food_catalog_import_batches')
  .update({ status: 'imported', completed_at: new Date().toISOString() })
  .eq('id', batch.id)

console.log(`Lote ${batch.id} aplicado: ${accepted.length} alimentos, ${mediaRows.length} imágenes.`)
process.exit(rejected.length > 0 ? 2 : 0)
