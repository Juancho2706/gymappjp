#!/usr/bin/env node
// @ts-check
/**
 * check-token-parity.mjs — EVA DS token parity gate (web <-> mobile).
 *
 * The EVA design-system token layer is mirrored by hand across two files:
 *   - apps/web/src/app/globals.css   (hex / rgba(), the materialized contract; "web manda")
 *   - apps/mobile/global.css         (space-separated "r g b" channels for NativeWind)
 * The single source of truth is docs/architecture/design-system/TOKENS.md; web globals.css
 * is that contract materialized, so this script treats web as authoritative and asserts
 * that mobile mirrors it exactly for every governed token, in BOTH light and dark scopes.
 *
 * It parses the CSS variables from both files, normalizes each value to an { r, g, b }
 * triple (resolving hex, rgb()/rgba() — alpha dropped, "r g b" channels, and var() chains
 * within the correct scope), and compares. Divergence -> legible diff + exit 1.
 *
 * Node-pure (no dependencies). Run: `node scripts/check-token-parity.mjs` or `pnpm check:tokens`.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const WEB_CSS = join(ROOT, 'apps/web/src/app/globals.css')
const MOBILE_CSS = join(ROOT, 'apps/mobile/global.css')
const MOBILE_THEME_TS = join(ROOT, 'apps/mobile/lib/theme.ts')

/**
 * DS tokens governed by the contract (canonical names, without the `--` / `--color-`
 * prefixes). These are the ONLY variables compared; legacy/compat, macro, typography,
 * spacing and motion vars are intentionally excluded (they legitimately differ or are
 * platform-specific).
 */
const GOVERNED_TOKENS = [
  // Ink ramp
  'ink-950', 'ink-900', 'ink-800', 'ink-700', 'ink-600', 'ink-500',
  'ink-400', 'ink-300', 'ink-200', 'ink-100', 'ink-50', 'paper', 'white',
  // Sport ramp
  'sport-700', 'sport-600', 'sport-500', 'sport-400', 'sport-300', 'sport-200', 'sport-100',
  // Ember ramp
  'ember-700', 'ember-600', 'ember-500', 'ember-400', 'ember-300', 'ember-200', 'ember-100',
  // Aqua ramp
  'aqua-700', 'aqua-600', 'aqua-500', 'aqua-400', 'aqua-200', 'aqua-100',
  // Status ramps
  'success-700', 'success-600', 'success-500', 'success-100',
  'warning-700', 'warning-600', 'warning-500', 'warning-100',
  'danger-700', 'danger-600', 'danger-500', 'danger-100',
  'info-600', 'info-500', 'info-100',
  // Semantic surfaces
  'surface-app', 'surface-card', 'surface-sunken', 'surface-inverse', 'surface-inverse-2', 'surface-overlay',
  // Semantic text
  'text-strong', 'text-body', 'text-muted', 'text-subtle', 'text-on-sport',
  'text-on-success', 'text-on-warning', 'text-on-ember', 'text-on-dark', 'text-on-dark-muted', 'text-link',
  // Borders + track
  'border-subtle', 'border-default', 'border-strong', 'border-inverse', 'track',
  // Brand / action / accent
  'brand', 'brand-strong', 'action-primary', 'action-primary-hover',
  'cta-fill', 'cta-danger', 'accent-training', 'accent-nutrition', 'accent-recovery', 'focus-ring',
  // Data-viz categorical
  'viz-1', 'viz-2', 'viz-3', 'viz-4', 'viz-5', 'viz-6',
]

/** Strip `/* ... *\/` comments so they never leak into declaration parsing. */
function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

/**
 * Canonicalize a CSS custom-property name: drop leading `--`, then an optional
 * `color-` prefix (mobile uses `--color-<x>`, web uses `--<x>`).
 */
function canon(name) {
  let n = name.replace(/^--/, '')
  if (n.startsWith('color-')) n = n.slice('color-'.length)
  return n
}

/**
 * Extract raw declarations for the `:root` (base/light) scope and the bare `.dark`
 * scope. Bodies are flat (no nested braces), so a simple rule regex is sufficient.
 * Multiple `:root` blocks merge (later wins); only the bare-`.dark` selector list
 * ({ .dark, .dark:root }) feeds the dark scope — compound selectors like `.dark .glass`
 * are ignored.
 */
function parseScopes(css) {
  const clean = stripComments(css)
  const light = {}
  const dark = {}
  const ruleRe = /([^{}]+)\{([^{}]*)\}/g
  let m
  while ((m = ruleRe.exec(clean)) !== null) {
    const selector = m[1].trim()
    const body = m[2]
    const parts = selector.split(',').map((s) => s.trim())
    const isLight = parts.length === 1 && parts[0] === ':root'
    const isDark = parts.length > 0 && parts.every((p) => p === '.dark' || p === '.dark:root') && parts.includes('.dark')
    if (!isLight && !isDark) continue
    const target = isLight ? light : dark
    const declRe = /(--[\w-]+)\s*:\s*([^;]+);/g
    let d
    while ((d = declRe.exec(body)) !== null) {
      target[canon(d[1])] = d[2].trim()
    }
  }
  return { light, dark }
}

