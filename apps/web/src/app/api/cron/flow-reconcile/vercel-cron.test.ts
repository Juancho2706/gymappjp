import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

// U8: el cron de flow-reconcile DEBE estar registrado en vercel.json (si no, nunca corre → los ajustes
// de compuesto Flow por cupón/add-on jamás se sincronizan). Este test parsea el vercel.json real y
// verifica el registro + que su horario NO colisione con mp-reconcile (escritores del mismo dominio).

/** Sube desde el cwd buscando vercel.json (robusto ante el cwd de vitest). */
function findVercelJson(): string {
    let dir = process.cwd()
    for (let i = 0; i < 8; i++) {
        try {
            const candidate = join(dir, 'vercel.json')
            readFileSync(candidate, 'utf8')
            return candidate
        } catch {
            const parent = dirname(dir)
            if (parent === dir) break
            dir = parent
        }
    }
    throw new Error('vercel.json no encontrado subiendo desde el cwd')
}

describe('vercel.json — cron flow-reconcile (U8)', () => {
    const raw = readFileSync(findVercelJson(), 'utf8')
    const parsed = JSON.parse(raw) as { crons?: Array<{ path: string; schedule: string }> }

    it('parsea y contiene el cron /api/cron/flow-reconcile', () => {
        const flow = (parsed.crons ?? []).find((c) => c.path === '/api/cron/flow-reconcile')
        expect(flow).toBeDefined()
        expect(typeof flow!.schedule).toBe('string')
        expect(flow!.schedule.trim().length).toBeGreaterThan(0)
    })

    it('su horario NO coincide con el de mp-reconcile (escritores del mismo compuesto, no deben pisarse)', () => {
        const crons = parsed.crons ?? []
        const flow = crons.find((c) => c.path === '/api/cron/flow-reconcile')
        const mp = crons.find((c) => c.path === '/api/cron/mp-reconcile')
        expect(flow).toBeDefined()
        expect(mp).toBeDefined()
        expect(flow!.schedule).not.toBe(mp!.schedule)
    })
})
