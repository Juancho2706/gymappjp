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

  console.log(`✓ EVA DS token parity OK — ${GOVERNED_TOKENS.length} governed tokens match across web and mobile (light + dark).`)
}

main()