/**
 * Resolve a raw value to an { r, g, b } triple within a scope ('light' | 'dark').
 * Handles hex, rgb()/rgba() (alpha dropped), "r g b" channels, and var() chains
 * (dark lookups fall back to the light declaration when not overridden in dark).
 * Returns null if unresolvable.
 */
function resolveValue(raw, scope, light, dark, seen = new Set()) {
  if (raw == null) return null
  const value = raw.trim()

  const varMatch = value.match(/^var\(\s*(--[\w-]+)\s*(?:,\s*([^)]+))?\)$/)
  if (varMatch) {
    const key = canon(varMatch[1])
    if (seen.has(key)) return null
    seen.add(key)
    const next = scope === 'dark' ? (dark[key] ?? light[key]) : light[key]
    if (next != null) return resolveValue(next, scope, light, dark, seen)
    if (varMatch[2] != null) return resolveValue(varMatch[2], scope, light, dark, seen)
    return null
  }

  // hex #RGB or #RRGGBB
  const hex = value.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)
  if (hex) {
    let h = hex[1]
    if (h.length === 3) h = h.split('').map((c) => c + c).join('')
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) }
  }

  // rgb() / rgba() — alpha ignored for parity (mobile stores rgb, applies alpha via utility)
  const rgb = value.match(/^rgba?\(\s*([0-9.]+)[\s,]+([0-9.]+)[\s,]+([0-9.]+)/)
  if (rgb) {
    return { r: Math.round(+rgb[1]), g: Math.round(+rgb[2]), b: Math.round(+rgb[3]) }
  }

  // space-separated channels "r g b" (mobile)
  const ch = value.match(/^(\d+)\s+(\d+)\s+(\d+)$/)
  if (ch) {
    return { r: +ch[1], g: +ch[2], b: +ch[3] }
  }

  return null
}

function eq(a, b) {
  return a && b && a.r === b.r && a.g === b.g && a.b === b.b
}

function fmt(t) {
  return t ? `rgb(${t.r}, ${t.g}, ${t.b})` : 'UNRESOLVED'
}

/* ============================================================================
 * Sello EVA v2 (SPEC docs/specs/eva-seal-background/ D5): tokens `--seal-*` de
 * web globals.css (:root = light, .dark = dark) espejados a mano en el objeto
 * `SEAL_TOKENS` de apps/mobile/lib/theme.ts. NO son canales rgb como los
 * GOVERNED_TOKENS: son ALPHAS de capa (números) y colores rgba con el alpha
 * horneado, así que se comparan acá con su propio resolver (alpha INCLUIDO).
 * ========================================================================== */
const SEAL_TOKEN_MAP = [
  { web: 'seal-blob1-alpha', mobile: 'blobPrimaryAlpha' },
  { web: 'seal-blob2-alpha', mobile: 'blobSecondaryAlpha' },
  { web: 'seal-grain-opacity', mobile: 'grainOpacity' },
  { web: 'seal-grain-h', mobile: 'grainLineH' },
  { web: 'seal-grain-v', mobile: 'grainLineV' },
]

/**
 * Normaliza un valor de token del sello a forma comparable:
 * - número ("0.15") → { kind: 'num', n }
 * - rgba(r,g,b,a) → { kind: 'rgba', r, g, b, a }
 * Devuelve null si no parsea.
 */
function parseSealValue(raw) {
  if (raw == null) return null
  const value = String(raw).trim().replace(/^'|'$/g, '')
  const num = value.match(/^[0-9.]+$/)
  if (num) return { kind: 'num', n: Number.parseFloat(value) }
  const rgba = value.match(/^rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)\s*(?:,\s*([0-9.]+)\s*)?\)$/)
  if (rgba) {
    return {
      kind: 'rgba',
      r: Math.round(+rgba[1]),
      g: Math.round(+rgba[2]),
      b: Math.round(+rgba[3]),
      a: rgba[4] != null ? Number.parseFloat(rgba[4]) : 1,
    }
  }
  return null
}

function sealEq(a, b) {
  if (!a || !b || a.kind !== b.kind) return false
  if (a.kind === 'num') return a.n === b.n
  return a.r === b.r && a.g === b.g && a.b === b.b && a.a === b.a
}

function fmtSeal(v) {
  if (!v) return 'UNRESOLVED'
  return v.kind === 'num' ? String(v.n) : `rgba(${v.r}, ${v.g}, ${v.b}, ${v.a})`
}

/**
 * Extrae los escenarios light/dark del objeto `SEAL_TOKENS` de theme.ts
 * (parse textual sin ejecutar TS: pares `clave: número | 'rgba(...)'` dentro de
 * cada `light:/dark: Object.freeze({ ... })`). Comentarios fuera vía stripComments.
 */
