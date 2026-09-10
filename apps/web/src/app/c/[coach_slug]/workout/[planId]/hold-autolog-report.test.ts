/**
 * Sentry del auto-envío del hold — WEB (specs/cuenta-atras-en-pantalla, **W6.2** · DATA-TESTING §8.3).
 *
 * Se testea el helper puro y no el camino completo del formulario: montar `LogSetForm`, forzar el
 * rechazo de la server action y esperar la reconciliación sería un test de otra cosa (el pipeline de
 * guardado, ya cubierto por `LogSetForm.test.tsx`). Lo que este tren agrega —y lo único que puede
 * romperse en silencio— es el **guard de fuente** y la forma exacta del reporte: tag
 * `area: 'hold-autolog'` (numerador del umbral §8.4) y las tres claves de `extra`.
 *
 * El cableado del helper en las DOS filas vive en `LogSetForm.tsx` (`reconcile`, rama `result.error`).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { captureException } = vi.hoisted(() => ({ captureException: vi.fn() }))
vi.mock('@sentry/nextjs', () => ({ captureException }))

import { reportHoldAutologError } from './hold-autolog-report'

const CTX = { blockId: 'blk-1', exerciseType: 'mobility', context: 'solo' as const }

beforeEach(() => {
    captureException.mockReset()
})

describe('reportHoldAutologError (web) — sólo el AUTO-envío llega a Sentry', () => {
    it('fuente timer ⇒ captura con el tag area: hold-autolog y el extra del contrato', () => {
        const err = new Error('duplicate key value violates unique constraint')
        expect(reportHoldAutologError(err, { ...CTX, source: 'timer' })).toBe(true)

        expect(captureException).toHaveBeenCalledTimes(1)
        const [captured, options] = captureException.mock.calls[0]
        expect(captured).toBe(err)
        expect(options).toEqual({
            tags: { area: 'hold-autolog' },
            extra: { blockId: 'blk-1', exerciseType: 'mobility', context: 'solo' },
        })
    })

    it('fuente manual ⇒ NINGUNA captura (la fila ya tiene su chip de reintento)', () => {
        expect(reportHoldAutologError(new Error('boom'), { ...CTX, source: 'manual' })).toBe(false)
        expect(captureException).not.toHaveBeenCalled()
    })

    it('sin marca de fuente (serie tipeada a mano) ⇒ NINGUNA captura', () => {
        expect(reportHoldAutologError(new Error('boom'), { ...CTX, source: null })).toBe(false)
        expect(reportHoldAutologError(new Error('boom'), { ...CTX, source: undefined })).toBe(false)
        expect(captureException).not.toHaveBeenCalled()
    })

    it('un error que no es Error se normaliza (Sentry agrupa por mensaje, no por «non-Error»)', () => {
        reportHoldAutologError('past_set_not_found', { ...CTX, source: 'timer' })
        const [captured] = captureException.mock.calls[0]
        expect(captured).toBeInstanceOf(Error)
        expect((captured as Error).message).toBe('past_set_not_found')
    })

    it('un Sentry sin inicializar NUNCA tumba la reconciliación de la serie', () => {
        captureException.mockImplementationOnce(() => {
            throw new Error('Sentry no inicializado')
        })
        expect(reportHoldAutologError(new Error('boom'), { ...CTX, source: 'timer' })).toBe(false)
    })
})
