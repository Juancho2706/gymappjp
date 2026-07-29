import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'

// NUT-038 — el guard reportaba verde con una raíz inexistente. Este test fija el contrato
// fail-closed ejecutando el script real desde un cwd donde NINGUNA raíz existe: si el
// checker vuelve a tragarse las rutas rotas en silencio, sale 0 y el test falla.
const HERE = dirname(fileURLToPath(import.meta.url))
const SCRIPT = resolve(HERE, 'check-nutrition-v2-boundaries.mjs')
const REPO_ROOT = resolve(HERE, '..')

const sandbox = mkdtempSync(join(tmpdir(), 'nutrition-v2-boundaries-'))
afterAll(() => {
  rmSync(sandbox, { recursive: true, force: true })
})

function run(cwd: string): { code: number; output: string } {
  try {
    const output = execFileSync(process.execPath, [SCRIPT], { cwd, encoding: 'utf8' })
    return { code: 0, output }
  } catch (error) {
    const err = error as { status?: number; stdout?: string; stderr?: string }
    return { code: err.status ?? 1, output: `${err.stdout ?? ''}${err.stderr ?? ''}` }
  }
}

describe('check-nutrition-v2-boundaries', () => {
  it('falla (exit 1) y nombra las raíces cuando las rutas configuradas no existen', () => {
    const { code, output } = run(sandbox)
    expect(code).toBe(1)
    expect(output).toContain('raíces declaradas inexistentes')
    expect(output).toContain('apps/mobile/app/alumno/(tabs)/nutrition-v2')
  })

  it('pasa sobre el repo real e inspecciona todas las raíces declaradas', () => {
    const { code, output } = run(REPO_ROOT)
    expect(code).toBe(0)
    expect(output).toContain('boundary guard passed')
    // La superficie del alumno RN + los helpers de apps/mobile/lib entraron al conteo.
    const checked = Number(/checked (\d+) source file/.exec(output)?.[1] ?? '0')
    expect(checked).toBeGreaterThan(162)
  })
})
