#!/usr/bin/env node
/**
 * `derive-cl-equivalences` — deriva las equivalencias del SET CHILENO de porciones
 * (13 grupos `portion_system = 'cl'`) desde el catalogo de `foods`, reusando la
 * matematica real del producto (`suggestPortionGrams`, que respeta `macros_basis`)
 * con el macro clave FORZADO por grupo. NO toca las ~2.507 filas del set SMAE:
 * solo las LEE, para el universo de derivacion y para la auditoria R7.
 *
 * Diseno: `docs/specs/nutrition-porciones-chilenas/DATA.md` §4 (§4.1 macro clave · §4.2 mapa
 * SMAE→cl · §4.3 y §4.3b umbrales de grasa · §4.4 pseudocodigo · §4.5 SQL del
 * apply · §4.6 informe · §4.7 corrida) y §5.2-§5.4 (curados).
 *
 * Patron de I/O: espeja `scripts/nutrition-portions/classify-foods.mjs` (misma
 * carga de envs con dotenv + cliente service-role + doble gate del apply).
 *
 * MODOS (excluyentes):
 *   (default) --dry-run  CERO escrituras. Lee, deriva y emite el informe Markdown
 *     en `scripts/output/cl-equivalences-<YYYYMMDD>.md` (ruta gitignoreada). Es lo
 *     que aprueba el owner ANTES de escribir.
 *   --apply   Escribe filas GLOBALES en `exchange_group_foods` con service_role
 *     (las policies `egf_insert_own`/`egf_insert_org` exigen dueno: `authenticated`
 *     NO puede crear filas globales). Doble gate: flag `--apply` + env
 *     NUTRITION_PORTIONS_CL_CONFIRM='yes'.
 *
 * Env (apps/web/.env.local o .env.local, o `--env <ruta>`):
 *   SUPABASE_URL (o NEXT_PUBLIC_SUPABASE_URL) y SUPABASE_SERVICE_ROLE_KEY.
 *   Sin fallback literal: `scripts/check-docs.mjs` rechaza `process.env.X ?? 'literal'`.
 *   La key NUNCA se imprime ni entra al informe.
 *
 * Flags: --dry-run | --apply | --env <ruta> | --out <ruta del informe>
 *
 * Salidas: 0 = dry-run/apply OK · 1 = error de entorno o de datos ·
 *          2 = apply BLOQUEADO por los controles: corte de carnes verificado sobre
 *              el universo curado COMPLETO de CB/CA, curados ambiguos, conflictos
 *              etiqueta ↔ gramos y curados sin match que se perderian.
 *
 * Corrida (PS 5.1, desde la raiz del monorepo). El .mjs importa .ts sin extension
 * en la cadena (`exchange-lists.ts` → `./intake-normalize`), asi que Node solo no
 * alcanza: hace falta un loader. `tsx` NO esta en el lockfile (2026-09-09); `jiti`
 * si (dependencia transitiva, `pnpm exec jiti` resuelve desde node_modules/.bin):
 *   pnpm exec jiti scripts/nutrition-portions-cl/derive-cl-equivalences.mjs --dry-run
 *   $env:NUTRITION_PORTIONS_CL_CONFIRM = 'yes'
 *   pnpm exec jiti scripts/nutrition-portions-cl/derive-cl-equivalences.mjs --apply
 * (con tsx instalado: `node --import tsx <ruta> --dry-run` es equivalente).
 */

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
// `roundPortionGrams` NO se importa a proposito: `suggestPortionGrams` ya lo
// aplica adentro (`exchange-lists.ts:126`), asi que llamarlo aca redondearia dos
// veces y el informe mostraria como «gramos calculados» algo que no es el crudo.
import {
  suggestPortionGrams,
  EXCHANGE_PORTION_GRAMS_LIMIT,
} from '../../packages/nutrition-v2/exchange-lists.ts'
import { intakeEntryFactor } from '../../packages/nutrition-v2/intake-normalize.ts'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const REPO_ROOT = resolve(__dirname, '../..')

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
const DRY_FLAG = process.argv.includes('--dry-run')
const ENV_ARG = flagValue('--env')
const OUT_ARG = flagValue('--out')

if (APPLY && DRY_FLAG) {
  console.error('--dry-run y --apply son mutuamente excluyentes.')
  process.exit(1)
}
/** Sin flags = dry-run. El modo que escribe se pide SIEMPRE explicito. */
const MODE = APPLY ? 'APPLY' : 'DRY-RUN'

// Envs: igual que classify-foods (apps/web/.env.local primero, .env.local despues
// sin override). `--env` gana sobre las dos, para correr contra otro proyecto.
if (ENV_ARG) config({ path: resolve(ENV_ARG) })
config({ path: resolve(REPO_ROOT, 'apps/web/.env.local'), override: false })
config({ path: resolve(REPO_ROOT, '.env.local'), override: false })

// ---------------------------------------------------------------------------
// 1) Tablas fijas del diseno (DATA §4.1, §4.2, §4.3, §4.3b)
// ---------------------------------------------------------------------------

/**
 * Macro clave por grupo chileno (R1). EXPLICITA, nunca derivada con
 * `dominantExchangeMacro`: con los refs UDD esa funcion devuelve `carbs` para LD y
 * LS pero `fats` para LE, y los tres subgrupos lacteos quedarian con gramajes
 * inconsistentes entre si. 'calories' = derivar por calorias (los descremados
 * tienen 0 g de grasa: derivar por lipidos es imposible).
 */
const CL_KEY_MACRO = {
  LD: 'calories', LS: 'calories', LE: 'calories',
  CB: 'protein', CA: 'protein', SCP: 'protein',
  LGS: 'carbs', VG: 'carbs', VL: 'carbs',
  FR: 'carbs', PCT: 'carbs', AZ: 'carbs',
  AG: 'fats',
}

/** Mapa SMAE → chileno (DATA §4.2). `null` = destino dinamico por grasa. */
const SMAE_TO_CL = {
  C: 'PCT', F: 'FR', V: 'VG',
  ARL: 'AG', G: 'AG', LEG: 'LGS', SP: 'SCP',
  LAC: null, // splitDairy (§4.3)
  P: null,   // splitMeat (§4.3b)
}

/** Eje lacteo: <15 % de kcal desde la grasa → LD · 15-40 % → LS · >40 % → LE. */
const DAIRY_SPLIT = { LD_MAX: 0.15, LS_MAX: 0.40 }
/** Eje de carnes (R16): mismo corte inclusivo del eje lacteo. share ≤ 0,40 → CB. */
const MEAT_SPLIT = { CB_MAX: 0.40 }
/** Guard SOLO para suplementos: un «scoop» con >50 % de kcal en grasa es una barra. */
const SUPPLEMENT_FAT_MAX = 0.50

/**
 * Rango util del set chileno. Mas estrecho que el CHECK `egf_portion_grams_range`
 * (5000) a proposito: ninguna porcion casera pide 2 kg de nada, y arriba de 600 g
 * lo que hay es un dato malo del catalogo.
 */
const CL_GRAMS_MIN = 5
const CL_GRAMS_MAX = 600

/** Universo esperado del set SMAE (STATS 08-09). Menos que esto = warning. */
const EXPECTED_UNIVERSE_MIN = 2507
/** Tope del CHECK `egf_portion_label_len` (20260804090000). */
const PORTION_LABEL_MAX_CHARS = 40
/** Chunk de escritura del apply (DATA §4.5). */
const WRITE_CHUNK = 500
/** Umbral del bloque «curados que difieren del derivado» (DATA §4.6). */
const CURATED_DELTA_MAX = 0.15
/** Umbral de la auditoria SMAE (R7). */
const SMAE_AUDIT_DELTA_MAX = 0.20
/**
 * Piso de muestra del control del corte de carnes (R16, DATA §4.3b): el manual
 * aporta «~15 genericos» de CB/CA y el control se corre sobre el universo curado
 * COMPLETO (hoy 16 CB + 14 CA). Con menos que esto el control no prueba nada y el
 * apply queda bloqueado igual que con un ✘.
 */
const MEAT_CONTROL_MIN_ROWS = 15

/** Palabras que delatan un falso positivo del clasificador de julio en lacteos. */
const DAIRY_KEYWORD_SUSPECTS = ['popcorn', 'cookie', 'galleta', 'barra', 'cereal', 'arroz', 'snack', 'pop corn']
const DAIRY_CODES = new Set(['LD', 'LS', 'LE'])

// ---------------------------------------------------------------------------
// 2) Funciones PURAS (sin I/O): toda la matematica del script vive aca
// ---------------------------------------------------------------------------

/**
 * Macros del alimento POR GRAMO. Replica de `perGramMacros` de
 * `packages/nutrition-v2/exchange-lists.ts` (privada, no exportada): se reusa el
 * MISMO `intakeEntryFactor` para que el resultado sea byte-identico al del
 * producto, incluida la rama legada sin `macros_basis` declarada.
 */
function perGramMacros(food) {
  const factor = intakeEntryFactor({
    quantity: 1,
    unit: 'g',
    servingSize: food.serving_size,
    basis: food.macros_basis ?? null,
  })
  const scale = (value) => {
    const n = Number(value ?? 0)
    const out = Number.isFinite(n) && n > 0 ? n * factor : 0
    return Number.isFinite(out) ? out : 0
  }
  return {
    protein: scale(food.protein_g),
    carbs: scale(food.carbs_g),
    fats: scale(food.fats_g),
    calories: scale(food.calories),
  }
}

/** Forma `ExchangeFoodMacros` que espera `suggestPortionGrams`. */
function toFoodMacros(food) {
  return {
    proteinG: food.protein_g,
    carbsG: food.carbs_g,
    fatsG: food.fats_g,
    calories: food.calories,
    servingSize: food.serving_size,
    macrosBasis: food.macros_basis ?? null,
  }
}

/**
 * % de kcal que aporta la grasa. Adimensional ⇒ escala-invariante: sirve igual
 * para la leche (per_100) y para el queso (per_serving). `null` sin kcal utiles.
 */
function fatEnergyShare(food) {
  const pg = perGramMacros(food)
  if (!(pg.calories > 0)) return null
  return (pg.fats * 9) / pg.calories
}

