#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const canonicalFiles = [
  'README.md',
  'docs/README.md',
  'docs/status/CURRENT.md',
  'docs/status/MOBILE_PARITY.md',
  'docs/product/PRODUCT_OVERVIEW.md',
  'docs/architecture/PROJECT_STRUCTURE.md',
  'docs/architecture/FLOWS_AND_COMPONENTS.md',
  'docs/architecture/design-system/TOKENS.md',
  'docs/testing/TEST_STATUS.md',
  'docs/testing/E2E_PERSONAS.md',
  'docs/operations/MANUAL_TASKS.md',
  'docs/operations/APP_REVIEW_NOTES.md',
  'docs/operations/RUNBOOK.md',
  'docs/operations/NUTRITION_V2_ROLLOUT_RUNBOOK.md',
  'docs/operations/FOOD_CATALOG_CL_IMPORT.md',
  'docs/operations/MOBILE_RELEASES_OTA.md',
  'docs/operations/RN-PARITY-DB-CHECKLIST.md',
  'docs/legal/tos.md',
  'docs/legal/privacy-policy.md',
  'docs/legal/enterprise-contract-template.md',
]

const forbiddenReferences = [
  'docs/status/CURRENT_PHASE.md',
  'docs/plans/EXECUTION_PLAN.md',
  'docs/status/NEXT_STEPS.md',
  'docs/development/LOCAL_WORKFLOW.md',
  'nuevabibliadelaapp/',
]

const forbiddenTrackedPaths = [
  'supabase/.temp/',
  'scripts/seed-catalina-full-qa.json',
  'scripts/seed-josefit-design-qa.json',
  'scripts/qa-seed-team-movida.json',
]

const errors = []

function fail(file, message) {
  errors.push(`${file}: ${message}`)
}

function listRepositoryFiles() {
  const result = spawnSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { cwd: repoRoot, encoding: 'utf8' },
  )
  if (result.status !== 0) {
    throw new Error(`git ls-files falló: ${result.stderr.trim()}`)
  }
  return result.stdout
    .split('\0')
    .filter(Boolean)
    .map((file) => file.replaceAll('\\', '/'))
}

function read(file) {
  return fs.readFileSync(path.join(repoRoot, file), 'utf8').replace(/^\uFEFF/, '')
}

