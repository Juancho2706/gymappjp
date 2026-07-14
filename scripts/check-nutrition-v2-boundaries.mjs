#!/usr/bin/env node
// @ts-check

/**
 * Prevents future Nutrition V2 surfaces from importing the legacy page shells.
 *
 * The guard is intentionally narrow: V2 may reuse domain services, schemas,
 * calculation engines and neutral UI primitives. It may not mount the V1
 * NutritionShell, NutritionHub or PlanBuilder inside a V2 route/component.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { extname, join, relative } from 'node:path'

const ROOT = process.cwd()
const V2_ROOTS = [
  'apps/web/src/app/c/[coach_slug]/nutrition-v2',
  'apps/web/src/app/coach/nutrition-v2',
  'apps/web/src/components/nutrition-v2',
  'apps/mobile/app/alumno/nutrition-v2',
  'apps/mobile/app/coach/nutrition-v2',
  'apps/mobile/components/nutrition-v2',
  'packages/nutrition-v2',
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

/** @param {string} directory */
function collectSourceFiles(directory) {
  /** @type {string[]} */
  const files = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(absolute))
    } else if (entry.isFile() && SOURCE_EXTENSIONS.has(extname(entry.name))) {
      files.push(absolute)
    }
  }
  return files
}

const files = V2_ROOTS.flatMap((root) => {
  const absolute = join(ROOT, root)
  return existsSync(absolute) ? collectSourceFiles(absolute) : []
})

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

if (files.length === 0) {
  console.log('✓ Nutrition V2 boundary guard ready — no V2 source directories exist yet.')
} else {
  console.log(`✓ Nutrition V2 boundary guard passed — checked ${files.length} source file(s).`)
}
