import { describe, it, expect } from 'vitest'
import { measureServer } from '@/lib/perf/measure-server'

describe('measureServer', () => {
    it('devuelve el resultado de la función async', async () => {
        const result = await measureServer('test-span', async () => ({ ok: true }))
        expect(result).toEqual({ ok: true })
    })

    it('propaga errores', async () => {
        await expect(
            measureServer('failing-span', async () => {
                throw new Error('boom')
            })
        ).rejects.toThrow('boom')
    })
})
