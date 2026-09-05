import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { SALE_TIERS } from '@eva/tiers'

/**
 * Guard estático: el alta MANUAL de coaches del panel admin no puede nacer en un tier LEGACY.
 *
 * POR QUÉ EXISTE: el `<Select name="subscription_tier">` de `CoachCreateSheet` pinta solo
 * `SALE_TIERS` (free/pro/elite desde pricing v2) pero su `defaultValue` había quedado en
 * `"starter"` — un tier que ya ni siquiera aparece en la lista. Un admin que no tocaba el selector
 * creaba un coach `starter` (10 alumnos, $19.990, fuera de venta desde el 17-08): `createCoachAction`
 * NO re-mapea nada, escribe el tier tal cual y `max_clients = getTierMaxClients(tier)`
 * (coach-actions.ts:88-92). Bajo pricing v3 el default correcto es 'free'.
 *
 * Se pinnea en la FUENTE (mismo criterio que `demo-client-exclusion.guard.test.ts` y
 * `csp-meta-pixel.test.ts`): el default es un literal JSX de un client component cuyo montaje
 * completo cuesta más que lo que prueba, y lo que importa es exactamente ese literal.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SHEET = path.join(__dirname, 'CoachCreateSheet.tsx')

function readTierDefault(): string {
    const source = fs.readFileSync(SHEET, 'utf8')
    const match = source.match(/<Select\s+name="subscription_tier"\s+defaultValue="([a-z_]+)"/)
    if (!match) {
        throw new Error(
            'No se encontró el <Select name="subscription_tier"> con defaultValue en CoachCreateSheet.tsx. ' +
                'Si cambió el markup, actualizá este guard — no lo borres: pinnea el tier con el que nacen los coaches del panel.'
        )
    }
    return match[1]
}

describe('CoachCreateSheet — tier por defecto del alta manual', () => {
    it('el default es un tier A LA VENTA (nunca starter/growth/scale legacy)', () => {
        const tierDefault = readTierDefault()
        expect(tierDefault).not.toBe('starter')
        expect(SALE_TIERS as readonly string[]).toContain(tierDefault)
    })

    it('pricing v3: el default es free (el piso, no un plan pago sin elegir)', () => {
        expect(readTierDefault()).toBe('free')
    })
})