/** Grupo chileno destino de una fila del universo SMAE. `null` = se descarta. */
function targetCode(smaeCode, food) {
  if (smaeCode === 'LAC') {
    const share = fatEnergyShare(food)
    if (share == null) return null
    if (share < DAIRY_SPLIT.LD_MAX) return 'LD'
    if (share <= DAIRY_SPLIT.LS_MAX) return 'LS'
    return 'LE'
  }
  // §4.3b (R16): el eje de carnes tambien esta partido. Sin esto una vienesa
  // (11 g P / 25 g G) saldria como «1 porcion de carne BAJA en grasa» de ~100 g y
  // ~290 kcal reales contra 65 declaradas. NO hay descarte por exceso de grasa:
  // la longaniza es una carne alta en grasa y vive en la lamina de CA.
  if (smaeCode === 'P') {
    const share = fatEnergyShare(food)
    if (share == null) return null
    return share <= MEAT_SPLIT.CB_MAX ? 'CB' : 'CA'
  }
  if (smaeCode === 'SP') {
    const share = fatEnergyShare(food)
    if (share != null && share > SUPPLEMENT_FAT_MAX) return null
  }
  return SMAE_TO_CL[smaeCode] ?? null
}

/**
 * Grupo sintetico que FUERZA el macro clave: `suggestPortionGrams` elige solo el
 * macro dominante, asi que se le pasan los otros dos en 0. Con clave 'calories'
 * van los TRES macros en 0 y el `ref_calories` real, que es exactamente la rama
 * de fallback por calorias de `exchange-lists.ts:121-123`.
 */
function syntheticGroup(group) {
  const key = CL_KEY_MACRO[group.code]
  if (key === 'calories') {
    return { refCalories: group.refCalories, refProteinG: 0, refCarbsG: 0, refFatsG: 0 }
  }
  return {
    refCalories: group.refCalories,
    refProteinG: key === 'protein' ? group.refProteinG : 0,
    refCarbsG: key === 'carbs' ? group.refCarbsG : 0,
    refFatsG: key === 'fats' ? group.refFatsG : 0,
  }
}

/**
 * Gramos de 1 porcion del grupo chileno, con el detalle del descarte para el
 * informe (top-20 sospechosos).
 *
 * `raw` son los gramos que devuelve la formula del producto, que YA vienen
 * redondeados y acotados: `suggestPortionGrams` (`exchange-lists.ts:114-129`)
 * aplica `roundPortionGrams` adentro y devuelve `null` sobre
 * `EXCHANGE_PORTION_GRAMS_LIMIT`. Por eso NO se vuelve a redondear aca (redondear
 * dos veces no cambia el numero pero miente sobre lo que hace el script) y el
 * cinturon del CHECK de abajo es defensa muerta HOY: se deja porque DATA §4.4 lo
 * pide y porque si esa funcion dejara de acotar, aca no se escribiria una fila
 * que el CHECK `egf_portion_grams_range` rechaza.
 */
function gramsForClGroupDetail(group, food) {
  const raw = suggestPortionGrams(syntheticGroup(group), toFoodMacros(food))
  if (raw == null) return { grams: null, raw: null, reason: 'sin_formula' }
  if (raw > EXCHANGE_PORTION_GRAMS_LIMIT) return { grams: null, raw, reason: 'sobre_limite_check' }
  if (raw < CL_GRAMS_MIN) return { grams: null, raw, reason: 'bajo_5g' }
  if (raw > CL_GRAMS_MAX) return { grams: null, raw, reason: 'sobre_600g' }
  return { grams: raw, raw, reason: null }
}

/** Gramos de 1 porcion del grupo chileno, o `null` si no se puede sugerir (R5). */
function gramsForClGroup(group, food) {
  return gramsForClGroupDetail(group, food).grams
}

/**
 * Auditoria R7: cuanto difiere `portion_grams` de la fila SMAE vigente de lo que
 * daria HOY la formula correcta. El script de julio ignoraba `macros_basis`.
 * NO corrige nada: solo cuenta.
 */
function auditSmaeRow(row, smaeGroupRefs) {
  const refs = smaeGroupRefs.get(row.group.code)
  if (!refs) return { status: 'sin_dato' }
  const expected = suggestPortionGrams(refs, toFoodMacros(row.food))
  const actual = Number(row.portion_grams ?? 0)
  if (!(expected > 0) || !(actual > 0)) return { status: 'sin_dato' }
  const delta = Math.abs(expected - actual) / actual
  return { status: delta > SMAE_AUDIT_DELTA_MAX ? 'divergente' : 'ok', expected, actual, delta }
}

/** Normaliza para comparar/buscar: minusculas, sin tildes (NFD), sin dobles espacios. */
function normalizeName(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** Las 2 palabras mas largas (≥ 4 letras) del nombre, para buscar candidatos. */
function longestWords(name, take = 2) {
  const words = normalizeName(name)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3)
    .sort((a, b) => b.length - a.length)
    .slice(0, take)
  // Raiz sin plural («uvas» → «uva», «porotos» → «poroto»): el ilike con la raiz
  // encuentra singular y plural a la vez. Con «Uva» (3 letras) el filtro de 4
  // letras dejaba la busqueda vacia y el informe decia «sin candidatos».
  const stems = words.map((w) => (w.length >= 5 ? w.replace(/(es|s)$/, '') : w))
  return [...new Set([...stems, ...words])]
}

/** Escapa los comodines de `ilike` para que un nombre se compare literal. */
function escapeLike(value) {
  return String(value ?? '').replace(/[%_\\]/g, (c) => `\\${c}`)
}

function chunk(list, size) {
  const out = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

function percentile(sorted, q) {
  if (sorted.length === 0) return null
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))
  return sorted[idx]
}

/** min · p25 · mediana · p75 · max · n de una lista de gramos. */
function distribution(values) {
  const sorted = [...values].sort((a, b) => a - b)
  return {
    n: sorted.length,
    min: sorted.length > 0 ? sorted[0] : null,
    p25: percentile(sorted, 0.25),
    p50: percentile(sorted, 0.5),
    p75: percentile(sorted, 0.75),
    max: sorted.length > 0 ? sorted[sorted.length - 1] : null,
  }
}

/** Histograma de `fatEnergyShare` en tramos de 5 puntos (0,00-0,05, …, >1,00). */
function shareHistogram(shares) {
  const bins = new Map()
  let nulls = 0
  let over = 0
  for (const share of shares) {
    if (share == null) { nulls += 1; continue }
    if (share > 1) { over += 1; continue }
    const bin = Math.min(19, Math.floor(share / 0.05))
    bins.set(bin, (bins.get(bin) ?? 0) + 1)
  }
  const rows = []
  for (let bin = 0; bin < 20; bin += 1) {
    const n = bins.get(bin) ?? 0
    if (n === 0) continue
    rows.push({ from: bin * 0.05, to: (bin + 1) * 0.05, n })
  }
  return { rows, nulls, over }
}

/** Las N filas mas cercanas a un corte, por lado (`bajo` = share ≤ corte). */
function closestToCut(items, cut, take = 10) {
  const withShare = items.filter((it) => it.share != null)
  const bajo = withShare.filter((it) => it.share <= cut).sort((a, b) => (cut - a.share) - (cut - b.share)).slice(0, take)
  const alto = withShare.filter((it) => it.share > cut).sort((a, b) => (a.share - cut) - (b.share - cut)).slice(0, take)
  return { bajo, alto }
}

/** Coherencia etiqueta ↔ gramos (R-14): misma etiqueta con gramajes distintos. */
function labelGramsConflicts(curatedByGroup) {
  const conflicts = []
  for (const [code, rows] of curatedByGroup) {
    const byLabel = new Map()
    for (const row of rows) {
      const label = String(row.label ?? '').trim()
      if (!label) continue
      if (!byLabel.has(label)) byLabel.set(label, new Map())
      const grams = byLabel.get(label)
      if (!grams.has(row.grams)) grams.set(row.grams, [])
      grams.get(row.grams).push(row.name)
    }
    for (const [label, grams] of byLabel) {
      if (grams.size > 1) {
        conflicts.push({
          code,
          label,
          variantes: [...grams.entries()].map(([g, names]) => ({ grams: g, names })),
        })
      }
    }
  }
  return conflicts
}

/** `true` si la fuente (de grupo o de fila) viene de INTA (R-15). */
function isIntaSource(groupSource, rowSource) {
  return /INTA/i.test(String(rowSource ?? '')) || /INTA/i.test(String(groupSource ?? ''))
}

/** Sospecha de contaminacion del clasificador de julio en el eje lacteo. */
function keywordSuspect(code, name) {
  if (!DAIRY_CODES.has(code)) return null
  const normalized = normalizeName(name)
  const hit = DAIRY_KEYWORD_SUSPECTS.find((word) => normalized.includes(word))
  return hit ?? null
}

function pct(value, digits = 1) {
  if (value == null || !Number.isFinite(value)) return '—'
  return `${(value * 100).toFixed(digits).replace('.', ',')} %`
}

function num(value) {
  if (value == null || !Number.isFinite(Number(value))) return '—'
  const n = Number(value)
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(1)))
}

/** Escapa una celda de tabla Markdown (los nombres del catalogo traen de todo). */
function md(value) {
  return String(value ?? '').replace(/\r?\n/g, ' ').replace(/\|/g, '\\|')
}

