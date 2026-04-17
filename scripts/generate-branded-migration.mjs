/**
 * generate-branded-migration.mjs
 *
 * Lee el CSV revisado por el coach (scripts/output/branded-foods-review.csv)
 * y genera una migración SQL con los alimentos de marca aprobados.
 *
 * Solo inserta filas con columna APROBADO = "S" (mayúscula o minúscula).
 *
 * Genera:
 *   supabase/migrations/TIMESTAMP_seed_branded_chilean_foods.sql
 *
 * Uso:
 *   node scripts/generate-branded-migration.mjs
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const CSV_PATH = join(__dirname, 'output', 'branded-foods-review.csv')

if (!existsSync(CSV_PATH)) {
  console.error(`❌ No se encontró ${CSV_PATH}`)
  console.error('   Ejecuta primero: node scripts/fetch-chilean-branded-foods.mjs')
  process.exit(1)
}

// ─── Parsear CSV ────────────────────────────────────────────────────────────────

function parseCSV(content) {
  // Quitar BOM si existe
  const clean = content.startsWith('\ufeff') ? content.slice(1) : content
  const lines = clean.split('\n').filter(l => l.trim())

  const parseRow = (line) => {
    const result = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
        else inQuotes = !inQuotes
      } else if (ch === ',' && !inQuotes) {
        result.push(current.trim())
        current = ''
      } else {
        current += ch
      }
    }
    result.push(current.trim())
    return result
  }

  const headers = parseRow(lines[0])
  return lines.slice(1).map(line => {
    const vals = parseRow(line)
    return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? '']))
  })
}

function escapeSql(s) {
  return (s ?? '').replace(/'/g, "''")
}

// ─── Main ──────────────────────────────────────────────────────────────────────

function main() {
  const content = readFileSync(CSV_PATH, 'utf8')
  const rows = parseCSV(content)

  const approved = rows.filter(r => r['APROBADO']?.trim().toLowerCase() === 's')

  if (approved.length === 0) {
    console.log('⚠️  No hay filas aprobadas (columna APROBADO = S).')
    console.log('   Edita el CSV y marca con "S" los productos que deseas importar.')
    process.exit(0)
  }

  console.log(`✅ ${approved.length} alimentos aprobados de ${rows.length} total`)

  // Timestamp para el nombre del archivo
  const now = new Date()
  const ts = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    '00'
  ].join('')

  const filename = `${ts}_seed_branded_chilean_foods.sql`
  const outputPath = join(ROOT, 'supabase', 'migrations', filename)

  let sql = `-- Seed de alimentos de marca chilena (revisados manualmente por coach)\n`
  sql += `-- Generado: ${now.toISOString()}\n`
  sql += `-- Fuente: OpenFoodFacts + validación manual\n`
  sql += `-- Supermercados de referencia: Santa Isabel, Jumbo, Lider (Walmart)\n`
  sql += `-- Todos los macros son POR 100g o 100ml\n\n`

  let skipped = 0

  for (const row of approved) {
    const name = row['nombre_app']?.trim() || row['nombre_openff']?.trim()
    const brand = row['marca']?.trim() || null
    const cal = parseFloat(row['calorias_100'])
    const prot = parseFloat(row['proteina_100'])
    const carbs = parseFloat(row['carbos_100'])
    const fats = parseFloat(row['grasas_100'])
    const serving = parseFloat(row['serving_size'])
    const unit = row['serving_unit']?.trim() || 'g'
    const category = row['categoria']?.trim() || 'otro'
    const isLiquid = unit === 'ml'

    // Validaciones básicas
    if (!name) { console.warn(`  ⚠️  Fila sin nombre_app, saltando`); skipped++; continue }
    if (isNaN(cal) || isNaN(prot) || isNaN(carbs) || isNaN(fats)) {
      console.warn(`  ⚠️  Macros inválidos en "${name}", saltando`); skipped++; continue
    }
    if (cal < 0 || cal > 1000) { console.warn(`  ⚠️  Calorías fuera de rango en "${name}", saltando`); skipped++; continue }

    const brandSql = brand ? `'${escapeSql(brand)}'` : 'NULL'

    sql += `-- ${name}${brand ? ` (${brand})` : ''}\n`
    sql += `INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, is_liquid, brand, coach_id)\n`
    sql += `SELECT\n`
    sql += `  '${escapeSql(name)}',\n`
    sql += `  ${cal.toFixed(1)}, ${prot.toFixed(1)}, ${carbs.toFixed(1)}, ${fats.toFixed(1)},\n`
    sql += `  ${isNaN(serving) ? 100 : serving}, '${escapeSql(unit)}',\n`
    sql += `  '${escapeSql(category)}', ${isLiquid ? 'true' : 'false'}, ${brandSql}, NULL\n`
    sql += `WHERE NOT EXISTS (\n`
    sql += `  SELECT 1 FROM foods WHERE name = '${escapeSql(name)}' AND coach_id IS NULL\n`
    sql += `);\n\n`

    console.log(`  ✅ ${name}${brand ? ` [${brand}]` : ''}`)
  }

  if (skipped > 0) {
    console.log(`  ⚠️  ${skipped} fila(s) saltadas por datos incompletos`)
  }

  writeFileSync(outputPath, sql, 'utf8')
  console.log(`\n📄 Migración generada: supabase/migrations/${filename}`)
  console.log(`   → Aplica con: npx supabase db push`)
}

main()
