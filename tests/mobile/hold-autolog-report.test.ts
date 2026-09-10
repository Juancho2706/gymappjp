/**
 * Sentry del auto-envío del hold — RN (specs/cuenta-atras-en-pantalla, **W6.2** · DATA-TESTING §8.3).
 *
 * Espejo del test web (`apps/web/src/app/c/[coach_slug]/workout/[planId]/hold-autolog-report.test.ts`):
 * se testea el helper y no `ExecutorV3` entero, porque lo que este tren agrega —y lo único que puede
 * romperse en silencio— es el **guard de fuente** y la forma exacta del reporte (tag
 * `area: 'hold-autolog'`, numerador del umbral §8.4, más las tres claves de `extra`).
 *
 * El cableado vive en `ExecutorV3.handleCommit`, en la rama `if (error)` del `logSet`.
 *
 * GOTCHA de resolución (mismo de `executor-v3-hold-module.test.ts`): los ids bare resuelven distinto
 * desde `tests/` que desde `apps/mobile/`, así que `@sentry/react-native` se mockea por PATH
 * ABSOLUTO con `vi.doMock` + `import()` dinámico.
 */
import path from 'node:path'
import { createRequire } from 'node:module'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const requireFromTest = createRequire(import.meta.url)
const mobileDir = path.resolve(__dirname, '..', '..', 'apps', 'mobile')
const mobileDep = (spec: string) => requireFromTest.resolve(spec, { paths: [mobileDir] })

const captureException = vi.fn()
vi.doMock(mobileDep('@sentry/react-native'), () => ({ captureException }))

const { reportHoldAutologError } = await import(
  '../../apps/mobile/components/alumno/workout/v3/hold-autolog-report'
)

const CTX = { blockId: 'blk-1', exerciseType: 'strength', context: 'superset' as const }

beforeEach(() => {
  captureException.mockReset()
})

describe('reportHoldAutologError (RN) — sólo el AUTO-envío llega a Sentry', () => {
  it('fuente timer ⇒ captura con el tag area: hold-autolog y el extra del contrato', () => {
    const err = new Error('network request failed')
    expect(reportHoldAutologError(err, { ...CTX, source: 'timer' })).toBe(true)

    expect(captureException).toHaveBeenCalledTimes(1)
    const [captured, options] = captureException.mock.calls[0]
    expect(captured).toBe(err)
    expect(options).toEqual({
      tags: { area: 'hold-autolog' },
      extra: { blockId: 'blk-1', exerciseType: 'strength', context: 'superset' },
    })
  })

  it('fuente manual ⇒ NINGUNA captura (la fila ya tiene su chip de reintento)', () => {
    expect(reportHoldAutologError(new Error('boom'), { ...CTX, source: 'manual' })).toBe(false)
    expect(captureException).not.toHaveBeenCalled()
  })

  it('sin marca de fuente (serie tipeada a mano) ⇒ NINGUNA captura', () => {
    expect(reportHoldAutologError(new Error('boom'), { ...CTX, source: null })).toBe(false)
    expect(captureException).not.toHaveBeenCalled()
  })

  it('un error que no es Error se normaliza (Sentry agrupa por mensaje, no por «non-Error»)', () => {
    reportHoldAutologError('past_set_not_found', { ...CTX, source: 'timer' })
    const [captured] = captureException.mock.calls[0]
    expect(captured).toBeInstanceOf(Error)
    expect((captured as Error).message).toBe('past_set_not_found')
  })

  it('un Sentry sin inicializar NUNCA tumba el commit de la serie', () => {
    captureException.mockImplementationOnce(() => {
      throw new Error('Sentry no inicializado')
    })
    expect(reportHoldAutologError(new Error('boom'), { ...CTX, source: 'timer' })).toBe(false)
  })
})
