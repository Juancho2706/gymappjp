/**
 * audit-fresh-foods.mjs
 *
 * Compara los valores nutricionales de alimentos frescos/genéricos de la app
 * contra la base de datos USDA FoodData Central (Foundation + SR Legacy).
 *
 * Genera:
 *   scripts/output/fresh-foods-audit.md   → tabla comparativa (app vs USDA)
 *   scripts/output/fresh-foods-corrections.sql → UPDATE SQL para ítems con delta > 10%
 *
 * Uso:
 *   node scripts/audit-fresh-foods.mjs
 *
 * Variables de entorno requeridas (en .env.local):
 *   USDA_API_KEY                  → clave gratuita: https://fdc.nal.usda.gov/api-key-signup.html
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

dotenv.config({ path: '.env.local' })
dotenv.config()

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUTPUT_DIR = join(__dirname, 'output')
mkdirSync(OUTPUT_DIR, { recursive: true })

// ─── Configuración ─────────────────────────────────────────────────────────────

const USDA_API_KEY = process.env.USDA_API_KEY || 'DEMO_KEY'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const DELTA_THRESHOLD = 0.10  // 10% de diferencia para marcar como corrección
const USDA_BASE = 'https://api.nal.usda.gov/fdc/v1'

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local')
  process.exit(1)
}

// ─── Mapa de traducción: nombre en español → término de búsqueda USDA (inglés) ──

const NAME_MAP = {
  // Frutas
  'Mandarina':               'mandarin tangerine raw',
  'Ciruela fresca':          'plum raw',
  'Damasco / Albaricoque':   'apricot raw',
  'Papaya':                  'papaya raw',
  'Frambuesas':              'raspberries raw',
  'Maracuyá / Maracuya':     'passion fruit raw',
  'Pomelo':                  'grapefruit raw',
  'Limón (1 unidad)':        'lemon raw',
  'Cerezas':                 'cherries sweet raw',
  'Higo fresco':             'fig raw',
  'Caqui / Kaki':            'persimmon raw',
  'Mango':                   'mango raw',
  'Manzana':                 'apple raw',
  'Plátano / Banana':        'banana raw',
  'Naranja':                 'orange raw',
  'Frutilla / Fresa':        'strawberry raw',
  'Pera':                    'pear raw',
  'Uva':                     'grapes raw',
  'Sandía':                  'watermelon raw',
  'Melón':                   'cantaloupe melon raw',
  'Kiwi':                    'kiwi fruit raw',
  'Durazno / Melocotón':     'peach raw',
  'Piña':                    'pineapple raw',
  'Arándanos':               'blueberries raw',
  'Mora':                    'blackberries raw',
  // Verduras
  'Acelga cocida':           'swiss chard cooked',
  'Remolacha cocida':        'beet cooked',
  'Apio':                    'celery raw',
  'Puerro':                  'leek raw',
  'Col de Bruselas':         'brussels sprouts raw',
  'Hinojo':                  'fennel bulb raw',
  'Nabo':                    'turnip raw',
  'Repollo / Col':           'cabbage raw',
  'Ajo':                     'garlic raw',
  'Rúcula':                  'arugula raw',
  'Espárrago':               'asparagus raw',
  'Alcachofa cocida':        'artichoke cooked',
  'Rábano':                  'radish raw',
  'Palmito':                 'hearts of palm canned',
  'Bok choy / Pak choi':     'bok choy raw',
  'Pimentón / Pimiento':     'bell pepper red raw',
  'Tomate':                  'tomato red raw',
  'Zanahoria':               'carrot raw',
  'Pepino':                  'cucumber raw',
  'Espinaca':                'spinach raw',
  'Brócoli':                 'broccoli raw',
  'Cebolla':                 'onion raw',
  'Champiñones':             'mushroom raw',
  'Choclo / Maíz cocido':    'corn yellow cooked',
  'Zapallo cocido':          'butternut squash cooked',
  'Berenjena':               'eggplant raw',
  'Coliflor':                'cauliflower raw',
  'Palta / Aguacate':        'avocado raw',
  // Proteínas
  'Pechuga de pollo cocida':     'chicken breast cooked',
  'Pechuga de pollo horneada':   'chicken breast roasted',
  'Carne molida 80/20 cocida':   'beef ground 80/20 cooked',
  'Salmón cocido':               'salmon cooked',
  'Atún al agua (escurrido)':    'tuna light canned water',
  'Atún con aceite (escurrido)': 'tuna light canned oil drained',
  'Huevo entero cocido':         'egg whole cooked hard boiled',
  'Yema de huevo':               'egg yolk cooked hard boiled',
  'Clara de huevo cocida':       'egg white cooked',
  'Filete de merluza cocido':    'hake cooked',
  'Seitan':                      'seitan wheat gluten',
  'Pato sin piel cocido':        'duck cooked without skin',
  'Jaiva / Centolla cocida':     'crab cooked',
  'Anchoa en aceite (escurrida)':'anchovy canned oil',
  'Conejo magro cocido':         'rabbit cooked roasted',
  'Salmón enlatado (al natural)':'salmon canned',
  'Chorizo de pavo':             'turkey sausage',
  'Vieiras cocidas':             'scallops cooked',
  'Jamón serrano (crudo curado)':'prosciutto ham dry cured',
  // Legumbres
  'Lentejas cocidas':            'lentils cooked boiled',
  'Porotos negros cocidos':      'black beans cooked',
  'Garbanzos cocidos':           'chickpeas cooked',
  'Porotos blancos cocidos':     'white beans cooked',
  'Soya cocida':                 'soybeans cooked',
  'Lenteja roja cocida':         'red lentils cooked',
  'Arveja cocida':               'peas cooked',
  // Grasas
  'Aceite de oliva':             'olive oil',
  'Aceite de canola':            'canola oil',
  'Aceite de sésamo':            'sesame oil',
  'Aceite de aguacate':          'avocado oil',
  'Almendras':                   'almonds raw',
  'Nuez':                        'walnuts raw',
  'Maní / Cacahuate':            'peanuts raw',
  'Semillas de chía':            'chia seeds',
  'Semillas de sésamo':          'sesame seeds',
  'Coco rallado sin azúcar':     'coconut dried unsweetened',
  'Macadamia':                   'macadamia nuts raw',
  'Avellanas':                   'hazelnuts raw',
  'Manteca de cerdo':            'lard',
}

// ─── Categorías de alimentos frescos (excluir empacados/bebidas) ────────────────

const FRESH_CATEGORIES = ['fruta', 'verdura', 'proteina', 'legumbre', 'grasa']

// ─── Helpers ───────────────────────────────────────────────────────────────────

async function fetchUSDA(query) {
  const url = `${USDA_BASE}/foods/search?query=${encodeURIComponent(query)}&dataType=Foundation,SR+Legacy&pageSize=5&api_key=${USDA_API_KEY}`
  const res = await fetch(url)
  if (!res.ok) {
    console.warn(`  ⚠️  USDA HTTP ${res.status} para "${query}"`)
    return null
  }
  const json = await res.json()
  return json.foods?.[0] ?? null
}

function getNutrientValue(food, nutrientId) {
  const n = food.foodNutrients?.find(fn => fn.nutrientId === nutrientId)
  return n?.value ?? null
}

// USDA nutrient IDs (Foundation/SR Legacy):
// 1008 = Energy (kcal), 1003 = Protein, 1005 = Carbohydrates, 1004 = Total lipid (fat)
const IDS = { calories: 1008, protein: 1003, carbs: 1005, fats: 1004 }

function delta(a, b) {
  if (!b || b === 0) return null
  return Math.abs(a - b) / b
}

function fmt(n) {
  return n == null ? '—' : n.toFixed(1)
}

function pct(d) {
  return d == null ? '—' : `${(d * 100).toFixed(0)}%`
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🔍 Conectando a Supabase…')
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  const { data: foods, error } = await supabase
    .from('foods')
    .select('id, name, calories, protein_g, carbs_g, fats_g, category')
    .is('coach_id', null)
    .in('category', FRESH_CATEGORIES)
    .order('category')
    .order('name')

  if (error) {
    console.error('❌ Error fetching foods:', error.message)
    process.exit(1)
  }

  console.log(`✅ ${foods.length} alimentos frescos encontrados`)
  console.log(`🌐 Consultando USDA FoodData Central (API key: ${USDA_API_KEY === 'DEMO_KEY' ? 'DEMO (limitado)' : 'personalizada'})…\n`)

  const rows = []
  const corrections = []

  for (const food of foods) {
    const query = NAME_MAP[food.name]
    if (!query) {
      console.log(`  ⏭️  Sin mapeo para: "${food.name}"`)
      rows.push({ food, usda: null, note: 'sin_mapeo' })
      continue
    }

    // Pausa corta para no sobrecargar la API con DEMO_KEY (ratelimit: 30req/min)
    await new Promise(r => setTimeout(r, 2100))

    console.log(`  🔎 "${food.name}" → buscando "${query}"…`)
    const usda = await fetchUSDA(query)

    if (!usda) {
      console.log(`     ❌ Sin resultados USDA`)
      rows.push({ food, usda: null, note: 'no_encontrado' })
      continue
    }

    const uCal = getNutrientValue(usda, IDS.calories)
    const uProt = getNutrientValue(usda, IDS.protein)
    const uCarbs = getNutrientValue(usda, IDS.carbs)
    const uFats = getNutrientValue(usda, IDS.fats)

    const dCal = delta(food.calories, uCal)
    const dProt = delta(food.protein_g, uProt)
    const dCarbs = delta(food.carbs_g, uCarbs)
    const dFats = delta(food.fats_g, uFats)

    const maxDelta = Math.max(dCal ?? 0, dProt ?? 0, dCarbs ?? 0, dFats ?? 0)
    const needsCorrection = maxDelta > DELTA_THRESHOLD

    console.log(`     ✅ "${usda.description.substring(0, 50)}" | δcal=${pct(dCal)} δprot=${pct(dProt)} δcarbs=${pct(dCarbs)} δfats=${pct(dFats)}${needsCorrection ? ' ⚠️  CORREGIR' : ''}`)

    rows.push({ food, usda: { description: usda.description, cal: uCal, prot: uProt, carbs: uCarbs, fats: uFats }, deltas: { cal: dCal, prot: dProt, carbs: dCarbs, fats: dFats }, needsCorrection })

    if (needsCorrection && uCal != null && uProt != null && uCarbs != null && uFats != null) {
      corrections.push({
        id: food.id,
        name: food.name,
        app: { cal: food.calories, prot: food.protein_g, carbs: food.carbs_g, fats: food.fats_g },
        usda: { cal: uCal, prot: uProt, carbs: uCarbs, fats: uFats },
        usdaDesc: usda.description,
      })
    }
  }

  // ─── Generar reporte Markdown ──────────────────────────────────────────────

  let md = `# Auditoría Nutricional — Alimentos Frescos vs USDA FoodData Central\n\n`
  md += `**Fecha:** ${new Date().toLocaleDateString('es-CL')}\n`
  md += `**Fuente USDA:** Foundation + SR Legacy\n`
  md += `**Umbral de corrección:** > ${DELTA_THRESHOLD * 100}% de diferencia en cualquier macro\n\n`
  md += `## Resultados\n\n`
  md += `| Alimento | Cat. | App Cal | USDA Cal | δCal | App P | USDA P | δP | App C | USDA C | δC | App F | USDA F | δF | Estado |\n`
  md += `|----------|------|--------:|--------:|-----:|------:|------:|----:|------:|------:|----:|------:|------:|----:|--------|\n`

  for (const { food, usda, deltas, needsCorrection, note } of rows) {
    const status = note === 'sin_mapeo' ? '⏭️ sin mapeo' : !usda ? '❌ no encontrado' : needsCorrection ? '⚠️ corregir' : '✅ ok'
    md += `| ${food.name} | ${food.category} | ${food.calories} | ${fmt(usda?.cal)} | ${pct(deltas?.cal)} | ${food.protein_g} | ${fmt(usda?.prot)} | ${pct(deltas?.prot)} | ${food.carbs_g} | ${fmt(usda?.carbs)} | ${pct(deltas?.carbs)} | ${food.fats_g} | ${fmt(usda?.fats)} | ${pct(deltas?.fats)} | ${status} |\n`
  }

  md += `\n## Resumen\n\n`
  md += `- **Total revisados:** ${rows.filter(r => r.usda).length} / ${foods.length}\n`
  md += `- **Sin mapeo:** ${rows.filter(r => r.note === 'sin_mapeo').length}\n`
  md += `- **No encontrados:** ${rows.filter(r => r.note === 'no_encontrado').length}\n`
  md += `- **Con correcciones sugeridas:** ${corrections.length}\n\n`

  writeFileSync(join(OUTPUT_DIR, 'fresh-foods-audit.md'), md, 'utf8')
  console.log(`\n📄 Reporte guardado: scripts/output/fresh-foods-audit.md`)

  // ─── Generar SQL de correcciones ───────────────────────────────────────────

  if (corrections.length > 0) {
    let sql = `-- Correcciones nutricionales sugeridas por USDA FoodData Central\n`
    sql += `-- Generado: ${new Date().toISOString()}\n`
    sql += `-- REVISAR ANTES DE APLICAR: comparar con etiquetas locales si existen\n\n`
    sql += `BEGIN;\n\n`

    for (const c of corrections) {
      sql += `-- ${c.name}\n`
      sql += `-- App: cal=${c.app.cal} prot=${c.app.prot} carbs=${c.app.carbs} fats=${c.app.fats}\n`
      sql += `-- USDA (${c.usdaDesc}): cal=${c.usda.cal} prot=${c.usda.prot} carbs=${c.usda.carbs} fats=${c.usda.fats}\n`
      sql += `UPDATE foods SET\n`
      sql += `  calories  = ${c.usda.cal.toFixed(1)},\n`
      sql += `  protein_g = ${c.usda.prot.toFixed(1)},\n`
      sql += `  carbs_g   = ${c.usda.carbs.toFixed(1)},\n`
      sql += `  fats_g    = ${c.usda.fats.toFixed(1)}\n`
      sql += `WHERE name = '${c.name.replace(/'/g, "''")}' AND coach_id IS NULL;\n\n`
    }

    sql += `COMMIT;\n`

    writeFileSync(join(OUTPUT_DIR, 'fresh-foods-corrections.sql'), sql, 'utf8')
    console.log(`📄 Correcciones guardadas: scripts/output/fresh-foods-corrections.sql`)
    console.log(`   → ${corrections.length} alimentos con diferencias > ${DELTA_THRESHOLD * 100}%`)
  } else {
    console.log(`✅ No hay correcciones necesarias (todos dentro del ${DELTA_THRESHOLD * 100}% de tolerancia)`)
  }

  console.log('\n✅ Auditoría completada.')
}

main().catch(err => {
  console.error('❌ Error:', err.message)
  process.exit(1)
})