/** Fecha LOCAL en YYYYMMDD para el nombre del informe. */
function localStampDate(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}`
}

// ---------------------------------------------------------------------------
// 3) Guardas de entorno y cliente (I/O)
// ---------------------------------------------------------------------------

function requireEnv() {
  // Sin fallback literal: docs:check rechaza `process.env.X ?? 'https://…'`.
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error(
      'Faltan SUPABASE_URL (o NEXT_PUBLIC_SUPABASE_URL) y/o SUPABASE_SERVICE_ROLE_KEY.\n' +
        'Se buscan en apps/web/.env.local, .env.local o el archivo de --env. No hay default.',
    )
    process.exit(1)
  }
  return { url, key }
}

function requireWriteConfirm() {
  if (process.env.NUTRITION_PORTIONS_CL_CONFIRM !== 'yes') {
    console.error(
      '--apply escribe filas globales en la Supabase remota. Requiere AMBOS gates:\n' +
        '  1) flag --apply\n' +
        "  2) env NUTRITION_PORTIONS_CL_CONFIRM='yes'\n" +
        'Abortando sin tocar nada.',
    )
    process.exit(1)
  }
}

function createServiceRoleClient(url, key) {
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

const FOOD_COLUMNS = 'id, name, brand, calories, protein_g, carbs_g, fats_g, serving_size, macros_basis, coach_id, org_id, category'

// ---------------------------------------------------------------------------
// 4) Carga del JSON de curados (§5.2)
// ---------------------------------------------------------------------------

/**
 * Lee `generic-foods-cl.json` con readFileSync + JSON.parse relativo a
 * `import.meta.url` (no `import ... with { type: 'json' }`: las import attributes
 * dependen del loader y este .mjs se corre con tsx).
 */
function loadCuratedJson() {
  const path = resolve(__dirname, 'generic-foods-cl.json')
  if (!existsSync(path)) {
    console.error(`No existe ${path}. El JSON de curados (§5.2) es obligatorio: sin el no hay set chileno.`)
    process.exit(1)
  }
  let parsed
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'))
  } catch (err) {
    console.error(`generic-foods-cl.json no es JSON valido: ${err instanceof Error ? err.message : err}`)
    process.exit(1)
  }
  const groups = parsed?.groups
  if (!groups || typeof groups !== 'object') {
    console.error('generic-foods-cl.json no trae `groups`. Forma esperada: DATA §5.2.')
    process.exit(1)
  }
  /** Aplana a filas con su grupo, su fuente y la marca INTA (R-15). */
  const rows = []
  /** Filas OMITIDAS a proposito (`"skip": true` + `skip_reason`): el alimento no
   *  existe en el catalogo y el owner decidio no darlo de alta. Salen del
   *  universo curado (no bloquean, no se escriben) y se listan en el informe. */
  const skipped = []
  for (const [code, group] of Object.entries(groups)) {
    const foods = Array.isArray(group?.foods) ? group.foods : []
    for (const food of foods) {
      if (food?.skip === true) {
        skipped.push({ code, name: String(food?.name ?? '').trim(), reason: food?.skip_reason ?? null })
        continue
      }
      rows.push({
        code,
        groupSource: group?.source ?? null,
        name: String(food?.name ?? '').trim(),
        grams: Number(food?.grams),
        label: typeof food?.label === 'string' ? food.label.trim() : null,
        note: food?.note ?? null,
        source: food?.source ?? null,
        foodId: food?.food_id ?? null,
        aliases: Array.isArray(food?.aliases) ? food.aliases.filter((a) => typeof a === 'string') : [],
        macros100: food?.macros_100 ?? null,
        category: food?.category ?? null,
        householdLabel: food?.household_label ?? null,
        householdGrams: food?.household_grams ?? null,
        // Excepcion DECLARADA del control de carnes (solo CB/CA): el manual
        // clasifica el alimento contra su % de kcal desde grasa y se acepta con
        // la pagina escrita. Sin texto = sin excepcion.
        controlException:
          typeof food?.control_exception === 'string' && food.control_exception.trim()
            ? food.control_exception.trim()
            : null,
        inta: isIntaSource(group?.source, food?.source),
      })
    }
  }
  return { path, version: parsed?.version ?? null, rows, skipped }
}

/** Validaciones de forma del curado que NO necesitan la DB. */
function validateCuratedRows(rows, clGroups) {
  const problems = []
  for (const row of rows) {
    if (!row.name) problems.push({ row, motivo: 'fila sin `name`' })
    if (!clGroups.has(row.code)) problems.push({ row, motivo: `grupo \`${row.code}\` no existe en el set cl` })
    if (!(row.grams > 0) || row.grams > EXCHANGE_PORTION_GRAMS_LIMIT) {
      problems.push({ row, motivo: `gramos fuera del CHECK egf_portion_grams_range: ${row.grams}` })
    }
    if (row.label != null && Array.from(row.label).length > PORTION_LABEL_MAX_CHARS) {
      problems.push({ row, motivo: `etiqueta de ${Array.from(row.label).length} caracteres (tope ${PORTION_LABEL_MAX_CHARS})` })
    }
  }
  return problems
}

// ---------------------------------------------------------------------------
// 5) Lectores (I/O)
// ---------------------------------------------------------------------------

/**
 * Los 13 grupos chilenos, del catalogo y NO hardcodeados. SIN `.is('deleted_at', null)`
 * (R14-ter): entre W0 y el encendido de W6.8 los 13 viven APAGADOS y el script tiene
 * que poder correr igual. Es seguro porque corre con service_role (sin RLS).
 */
async function loadClGroups(db) {
  const { data, error } = await db
    .from('exchange_groups')
    .select('id, code, slug, ref_calories, ref_protein_g, ref_carbs_g, ref_fats_g')
    .eq('portion_system', 'cl')
    .eq('is_system', true)
  if (error) throw new Error(`loadClGroups: ${error.message}`)
  const rows = data ?? []
  if (rows.length !== 13) {
    throw new Error(`Se esperaban 13 grupos cl, hay ${rows.length}. Corre el _POST_DEPLOY_ primero.`)
  }
  // ASSERT DURO: los 13 `code` del catalogo son EXACTAMENTE las llaves de
  // CL_KEY_MACRO. Sin esto, si el seed renombrara un code, `syntheticGroup`
  // devolveria los tres refs en 0 y TODO ese grupo se derivaria por calorias en
  // silencio (macro clave equivocada, gramos mentirosos), y los controles que
  // buscan 'CB'/'CA' por nombre reventarian con TypeError mucho despues.
  const catalogCodes = rows.map((g) => g.code).sort()
  const tableCodes = Object.keys(CL_KEY_MACRO).sort()
  const sobran = catalogCodes.filter((c) => !CL_KEY_MACRO[c])
  const faltan = tableCodes.filter((c) => !catalogCodes.includes(c))
  if (sobran.length > 0 || faltan.length > 0) {
    throw new Error(
      'Los codigos del catalogo cl no coinciden con CL_KEY_MACRO (DATA §4.1). ' +
        `Sin macro clave: [${sobran.join(', ')}] · en la tabla pero no en el catalogo: [${faltan.join(', ')}]. ` +
        'NO se deriva nada: el macro clave forzado es la mitad de la formula.',
    )
  }
  return new Map(rows.map((g) => [g.code, {
    id: g.id,
    code: g.code,
    slug: g.slug,
    refCalories: Number(g.ref_calories),
    refProteinG: Number(g.ref_protein_g),
    refCarbsG: Number(g.ref_carbs_g),
    refFatsG: Number(g.ref_fats_g),
  }]))
}

/** Los 9 grupos SMAE vigentes con sus refs: son el origen del universo y de la auditoria R7. */
async function loadSmaeGroups(db) {
  const { data, error } = await db
    .from('exchange_groups')
    .select('id, code, ref_calories, ref_protein_g, ref_carbs_g, ref_fats_g')
    .eq('portion_system', 'smae')
    .eq('is_system', true)
    .is('deleted_at', null)
  if (error) throw new Error(`loadSmaeGroups: ${error.message}`)
  const rows = data ?? []
  if (rows.length !== 9) {
    console.warn(`loadSmaeGroups: se esperaban 9 grupos smae vigentes, hay ${rows.length}.`)
  }
  return new Map(rows.map((g) => [g.code, {
    id: g.id,
    code: g.code,
    refCalories: Number(g.ref_calories),
    refProteinG: Number(g.ref_protein_g),
    refCarbsG: Number(g.ref_carbs_g),
    refFatsG: Number(g.ref_fats_g),
  }]))
}

/** Alimentos GLOBALES con nombre exactamente igual (case-insensitive). */
async function findGlobalFoodsByName(db, name) {
  const { data, error } = await db
    .from('foods')
    .select(FOOD_COLUMNS)
    .ilike('name', escapeLike(name))
    .is('coach_id', null)
    .is('org_id', null)
  if (error) throw new Error(`findGlobalFoodsByName(${name}): ${error.message}`)
  return data ?? []
}

/** Candidatos para el informe cuando un curado no tuvo match exacto. */
async function findCandidates(db, name, limit = 5) {
  const words = longestWords(name)
  const seen = new Map()
  for (const word of words) {
    // Se busca con la palabra tal cual (el catalogo guarda tildes) y con su
    // version sin tildes: `ilike` no des-acentua y `unaccent` no esta disponible
    // por PostgREST. Decision del worker, ver el resumen de la tarea.
    const variants = new Set([word])
    const original = String(name).split(/[^\p{L}\p{N}]+/u).find((w) => normalizeName(w) === word)
    if (original) variants.add(original)
    for (const variant of variants) {
      if (seen.size >= limit) break
      const { data, error } = await db
        .from('foods')
        .select(FOOD_COLUMNS)
        .ilike('name', `%${escapeLike(variant)}%`)
        .is('coach_id', null)
        .is('org_id', null)
        .limit(limit)
      if (error) throw new Error(`findCandidates(${name}): ${error.message}`)
      for (const row of data ?? []) {
        if (!seen.has(row.id) && seen.size < limit) seen.set(row.id, row)
      }
    }
  }
  return [...seen.values()]
}

/**
 * Resuelve cada fila del JSON a un `food_id` GLOBAL. Corre ANTES de `loadUniverse`
 * porque su salida alimenta CURATED_FOOD_IDS y esa exclusion define el universo
 * derivado (§4.2, R-13): el curado es autoridad y define grupo, gramos y etiqueta.
 */
async function resolveGenerics(db, curatedRows) {
  const resolved = []
  const ambiguos = []
  const sinMatch = []
  for (const row of curatedRows) {
    if (row.foodId) {
      const { data, error } = await db.from('foods').select(FOOD_COLUMNS).eq('id', row.foodId).limit(1)
      if (error) throw new Error(`resolveGenerics(${row.name}): ${error.message}`)
      const food = (data ?? [])[0]
      if (!food) {
        sinMatch.push({ row, motivo: `food_id ${row.foodId} no existe`, candidatos: await findCandidates(db, row.name) })
        continue
      }
      if (food.coach_id != null || food.org_id != null) {
        sinMatch.push({ row, motivo: `food_id ${row.foodId} tiene dueno (coach/org): no es global`, candidatos: [] })
        continue
      }
      resolved.push({ row, food })
      continue
    }

    const hits = new Map()
    for (const name of [row.name, ...row.aliases]) {
      if (!name) continue
      for (const food of await findGlobalFoodsByName(db, name)) hits.set(food.id, food)
    }
    const all = [...hits.values()]
    // Preferencia por el GENERICO (brand null): el manual habla de «leche
    // descremada», no de la de Colun. Las marcas homonimas se ignoran y se
    // cuentan; solo dos GENERICOS homonimos son ambiguedad real (curaduria, no
    // automatismo). Sin generico: hay que fijar food_id en el JSON, y las marcas
    // van como candidatos al informe.
    const genericos = all.filter((food) => food.brand == null)
    if (genericos.length === 1) {
      resolved.push({ row, food: genericos[0], marcasIgnoradas: all.length - 1 })
    } else if (genericos.length > 1) {
      ambiguos.push({ row, hits: genericos })
    } else if (all.length > 0) {
      sinMatch.push({ row, motivo: `sin generico: ${all.length} marca(s) con ese nombre (fija food_id)`, candidatos: all.slice(0, 5) })
    } else {
      sinMatch.push({ row, motivo: 'sin coincidencia exacta entre alimentos globales', candidatos: await findCandidates(db, row.name) })
    }
  }
  return { resolved, ambiguos, sinMatch }
}