function parseSealMobileTokens(src) {
  const clean = stripComments(src)
  const block = clean.match(/export const SEAL_TOKENS\s*=\s*Object\.freeze\(\{([\s\S]*?)\n\}\)/)
  if (!block) return null
  const scopes = {}
  for (const scope of ['light', 'dark']) {
    const scopeMatch = block[1].match(new RegExp(`${scope}:\\s*Object\\.freeze\\(\\{([\\s\\S]*?)\\}\\)`))
    if (!scopeMatch) return null
    const entries = {}
    const pairRe = /(\w+):\s*([0-9.]+|'[^']*')/g
    let p
    while ((p = pairRe.exec(scopeMatch[1])) !== null) {
      entries[p[1]] = p[2]
    }
    scopes[scope] = entries
  }
  return scopes
}

/** Corre la sección del sello; empuja mismatches al array del caller. */
function checkSealTokens(web, mismatches) {
  let mobileSeal = null
  try {
    mobileSeal = parseSealMobileTokens(readFileSync(MOBILE_THEME_TS, 'utf8'))
  } catch {
    mobileSeal = null
  }
  const webHasSeal = SEAL_TOKEN_MAP.some(({ web: w }) => w in web.light)
  if (!webHasSeal && !mobileSeal) return // sello aún no introducido en ninguna punta
  if (!mobileSeal) {
    mismatches.push({ token: 'SEAL_TOKENS', scope: 'theme.ts', web: 'presente', mobile: 'AUSENTE (apps/mobile/lib/theme.ts)' })
    return
  }
  for (const { web: webName, mobile: mobileName } of SEAL_TOKEN_MAP) {
    for (const scope of ['light', 'dark']) {
      // Web: el .dark redefine todo el juego; si faltara, cae al :root (var CSS real).
      const webRaw = scope === 'dark' ? (web.dark[webName] ?? web.light[webName]) : web.light[webName]
      const w = parseSealValue(webRaw)
      const m = parseSealValue(mobileSeal[scope][mobileName])
      if (!sealEq(w, m)) {
        mismatches.push({
          token: `${webName} (≙ SEAL_TOKENS.${scope}.${mobileName})`,
          scope,
          web: fmtSeal(w),
          mobile: fmtSeal(m),
        })
      }
    }
  }
}

function main() {
  const web = parseScopes(readFileSync(WEB_CSS, 'utf8'))
  const mobile = parseScopes(readFileSync(MOBILE_CSS, 'utf8'))

  const mismatches = []
  const warnings = []

  for (const token of GOVERNED_TOKENS) {
    const inWeb = token in web.light
    const inMobile = token in mobile.light
    if (!inWeb && !inMobile) continue
    if (!inWeb) { warnings.push(`  ~ ${token}: present in mobile but absent in web`); continue }
    if (!inMobile) { warnings.push(`  ~ ${token}: present in web but absent in mobile`); continue }

    for (const scope of /** @type {const} */ (['light', 'dark'])) {
      // Start from the scope-appropriate raw declaration (dark override falls back to light).
      const webRaw = scope === 'dark' ? (web.dark[token] ?? web.light[token]) : web.light[token]
      const mobileRaw = scope === 'dark' ? (mobile.dark[token] ?? mobile.light[token]) : mobile.light[token]
      const w = resolveValue(webRaw, scope, web.light, web.dark)
      const mVal = resolveValue(mobileRaw, scope, mobile.light, mobile.dark)
      if (!eq(w, mVal)) {
        mismatches.push({ token, scope, web: fmt(w), mobile: fmt(mVal) })
      }
    }
  }

  // Sello EVA v2: `--seal-*` (web) ↔ SEAL_TOKENS de apps/mobile/lib/theme.ts (alphas incluidos).
  checkSealTokens(web, mismatches)

  if (warnings.length > 0) {
    console.log('\nToken parity warnings (token present on only one platform):')
    console.log(warnings.join('\n'))
  }

  if (mismatches.length > 0) {
    console.error('\n✗ EVA DS token parity FAILED — web (contract) and mobile diverge:\n')
    for (const d of mismatches) {
      console.error(`  ✗ --${d.token} [${d.scope}]`)
      console.error(`      web    globals.css : ${d.web}`)
      console.error(`      mobile global.css  : ${d.mobile}`)
    }
    console.error(
      `\n${mismatches.length} mismatch(es). Fix apps/mobile/global.css to mirror ` +
      `apps/web/src/app/globals.css (web is the source of truth per TOKENS.md).\n`,
    )
    process.exit(1)
  }

  console.log(
    `✓ EVA DS token parity OK — ${GOVERNED_TOKENS.length} governed tokens + ` +
    `${SEAL_TOKEN_MAP.length} seal tokens (--seal-* ↔ SEAL_TOKENS) match across web and mobile (light + dark).`,
  )
}

main()
