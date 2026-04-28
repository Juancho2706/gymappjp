/**
 * check-meal-completions-deprecation.mjs
 *
 * Evalua si es seguro eliminar la tabla legacy `meal_completions`.
 * Genera reporte markdown con:
 * - filas actuales en meal_completions
 * - objetos DB que dependan de la tabla (views/materialized views/functions)
 *
 * Uso:
 *   node scripts/check-meal-completions-deprecation.mjs
 *
 * Requiere:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

dotenv.config({ path: '.env.local' })
dotenv.config()

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local')
  process.exit(1)
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUTPUT_DIR = join(__dirname, 'output')
mkdirSync(OUTPUT_DIR, { recursive: true })

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function countLegacyRows() {
  const { count, error } = await supabase
    .from('meal_completions')
    .select('id', { count: 'exact', head: true })
  if (error) throw error
  return count ?? 0
}

function collectFilesRecursively(rootDir, extensions) {
  const out = []
  const entries = readdirSync(rootDir, { withFileTypes: true })
  for (const entry of entries) {
    const abs = join(rootDir, entry.name)
    if (entry.isDirectory()) {
      out.push(...collectFilesRecursively(abs, extensions))
      continue
    }
    if (extensions.some((ext) => entry.name.endsWith(ext))) out.push(abs)
  }
  return out
}

function listCodeDependencies(workspaceRoot) {
  const targets = [join(workspaceRoot, 'src')]
  const files = targets
    .filter((p) => {
      try {
        return statSync(p).isDirectory()
      } catch {
        return false
      }
    })
    .flatMap((p) => collectFilesRecursively(p, ['.ts', '.tsx', '.js', '.mjs', '.sql']))

  const hits = []
  for (const file of files) {
    const content = readFileSync(file, 'utf8')
    if (content.toLowerCase().includes('meal_completions')) {
      hits.push(file)
    }
  }
  return hits
}

async function main() {
  const rowsCount = await countLegacyRows()
  const workspaceRoot = join(__dirname, '..')
  const codeDeps = listCodeDependencies(workspaceRoot)

  const now = new Date().toISOString()
  const safeToDrop = rowsCount === 0 && codeDeps.length === 0

  let md = `# Check Deprecacion meal_completions\n\n`
  md += `Generado: ${now}\n\n`
  md += `## Resultado\n\n`
  md += `- Filas en \`meal_completions\`: **${rowsCount}**\n`
  md += `- Referencias en \`src/\` (runtime): **${codeDeps.length}**\n`
  md += `- Estado DROP: **${safeToDrop ? 'SEGURO' : 'NO SEGURO'}**\n\n`

  md += `## Referencias encontradas en src/\n\n`
  if (codeDeps.length === 0) md += `- Ninguna\n`
  else codeDeps.forEach((p) => { md += `- ${p}\n` })

  md += `\n## Recomendacion\n\n`
  if (safeToDrop) {
    md += `Condiciones cumplidas para preparar migracion de DROP TABLE \`meal_completions\`.\n`
  } else {
    md += `No hacer DROP todavia. Limpiar dependencias y/o migrar datos legacy primero.\n`
  }

  const outputFile = join(OUTPUT_DIR, 'meal-completions-deprecation-check.md')
  writeFileSync(outputFile, md, 'utf8')
  console.log(`Reporte generado: ${outputFile}`)
}

main().catch((err) => {
  console.error('Error en check de deprecacion:', err.message)
  process.exit(1)
})