function parseFrontmatter(file, content) {
  if (!content.startsWith('---\n') && !content.startsWith('---\r\n')) {
    fail(file, 'debe comenzar con frontmatter YAML')
    return null
  }
  const normalized = content.replaceAll('\r\n', '\n')
  const end = normalized.indexOf('\n---\n', 4)
  if (end < 0) {
    fail(file, 'frontmatter YAML sin cierre')
    return null
  }

  const metadata = new Map()
  for (const line of normalized.slice(4, end).split('\n')) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue
    const match = line.match(/^([a-z_][a-z0-9_-]*):\s*(.*?)\s*$/i)
    if (match) metadata.set(match[1], match[2].replace(/^['"]|['"]$/g, ''))
  }
  return metadata
}

function validateCanonicalMetadata(file) {
  const fullPath = path.join(repoRoot, file)
  if (!fs.existsSync(fullPath)) {
    fail(file, 'documento canónico ausente')
    return
  }

  const metadata = parseFrontmatter(file, read(file))
  if (!metadata) return

  for (const field of ['status', 'owner', 'last_verified']) {
    if (!metadata.get(field)) fail(file, `falta metadata '${field}'`)
  }
  if (metadata.get('canonical') !== 'true') {
    fail(file, "documento canónico debe declarar 'canonical: true'")
  }

  const verified = metadata.get('last_verified') ?? ''
  if (verified && !/^\d{4}-\d{2}-\d{2}(?:\s*@\s*[0-9a-f]{7,40})?$/.test(verified)) {
    fail(file, "'last_verified' debe ser YYYY-MM-DD o YYYY-MM-DD @ sha")
  }
}

function stripFencedCode(content) {
  const lines = content.split(/\r?\n/)
  let fence = null
  return lines.map((line) => {
    const marker = line.match(/^\s*(```+|~~~+)/)?.[1] ?? null
    if (marker) {
      if (!fence) fence = marker[0]
      else if (marker[0] === fence) fence = null
      return ''
    }
    return fence ? '' : line
  }).join('\n')
}

function linkTargets(content) {
  const withoutCode = stripFencedCode(content)
  const targets = []
  const inline = /!?\[[^\]]*\]\((<[^>]+>|[^)\s]+)(?:\s+["'][^"']*["'])?\)/g
  const reference = /^\s*\[[^\]]+\]:\s*(<[^>]+>|\S+)/gm
  for (const regex of [inline, reference]) {
    for (const match of withoutCode.matchAll(regex)) {
      targets.push(match[1].replace(/^<|>$/g, ''))
    }
  }
  return targets
}

function isExternalOrRoute(target) {
  return (
    !target ||
    target.startsWith('#') ||
    target.startsWith('/') ||
    target.startsWith('\\') ||
    /^[a-z][a-z0-9+.-]*:/i.test(target) ||
    /^[a-z]:[\\/]/i.test(target) ||
    /[{}*]/.test(target)
  )
}

function validateLinks(file, content) {
  for (const rawTarget of linkTargets(content)) {
    if (isExternalOrRoute(rawTarget)) continue
    const targetWithoutAnchor = rawTarget.split('#', 1)[0].split('?', 1)[0]
    let decoded
    try {
      decoded = decodeURIComponent(targetWithoutAnchor)
    } catch {
      fail(file, `enlace con encoding inválido: ${rawTarget}`)
      continue
    }
    const resolved = path.resolve(path.dirname(path.join(repoRoot, file)), decoded)
    const relative = path.relative(repoRoot, resolved)
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      fail(file, `enlace sale del repositorio: ${rawTarget}`)
    } else if (!fs.existsSync(resolved)) {
      fail(file, `enlace relativo roto: ${rawTarget}`)
    }
  }
}

function placeholderCredential(value) {
  const normalized = value
    .replace(/[*_~]/g, '')
    .trim()
    .replace(/^['"`]|['"`]$/g, '')
    .trim()
  return (
    !normalized ||
    /^<[^>]+>$/.test(normalized) ||
    /^\[[^\]]+\]$/.test(normalized) ||
    /^\$\{?\w+\}?$/.test(normalized) ||
    /^(?:password|data\.password|parsed\.data\.password|form\.password)$/i.test(normalized) ||
    /^(?:redacted|rotated|removed|placeholder|example|unset|none|null|n\/a)$/i.test(normalized) ||
    /(?:process\.env|secrets\.|env\.|YOUR_|REPLACE_|\*{3,})/i.test(normalized)
  )
}

function validateLiteralCredentials(file, content) {
  const prose = content
  const patterns = [
    /^\s*(?:[-*]\s*)?(?:password|contraseña|passcode)\s*(?:[:=]|[—–-])\s*(\S.*)$/gim,
    /["'](?:password|contraseña|passcode)["']\s*:\s*["'`]([^"'`\r\n]+)["'`]/gim,
    /\b(?:const|let|var)\s+\w*(?:password|passcode|secret|token|api[_-]?key|anon[_-]?key|service[_-]?role[_-]?key)\w*\s*=\s*["'`]([^"'`\r\n]+)["'`]/gim,
    /^\s*\|\s*(?:password|contraseña|passcode)\s*\|\s*([^|\r\n]+)\|/gim,
  ]
  for (const pattern of patterns) {
    for (const match of prose.matchAll(pattern)) {
      if (!placeholderCredential(match[1])) {
        const line = prose.slice(0, match.index).split(/\r?\n/).length
        fail(file, `posible credencial literal en línea ${line}`)
      }
    }
  }
}

function validateEnvironmentCredentialFallbacks(file) {
  const fullPath = path.join(repoRoot, file)
  if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) return

  const buffer = fs.readFileSync(fullPath)
  if (buffer.length > 5_000_000 || buffer.includes(0)) return

  const content = buffer.toString('utf8')
  const pattern = /(?:process\.env|\benv)\.([A-Z0-9_]*(?:PASSWORD|PASSCODE|SECRET|TOKEN|KEY)[A-Z0-9_]*)\s*(?:\|\||\?\?)\s*(['"])([^'"\r\n]*)\2/g

  for (const match of content.matchAll(pattern)) {
    const [, variable, , fallback] = match
    if (!fallback) continue

    // USDA/api.data.gov documenta DEMO_KEY como sentinel público de baja cuota.
    if (variable === 'USDA_API_KEY' && fallback === 'DEMO_KEY') continue

    const line = content.slice(0, match.index).split(/\r?\n/).length
    fail(file, `fallback literal para ${variable} en línea ${line}`)
  }
}

const repositoryFiles = listRepositoryFiles()
for (const forbidden of forbiddenTrackedPaths) {
  if (repositoryFiles.some((file) => file === forbidden || file.startsWith(forbidden))) {
    fail(forbidden, 'artefacto generado no debe estar versionado')
  }
}
const markdownFiles = repositoryFiles.filter(
  (file) => file.toLowerCase().endsWith('.md') && fs.existsSync(path.join(repoRoot, file)),
)
const activeMarkdown = markdownFiles.filter((file) => !file.startsWith('docs/archive/'))

for (const file of canonicalFiles) validateCanonicalMetadata(file)

for (const file of activeMarkdown) {
  const lowered = file.toLowerCase()
  if (lowered.split('/').some((part) => part === 'handoff' || part === 'handoffs') || /handoff/i.test(path.basename(file))) {
    fail(file, 'handoff activo fuera de docs/archive')
  }

  const content = read(file)
  validateLinks(file, content)
  for (const forbidden of forbiddenReferences) {
    if (content.includes(forbidden)) {
      fail(file, `referencia obsoleta prohibida: ${forbidden}`)
    }
  }
}

for (const file of markdownFiles) validateLiteralCredentials(file, read(file))
for (const file of repositoryFiles) validateEnvironmentCredentialFallbacks(file)

if (errors.length > 0) {
  console.error(`docs:check encontró ${errors.length} problema(s):`)
  for (const error of errors.sort()) console.error(`- ${error}`)
  process.exit(1)
}

process.stdout.write(
  `docs:check OK — ${canonicalFiles.length} canónicos, ${activeMarkdown.length} Markdown activos, sin handoffs ni credenciales literales\n`,
)
