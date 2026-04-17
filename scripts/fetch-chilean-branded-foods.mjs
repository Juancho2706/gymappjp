/**
 * fetch-chilean-branded-foods.mjs
 *
 * Busca productos de marcas chilenas en OpenFoodFacts y genera un CSV
 * para revisión manual del coach antes de generar la migración final.
 *
 * Genera:
 *   scripts/output/branded-foods-review.csv
 *
 * Uso:
 *   node scripts/fetch-chilean-branded-foods.mjs
 *
 * No requiere variables de entorno (OpenFoodFacts es público y gratuito).
 */

import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUTPUT_DIR = join(__dirname, 'output')
mkdirSync(OUTPUT_DIR, { recursive: true })

// ─── Configuración de búsquedas ────────────────────────────────────────────────
// Cada entrada: { query, brands, category, default_unit, default_serving }

const SEARCH_QUERIES = [
  // ── Avenas y cereales ──────────────────────────────────────────────────────
  { query: 'avena cocida',        brands: ['quaker', 'santa maria', 'nestle'],     category: 'carbohidrato', unit: 'g',  serving: 40 },
  { query: 'avena instantanea',   brands: ['quaker'],                              category: 'carbohidrato', unit: 'g',  serving: 40 },
  { query: 'corn flakes',         brands: ['kelloggs', 'nestle'],                  category: 'carbohidrato', unit: 'g',  serving: 30 },
  { query: 'cereal integral',     brands: ['nestle', 'kelloggs'],                  category: 'carbohidrato', unit: 'g',  serving: 30 },
  { query: 'granola',             brands: ['kelloggs', 'nestle'],                  category: 'snack',        unit: 'g',  serving: 45 },
  { query: 'muesli',              brands: [],                                      category: 'carbohidrato', unit: 'g',  serving: 45 },

  // ── Leches y lácteos ───────────────────────────────────────────────────────
  { query: 'leche entera',        brands: ['colun', 'soprole', 'loncoleche'],      category: 'lacteo',       unit: 'ml', serving: 200 },
  { query: 'leche semidescremada',brands: ['colun', 'soprole', 'loncoleche'],      category: 'lacteo',       unit: 'ml', serving: 200 },
  { query: 'leche descremada',    brands: ['colun', 'soprole'],                    category: 'lacteo',       unit: 'ml', serving: 200 },
  { query: 'leche sin lactosa',   brands: ['colun', 'soprole', 'loncoleche'],      category: 'lacteo',       unit: 'ml', serving: 200 },
  { query: 'yogur natural',       brands: ['yoplait', 'colun', 'soprole'],         category: 'lacteo',       unit: 'g',  serving: 150 },
  { query: 'yogur griego',        brands: ['yoplait', 'fage'],                     category: 'lacteo',       unit: 'g',  serving: 150 },
  { query: 'queso cottage',       brands: ['soprole', 'colun'],                    category: 'lacteo',       unit: 'g',  serving: 100 },
  { query: 'queso gauda',         brands: ['colun', 'soprole'],                    category: 'lacteo',       unit: 'g',  serving: 30  },
  { query: 'queso mantecoso',     brands: ['colun', 'soprole'],                    category: 'lacteo',       unit: 'g',  serving: 30  },

  // ── Proteínas en polvo ─────────────────────────────────────────────────────
  { query: 'whey protein',        brands: ['dymatize', 'optimum nutrition', 'bsn', 'muscletech'], category: 'snack', unit: 'g', serving: 30 },
  { query: 'proteina de suero',   brands: ['dymatize', 'optimum nutrition'],       category: 'snack',        unit: 'g',  serving: 30 },
  { query: 'caseina proteina',    brands: ['dymatize', 'optimum nutrition'],       category: 'snack',        unit: 'g',  serving: 30 },
  { query: 'proteina vegana',     brands: ['dymatize', 'garden of life'],          category: 'snack',        unit: 'g',  serving: 30 },
  { query: 'creatina monohidrato',brands: [],                                      category: 'snack',        unit: 'g',  serving: 5  },

  // ── Panes ──────────────────────────────────────────────────────────────────
  { query: 'pan de molde integral',brands: ['bimbo', 'ideal'],                    category: 'carbohidrato', unit: 'un', serving: 25 },
  { query: 'pan de molde blanco', brands: ['bimbo', 'ideal'],                     category: 'carbohidrato', unit: 'un', serving: 25 },
  { query: 'pan pita',            brands: [],                                      category: 'carbohidrato', unit: 'un', serving: 60 },
  { query: 'tostadas integrales', brands: ['wasa', 'finn crisp'],                  category: 'carbohidrato', unit: 'un', serving: 11 },

  // ── Snacks y otros empacados ───────────────────────────────────────────────
  { query: 'mantequilla de mani', brands: [],                                      category: 'grasa',        unit: 'g',  serving: 32 },
  { query: 'mantequilla de almendras', brands: [],                                 category: 'grasa',        unit: 'g',  serving: 32 },
  { query: 'barra proteica',      brands: ['quest', 'kind', 'one'],               category: 'snack',        unit: 'un', serving: 60 },
  { query: 'atun en lata agua',   brands: ['van camps', 'frutos del mar'],         category: 'proteina',     unit: 'g',  serving: 80 },
  { query: 'salmon enlatado',     brands: [],                                      category: 'proteina',     unit: 'g',  serving: 80 },
  { query: 'arroz blanco cocido', brands: [],                                      category: 'carbohidrato', unit: 'g',  serving: 150},
  { query: 'pasta cocida',        brands: ['lucchetti', 'carozzi'],               category: 'carbohidrato', unit: 'g',  serving: 200},
]

