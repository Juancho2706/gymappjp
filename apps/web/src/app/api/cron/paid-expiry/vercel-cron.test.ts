import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

// El cron paid-expiry DEBE estar registrado en vercel.json (si no, nunca corre → las suscripciones
// pagas con webhook terminal perdido nunca se expiran = Pro gratis indefinido). Verifica el registro
// + que su horario NO colisione con los otros escritores del dominio de billing (mp/flow-reconcile,
// trial-expiry).

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

describe('vercel.json — cron paid-expiry', () => {
    const raw = readFileSync(findVercelJson(), 'utf8')
    const parsed = JSON.parse(raw) as { crons?: Array<{ path: string; schedule: string }> }

    it('parsea y contiene el cron /api/cron/paid-expiry', () => {
        const cron = (parsed.crons ?? []).find((c) => c.path === '/api/cron/paid-expiry')
        expect(cron).toBeDefined()
        expect(typeof cron!.schedule).toBe('string')
        expect(cron!.schedule.trim().length).toBeGreaterThan(0)
    })

    it('su horario NO coincide con mp-reconcile / flow-reconcile / trial-expiry (mismo dominio de billing)', () => {
        const crons = parsed.crons ?? []
        const paid = crons.find((c) => c.path === '/api/cron/paid-expiry')!
        const others = ['/api/cron/mp-reconcile', '/api/cron/flow-reconcile', '/api/cron/trial-expiry']
            .map((p) => crons.find((c) => c.path === p))
            .filter(Boolean) as Array<{ schedule: string }>
        expect(paid).toBeDefined()
        for (const o of others) {
            expect(paid.schedule).not.toBe(o.schedule)
        }
    })
})
