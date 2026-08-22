import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Guard de la LÍNEA CANÓNICA de tienda (embudo Free→Pro, W6 — ronda de revisión 21-08).
 *
 * Hermano de `tests/mobile-no-prices.test.ts`, pero para un riesgo distinto. Aquel impide que un
 * PRECIO se filtre a la app; este impide que la única frase que Android sí admite («Los cambios de
 * plan se hacen en eva-app.cl») se DUPLIQUE en variantes escritas a mano por cada pantalla.
 *
 * Por qué importa: `verify-email.tsx` decía «Cambia de plan cuando quieras desde eva-app.cl»
 * —una segunda línea de compliance, distinta de la canónica, en un archivo que nadie asocia con
 * las tiendas—. Con dos o tres de esas, ajustar la política significa buscarlas a mano y una
 * siempre se queda atrás; peor: cada variante es una redacción que nadie revisó contra la guideline.
 *
 * La regla: el literal vive SOLO en `apps/mobile/lib/client-cap.ts` (`STORE_PLAN_CHANGE_CAPTION`,
 * servido por `storePlanChangeCaption(platform)`); el resto de la app lo importa. Los comentarios
 * quedan fuera del barrido — explicar la regla no es romperla.
 */

const MOBILE_ROOT = join(__dirname, '..', '..', 'apps', 'mobile')

/** Único archivo autorizado a escribir el literal: es la fábrica de la frase. */
const ALLOWLIST = new Set([join('lib', 'client-cap.ts')])

const SKIP_DIRS = new Set([
  'node_modules',
  '.expo',
  '.expo-shared',
  'android',
  'ios',
  'dist',
  'build',
  'coverage',
  '__tests__',
  '__mocks__',
])

const CODE_EXT = /\.tsx?$/

function listCodeFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    // `statSync` en vez de withFileTypes: el árbol de mobile tiene symlinks de pnpm.
    const st = statSync(full)
    if (st.isDirectory()) {
      if (SKIP_DIRS.has(entry)) continue
      out.push(...listCodeFiles(full))
      continue
    }
    if (!CODE_EXT.test(entry) || /\.test\.tsx?$/.test(entry)) continue
    out.push(full)
  }
  return out
}

/**
 * Descarta líneas que son SOLO comentario (`//`, `*`, `/*`), igual que el guard de precios: los
 * docblocks de `plan-change.ts` explican por qué la frase es una sola y eso tiene que poder decirse.
 */
function isCommentLine(line: string): boolean {
  return /^\s*(\/\/|\*|\/\*)/.test(line)
}

interface Rule {
  label: string
  /** `true` si ESTA línea de código rompe la regla. */
  hits: (line: string) => boolean
}

const RULES: Rule[] = [
  {
    label: 'el literal «cambios de plan» (la línea canónica se importa, no se reescribe)',
    hits: (line) => line.toLowerCase().includes('cambios de plan'),
  },
  {
    label: '«eva-app.cl» en una línea que además habla de «plan» (variante casera del caption)',
    hits: (line) => {
      const lower = line.toLowerCase()
      return lower.includes('eva-app.cl') && lower.includes('plan')
    },
  },
]

describe('apps/mobile tiene UNA sola línea de tienda (embudo Free→Pro W6)', () => {
  const files = listCodeFiles(MOBILE_ROOT)

  it('el barrido encuentra el árbol de mobile (si esto falla, el guard miraba al vacío)', () => {
    expect(files.length).toBeGreaterThan(100)
    expect(files.some((f) => f.endsWith(join('lib', 'client-cap.ts')))).toBe(true)
  })

  it.each(RULES)('ningún archivo fuera de la allowlist contiene $label', ({ hits }) => {
    const offenders: string[] = []
    for (const file of files) {
      const rel = relative(MOBILE_ROOT, file)
      if (ALLOWLIST.has(rel)) continue
      const lines = readFileSync(file, 'utf-8').split('\n')
      lines.forEach((line, i) => {
        if (isCommentLine(line)) return
        if (hits(line)) offenders.push(`${rel.split(sep).join('/')}:${i + 1}`)
      })
    }
    expect(
      offenders,
      `copy de tienda duplicado (importá STORE_PLAN_CHANGE_CAPTION / storePlanChangeCaption de lib/client-cap.ts):\n  ${offenders.join('\n  ')}`
    ).toEqual([])
  })

  it('la allowlist apunta al archivo que de verdad define la frase', () => {
    const src = readFileSync(join(MOBILE_ROOT, 'lib', 'client-cap.ts'), 'utf-8')
    expect(src).toContain("export const STORE_PLAN_CHANGE_CAPTION = 'Los cambios de plan se hacen en eva-app.cl'")
  })
})
