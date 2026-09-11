import { describe, expect, it } from 'vitest'
import { DEFAULT_REST_FALLBACK_SEC, resolveEffectiveRest } from './rest-fallback'
import { resolveRestAfterCommit } from './rest-after-commit'

describe('resolveEffectiveRest — nunca 0 (reporte Víctor 2026-09-11)', () => {
    it('usa el rest_time del bloque cuando es válido', () => {
        expect(resolveEffectiveRest({ restSec: 90 })).toEqual({ seconds: 90, source: 'block', warmup: false })
    })

    it('cae al fallback con rest_time vacío, 0 o negativo', () => {
        for (const restSec of [0, -5, Number.NaN]) {
            expect(resolveEffectiveRest({ restSec })).toEqual({
                seconds: DEFAULT_REST_FALLBACK_SEC,
                source: 'fallback',
                warmup: false,
            })
        }
    })

    it('warmup válido en la serie 1 manda sobre el rest_time', () => {
        expect(resolveEffectiveRest({ restSec: 90, warmupRestSec: 30, useWarmup: true })).toEqual({
            seconds: 30,
            source: 'warmup',
            warmup: true,
        })
    })

    it('warmup vacío o 0 NO anula el descanso: cae al rest_time normal', () => {
        expect(resolveEffectiveRest({ restSec: 90, warmupRestSec: 0, useWarmup: true })).toEqual({
            seconds: 90,
            source: 'block',
            warmup: false,
        })
        expect(resolveEffectiveRest({ restSec: 0, warmupRestSec: null, useWarmup: true })).toEqual({
            seconds: DEFAULT_REST_FALLBACK_SEC,
            source: 'fallback',
            warmup: false,
        })
    })

    it('fuera de la serie 1 el warmup se ignora aunque sea válido', () => {
        expect(resolveEffectiveRest({ restSec: 90, warmupRestSec: 30, useWarmup: false }).seconds).toBe(90)
    })

    it('encadenado con la matriz: un bloque sin rest_time ya no produce `none` en pantalla sola', () => {
        const { seconds } = resolveEffectiveRest({ restSec: 0 })
        expect(resolveRestAfterCommit({ autoRestEnabled: true, context: 'solo', restSec: seconds })).toBe('auto-start')
        expect(resolveRestAfterCommit({ autoRestEnabled: false, context: 'solo', restSec: seconds })).toBe('offer-cta')
        expect(resolveRestAfterCommit({ autoRestEnabled: true, context: 'superset-last', restSec: seconds })).toBe('auto-start')
        // V4 intacto: entre miembros de la ronda sigue sin haber descanso.
        expect(resolveRestAfterCommit({ autoRestEnabled: true, context: 'superset-mid', restSec: seconds })).toBe('none')
    })
})