/**
 * Universo de derivacion: las filas GLOBALES de `exchange_group_foods` con
 * `source='catalog'` e `is_excluded=false` de los grupos SMAE (~2.507, STATS).
 * PAGINACION CON ORDEN EXPLICITO: `.range()` sin `.order()` no garantiza
 * estabilidad entre paginas y se perderian filas en silencio. El orden es el uq
 * de la tabla y el conteo se contrasta contra el total real.
 */
async function loadUniverse(db) {
  const rows = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from('exchange_group_foods')
      .select(`
        exchange_group_id,
        food_id,
        portion_grams,
        food:foods!inner ( id, name, brand, calories, protein_g, carbs_g, fats_g,
                           serving_size, macros_basis, coach_id, org_id ),
        group:exchange_groups!inner ( code, portion_system, ref_calories, ref_protein_g,
                                      ref_carbs_g, ref_fats_g )
      `)
      .is('coach_id', null)
      .is('org_id', null)
      .eq('source', 'catalog')
      .eq('is_excluded', false)
      .eq('group.portion_system', 'smae')
      .order('exchange_group_id', { ascending: true })
      .order('food_id', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw new Error(`loadUniverse: ${error.message}`)
    const batch = data ?? []
    rows.push(...batch)
    if (batch.length < PAGE) break
  }

  // ASSERT DURO: la paginacion leyo TODO. Escribir con un universo incompleto
  // deja grupos mancos y nadie lo ve.
  const { count: expected, error: countError } = await db
    .from('exchange_group_foods')
    .select('food_id, group:exchange_groups!inner(portion_system)', { count: 'exact', head: true })
    .is('coach_id', null)
    .is('org_id', null)
    .eq('source', 'catalog')
    .eq('is_excluded', false)
    .eq('group.portion_system', 'smae')
  if (countError) throw new Error(`loadUniverse (conteo): ${countError.message}`)
  if (rows.length !== expected) {
    throw new Error(
      `loadUniverse: leidas ${rows.length} filas, esperadas ${expected}. ` +
        'La paginacion perdio o repitio filas: NO se escribe nada.',
    )
  }
  if (!(expected >= EXPECTED_UNIVERSE_MIN)) {
    console.warn(`loadUniverse: el universo bajo de ${EXPECTED_UNIVERSE_MIN} a ${expected} filas (STATS 08-09). Revisar antes de --apply.`)
  }
  return { rows, expected }
}

/** Filas GLOBALES que YA existen en los 13 grupos chilenos (clave del uq). */
async function loadExistingClRows(db, clGroups) {
  const ids = [...clGroups.values()].map((g) => g.id)
  const rows = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from('exchange_group_foods')
      .select('exchange_group_id, food_id, portion_label, source, is_excluded')
      .is('coach_id', null)
      .is('org_id', null)
      .in('exchange_group_id', ids)
      .order('exchange_group_id', { ascending: true })
      .order('food_id', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw new Error(`loadExistingClRows: ${error.message}`)
    const batch = data ?? []
    rows.push(...batch)
    if (batch.length < PAGE) break
  }
  const byKey = new Map()
  for (const row of rows) byKey.set(`${row.exchange_group_id}|${row.food_id}`, row)
  return byKey
}

// ---------------------------------------------------------------------------
// 6) Derivacion (puro, sobre lo ya leido)
// ---------------------------------------------------------------------------

/** Fuera los alimentos con dueno y fuera los curados (§4.2, R-13). */
function filterUniverse(rows, curatedFoodIds) {
  const conDueno = []
  const curados = []
  const universo = []
  for (const row of rows) {
    if (row.food.coach_id != null || row.food.org_id != null) { conDueno.push(row); continue }
    if (curatedFoodIds.has(row.food.id)) { curados.push(row); continue }
    universo.push(row)
  }
  return { universo, conDueno, curados }
}

/** Deriva una fila: destino, share y gramos, con el motivo del descarte. */
function deriveRow(row, clGroups) {
  const smaeCode = row.group.code
  const share = fatEnergyShare(row.food)
  const code = targetCode(smaeCode, row.food)
  if (code == null) {
    const motivo = share == null ? 'sin_kcal' : smaeCode === 'SP' ? 'suplemento_con_grasa' : 'sin_destino'
    return { smaeCode, code: null, share, grams: null, raw: null, motivo }
  }
  const group = clGroups.get(code)
  if (!group) return { smaeCode, code, share, grams: null, raw: null, motivo: 'grupo_cl_ausente' }
  const detail = gramsForClGroupDetail(group, row.food)
  return { smaeCode, code, group, share, grams: detail.grams, raw: detail.raw, motivo: detail.reason }
}

/** Todo el set derivado, deduplicado por (grupo cl, food) — ARL y G colapsan en AG. */
function deriveAll(universo, clGroups, existingByKey) {
  const porGrupo = new Map()
  for (const code of clGroups.keys()) {
    porGrupo.set(code, { candidatos: 0, validos: [], descartados: [], yaExistentes: 0, duplicados: 0, aInsertar: [] })
  }
  const sinDestino = []
  const vistos = new Set()
  for (const row of universo) {
    const derived = deriveRow(row, clGroups)
    if (derived.code == null || !derived.group) {
      sinDestino.push({ row, derived })
      continue
    }
    const bucket = porGrupo.get(derived.code)
    bucket.candidatos += 1
    if (derived.grams == null) {
      bucket.descartados.push({ row, derived })
      continue
    }
    // Contaminacion del clasificador de julio (DATA §4.3.1): un snack «sabor
    // queso» quedo en LAC por keywordSignal y NO es un lacteo. No se arrastra al
    // set chileno: se descarta con motivo propio y sale en el top-20.
    const suspect = keywordSuspect(derived.code, row.food.name)
    if (suspect) {
      bucket.descartados.push({ row, derived: { ...derived, grams: null, motivo: `sospechoso_nombre:${suspect}` } })
      continue
    }
    const item = {
      groupId: derived.group.id,
      groupCode: derived.code,
      foodId: row.food.id,
      food: row.food,
      grams: derived.grams,
      raw: derived.raw,
      share: derived.share,
      smaeCode: derived.smaeCode,
    }
    // DEDUPE ANTES de contar: ARL y G colapsan los dos en AG, asi que el mismo
    // (grupo cl, food) puede llegar dos veces. Si el duplicado entrara a
    // `validos`, el bloque 1 («con gramos validos») y la distribucion del bloque 2
    // quedarian inflados contra un `aInsertar` que si esta deduplicado.
    const key = `${item.groupId}|${item.foodId}`
    if (vistos.has(key)) { bucket.duplicados += 1; continue }
    vistos.add(key)
    bucket.validos.push(item)
    if (existingByKey.has(key)) { bucket.yaExistentes += 1; continue }
    bucket.aInsertar.push(item)
  }
  return { porGrupo, sinDestino }
}

/**
 * Control del corte de carnes (R16, DATA §4.3b punto 1): los genericos de CB/CA
 * del manual se pasan por `targetCode('P', food)` aunque esten excluidos del
 * universo derivado, y **los del universo COMPLETO** tienen que caer en el grupo
 * que dice la lamina.
 *
 * El denominador es el universo curado de CB+CA del JSON (hoy 16 + 14 = 30), NO
 * el subconjunto que casualmente resolvio contra el catalogo. Sin ese piso, con
 * `generic-foods-cl.json` sin `food_id` ni `aliases` casi todos caen en
 * `sinMatch` y el gate pasaria con un «3/3 ✔» que el owner leeria como si el
 * corte estuviera verificado. Un curado que NO resuelve es un control que NO se
 * corrio: cuenta como ✘ y bloquea igual que un ✘ de clasificacion.
 */
function meatControl(curatedRows, curated) {
  const universo = curatedRows.filter((row) => row.code === 'CB' || row.code === 'CA')
  const foodByRow = new Map(curated.resolved.map(({ row, food }) => [row, food]))
  const ambiguosRows = new Set(curated.ambiguos.map((a) => a.row))
  const sinMatchRows = new Map(curated.sinMatch.map((s) => [s.row, s.motivo]))

  const filas = []
  const noResueltos = []
  for (const row of universo) {
    const food = foodByRow.get(row)
    if (!food) {
      noResueltos.push({
        manual: row.code,
        name: row.name,
        motivo: ambiguosRows.has(row)
          ? 'AMBIGUO: mas de un alimento global con ese nombre'
          : (sinMatchRows.get(row) ?? 'sin resolver contra el catalogo'),
      })
      continue
    }
    const share = fatEnergyShare(food)
    const derivado = targetCode('P', food)
    // Excepcion DECLARADA en el JSON (`control_exception`): el manual clasifica
    // ese alimento contra su % de kcal desde grasa (UDD p. 57 pone el huevo
    // entero en CB con ~60 %; INTA p. 28 pone la sobrecostilla en CA). Manda el
    // manual, pero la excepcion tiene que estar escrita con su pagina: sin texto
    // sigue siendo ✘ y bloquea.
    const exception = derivado === row.code ? null : row.controlException
    const ok = derivado === row.code || exception != null
    filas.push({ manual: row.code, name: row.name, foodName: food.name, share, derivado, ok, exception })
  }
  const fallidos = filas.filter((f) => !f.ok)
  const excepciones = filas.filter((f) => f.exception != null)
  return {
    filas,
    fallidos,
    excepciones,
    noResueltos,
    esperados: universo.length,
    verificados: filas.length - fallidos.length,
    // El piso de muestra es doble: el universo curado completo Y el minimo que
    // exige DATA (§4.3b). Un JSON truncado no puede comprar el apply con 3 filas.
    ok:
      universo.length >= MEAT_CONTROL_MIN_ROWS &&
      noResueltos.length === 0 &&
      fallidos.length === 0,
  }
}

