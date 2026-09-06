import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
    computeDigestHash,
    readLastDigestHash,
    recordDigest,
    MP_RECONCILE_DIGEST_ACTION,
    PAID_EXPIRY_DIGEST_ACTION,
} from './admin-digest'

// Dedupe de digests a ADMIN_EMAILS (D4): el hash es la CLAVE de todo el mecanismo, así que se
// testea que sea determinista ante los dos ruidos reales (orden de claves y orden de filas) y que
// discrimine cuando el contenido cambia de verdad. El ledger se ejercita con un admin falso: lo
// único que importa es la forma de la fila y el fail-open cuando la tabla no se puede leer.

type AuditRow = { action?: unknown; payload?: unknown }

function makeAdmin(opts: { rows?: AuditRow[]; readError?: string; throwOnSelect?: boolean } = {}) {
    const inserts: AuditRow[] = []
    const rows = opts.rows ?? []
    const admin = {
        from: () => ({
            select: () => {
                if (opts.throwOnSelect) throw new Error('boom')
                const eqCalls: Array<[string, unknown]> = []
                const chain: Record<string, unknown> = {}
                const ret = () => chain
                Object.assign(chain, {
                    eq: (col: string, val: unknown) => {
                        eqCalls.push([col, val])
                        return chain
                    },
                    order: ret,
                    limit: ret,
                    then: (resolve: (v: { data: AuditRow[] | null; error: { message: string } | null }) => unknown) => {
                        if (opts.readError) return resolve({ data: null, error: { message: opts.readError } })
                        const action = eqCalls.find(([col]) => col === 'action')?.[1]
                        // Más reciente primero (la query pide order desc + limit 1).
                        return resolve({ data: rows.filter((r) => r.action === action).reverse(), error: null })
                    },
                })
                return chain
            },
            insert: async (row: AuditRow) => {
                inserts.push(row)
                return { error: null }
            },
        }),
    }
    return { admin: admin as never, inserts }
}

beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('computeDigestHash', () => {
    it('mismo contenido ⇒ mismo hash aunque cambie el ORDEN DE LAS CLAVES', () => {
        const a = computeDigestHash({ divergences: [{ slug: 'ljfitness', dbStatus: 'active', mpStatus: 'pending' }], overdue: 0 })
        const b = computeDigestHash({ overdue: 0, divergences: [{ mpStatus: 'pending', slug: 'ljfitness', dbStatus: 'active' }] })
        expect(a).toBe(b)
    })

    it('mismo contenido ⇒ mismo hash aunque cambie el ORDEN DE LAS FILAS (Supabase no lo garantiza)', () => {
        const uno = computeDigestHash({ alerts: [{ slug: 'a' }, { slug: 'b' }] })
        const dos = computeDigestHash({ alerts: [{ slug: 'b' }, { slug: 'a' }] })
        expect(uno).toBe(dos)
    })

    it('contenido distinto ⇒ hash distinto (una divergencia nueva rompe la supresión)', () => {
        const base = computeDigestHash({ divergences: [{ slug: 'ljfitness', dbStatus: 'active', mpStatus: 'pending' }] })
        const conOtro = computeDigestHash({
            divergences: [
                { slug: 'ljfitness', dbStatus: 'active', mpStatus: 'pending' },
                { slug: 'movens', dbStatus: 'active', mpStatus: 'cancelled' },
            ],
        })
        const cambiaDetalle = computeDigestHash({ divergences: [{ slug: 'ljfitness', dbStatus: 'active', mpStatus: 'cancelled' }] })
        expect(conOtro).not.toBe(base)
        expect(cambiaDetalle).not.toBe(base)
    })

    it('devuelve sha256 en hex (64 caracteres)', () => {
        expect(computeDigestHash({ x: 1 })).toMatch(/^[0-9a-f]{64}$/)
    })
})

describe('readLastDigestHash', () => {
    it('sin filas previas ⇒ null (primer digest siempre se manda)', async () => {
        const { admin } = makeAdmin()
        expect(await readLastDigestHash(admin, MP_RECONCILE_DIGEST_ACTION)).toBeNull()
    })

    it('devuelve el digest_hash de la fila más reciente de ESA acción', async () => {
        const { admin } = makeAdmin({
            rows: [
                { action: PAID_EXPIRY_DIGEST_ACTION, payload: { digest_hash: 'de-otro-cron' } },
                { action: MP_RECONCILE_DIGEST_ACTION, payload: { digest_hash: 'viejo' } },
                { action: MP_RECONCILE_DIGEST_ACTION, payload: { digest_hash: 'nuevo' } },
            ],
        })
        expect(await readLastDigestHash(admin, MP_RECONCILE_DIGEST_ACTION)).toBe('nuevo')
    })

    it('fail-open: si el ledger devuelve error ⇒ null (el correo sale igual)', async () => {
        const { admin } = makeAdmin({ readError: 'permission denied for admin_audit_logs' })
        expect(await readLastDigestHash(admin, MP_RECONCILE_DIGEST_ACTION)).toBeNull()
    })

    it('fail-open: si la lectura LANZA ⇒ null, no propaga', async () => {
        const { admin } = makeAdmin({ throwOnSelect: true })
        await expect(readLastDigestHash(admin, PAID_EXPIRY_DIGEST_ACTION)).resolves.toBeNull()
    })

    it('payload sin digest_hash usable ⇒ null', async () => {
        const { admin } = makeAdmin({
            rows: [{ action: MP_RECONCILE_DIGEST_ACTION, payload: { digest_hash: 42 } }],
        })
        expect(await readLastDigestHash(admin, MP_RECONCILE_DIGEST_ACTION)).toBeNull()
    })
})

describe('recordDigest', () => {
    it('inserta la fila con la forma de las filas cron.* vecinas', async () => {
        const { admin, inserts } = makeAdmin()
        await recordDigest(admin, MP_RECONCILE_DIGEST_ACTION, {
            digest_hash: 'abc',
            sent: false,
            summary: { divergences: 1, addonAlerts: 0 },
        })
        expect(inserts).toHaveLength(1)
        expect(inserts[0]).toMatchObject({
            admin_email: 'cron',
            action: MP_RECONCILE_DIGEST_ACTION,
            target_table: 'coaches',
            target_id: null,
            payload: { digest_hash: 'abc', sent: false, summary: { divergences: 1, addonAlerts: 0 } },
        })
    })

    it('nunca lanza si el insert falla (la traza es evidencia, no el trabajo)', async () => {
        const admin = {
            from: () => ({
                insert: async () => ({ error: { message: 'nope' } }),
            }),
        } as never
        await expect(
            recordDigest(admin, PAID_EXPIRY_DIGEST_ACTION, { digest_hash: 'x', sent: true, summary: {} })
        ).resolves.toBeUndefined()
    })
})
