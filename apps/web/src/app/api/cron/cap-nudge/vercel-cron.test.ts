import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

// El cron cap-nudge DEBE estar registrado en vercel.json: si no, nunca corre y el correo de venta
// por cupo se queda igual que hoy (0 envíos con ~15 coaches free en cupo permanente). Verifica el
// registro + que su horario NO colisione con los otros escritores del dominio de billing (que
// además leen/escriben el mismo ledger `admin_audit_logs`).

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

describe('vercel.json — cron cap-nudge', () => {
    const raw = readFileSync(findVercelJson(), 'utf8')
    const parsed = JSON.parse(raw) as { crons?: Array<{ path: string; schedule: string }> }

    it('parsea y contiene el cron /api/cron/cap-nudge', () => {
        const cron = (parsed.crons ?? []).find((c) => c.path === '/api/cron/cap-nudge')
        expect(cron).toBeDefined()
        expect(typeof cron!.schedule).toBe('string')
        expect(cron!.schedule.trim().length).toBeGreaterThan(0)
    })

    it('su horario NO coincide con paid-expiry / trial-expiry / mp-reconcile / flow-reconcile', () => {
        const crons = parsed.crons ?? []
        const capNudge = crons.find((c) => c.path === '/api/cron/cap-nudge')!
        const others = [
            '/api/cron/paid-expiry',
            '/api/cron/trial-expiry',
            '/api/cron/mp-reconcile',
            '/api/cron/flow-reconcile',
        ]
            .map((p) => crons.find((c) => c.path === p))
            .filter(Boolean) as Array<{ schedule: string }>
        expect(capNudge).toBeDefined()
        expect(others.length).toBe(4)
        for (const other of others) {
            expect(capNudge.schedule).not.toBe(other.schedule)
        }
    })
})