// ---------------------------------------------------------------------------
// 7) Informe (puro: recibe el modelo, devuelve Markdown)
// ---------------------------------------------------------------------------

function buildReport(model) {
  const {
    mode, target, generatedAt, clGroups, universeCount, universeExpected, curatedJson,
    curated, derived, smaeAudit, meat, curatedDeltas, labelConflicts, cbOverCut, applyResult,
  } = model
  const L = []
  const push = (line = '') => L.push(line)

  push(`# Equivalencias del set chileno — ${mode}`)
  push()
  push(`- Generado: ${generatedAt}`)
  push(`- Proyecto Supabase: \`${target}\``)
  push(`- Curados: \`scripts/nutrition-portions-cl/generic-foods-cl.json\`${curatedJson.version ? ` (version ${curatedJson.version})` : ''} — ${curatedJson.rows.length} filas activas${curatedJson.skipped.length ? ` + ${curatedJson.skipped.length} omitidas a propósito (\`skip\`)` : ''}`)
  push(`- Universo SMAE leido: **${universeCount}** filas (conteo exacto de la misma query: ${universeExpected})`)
  push()
  push('> Este informe NO contiene credenciales ni valores de entorno.')
  push()
  if (curatedJson.skipped.length > 0) {
    push('### Curados omitidos a propósito (`skip: true`)')
    push()
    push('| grupo | alimento | motivo |')
    push('|---|---|---|')
    for (const s of curatedJson.skipped) push(`| \`${s.code}\` | ${md(s.name)} | ${md(s.reason ?? '—')} |`)
    push()
  }

  // ── Bloque 1 ──────────────────────────────────────────────────────────────
  push('## 1. Conteo por grupo chileno')
  push()
  push('| code | candidatos | curados (excluidos del derivado) | con gramos válidos | descartados | ya existentes | a insertar |')
  push('|---|---:|---:|---:|---:|---:|---:|')
  let totals = { candidatos: 0, curados: 0, validos: 0, descartados: 0, yaExistentes: 0, aInsertar: 0 }
  for (const code of clGroups.keys()) {
    const bucket = derived.porGrupo.get(code)
    // Las filas del universo REALMENTE excluidas por curado (§4.6), no los curados
    // resueltos: un curado cuyo alimento no tenia fila SMAE no excluyo nada.
    const curadosGrupo = model.curadosExcluidosPorGrupo.get(code) ?? 0
    push(`| \`${code}\` | ${bucket.candidatos} | ${curadosGrupo} | ${bucket.validos.length} | ${bucket.descartados.length} | ${bucket.yaExistentes} | ${bucket.aInsertar.length} |`)
    totals = {
      candidatos: totals.candidatos + bucket.candidatos,
      curados: totals.curados + curadosGrupo,
      validos: totals.validos + bucket.validos.length,
      descartados: totals.descartados + bucket.descartados.length,
      yaExistentes: totals.yaExistentes + bucket.yaExistentes,
      aInsertar: totals.aInsertar + bucket.aInsertar.length,
    }
  }
  push(`| **total** | **${totals.candidatos}** | **${totals.curados}** | **${totals.validos}** | **${totals.descartados}** | **${totals.yaExistentes}** | **${totals.aInsertar}** |`)
  push()
  push(`Filas del universo sin destino (descartadas antes de elegir grupo): **${derived.sinDestino.length}**.`)
  push()
  push(
    `La columna «curados» son las filas del universo SMAE que salieron del derivado por estar en el JSON (R-13): ` +
      `**${model.curadosExcluidos}** en total, de **${curated.resolved.length}** curados resueltos. La diferencia son ` +
      'curados cuyo alimento no tenía fila de equivalencia SMAE, así que no excluyeron nada.',
  )
  push()
  push('Referencia esperada por el mapa de §4.2: PCT ≈ 706 · CB+CA ≈ 603 · FR ≈ 226 · VG ≈ 111 · LD+LS+LE ≈ 403 · AG ≈ 318 · LGS ≈ 88 · SCP ≈ 52 · VL = 0.')
  push()

  // ── Bloque 2 ──────────────────────────────────────────────────────────────
  push('## 2. Distribución de gramos por grupo')
  push()
  push('| code | mín | p25 | mediana | p75 | máx | n |')
  push('|---|---:|---:|---:|---:|---:|---:|')
  for (const code of clGroups.keys()) {
    const bucket = derived.porGrupo.get(code)
    const d = distribution(bucket.validos.map((v) => v.grams))
    push(`| \`${code}\` | ${num(d.min)} | ${num(d.p25)} | ${num(d.p50)} | ${num(d.p75)} | ${num(d.max)} | ${d.n} |`)
  }
  push()
  push('Si `PCT` no queda ~2× lo que tenía `C`, la escala está corrida (la porción INTA es ~2× la SMAE).')
  push()

  // ── Bloque 3 ──────────────────────────────────────────────────────────────
  push('## 3. Top 20 sospechosos')
  push()
  const sospechosos = []
  for (const [code, bucket] of derived.porGrupo) {
    for (const item of bucket.descartados) {
      const motivo = item.derived.motivo ?? ''
      if (motivo === 'bajo_5g' || motivo === 'sobre_600g' || motivo === 'sobre_limite_check') {
        sospechosos.push({ code, food: item.row.food, raw: item.derived.raw, motivo })
      } else if (motivo.startsWith('sospechoso_nombre:')) {
        sospechosos.push({
          code,
          food: item.row.food,
          raw: item.derived.raw,
          motivo: `EXCLUIDO del insert: nombre no calza con el grupo («${motivo.slice('sospechoso_nombre:'.length)}»)`,
        })
      }
    }
  }
  if (sospechosos.length === 0) {
    push('Ninguno.')
  } else {
    push('| grupo | alimento | basis | kcal | macro clave | gramos calculados | motivo |')
    push('|---|---|---|---:|---|---:|---|')
    for (const s of sospechosos.slice(0, 20)) {
      push(`| \`${s.code}\` | ${md(s.food.name)} | ${md(s.food.macros_basis ?? '—')} | ${num(s.food.calories)} | ${CL_KEY_MACRO[s.code]} | ${num(s.raw)} | ${md(s.motivo)} |`)
    }
    push()
    push(`Total de sospechosos: ${sospechosos.length}.`)
  }
  push()

  // ── Bloque 4 ──────────────────────────────────────────────────────────────
  push('## 4. Reparto de los dos ejes partidos por grasa')
  push()
  const ejeTabla = (codes, titulo) => {
    push(`### ${titulo}`)
    push()
    push('| destino | n | % kcal grasa mín | mediana | máx | 5 ejemplos |')
    push('|---|---:|---:|---:|---:|---|')
    for (const code of codes) {
      const bucket = derived.porGrupo.get(code)
      const shares = bucket.validos.map((v) => v.share).filter((s) => s != null).sort((a, b) => a - b)
      const ejemplos = bucket.validos.slice(0, 5).map((v) => v.food.name).join(' · ')
      push(`| \`${code}\` | ${bucket.validos.length} | ${pct(shares[0])} | ${pct(percentile(shares, 0.5))} | ${pct(shares[shares.length - 1])} | ${md(ejemplos)} |`)
    }
    push()
  }
  ejeTabla(['LD', 'LS', 'LE'], 'Eje lácteo (§4.3)')
  const sinKcalLac = derived.sinDestino.filter((d) => d.derived.smaeCode === 'LAC').length
  push(`Filas \`LAC\` con \`share == null\` (sin kcal útiles), descartadas: **${sinKcalLac}**.`)
  push()
  ejeTabla(['CB', 'CA'], 'Eje de carnes (§4.3b, R16)')
  const sinKcalP = derived.sinDestino.filter((d) => d.derived.smaeCode === 'P').length
  push(`Filas \`P\` con \`share == null\`, descartadas: **${sinKcalP}**.`)
  push()

  const carnes = [
    ...derived.porGrupo.get('CB').validos.map((v) => ({ ...v, destino: 'CB' })),
    ...derived.porGrupo.get('CA').validos.map((v) => ({ ...v, destino: 'CA' })),
  ]
  const cerca = closestToCut(carnes, MEAT_SPLIT.CB_MAX, 10)
  push('**10 filas más cercanas al corte 0,40 por cada lado** (vienesa, longaniza y mortadela tienen que caer en `CA`):')
  push()
  push('| lado | alimento | share | destino |')
  push('|---|---|---:|---|')
  for (const it of [...cerca.bajo, ...cerca.alto]) {
    push(`| ${it.share <= MEAT_SPLIT.CB_MAX ? '≤ 0,40' : '> 0,40'} | ${md(it.food.name)} | ${pct(it.share)} | \`${it.destino}\` |`)
  }
  push()

  push(`### Control ${meat.esperados}/${meat.esperados} del corte de carnes (R16)`)
  push()
  push(
    `Universo del control: **los ${meat.esperados} curados de \`CB\`/\`CA\` del manual** (§5.2), no los que ` +
      'casualmente resolvieron contra el catálogo. Un curado sin resolver es un control que **no se corrió**: ' +
      'cuenta como ✘.',
  )
  push()
  if (meat.esperados < MEAT_CONTROL_MIN_ROWS) {
    push(`**✘ BLOQUEA EL APPLY**: el JSON solo trae ${meat.esperados} curados de \`CB\`/\`CA\` (mínimo ${MEAT_CONTROL_MIN_ROWS}). Con esa muestra el corte no está verificado.`)
    push()
  }
  if (meat.filas.length > 0) {
    push('| alimento curado | grupo del manual | grupo que da fatEnergyShare | share | ✔/✘ |')
    push('|---|---|---|---:|:--:|')
    for (const f of meat.filas) {
      push(`| ${md(f.name)} → ${md(f.foodName)} | \`${f.manual}\` | ${f.derivado ? `\`${f.derivado}\`` : '—'} | ${pct(f.share)} | ${f.ok ? (f.exception ? '✔ excepción' : '✔') : '✘'} |`)
    }
    push()
  }
  if (meat.excepciones.length > 0) {
    push(`**Excepciones declaradas (${meat.excepciones.length})** — el manual manda sobre el % de kcal desde grasa, con su página escrita en el JSON (\`control_exception\`):`)
    push()
    push('| alimento curado | grupo del manual | share | excepción |')
    push('|---|---|---:|---|')
    for (const f of meat.excepciones) push(`| ${md(f.name)} | \`${f.manual}\` | ${pct(f.share)} | ${md(f.exception)} |`)
    push()
  }
  if (meat.noResueltos.length > 0) {
    push(`**Curados de carne SIN VERIFICAR (${meat.noResueltos.length} de ${meat.esperados})** — no se resolvieron contra el catálogo, así que nunca pasaron por \`fatEnergyShare\`:`)
    push()
    push('| alimento curado | grupo del manual | por qué no se verificó |')
    push('|---|---|---|')
    for (const f of meat.noResueltos) push(`| ${md(f.name)} | \`${f.manual}\` | ${md(f.motivo)} |`)
    push()
  }
  push(
    `Resultado: **${meat.verificados}/${meat.esperados} verificados**` +
      ` (clasificados mal: ${meat.fallidos.length} · con excepción declarada: ${meat.excepciones.length} · sin resolver: ${meat.noResueltos.length})` +
      `${meat.ok ? ' ✔ el corte reproduce el manual en el universo completo.' : ' ✘ **BLOQUEA EL APPLY**: el corte no está verificado 100 %.'}`,
  )
  push()

  push('### Control «0 filas en `CB` con share > 0,40»')
  push()
  if (cbOverCut.length === 0) {
    push('Conteo: **0** ✔')
  } else {
    push(`Conteo: **${cbOverCut.length}** ✘`)
    push()
    push('| alimento | share |')
    push('|---|---:|')
    for (const it of cbOverCut.slice(0, 20)) push(`| ${md(it.food.name)} | ${pct(it.share)} |`)
  }
  push()

  push('### Histograma de `fatEnergyShare` (tramos de 5 puntos)')
  push()
  for (const [smaeCode, titulo] of [['LAC', 'LAC (eje lácteo)'], ['P', 'P (eje de carnes)']]) {
    const shares = model.sharesBySmae.get(smaeCode) ?? []
    const hist = shareHistogram(shares.map((s) => s.share))
    push(`**${titulo}** — n = ${shares.length} · sin kcal = ${hist.nulls} · share > 1 = ${hist.over}`)
    push()
    push('| tramo | n |')
    push('|---|---:|')
    for (const bin of hist.rows) push(`| ${bin.from.toFixed(2)}–${bin.to.toFixed(2)} | ${bin.n} |`)
    push()
    for (const cut of smaeCode === 'LAC' ? [DAIRY_SPLIT.LD_MAX, DAIRY_SPLIT.LS_MAX] : [MEAT_SPLIT.CB_MAX]) {
      const near = closestToCut(shares, cut, 5)
      const nombres = [...near.bajo, ...near.alto].map((it) => `${it.food.name} (${pct(it.share)})`).join(' · ')
      push(`- 10 ejemplos alrededor de ${cut.toFixed(2)}: ${md(nombres) || '—'}`)
    }
    push()
  }

  push('### Coherencia etiqueta ↔ gramos por grupo (R-14)')
  push()
  if (labelConflicts.length === 0) {
    push('Sin conflictos: ninguna etiqueta curada aparece con dos gramajes distintos dentro del mismo grupo.')
  } else {
    push('| grupo | etiqueta | gramajes distintos |')
    push('|---|---|---|')
    for (const c of labelConflicts) {
      const detalle = c.variantes.map((v) => `${num(v.grams)} g (${v.names.join(', ')})`).join(' · ')
      push(`| \`${c.code}\` | ${md(c.label)} | ${md(detalle)} |`)
    }
    push()
    push(
      '**Informativo, no bloquea** (decisión del jefe, 2026-09-09): el propio manual da gramajes distintos a la misma ' +
        'medida casera según el alimento («1 taza» de zanahoria rallada pesa 50 g y de brócoli 100 g); R-14 solo fijó el ' +
        'caso de las legumbres cocidas en `LGS` (¾ taza = 130 g), que sigue unificado. Revisá esta tabla por si hay un ' +
        'error real de transcripción, no como regla.',
    )
  }
  push()

  push('### Curados AMBIGUOS (más de un alimento global con ese nombre)')
  push()
  if (curated.ambiguos.length === 0) {
    push('Ninguno.')
  } else {
    push('| grupo | nombre del JSON | id | name | brand | kcal | basis |')
    push('|---|---|---|---|---|---:|---|')
    for (const a of curated.ambiguos) {
      for (const hit of a.hits) {
        push(`| \`${a.row.code}\` | ${md(a.row.name)} | \`${hit.id}\` | ${md(hit.name)} | ${md(hit.brand ?? '—')} | ${num(hit.calories)} | ${md(hit.macros_basis ?? '—')} |`)
      }
    }
    push()
    push('**BLOQUEA EL APPLY**: elegir entre dos homónimos es curaduría, no automatismo. Fijá `food_id` en el JSON.')
  }
  push()

  push('### Curados SIN MATCH')
  push()
  if (curated.sinMatch.length === 0) {
    push('Ninguno.')
  } else {
    push('| grupo | nombre del JSON | motivo | candidatos (hasta 5) | alta automática |')
    push('|---|---|---|---|---|')
    for (const s of curated.sinMatch) {
      const cand = s.candidatos.map((c) => `${c.name} (\`${c.id}\`)`).join(' · ')
      const alta = s.row.macros100 && s.row.category ? 'sí (macros_100 + category, §5.3)' : 'no — **BLOQUEA EL APPLY**'
      push(`| \`${s.row.code}\` | ${md(s.row.name)} | ${md(s.motivo)} | ${md(cand) || '—'} | ${alta} |`)
    }
    push()
    const perdidos = curated.sinMatch.filter((s) => !(s.row.macros100 && s.row.category))
    push(
      `**${perdidos.length} curado(s) se perderían en silencio** (sin match y sin \`macros_100\` + \`category\` para el alta de §5.3): ` +
        'son medidas caseras del manual que no llegarían al set chileno, así que **bloquean el `--apply`**. ' +
        'Se arregla en el JSON — fijando `food_id` con uno de los candidatos, sumando `aliases`, o cargando los macros por 100 g.',
    )
  }
  push()

  push('### Curados resueltos (manual vs derivado)')
  push()
  push('| grupo | nombre del JSON → catálogo | id | gramos manual | gramos derivados | Δ % | fuente | INTA |')
  push('|---|---|---|---:|---:|---:|---|:--:|')
  for (const d of curatedDeltas) {
    push(
      `| \`${d.code}\` | ${md(d.name)} → ${md(d.foodName)} | \`${d.foodId}\` | ${num(d.manual)} | ${num(d.derivado)} | ${d.delta == null ? '—' : pct(d.delta)} | ${md(d.source ?? '—')} | ${d.inta ? 'sí' : 'no'} |`,
    )
  }
  push()
  const grandes = curatedDeltas.filter((d) => d.delta != null && d.delta > CURATED_DELTA_MAX)
  push(`**Curados que difieren > 15 % del derivado: ${grandes.length}.**`)
  if (grandes.length > 0) {
    push()
    push('| grupo | alimento | gramos del manual | gramos derivados | Δ % | página |')
    push('|---|---|---:|---:|---:|---|')
    for (const d of grandes) {
      push(`| \`${d.code}\` | ${md(d.name)} | ${num(d.manual)} | ${num(d.derivado)} | ${pct(d.delta)} | ${md(d.source ?? d.groupSource ?? '—')} |`)
    }
    push()
    push('Manda el manual (§4.5). Un Δ enorme repetido en el mismo grupo = `ref_*` del grupo o `macros_basis` del alimento mal.')
  }
  push()

  // ── Bloque 5 ──────────────────────────────────────────────────────────────
  push('## 5. Auditoría SMAE (R7) — no se corrige nada acá')
  push()
  push(`Filas SMAE auditadas: **${smaeAudit.total}** · divergentes > 20 %: **${smaeAudit.divergentes}** · sin dato: **${smaeAudit.sinDato}**.`)
  push()
  push('| grupo SMAE | filas | divergentes | % |')
  push('|---|---:|---:|---:|')
  for (const [code, stat] of smaeAudit.porGrupo) {
    push(`| \`${code}\` | ${stat.total} | ${stat.divergentes} | ${stat.total > 0 ? pct(stat.divergentes / stat.total) : '—'} |`)
  }
  push()
  push('| macros_basis | filas | divergentes | % |')
  push('|---|---:|---:|---:|')
  for (const [basis, stat] of smaeAudit.porBasis) {
    push(`| ${md(basis)} | ${stat.total} | ${stat.divergentes} | ${stat.total > 0 ? pct(stat.divergentes / stat.total) : '—'} |`)
  }
  push()
  push('Queda como backlog «auditoría gramos SMAE» en TASKS.')
  push()

  // ── Cierre ────────────────────────────────────────────────────────────────
  push('## Cierre')
  push()
  const labelsACompletar = model.labelsACompletar
  push(`- Filas leídas del universo: **${universeCount}** · esperado (conteo exacto): **${universeExpected}** · ≥ ${EXPECTED_UNIVERSE_MIN}: ${universeCount >= EXPECTED_UNIVERSE_MIN ? 'sí' : '**NO — revisar**'}`)
  push(`- Filas a insertar (derivadas): **${totals.aInsertar}**`)
  push(`- Filas curadas a insertar: **${model.curatedToInsert}**`)
  push(`- Labels a completar (update de curados sobre filas globales sin etiqueta): **${labelsACompletar}**`)
  push(`- Curados que difieren > 15 % del derivado: **${grandes.length}**`)
  push('- Filas con dueño que se van a tocar: **0** (todos los statements filtran `coach_id is null and org_id is null`)')
  const curatedPerdidos = curated.sinMatch.filter((s) => !(s.row.macros100 && s.row.category))
  push(
    `- Estado de los controles: corte de carnes ${meat.verificados}/${meat.esperados} ${meat.ok ? '✔' : '✘'}` +
      ` · curados ambiguos ${curated.ambiguos.length === 0 ? '✔ 0' : `✘ ${curated.ambiguos.length}`}` +
      ` · conflictos etiqueta ↔ gramos ${labelConflicts.length} (informativo, no bloquea)` +
      ` · curados sin match que se perderían ${curatedPerdidos.length === 0 ? '✔ 0' : `✘ ${curatedPerdidos.length}`}` +
      ` · CB con share > 0,40 ${cbOverCut.length === 0 ? '✔ 0' : `✘ ${cbOverCut.length}`}`,
  )
  push(
    `- ¿El \`--apply\` está habilitado? **${meat.ok && curated.ambiguos.length === 0 && curatedPerdidos.length === 0 ? 'sí' : 'NO — está BLOQUEADO por los ✘ de arriba'}**`,
  )
  push()
  push('Comando exacto del apply (los dos gates son obligatorios; `jiti` es el loader disponible en el monorepo, `tsx` no está instalado):')
  push()
  push('```powershell')
  push("$env:NUTRITION_PORTIONS_CL_CONFIRM = 'yes'")
  push('pnpm exec jiti scripts/nutrition-portions-cl/derive-cl-equivalences.mjs --apply')
  push('```')
  push()

  if (applyResult) {
    push('## Resultado del --apply')
    push()
    push(`- Curados insertados: **${applyResult.curatedInserted}** (saltados por conflicto: ${applyResult.curatedSkipped})`)
    push(`- Derivados insertados: **${applyResult.derivedInserted}** (saltados por conflicto: ${applyResult.derivedSkipped})`)
    push(`- Labels completados: **${applyResult.labelsUpdated}**`)
    push(`- Alimentos globales dados de alta (§5.3): **${applyResult.foodsCreated}**`)
    push(`- Guard «filas con dueño tocadas por esta corrida»: **${applyResult.ownedTouched}** (esperado 0)`)
    push(`- Guard «0 filas en CB con share > 0,40» sobre lo escrito: **${applyResult.cbOverCutAfter}** (esperado 0)`)
    if (applyResult.errors.length > 0) {
      push()
      push('| error |')
      push('|---|')
      for (const e of applyResult.errors.slice(0, 30)) push(`| ${md(e)} |`)
    }
    push()
  }

  return `${L.join('\n')}\n`
}

