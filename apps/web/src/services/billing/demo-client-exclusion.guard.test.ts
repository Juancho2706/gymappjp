import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Guard estático: el alumno de ejemplo (`clients.is_demo`) NUNCA cuenta para el cupo.
 *
 * POR QUÉ EXISTE (onboarding v2, W1 F1.3 — docs/specs/coach-onboarding-v2/): desde pricing v3 el
 * plan Free tiene UN alumno. El onboarding siembra un alumno demo para que el panel no nazca
 * vacío; si ese demo entra en cualquiera de los conteos de cupo, el coach nuevo nace 1/1 y el
 * onboarding se convierte en un muro — el riesgo #1 de la SPEC.
 *
 * El predicado está DUPLICADO en cada call site (cada uno lo arma con su propio scope: standalone,
 * org, team, import, /join). Los que tienen una costura testeable ya se prueban por comportamiento
 * en `capacity.service.test.ts`, `join-capacity.test.ts`, `client-archive.service.test.ts`,
 * `coach.repository.test.ts` y `api/cron/cap-nudge/route.test.ts`. Los de acá son server actions y
 * route handlers cuyo montaje completo (auth + workspace + Supabase + Resend) cuesta más que lo que
 * prueba, así que se pinnea el predicado en la fuente: si alguien agrega un conteo nuevo o borra el
 * filtro, CI lo caza. Mismo criterio que `csp-meta-pixel.test.ts` con la CSP de Vercel.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// .../apps/web/src/services/billing -> .../apps/web/src
const SRC = path.resolve(__dirname, '..', '..')

const FILTER = ".eq('is_demo', false)"

/** Ventana de búsqueda desde el ancla: alcanza para cubrir la cadena de filtros más larga. */
const WINDOW = 700

type CountSite = {
    /** Ruta relativa a apps/web/src */
    file: string
    /** Qué conteo es (aparece en el mensaje de fallo). */
    what: string
    /** Texto único que abre el conteo en la fuente. */
    anchor: string
}

const COUNT_SITES: CountSite[] = [
    {
        file: 'app/coach/clients/_actions/clients.actions.ts',
        what: 'gate 402 del alta de alumno (web)',
        anchor: 'let activeClientsQuery = supabase',
    },
    {
        file: 'app/coach/clients/import/_actions/import.actions.ts',
        what: 'precheck de cupo del importador (web)',
        anchor: 'const countQuery = supabase',
    },
    {
        file: 'app/coach/clients/import/_actions/import.actions.ts',
        what: 'gate de cupo del importador (web)',
        anchor: 'const { count: activeCount } = await supabase',
    },
    {
        file: 'app/api/mobile/coach/clients/route.ts',
        what: 'gate 402 del alta de alumno (RN)',
        anchor: "const { count: activeClientsCount, error: countError } = workspace.type === 'coach_standalone'",
    },
    {
        file: 'app/api/mobile/coach/clients/import/route.ts',
        what: 'gate de cupo del importador (RN)',
        anchor: 'const { count, error: countError } = await admin',
    },
    {
        file: 'app/coach/reactivate/_data/reactivate.queries.ts',
        what: 'conteo de activos de /coach/reactivate',
        anchor: "supabase\n            .from('clients')\n            .select('id', { count: 'exact', head: true })",
    },
    {
        file: 'app/coach/reactivate/_data/reactivate.queries.ts',
        what: 'lista archivable de /coach/reactivate',
        anchor: "supabase\n            .from('clients')\n            .select('id, full_name')",
    },
    {
        file: 'app/api/cron/trial-expiry/route.ts',
        what: 'conteo del correo de trial expirado',
        anchor: 'const { count: clientCount } = await admin',
    },
    {
        file: 'app/admin/(panel)/coaches/_actions/coach-actions.ts',
        what: 'conteo del correo de reactivación disparado por admin',
        anchor: 'const { count: clientCount } = await adminClient',
    },
]

/** Normaliza CRLF: el repo se clona en Windows y algunos archivos llegan con \r\n. */
function readSource(file: string): string {
    return fs.readFileSync(path.join(SRC, file), 'utf8').replace(/\r\n/g, '\n')
}

describe('is_demo fuera del cupo — conteos sin costura de test', () => {
    it.each(COUNT_SITES)('$file — $what', ({ file, anchor }) => {
        const source = readSource(file)
        const at = source.indexOf(anchor)
        expect(at, `no se encontró el ancla en ${file}; si el código se movió, actualizá el ancla`).toBeGreaterThan(-1)
        expect(source.slice(at, at + WINDOW)).toContain(FILTER)
    })

    it('trial-expiry filtra el demo en SUS DOS conteos (expirados y aviso previo)', () => {
        const source = readSource('app/api/cron/trial-expiry/route.ts')
        expect(source.split('const { count: clientCount } = await admin').length - 1).toBe(2)
        expect(source.split(FILTER).length - 1).toBe(2)
    })
})
