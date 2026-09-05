import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * El cron `onboarding-behavior` DEBE estar registrado en `vercel.json` y DEBE ser HORARIO.
 *
 * D12 = A (owner 22-08): `vercel.json` solo tenía crons diarios/semanales, así que la señal «+2 h
 * sin alumno» de SPEC §8 llegaba en realidad «hasta +26 h» — el correo del día 1 caía el día 2
 * (hallazgo w6-w7-08 de la auditoría). Si alguien lo pasa a diario, W6 vuelve a ser un drip por
 * almanaque con otro nombre; por eso el horario se pinnea acá y no solo en la doc.
 */

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

describe('vercel.json — cron onboarding-behavior', () => {
    const raw = readFileSync(findVercelJson(), 'utf8')
    const parsed = JSON.parse(raw) as { crons?: Array<{ path: string; schedule: string }> }
    const crons = parsed.crons ?? []
    const cron = crons.find((c) => c.path === '/api/cron/onboarding-behavior')

    it('está registrado', () => {
        expect(cron).toBeDefined()
    })

    it('corre CADA HORA (minuto fijo, comodín en la hora)', () => {
        const [minute, hour] = cron!.schedule.trim().split(/\s+/)
        expect(hour).toBe('*')
        expect(minute).toMatch(/^\d{1,2}$/)
    })

    // Los dos crons horarios del proyecto escriben en Resend: arrancarlos en el mismo minuto es
    // pedirle al rate limit (2 req/s) que decida cuál de los dos correos se pierde.
    it('no arranca en el mismo minuto que checkout-abandoned', () => {
        const other = crons.find((c) => c.path === '/api/cron/checkout-abandoned')
        expect(other).toBeDefined()
        expect(cron!.schedule).not.toBe(other!.schedule)
    })
})