// ---------------------------------------------------------------------------
// 8) Escritura (solo --apply)
// ---------------------------------------------------------------------------

/**
 * Alta de un `food` del sistema (§5.3) cuando el curado no tuvo match y trae
 * `macros_100` + `category`. Molde `per_100` + `serving_size = 100`: el par
 * correcto para un dato de tabla de composicion. Global (coach_id/org_id null).
 * NUNCA se tocan `foods.exchange_*`: el set chileno vive solo en `exchange_group_foods`.
 */
async function createSystemFood(db, row) {
  const macros = row.macros100
  const payload = {
    name: row.name,
    brand: null,
    calories: Number(macros.kcal),
    protein_g: Number(macros.protein_g),
    carbs_g: Number(macros.carbs_g),
    fats_g: Number(macros.fats_g),
    serving_size: 100,
    serving_unit: 'g',
    macros_basis: 'per_100',
    category: row.category,
    catalog_source: 'eva',
    country_code: 'CL',
    coach_id: null,
    org_id: null,
  }
  // El CHECK `..._household_pair` exige el par completo o los dos en null.
  if (row.householdLabel && row.householdGrams) {
    payload.household_label = row.householdLabel
    payload.household_grams = Number(row.householdGrams)
  }
  const { data, error } = await db.from('foods').insert(payload).select(FOOD_COLUMNS)
  if (error) throw new Error(`createSystemFood(${row.name}): ${error.message}`)
  return (data ?? [])[0]
}