// ─── OpenFoodFacts API ──────────────────────────────────────────────────────────

const OFF_BASE = 'https://world.openfoodfacts.org'

async function searchOpenFoodFacts(query, brands) {
  const params = new URLSearchParams({
    search_terms: query,
    tagtype_0: 'countries',
    tag_contains_0: 'contains',
    tag_0: 'chile',
    action: 'process',
    json: '1',
    page_size: '20',
  })

  // Si hay marcas específicas, filtrar por primera marca
  if (brands.length > 0) {
    params.set('tagtype_1', 'brands')
    params.set('tag_contains_1', 'contains')
    params.set('tag_1', brands[0])
  }

  const url = `${OFF_BASE}/cgi/search.pl?${params}`

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'GymAppJP-Nutrition-Audit/1.0 (jvillegas.dev@gmail.com)' }
    })
    if (!res.ok) return []
    const json = await res.json()
    return json.products ?? []
  } catch (e) {
    console.warn(`  ⚠️  Error OpenFoodFacts: ${e.message}`)
    return []
  }
}

function parseNutriment(product, key, fallback = null) {
  const v = product.nutriments?.[key]
  return v != null && !isNaN(Number(v)) ? Number(v) : fallback
}

function escapeCSV(v) {
  if (v == null) return ''
  const s = String(v)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🔍 Buscando productos de marca chilena en OpenFoodFacts…\n')

  const csvRows = []

  // Header del CSV
  csvRows.push([
    'nombre_openff', 'marca', 'calorias_100', 'proteina_100', 'carbos_100', 'grasas_100',
    'serving_size', 'serving_unit', 'categoria', 'barcode', 'url_imagen',
    'APROBADO', 'nombre_app', 'notas'
  ])

  for (const search of SEARCH_QUERIES) {
    console.log(`🔎 Buscando: "${search.query}" (marcas: ${search.brands.join(', ') || 'cualquiera'})`)

    await new Promise(r => setTimeout(r, 500)) // cortesía a la API

    const products = await searchOpenFoodFacts(search.query, search.brands)

    if (products.length === 0) {
      console.log(`   ❌ Sin resultados`)
      // Agregar fila vacía para que el coach sepa que no se encontró
      csvRows.push([
        `[buscar manualmente: ${search.query}]`, '', '', '', '', '',
        search.serving, search.unit, search.category, '', '',
        'N', '', 'NO ENCONTRADO EN OPENFOODFACTS'
      ])
      continue
    }

    let added = 0
    for (const product of products) {
      const cal = parseNutriment(product, 'energy-kcal_100g')
        ?? parseNutriment(product, 'energy_100g')
      const prot = parseNutriment(product, 'proteins_100g')
      const carbs = parseNutriment(product, 'carbohydrates_100g')
      const fats = parseNutriment(product, 'fat_100g')

      // Saltar si faltan macros básicos
      if (cal == null || prot == null || carbs == null || fats == null) continue

      // Saltar si los valores parecen inválidos
      if (cal < 0 || cal > 1000 || prot < 0 || carbs < 0 || fats < 0) continue

      const name = product.product_name_es || product.product_name || product.product_name_en || ''
      const brand = product.brands || ''
      const barcode = product.code || ''
      const imgUrl = product.image_front_small_url || ''

      csvRows.push([
        name, brand,
        cal.toFixed(1), prot.toFixed(1), carbs.toFixed(1), fats.toFixed(1),
        search.serving, search.unit, search.category,
        barcode, imgUrl,
        'N', '', '' // coach llena: APROBADO(S/N), nombre_app, notas
      ])

      added++
      if (added >= 5) break // máximo 5 resultados por búsqueda
    }

    console.log(`   ✅ ${added} producto(s) encontrado(s)`)
  }

  // Escribir CSV
  const csvContent = csvRows
    .map(row => row.map(escapeCSV).join(','))
    .join('\n')

  const outputPath = join(OUTPUT_DIR, 'branded-foods-review.csv')
  writeFileSync(outputPath, '\ufeff' + csvContent, 'utf8') // BOM para Excel/Numbers

  console.log(`\n📄 CSV guardado: scripts/output/branded-foods-review.csv`)
  console.log(`   → ${csvRows.length - 1} productos listos para revisión`)
  console.log('\n📋 INSTRUCCIONES PARA EL COACH:')
  console.log('   1. Abre el CSV en Excel, Numbers o Google Sheets')
  console.log('   2. Revisa cada fila: compara con la etiqueta real del producto')
  console.log('   3. En la columna APROBADO: escribe "S" si los datos son correctos')
  console.log('   4. En nombre_app: escribe el nombre que aparecerá en la app')
  console.log('   5. En notas: cualquier comentario o corrección de valores')
  console.log('   6. Guarda el CSV y ejecuta: node scripts/generate-branded-migration.mjs')
}

main().catch(err => {
  console.error('❌ Error:', err.message)
  process.exit(1)
})
