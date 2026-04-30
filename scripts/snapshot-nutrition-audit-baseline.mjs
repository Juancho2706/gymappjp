import { copyFileSync, existsSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUTPUT_DIR = join(__dirname, 'output')
mkdirSync(OUTPUT_DIR, { recursive: true })

const source = join(OUTPUT_DIR, 'nutrition-empty-meals-audit.json')
const target = join(OUTPUT_DIR, 'nutrition-empty-meals-audit-baseline.json')

if (!existsSync(source)) {
  console.error('No existe audit actual en scripts/output/nutrition-empty-meals-audit.json')
  process.exit(1)
}

copyFileSync(source, target)
console.log(`Baseline guardada: ${target}`)