/**
 * Insert de filas globales con ON CONFLICT DO NOTHING sobre `egf_group_food_owner_uq`.
 * `upsert(..., { ignoreDuplicates: true })` es lo que PostgREST traduce a
 * `ON CONFLICT (exchange_group_id, food_id, coach_id, org_id) DO NOTHING`
 * (Prefer: resolution=ignore-duplicates). Jamas DO UPDATE: una fila global ya
 * escrita —por una corrida anterior o a mano— no se pisa.
 */
async function insertRows(db, rows, errors) {
  let inserted = 0
  for (const part of chunk(rows, WRITE_CHUNK)) {
    const { data, error } = await db
      .from('exchange_group_foods')
      .upsert(part, { onConflict: 'exchange_group_id,food_id,coach_id,org_id', ignoreDuplicates: true })
      .select('exchange_group_id, food_id')
    if (error) {
      errors.push(`insert chunk de ${part.length} filas: ${error.message}`)
      continue
    }
    inserted += (data ?? []).length
  }
  return { inserted, skipped: rows.length - inserted }
}

/**
 * (b) Medida casera de los curados sobre filas globales que YA existian sin label.
 * `portion_grams` = el del manual, NO `coalesce`: la etiqueta y los gramos salen
 * de la MISMA fuente. Los cuatro predicados son la implementacion literal de S6:
 * jamas pisa una fila de coach, ni de org, ni una correccion manual
 * (`source <> 'catalog'`), ni un label ya escrito.
 */
async function updateCuratedLabels(db, rows, errors) {
  let updated = 0
  for (const row of rows) {
    const { data, error } = await db
      .from('exchange_group_foods')
      // Sin `updated_at`: lo pone el trigger `exchange_group_foods_set_updated_at`
      // (`20260804090000:147-149`) en cada UPDATE. Mandarlo desde el cliente es
      // redundante y ademas el guard post-apply mide justo esa columna.
      .update({ portion_label: row.portion_label, portion_grams: row.portion_grams })
      .eq('exchange_group_id', row.exchange_group_id)
      .eq('food_id', row.food_id)
      .is('coach_id', null)
      .is('org_id', null)
      .eq('source', 'catalog')
      .is('portion_label', null)
      .select('food_id')
    if (error) {
      errors.push(`update label ${row.food_id}: ${error.message}`)
      continue
    }
    updated += (data ?? []).length
  }
  return updated
}

/** Guard R6/S6: ninguna fila CON DUENO fue tocada por esta corrida. Esperado 0. */
async function countOwnedTouched(db, sinceIso) {
  const { count, error } = await db
    .from('exchange_group_foods')
    .select('id', { count: 'exact', head: true })
    .or('coach_id.not.is.null,org_id.not.is.null')
    .gt('updated_at', sinceIso)
  if (error) throw new Error(`guard filas con dueno: ${error.message}`)
  return count ?? 0
}

/** Recuento post-apply del control «0 filas en CB con share > 0,40» sobre lo escrito. */
async function countCbOverCut(db, cbGroupId) {
  const rows = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from('exchange_group_foods')
      .select('food_id, food:foods!inner ( id, name, calories, protein_g, carbs_g, fats_g, serving_size, macros_basis )')
      .eq('exchange_group_id', cbGroupId)
      .is('coach_id', null)
      .is('org_id', null)
      .eq('is_excluded', false)
      .order('food_id', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw new Error(`countCbOverCut: ${error.message}`)
    const batch = data ?? []
    rows.push(...batch)
    if (batch.length < PAGE) break
  }
  return rows.filter((r) => {
    const share = fatEnergyShare(r.food)
    return share != null && share > MEAT_SPLIT.CB_MAX
  })
}

// ---------------------------------------------------------------------------
// 9) Main
// ---------------------------------------------------------------------------

