#!/usr/bin/env node

/**
 * Lint de los tests de QA — prohíbe `waitForLoadState('networkidle')`.
 *
 * POR QUÉ ES UNA REGLA Y NO UNA PREFERENCIA: `networkidle` espera a que pasen 500 ms sin
 * conexiones de red. Contra una app con telemetría, polling y prefetch —es decir, contra EVA en
 * producción— ese estado casi nunca llega, así que el test se queda dando vueltas hasta el
 * timeout MANTENIENDO la sesión y las conexiones abiertas. Sumado a varios workers, es la receta
 * exacta del incidente del 2026-08-22: una tanda de QA dejó la base de datos abajo.
 *
 * Playwright lo desaconseja explícitamente. La alternativa siempre es esperar por lo que de
 * verdad importa: `expect(locator).toBeVisible()`, `page.waitForURL(...)` o, si hace falta un
 * respiro, el helper `settle()` de tests/_fixtures/suave.ts.
 *
 * Uso: `pnpm qa:lint` (o `node scripts/check-qa-test-lint.mjs`).
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const scanRoot = path.join(repoRoot, 'tests')

/** Extensiones que se revisan. Los `.md` y los fixtures binarios no. */
const SCANNED_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.js', '.mjs'])

/** Carpetas que no se recorren. */
const SKIPPED_DIRS = new Set(['node_modules', 'archive', '.auth', 'fixtures'])

/**
 * DEUDA CONOCIDA, congelada a propósito: estos archivos ya tenían la llamada antes de que la
 * regla existiera y no se tocan en esta tanda. La lista NO crece — un archivo nuevo con
 * `networkidle` es un error. Al limpiar uno, se borra su línea de acá.
 */
const LEGACY_ALLOWLIST = new Set(['tests/enterprise/journey-e2e.spec.ts'])

/** Cada patrón: qué se busca y qué se hace en su lugar. */
const FORBIDDEN_PATTERNS = [
    {
        regex: /waitForLoadState\(\s*['"`]networkidle['"`]\s*\)/g,
        message:
            "waitForLoadState('networkidle') — esperá por el elemento que importa " +
            '(expect(locator).toBeVisible()) o por la URL (page.waitForURL).',
    },
    {
        regex: /waitUntil\s*:\s*['"`]networkidle['"`]/g,
        message:
            "waitUntil: 'networkidle' — mismo problema en goto/reload; usá 'domcontentloaded' " +
            'y una aserción sobre el contenido.',
    },
]

/** Rutas relativas al repo, con separadores POSIX, para que el mensaje sea igual en todo OS. */
function toRepoRelative(absolutePath) {
    return path.relative(repoRoot, absolutePath).replaceAll('\\', '/')
}

function collectFiles(dir) {
    const found = []
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name.startsWith('.') && entry.isDirectory()) continue
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
            if (SKIPPED_DIRS.has(entry.name)) continue
            found.push(...collectFiles(full))
            continue
        }
        if (SCANNED_EXTENSIONS.has(path.extname(entry.name))) found.push(full)
    }
    return found
}

if (!fs.existsSync(scanRoot)) {
    console.error('qa:lint: no existe la carpeta tests/')
    process.exit(1)
}

const violations = []
const staleAllowlist = new Set(LEGACY_ALLOWLIST)

for (const file of collectFiles(scanRoot)) {
    const relative = toRepoRelative(file)
    const content = fs.readFileSync(file, 'utf8')

    for (const { regex, message } of FORBIDDEN_PATTERNS) {
        // `regex` es global y se reutiliza entre archivos: sin este reset, `matchAll` arrancaría
        // desde el lastIndex del archivo anterior y se saltaría coincidencias.
        regex.lastIndex = 0
        for (const match of content.matchAll(regex)) {
            if (LEGACY_ALLOWLIST.has(relative)) {
                staleAllowlist.delete(relative)
                continue
            }
            const line = content.slice(0, match.index).split(/\r?\n/).length
            violations.push(`${relative}:${line} — ${message}`)
        }
    }
}

// Una excepción que ya no hace falta es ruido que invita a agregar más: se avisa para borrarla.
for (const stale of staleAllowlist) {
    violations.push(
        `${stale} — ya no usa networkidle: sacá su línea de LEGACY_ALLOWLIST en ` +
            'scripts/check-qa-test-lint.mjs.',
    )
}

if (violations.length > 0) {
    console.error(`qa:lint encontró ${violations.length} problema(s):`)
    for (const violation of violations.sort()) console.error(`- ${violation}`)
    console.error(
        '\nRegla: los tests de QA contra producción no esperan a que la red se calle. ' +
            'Ver docs/operations/QA_PLAYWRIGHT.md.',
    )
    process.exit(1)
}

process.stdout.write(
    `qa:lint OK — tests/ sin networkidle (${LEGACY_ALLOWLIST.size} excepción(es) heredada(s) declarada(s))\n`,
)
