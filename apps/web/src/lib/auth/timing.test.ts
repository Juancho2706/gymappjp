import { describe, it, expect, vi, afterEach } from 'vitest'
import { jitter } from './timing'

afterEach(() => {
    vi.useRealTimers()
})

describe('jitter', () => {
    it('resolves after at least minMs', async () => {
        vi.useFakeTimers()
        const promise = jitter(100, 200)
        vi.advanceTimersByTime(50)
        // not resolved yet — timer hasn't fired
        let resolved = false
        promise.then(() => { resolved = true })
        await Promise.resolve() // flush microtasks
        expect(resolved).toBe(false)

        vi.advanceTimersByTime(300)
        await promise
        expect(resolved).toBe(true)
    })

    it('returns a Promise', () => {
        vi.useFakeTimers()
        const result = jitter(0, 0)
        expect(result).toBeInstanceOf(Promise)
        vi.advanceTimersByTime(0)
    })

    it('throws when maxMs < minMs', () => {
        expect(() => jitter(500, 100)).toThrow('jitter: maxMs must be >= minMs')
    })

    it('works when minMs === maxMs (zero span)', async () => {
        vi.useFakeTimers()
        const promise = jitter(200, 200)
        vi.advanceTimersByTime(200)
        await promise
    })
})