async function main() {
  const { url, key } = requireEnv()
  if (APPLY) requireWriteConfirm()

  console.log(`Target: ${url}`)
  console.log(`Modo: ${MODE}`)

  const db = createServiceRoleClient(url, key)
  const startedAtIso = new Date().toISOString()

  // (1) Grupos.
  const clGroups = await loadClGroups(db)
  const smaeGroups = await loadSmaeGroups(db)
  console.log(`Grupos: cl=${clGroups.size} · smae=${smaeGroups.size}`)

  // (2) Curados PRIMERO: su lista de food_id define el universo derivado (R-13).
  const curatedJson = loadCuratedJson()
  const formProblems = validateCuratedRows(curatedJson.rows, clGroups)
  if (formProblems.length > 0) {
    console.error('El JSON de curados tiene filas invalidas:')
    for (const p of formProblems) console.error(`  - [${p.row.code}] ${p.row.name}: ${p.motivo}`)
    process.exit(1)
  }
  const curated = await resolveGenerics(db, curatedJson.rows)
  const CURATED_FOOD_IDS = new Set(curated.resolved.map(({ food }) => food.id))
  console.log(
    `Curados: ${curatedJson.rows.length} · resueltos ${curated.resolved.length} · ambiguos ${curated.ambiguos.length} · sin match ${curated.sinMatch.length}`,
  )

  // (3) Universo.
  const { rows: universeRows, expected: universeExpected } = await loadUniverse(db)
  const { universo, conDueno, curados: excluidosPorCurado } = filterUniverse(universeRows, CURATED_FOOD_IDS)
  console.log(
    `Universo: leidas ${universeRows.length} (esperadas ${universeExpected}) · con dueno ${conDueno.length} · excluidas por curado ${excluidosPorCurado.length} · a derivar ${universo.length}`,
  )

  // Columna «curados (excluidos del derivado)» del bloque 1 (§4.6): son las filas
  // del universo que filterUniverse SACO, atribuidas al grupo chileno que les fija
  // el manual. NO es «curados resueltos por grupo»: un curado cuyo alimento no
  // tenia fila SMAE no excluyo ninguna fila del universo.
  const clCodeByFoodId = new Map(curated.resolved.map(({ row, food }) => [food.id, row.code]))
  const curadosExcluidosPorGrupo = new Map([...clGroups.keys()].map((code) => [code, 0]))
  for (const row of excluidosPorCurado) {
    const code = clCodeByFoodId.get(row.food.id)
    if (code == null) continue
    curadosExcluidosPorGrupo.set(code, (curadosExcluidosPorGrupo.get(code) ?? 0) + 1)
  }

  // (5) Filas globales que ya existen en los grupos chilenos.
  const existingByKey = await loadExistingClRows(db, clGroups)

  // (4) Derivacion + controles.
  const derived = deriveAll(universo, clGroups, existingByKey)
  // El control de carnes se corre contra el universo curado COMPLETO de CB/CA
  // (curatedJson.rows), no contra `curated.resolved`: un curado sin resolver es un
  // control sin correr y tiene que bloquear (R16).
  const meat = meatControl(curatedJson.rows, curated)
  const cbGroup = clGroups.get('CB')
  const cbOverCut = derived.porGrupo.get('CB').validos.filter((v) => v.share != null && v.share > MEAT_SPLIT.CB_MAX)

  // Shares por grupo SMAE de origen, para los histogramas del informe.
  const sharesBySmae = new Map()
  for (const row of universeRows) {
    const code = row.group.code
    if (!sharesBySmae.has(code)) sharesBySmae.set(code, [])
    sharesBySmae.get(code).push({ food: row.food, share: fatEnergyShare(row.food) })
  }

  // Auditoria SMAE (R7) sobre TODAS las filas leidas (incluidas las curadas).
  const smaeAudit = { total: 0, divergentes: 0, sinDato: 0, porGrupo: new Map(), porBasis: new Map() }
  for (const row of universeRows) {
    const result = auditSmaeRow(row, smaeGroups)
    const basis = row.food.macros_basis ?? 'sin_basis'
    if (!smaeAudit.porGrupo.has(row.group.code)) smaeAudit.porGrupo.set(row.group.code, { total: 0, divergentes: 0 })
    if (!smaeAudit.porBasis.has(basis)) smaeAudit.porBasis.set(basis, { total: 0, divergentes: 0 })
    smaeAudit.total += 1
    smaeAudit.porGrupo.get(row.group.code).total += 1
    smaeAudit.porBasis.get(basis).total += 1
    if (result.status === 'sin_dato') smaeAudit.sinDato += 1
    if (result.status === 'divergente') {
      smaeAudit.divergentes += 1
      smaeAudit.porGrupo.get(row.group.code).divergentes += 1
      smaeAudit.porBasis.get(basis).divergentes += 1
    }
  }

  // Delta manual vs derivado de cada curado resuelto.
  const curatedDeltas = curated.resolved.map(({ row, food }) => {
    const group = clGroups.get(row.code)
    const derivado = group ? gramsForClGroup(group, food) : null
    const delta = derivado != null && derivado > 0 ? Math.abs(row.grams - derivado) / derivado : null
    return {
      code: row.code, name: row.name, foodName: food.name, foodId: food.id,
      manual: row.grams, derivado, delta, source: row.source ?? row.groupSource,
      groupSource: row.groupSource, inta: row.inta,
    }
  })

  // Coherencia etiqueta ↔ gramos sobre TODO el curado (es control de curaduria).
  const curatedByGroup = new Map()
  for (const row of curatedJson.rows) {
    if (!curatedByGroup.has(row.code)) curatedByGroup.set(row.code, [])
    curatedByGroup.get(row.code).push(row)
  }
  const labelConflicts = labelGramsConflicts(curatedByGroup)

  // Filas curadas a escribir y labels a completar.
  const curatedRowsToWrite = curated.resolved.map(({ row, food }) => ({
    exchange_group_id: clGroups.get(row.code).id,
    food_id: food.id,
    coach_id: null,
    org_id: null,
    portion_grams: row.grams,
    portion_label: row.label,
    is_excluded: false,
    source: 'catalog',
  }))
  const curatedToInsert = curatedRowsToWrite.filter((r) => !existingByKey.has(`${r.exchange_group_id}|${r.food_id}`)).length
  const labelsACompletar = curatedRowsToWrite.filter((r) => {
    const existing = existingByKey.get(`${r.exchange_group_id}|${r.food_id}`)
    return existing != null && existing.source === 'catalog' && existing.portion_label == null && r.portion_label != null
  }).length

  // Curados que el --apply PERDERIA en silencio: sin match contra el catalogo y
  // sin `macros_100` + `category`, o sea sin material para el alta de §5.3. Cada
  // uno es una medida casera del manual que NO llega al set chileno.
  const curatedPerdidos = curated.sinMatch.filter((s) => !(s.row.macros100 && s.row.category))

  // Bloqueo de escritura (R8): controles duros.
  const blocked = []
  if (!meat.ok) {
    blocked.push(`control del corte de carnes (${meat.verificados}/${meat.esperados} verificados)`)
  }
  if (curated.ambiguos.length > 0) blocked.push(`${curated.ambiguos.length} curado(s) AMBIGUO(s)`)
  // Conflicto etiqueta ↔ gramos: DATA §4.6 lo llamaba «error de curaduria», pero
  // el primer dry-run (09-09) mostro que el propio manual da gramajes distintos
  // a la misma medida casera segun el alimento («1 taza» de zanahoria = 50 g,
  // de brocoli = 100 g). Decision del jefe: es INFORMATIVO (sale en el informe)
  // y NO bloquea; R-14 solo fijo las legumbres cocidas de LGS (¾ taza = 130 g).
  // Curados perdidos: escribir igual deja un set chileno casi sin las medidas
  // caseras del manual, que son la razon de ser del tren. Se arregla en el JSON
  // (fijando `food_id`/`aliases`, o cargando `macros_100` + `category` para el
  // alta de §5.3), no bajando el liston.
  if (curatedPerdidos.length > 0) {
    blocked.push(`${curatedPerdidos.length} curado(s) SIN MATCH que se perderian (sin macros_100 + category para el alta §5.3)`)
  }

  const model = {
    mode: MODE,
    target: url,
    generatedAt: new Date().toISOString(),
    clGroups,
    universeCount: universeRows.length,
    universeExpected,
    curatedJson,
    curated,
    derived,
    smaeAudit,
    meat,
    curatedDeltas,
    labelConflicts,
    cbOverCut,
    sharesBySmae,
    curadosExcluidosPorGrupo,
    curadosExcluidos: excluidosPorCurado.length,
    curatedToInsert,
    labelsACompletar,
    applyResult: null,
  }

  const outPath = OUT_ARG
    ? resolve(OUT_ARG)
    : resolve(REPO_ROOT, 'scripts/output', `cl-equivalences-${localStampDate()}.md`)

  const totalAInsertar = [...derived.porGrupo.values()].reduce((acc, b) => acc + b.aInsertar.length, 0)

  if (!APPLY) {
    writeReport(outPath, buildReport(model))
    console.log('')
    console.log(`DRY-RUN OK (cero escrituras). Derivadas a insertar: ${totalAInsertar} · curadas a insertar: ${curatedToInsert} · labels a completar: ${labelsACompletar}`)
    console.log(
      `Controles: corte de carnes ${meat.verificados}/${meat.esperados} ${meat.ok ? 'OK' : 'FALLA'}` +
        ` (mal clasificados ${meat.fallidos.length} · sin resolver ${meat.noResueltos.length})` +
        ` · ambiguos ${curated.ambiguos.length} · conflictos etiqueta↔gramos ${labelConflicts.length}` +
        ` · curados perdidos ${curatedPerdidos.length} · CB con share > 0,40: ${cbOverCut.length}`,
    )
    console.log(`Auditoria SMAE: ${smaeAudit.divergentes}/${smaeAudit.total} divergentes > 20 %`)
    console.log(`Informe: ${outPath}`)
    if (blocked.length > 0) {
      console.warn(`El --apply quedaria BLOQUEADO por: ${blocked.join(' · ')}`)
    }
    return
  }

  // ── APPLY ────────────────────────────────────────────────────────────────
  if (blocked.length > 0) {
    console.error(`APPLY BLOQUEADO por: ${blocked.join(' · ')}. No se escribio nada.`)
    writeReport(outPath, buildReport(model))
    console.error(`Informe con el detalle: ${outPath}`)
    process.exitCode = 2
    return
  }

  const errors = []
  let foodsCreated = 0
  const extraCuratedRows = []

  // Alta de los curados sin match que traen macros_100 + category (§5.3).
  // Los que NO los traen ya bloquearon el apply mas arriba (`curatedPerdidos`):
  // si llegamos aca, ningun curado se pierde en silencio por este `continue`.
  for (const s of curated.sinMatch) {
    if (!s.row.macros100 || !s.row.category) continue
    try {
      const food = await createSystemFood(db, s.row)
      if (food) {
        foodsCreated += 1
        extraCuratedRows.push({
          exchange_group_id: clGroups.get(s.row.code).id,
          food_id: food.id,
          coach_id: null,
          org_id: null,
          portion_grams: s.row.grams,
          portion_label: s.row.label,
          is_excluded: false,
          source: 'catalog',
        })
      }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err))
    }
  }

  // (0) CURADOS PRIMERO: los gramos del manual mandan sobre los de la formula.
  const curatedWrite = await insertRows(db, [...curatedRowsToWrite, ...extraCuratedRows], errors)
  console.log(`Curados: insertados ${curatedWrite.inserted} · saltados ${curatedWrite.skipped}`)

  // (a) Derivados, con portion_label null (la etiqueta solo sale del manual).
  const derivedRows = []
  for (const bucket of derived.porGrupo.values()) {
    for (const item of bucket.aInsertar) {
      derivedRows.push({
        exchange_group_id: item.groupId,
        food_id: item.foodId,
        coach_id: null,
        org_id: null,
        portion_grams: item.grams,
        portion_label: null,
        is_excluded: false,
        source: 'catalog',
      })
    }
  }
  const derivedWrite = await insertRows(db, derivedRows, errors)
  console.log(`Derivados: insertados ${derivedWrite.inserted} · saltados ${derivedWrite.skipped}`)

  // (b) Labels de curados sobre filas globales de catalogo que quedaron sin etiqueta.
  const labelsUpdated = await updateCuratedLabels(db, [...curatedRowsToWrite, ...extraCuratedRows].filter((r) => r.portion_label != null), errors)
  console.log(`Labels completados: ${labelsUpdated}`)

  // (c) Guards post-apply.
  const ownedTouched = await countOwnedTouched(db, startedAtIso)
  const cbAfter = await countCbOverCut(db, cbGroup.id)

  model.applyResult = {
    curatedInserted: curatedWrite.inserted,
    curatedSkipped: curatedWrite.skipped,
    derivedInserted: derivedWrite.inserted,
    derivedSkipped: derivedWrite.skipped,
    labelsUpdated,
    foodsCreated,
    ownedTouched,
    cbOverCutAfter: cbAfter.length,
    errors,
  }
  writeReport(outPath, buildReport(model))

  console.log('')
  console.log(`APPLY listo. Guard filas con dueno tocadas: ${ownedTouched} (esperado 0) · CB con share > 0,40: ${cbAfter.length} (esperado 0)`)
  console.log(`Informe: ${outPath}`)

  if (ownedTouched !== 0 || cbAfter.length !== 0) {
    console.error('')
    console.error('*** GUARD POST-APPLY EN ROJO ***')
    if (ownedTouched !== 0) console.error(`  - ${ownedTouched} fila(s) CON DUENO con updated_at posterior al inicio de la corrida. Revisar YA.`)
    if (cbAfter.length !== 0) console.error(`  - ${cbAfter.length} fila(s) en CB con share > 0,40: el corte de carnes quedo mal escrito.`)
    process.exitCode = 1
  }
  if (errors.length > 0) {
    console.error(`Errores de escritura: ${errors.length} (detalle en el informe).`)
    process.exitCode = 1
  }
}

function writeReport(path, content) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content, 'utf8')
}

main().catch((err) => {
  console.error('Fallo derive-cl-equivalences:', err instanceof Error ? err.message : err)
  process.exit(1)
})
