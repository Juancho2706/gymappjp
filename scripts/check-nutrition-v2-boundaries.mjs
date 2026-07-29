#!/usr/bin/env node
// @ts-check

/**
 * Prevents future Nutrition V2 surfaces from importing the legacy page shells.
 *
 * The guard is intentionally narrow: V2 may reuse domain services, schemas,
 * calculation engines and neutral UI primitives. It may not mount the V1
 * NutritionShell, NutritionHub or PlanBuilder inside a V2 route/component.
 *
 * NUT-038 — el checker antes mentía en verde: una de las raíces (`apps/mobile/app/alumno/
 * nutrition-v2`) no existe (la real lleva el grupo de rutas `(tabs)`) y el `existsSync`
 * silencioso la descartaba sin avisar, así que la superficie del alumno RN nunca se
 * inspeccionó. Dos correcciones: (1) las raíces declaradas son ahora fail-closed — si una
 * no existe el script sale con código 1; (2) se cubren los helpers V2 de `apps/mobile/lib`,
 * donde viven las fórmulas duplicadas.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, join, relative } from 'node:path'

const ROOT = process.cwd()

/**
 * Raíces inspeccionadas. `match` (opcional) filtra por nombre de archivo cuando la carpeta
 * mezcla V1 y V2 (caso `apps/mobile/lib`).
 * @type {{ path: string; match?: RegExp }[]}
 */
const V2_ROOTS = [
  { path: 'apps/web/src/app/c/[coach_slug]/nutrition-v2' },
  { path: 'apps/web/src/app/coach/nutrition-v2' },
  { path: 'apps/web/src/components/nutrition-v2' },
  // El grupo de rutas `(tabs)` es parte de la ruta real en disco: sin él la raíz no existe.
  { path: 'apps/mobile/app/alumno/(tabs)/nutrition-v2' },
  { path: 'apps/mobile/app/coach/nutrition-v2' },
  { path: 'apps/mobile/components/nutrition-v2' },
  // Helpers V2 del cliente móvil (intake, builder, quick-edit, api, caché…). Conviven con
  // los de V1 en la misma carpeta, así que se seleccionan por nombre.
  { path: 'apps/mobile/lib', match: /nutrition-v2/ },
  { path: 'packages/nutrition-v2' },
]

const SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.mjs', '.ts', '.tsx'])

const FORBIDDEN_IMPORTS = [
  {
    label: 'NutritionShell V1',
    pattern: /(?:from\s+|import\s*\()['"][^'"]*NutritionShell['"]\)?/,
  },
  {
    label: 'NutritionHub V1',
    pattern: /(?:from\s+|import\s*\()['"][^'"]*NutritionHub['"]\)?/,
  },
  {
    label: 'PlanBuilder V1',
    pattern: /(?:from\s+|import\s*\()['"][^'"]*PlanBuilder(?:\/PlanBuilder)?['"]\)?/,
  },
]

/**
 * @param {string} directory
 * @param {RegExp} [match]
 */
function collectSourceFiles(directory, match) {
  /** @type {string[]} */
  const files = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(absolute, match))
    } else if (entry.isFile() && SOURCE_EXTENSIONS.has(extname(entry.name))) {
      if (match && !match.test(entry.name)) continue
      files.push(absolute)
    }
  }
  return files
}

/** @type {string[]} */
const missingRoots = []
/** @type {string[]} */
const emptyRoots = []
/** @type {string[]} */
const files = []

for (const root of V2_ROOTS) {
  const absolute = join(ROOT, root.path)
  if (!existsSync(absolute) || !statSync(absolute).isDirectory()) {
    missingRoots.push(root.path)
    continue
  }
  const collected = collectSourceFiles(absolute, root.match)
  if (collected.length === 0) emptyRoots.push(root.path)
  files.push(...collected)
}

// Fail-closed: una raíz declarada que no existe (typo, carpeta movida, grupo de rutas
// olvidado) hacía que el guard reportara verde sin mirar esa superficie.
if (missingRoots.length > 0) {
  console.error('\n✗ Nutrition V2 boundary check failed — raíces declaradas inexistentes.\n')
  for (const root of missingRoots) console.error(`  ✗ ${root}`)
  console.error(
    '\nCorrige la ruta en scripts/check-nutrition-v2-boundaries.mjs (y el filtro `paths:` de ' +
    '.github/workflows/nutrition-v2-boundaries.yml) o retira la raíz si la superficie murió.\n',
  )
  process.exit(1)
}

if (emptyRoots.length > 0) {
  console.error('\n✗ Nutrition V2 boundary check failed — raíces sin archivos fuente.\n')
  for (const root of emptyRoots) console.error(`  ✗ ${root}`)
  console.error(
    '\nUna raíz vacía casi siempre significa que el filtro por nombre dejó de calzar.\n',
  )
  process.exit(1)
}

/** @type {{ file: string; label: string }[]} */
const violations = []
for (const file of files) {
  const source = readFileSync(file, 'utf8')
  for (const rule of FORBIDDEN_IMPORTS) {
    if (rule.pattern.test(source)) {
      violations.push({ file: relative(ROOT, file), label: rule.label })
    }
  }
}

if (violations.length > 0) {
  console.error('\n✗ Nutrition V2 boundary check failed.\n')
  for (const violation of violations) {
    console.error(`  ✗ ${violation.file}: imports ${violation.label}`)
  }
  console.error(
    '\nV2 may reuse services and neutral primitives, but it must not render legacy shells. ' +
    'Build the V2 surface or move reusable logic into a framework-neutral module.\n',
  )
  process.exit(1)
}

console.log(
  `✓ Nutrition V2 boundary guard passed — checked ${files.length} source file(s) ` +
  `across ${V2_ROOTS.length} root(s).`,
)
