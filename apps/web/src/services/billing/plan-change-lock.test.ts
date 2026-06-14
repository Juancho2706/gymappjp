import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
    claimUpgradeInFlight,
    clearUpgradeInFlight,
    isUpgradeInFlight,
    setUpgradeInFlight,
    TTL_MINUTES,
    upgradeInFlightKey,
} from './plan-change-lock'

// ── Unit tests del candado in-flight de UPGRADE (audit P0-4, FUNDACIÓN F1) ──────────────────
// El candado reutiliza `subscription_events` como marcador efímero (sin migración). Mockeamos el
// client service-role como un query builder chainable que registra las llamadas; la lógica bajo
// test es: la clave por coach, la query con ventana de TTL (gt created_at), y el patrón
// DELETE→INSERT de setUpgradeInFlight (renueva created_at evitando la colisión del único).
//
// NO se testea el acceso real a DB (eso es la suite SQL del gate) — solo la forma de las queries
// y la semántica (existe fila viva ⇒ in-flight; clear/set idempotentes; errores se propagan).

type SelectResult = { data: unknown; error: { message: string } | null }
type WriteResult = { error: { message: string } | null }

// Builder configurable: cada test inyecta el resultado del .maybeSingle() (in-flight check) y de
// los writes (delete/insert). Captura los argumentos para aseverar la forma de la query.
function makeDb(opts?: {
    selectResult?: SelectResult
    deleteResult?: WriteResult
    insertResult?: WriteResult
}) {
    const calls = {
        table: [] as string[],
        selectCols: [] as string[],
        eq: [] as Array<[string, unknown]>,
        gt: [] as Array<[string, unknown]>,
        deletedKeys: [] as string[],
        inserted: [] as Array<Record<string, unknown>>,
    }
    const selectResult = opts?.selectResult ?? { data: null, error: null }
    const deleteResult = opts?.deleteResult ?? { error: null }
    const insertResult = opts?.insertResult ?? { error: null }

    const db = {
        from: vi.fn((table: string) => {
            calls.table.push(table)
            return {
                // isUpgradeInFlight: select('created_at').eq(...).gt(...).maybeSingle()
                select: vi.fn((cols: string) => {
                    calls.selectCols.push(cols)
                    return {
                        eq: vi.fn((col: string, value: unknown) => {
                            calls.eq.push([col, value])
                            return {
                                gt: vi.fn((col2: string, value2: unknown) => {
                                    calls.gt.push([col2, value2])
                                    return { maybeSingle: vi.fn(async () => selectResult) }
                                }),
                            }
                        }),
                    }
                }),
                // setUpgradeInFlight / clearUpgradeInFlight: delete().eq('provider_event_id', key)
                delete: vi.fn(() => ({
                    eq: vi.fn(async (col: string, value: unknown) => {
                        calls.eq.push([col, value])
                        if (col === 'provider_event_id') calls.deletedKeys.push(String(value))
                        return deleteResult
                    }),
                })),
                // setUpgradeInFlight: insert(row)
                insert: vi.fn(async (row: Record<string, unknown>) => {
                    calls.inserted.push(row)
                    return insertResult
                }),
            }
        }),
    }
    return { db: db as never, calls }
}

const COACH = 'coach-1'

beforeEach(() => {
    vi.clearAllMocks()
})

describe('upgradeInFlightKey', () => {
    it('deriva la clave estable por coach', () => {
        expect(upgradeInFlightKey(COACH)).toBe('tier_upgrade_pending:coach-1')
    })

    it('claves distintas para coaches distintos (un candado por coach)', () => {
        expect(upgradeInFlightKey('a')).not.toBe(upgradeInFlightKey('b'))
    })

    it('TTL_MINUTES es 30 (ventana de auto-recuperación del checkout abandonado)', () => {
        expect(TTL_MINUTES).toBe(30)
    })
})

describe('isUpgradeInFlight', () => {
    it('true cuando hay una fila del marcador dentro de la ventana de TTL', async () => {
        const { db, calls } = makeDb({
            selectResult: { data: { created_at: '2026-06-14T12:00:00.000Z' }, error: null },
        })
        const result = await isUpgradeInFlight(db, COACH)
        expect(result).toBe(true)
        // Consulta subscription_events por la clave del coach con la ventana de TTL.
        expect(calls.table).toContain('subscription_events')
        expect(calls.selectCols[0]).toBe('created_at')
        expect(calls.eq).toContainEqual(['provider_event_id', upgradeInFlightKey(COACH)])
        // Filtra por created_at > (now - TTL): el col del .gt() es created_at.
        expect(calls.gt[0][0]).toBe('created_at')
    })

    it('false cuando no hay fila (sin upgrade en vuelo, o el marcador venció)', async () => {
        const { db } = makeDb({ selectResult: { data: null, error: null } })
        expect(await isUpgradeInFlight(db, COACH)).toBe(false)
    })

    it('la ventana de TTL usa now - TTL_MINUTES (filtra marcadores viejos = checkout abandonado)', async () => {
        const { db, calls } = makeDb({ selectResult: { data: null, error: null } })
        const before = Date.now()
        await isUpgradeInFlight(db, COACH)
        const after = Date.now()
        // El valor del .gt('created_at', sinceIso) debe estar dentro de [now-TTL-ε, now-TTL+ε].
        const sinceMs = new Date(String(calls.gt[0][1])).getTime()
        const expectedLow = before - TTL_MINUTES * 60 * 1000
        const expectedHigh = after - TTL_MINUTES * 60 * 1000
        expect(sinceMs).toBeGreaterThanOrEqual(expectedLow - 5)
        expect(sinceMs).toBeLessThanOrEqual(expectedHigh + 5)
    })

    it('propaga el error del select como excepción (db service-role obligatorio)', async () => {
        const { db } = makeDb({
            selectResult: { data: null, error: { message: 'permission denied (RLS)' } },
        })
        await expect(isUpgradeInFlight(db, COACH)).rejects.toThrow(/isUpgradeInFlight/)
        await expect(isUpgradeInFlight(db, COACH)).rejects.toThrow(/permission denied/)
    })
})

describe('setUpgradeInFlight', () => {
    it('DELETE de la fila previa y luego INSERT de una fresca (renueva created_at)', async () => {
        const { db, calls } = makeDb()
        await setUpgradeInFlight(db, COACH)
        // (1) borra primero por la clave (evita la colisión del único provider_event_id).
        expect(calls.deletedKeys).toContain(upgradeInFlightKey(COACH))
        // (2) inserta una fila fresca con la forma esperada (service-role escribe en subscription_events).
        expect(calls.inserted).toHaveLength(1)
        const row = calls.inserted[0]
        expect(row.coach_id).toBe(COACH)
        expect(row.provider).toBe('mercadopago')
        expect(row.provider_event_id).toBe(upgradeInFlightKey(COACH))
        expect(row.provider_status).toBe('tier_upgrade_pending')
        expect(row.payload).toEqual({})
    })

    it('el DELETE precede al INSERT (orden importa: created_at queda al momento actual)', async () => {
        const order: string[] = []
        const db = {
            from: vi.fn(() => ({
                delete: vi.fn(() => ({
                    eq: vi.fn(async () => {
                        order.push('delete')
                        return { error: null }
                    }),
                })),
                insert: vi.fn(async () => {
                    order.push('insert')
                    return { error: null }
                }),
            })),
        }
        await setUpgradeInFlight(db as never, COACH)
        expect(order).toEqual(['delete', 'insert'])
    })

    it('propaga el error del DELETE', async () => {
        const { db } = makeDb({ deleteResult: { error: { message: 'delete boom' } } })
        await expect(setUpgradeInFlight(db, COACH)).rejects.toThrow(/setUpgradeInFlight \(delete\)/)
        await expect(setUpgradeInFlight(db, COACH)).rejects.toThrow(/delete boom/)
    })

    it('propaga el error del INSERT', async () => {
        const { db } = makeDb({ insertResult: { error: { message: 'insert boom' } } })
        await expect(setUpgradeInFlight(db, COACH)).rejects.toThrow(/setUpgradeInFlight \(insert\)/)
        await expect(setUpgradeInFlight(db, COACH)).rejects.toThrow(/insert boom/)
    })
})

describe('clearUpgradeInFlight', () => {
    it('DELETE por la clave del coach (idempotente: no-op si no existe)', async () => {
        const { db, calls } = makeDb()
        await clearUpgradeInFlight(db, COACH)
        expect(calls.table).toContain('subscription_events')
        expect(calls.deletedKeys).toContain(upgradeInFlightKey(COACH))
    })

    it('propaga el error del DELETE', async () => {
        const { db } = makeDb({ deleteResult: { error: { message: 'clear boom' } } })
        await expect(clearUpgradeInFlight(db, COACH)).rejects.toThrow(/clearUpgradeInFlight/)
        await expect(clearUpgradeInFlight(db, COACH)).rejects.toThrow(/clear boom/)
    })
})

describe('plan-change-lock — ciclo set→isInFlight→clear (semántica end-to-end con un store en memoria)', () => {
    // Store en memoria que emula la fila única por provider_event_id, para verificar la SEMÁNTICA:
    // tras set() el coach está in-flight; tras clear() ya no.
    function makeStatefulDb() {
        const store = new Map<string, { created_at: string }>()
        return {
            from: vi.fn(() => ({
                select: vi.fn(() => ({
                    eq: vi.fn((_c: string, key: string) => ({
                        gt: vi.fn((_c2: string, sinceIso: string) => ({
                            maybeSingle: vi.fn(async () => {
                                const row = store.get(key)
                                if (row && new Date(row.created_at).getTime() > new Date(sinceIso).getTime()) {
                                    return { data: row, error: null }
                                }
                                return { data: null, error: null }
                            }),
                        })),
                    })),
                })),
                delete: vi.fn(() => ({
                    eq: vi.fn(async (_c: string, key: string) => {
                        store.delete(key)
                        return { error: null }
                    }),
                })),
                insert: vi.fn(async (row: { provider_event_id: string }) => {
                    store.set(row.provider_event_id, { created_at: new Date().toISOString() })
                    return { error: null }
                }),
            })),
        } as never
    }

    it('sin set previo → NO in-flight', async () => {
        const db = makeStatefulDb()
        expect(await isUpgradeInFlight(db, COACH)).toBe(false)
    })

    it('tras set → in-flight; tras clear → ya no', async () => {
        const db = makeStatefulDb()
        await setUpgradeInFlight(db, COACH)
        expect(await isUpgradeInFlight(db, COACH)).toBe(true)
        await clearUpgradeInFlight(db, COACH)
        expect(await isUpgradeInFlight(db, COACH)).toBe(false)
    })

    it('el candado es por coach: set para coach-1 no marca a coach-2', async () => {
        const db = makeStatefulDb()
        await setUpgradeInFlight(db, 'coach-1')
        expect(await isUpgradeInFlight(db, 'coach-1')).toBe(true)
        expect(await isUpgradeInFlight(db, 'coach-2')).toBe(false)
    })

    it('clear sin set previo es no-op (idempotente)', async () => {
        const db = makeStatefulDb()
        await expect(clearUpgradeInFlight(db, COACH)).resolves.toBeUndefined()
        expect(await isUpgradeInFlight(db, COACH)).toBe(false)
    })
})

// ── claimUpgradeInFlight — reclamo ATÓMICO (cierre del TOCTOU del check→set y del stale-takeover) ──
// El reclamo apoya su atomicidad en el UNIQUE de provider_event_id. Driveamos el código de error
// del INSERT (23505 = unique violation), el SELECT del marcador existente y el COMPARE-AND-SWAP
// delete (cuántas filas borra el match por created_at) para cubrir las ramas:
//   - INSERT fresco OK → true.
//   - 23505 + fila FRESCA → false (candado vivo).
//   - 23505 + data null (desapareció) → reintento de INSERT atómico (SIN delete) → true/false.
//   - 23505 + fila RANCIA → CAS-delete gana (1 fila) + INSERT final OK → true.
//   - 23505 + rancia → CAS-delete borra 0 filas (otra request la tomó) → false, SIN INSERT final.
//   - 23505 + rancia → CAS-delete gana pero INSERT final choca (racer metió fila fresca) → false.
//   - error NO-unique en cualquier paso → throw (fail-closed).
type ErrLike = { code?: string; message?: string } | null

// Builder a medida para claimUpgradeInFlight: secuencia los resultados del insert (1er reclamo y el
// INSERT final tras el CAS-delete), configura el select del marcador existente
// (select('created_at').eq(...).maybeSingle()) y el resultado del CAS-delete
// (delete().eq(provider_event_id).eq(created_at).select() → { data: filasBorradas[], error }).
function makeClaimDb(opts: {
    inserts: Array<{ error: ErrLike }>
    existing?: { data: { created_at: string } | null; error: ErrLike }
    casDelete?: { data: Array<{ provider_event_id: string }> | null; error: ErrLike }
}) {
    const calls = {
        inserted: [] as Array<Record<string, unknown>>,
        deletedKeys: [] as string[],
        deletedCreatedAt: [] as string[],
        selectedKeys: [] as string[],
    }
    const insertSeq = [...opts.inserts]
    const existing = opts.existing ?? { data: null, error: null }
    // Default: el CAS-delete GANA (borra exactamente la fila rancia → 1 fila).
    const casDelete =
        opts.casDelete ?? { data: [{ provider_event_id: upgradeInFlightKey(COACH) }], error: null }
    const db = {
        from: vi.fn(() => ({
            insert: vi.fn(async (row: Record<string, unknown>) => {
                calls.inserted.push(row)
                return insertSeq.shift() ?? { error: null }
            }),
            select: vi.fn(() => ({
                eq: vi.fn((_col: string, key: string) => {
                    calls.selectedKeys.push(key)
                    return { maybeSingle: vi.fn(async () => existing) }
                }),
            })),
            // CAS-delete: delete().eq('provider_event_id', key).eq('created_at', val).select(cols)
            delete: vi.fn(() => ({
                eq: vi.fn((_col: string, key: string) => {
                    calls.deletedKeys.push(key)
                    return {
                        eq: vi.fn((_col2: string, createdAt: string) => {
                            calls.deletedCreatedAt.push(createdAt)
                            return { select: vi.fn(async () => casDelete) }
                        }),
                    }
                }),
            })),
        })),
    }
    return { db: db as never, calls }
}

const UNIQUE_VIOLATION = { code: '23505', message: 'duplicate key value violates unique constraint "subscription_events_provider_event_id_key"' }

describe('claimUpgradeInFlight', () => {
    it('INSERT fresco OK → true (reclamado) e inserta la fila marcador con la forma esperada', async () => {
        const { db, calls } = makeClaimDb({ inserts: [{ error: null }] })
        expect(await claimUpgradeInFlight(db, COACH)).toBe(true)
        expect(calls.inserted).toHaveLength(1)
        const row = calls.inserted[0]
        expect(row.coach_id).toBe(COACH)
        expect(row.provider).toBe('mercadopago')
        expect(row.provider_event_id).toBe(upgradeInFlightKey(COACH))
        expect(row.provider_status).toBe('tier_upgrade_pending')
        expect(row.payload).toEqual({})
        // No hubo colisión → no se consulta ni borra el marcador existente.
        expect(calls.deletedKeys).toHaveLength(0)
    })

    it('UNIQUE VIOLATION + fila FRESCA (dentro del TTL) → false (alguien sostiene el candado)', async () => {
        const fresh = new Date().toISOString()
        const { db, calls } = makeClaimDb({
            inserts: [{ error: UNIQUE_VIOLATION }],
            existing: { data: { created_at: fresh }, error: null },
        })
        expect(await claimUpgradeInFlight(db, COACH)).toBe(false)
        // Un solo intento de insert; consultó el marcador existente; NO lo borró (está vivo).
        expect(calls.inserted).toHaveLength(1)
        expect(calls.selectedKeys).toContain(upgradeInFlightKey(COACH))
        expect(calls.deletedKeys).toHaveLength(0)
    })

    it('UNIQUE VIOLATION + fila RANCIA → CAS-delete gana (1 fila, match por created_at) + INSERT final OK → true', async () => {
        const stale = new Date(Date.now() - (TTL_MINUTES + 5) * 60 * 1000).toISOString()
        const { db, calls } = makeClaimDb({
            inserts: [{ error: UNIQUE_VIOLATION }, { error: null }], // 1er reclamo choca, INSERT final OK
            existing: { data: { created_at: stale }, error: null },
            // casDelete default = 1 fila borrada (ganó el CAS).
        })
        expect(await claimUpgradeInFlight(db, COACH)).toBe(true)
        // Borró la fila rancia EXACTA (match por provider_event_id + created_at) y reinsertó.
        expect(calls.deletedKeys).toContain(upgradeInFlightKey(COACH))
        expect(calls.deletedCreatedAt).toContain(stale)
        expect(calls.inserted).toHaveLength(2)
    })

    // TOCTOU CLOSURE: dos requests concurrentes ven el MISMO marcador rancio. La 2ª hace el CAS-delete
    // y borra 0 filas (la 1ª ya tomó la fila por created_at) → DEBE ceder (false) y NO reinsertar.
    it('UNIQUE VIOLATION + rancia + CAS-delete borra 0 filas (otra request ya la tomó) → false, SIN INSERT final', async () => {
        const stale = new Date(Date.now() - (TTL_MINUTES + 5) * 60 * 1000).toISOString()
        const { db, calls } = makeClaimDb({
            inserts: [{ error: UNIQUE_VIOLATION }], // solo el 1er reclamo; el INSERT final NO se alcanza
            existing: { data: { created_at: stale }, error: null },
            casDelete: { data: [], error: null }, // 0 filas borradas → perdimos la carrera
        })
        expect(await claimUpgradeInFlight(db, COACH)).toBe(false)
        expect(calls.deletedKeys).toContain(upgradeInFlightKey(COACH))
        expect(calls.inserted).toHaveLength(1) // NO hubo reinsert
    })

    it('UNIQUE VIOLATION + rancia + CAS-delete gana pero INSERT final choca (racer metió fila fresca) → false', async () => {
        const stale = new Date(Date.now() - (TTL_MINUTES + 5) * 60 * 1000).toISOString()
        const { db, calls } = makeClaimDb({
            inserts: [{ error: UNIQUE_VIOLATION }, { error: UNIQUE_VIOLATION }], // reclamo + INSERT final chocan
            existing: { data: { created_at: stale }, error: null },
            // casDelete default = ganó el delete (1 fila), pero un racer reinsertó antes que nosotros.
        })
        expect(await claimUpgradeInFlight(db, COACH)).toBe(false)
        expect(calls.deletedKeys).toContain(upgradeInFlightKey(COACH))
        expect(calls.inserted).toHaveLength(2)
    })

    it('UNIQUE VIOLATION pero la fila ya desapareció (data null) → reintento de INSERT atómico (SIN delete) → true', async () => {
        const { db, calls } = makeClaimDb({
            inserts: [{ error: UNIQUE_VIOLATION }, { error: null }],
            existing: { data: null, error: null }, // otra request la limpió entre el conflicto y el select
        })
        expect(await claimUpgradeInFlight(db, COACH)).toBe(true)
        expect(calls.inserted).toHaveLength(2)
        // La ranura quedó libre: el reclamo es el propio INSERT, NO se borra nada (sin CAS-delete).
        expect(calls.deletedKeys).toHaveLength(0)
    })

    it('error NO-unique del primer INSERT → throw (fail-closed → 500 upstream)', async () => {
        const { db } = makeClaimDb({
            inserts: [{ error: { code: '42501', message: 'permission denied (RLS)' } }],
        })
        await expect(claimUpgradeInFlight(db, COACH)).rejects.toThrow(/claimUpgradeInFlight \(insert\)/)
        await expect(
            claimUpgradeInFlight(
                makeClaimDb({
                    inserts: [{ error: { code: '42501', message: 'permission denied (RLS)' } }],
                }).db,
                COACH
            )
        ).rejects.toThrow(/permission denied/)
    })

    it('detecta el UNIQUE por el nombre del constraint aunque .code venga vacío (defensa de robustez)', async () => {
        const fresh = new Date().toISOString()
        const { db } = makeClaimDb({
            inserts: [
                { error: { message: 'duplicate key value violates unique constraint "subscription_events_provider_event_id_key"' } },
            ],
            existing: { data: { created_at: fresh }, error: null },
        })
        // Sin .code, debe igual reconocerlo como colisión y resolver false (fila fresca), no throw.
        expect(await claimUpgradeInFlight(db, COACH)).toBe(false)
    })

    it('error NO-unique del SELECT del marcador existente → throw', async () => {
        const { db } = makeClaimDb({
            inserts: [{ error: UNIQUE_VIOLATION }],
            existing: { data: null, error: { code: 'XXXXX', message: 'select boom' } },
        })
        await expect(claimUpgradeInFlight(db, COACH)).rejects.toThrow(/claimUpgradeInFlight \(select\)/)
    })

    it('error NO-unique del INSERT final (tras ganar el CAS-delete) → throw', async () => {
        const stale = new Date(Date.now() - (TTL_MINUTES + 5) * 60 * 1000).toISOString()
        const { db } = makeClaimDb({
            inserts: [{ error: UNIQUE_VIOLATION }, { error: { code: '40001', message: 'serialization failure' } }],
            existing: { data: { created_at: stale }, error: null },
        })
        await expect(claimUpgradeInFlight(db, COACH)).rejects.toThrow(/claimUpgradeInFlight \(insert\)/)
    })

    it('error NO-unique del CAS-delete (tras detectar fila rancia) → throw', async () => {
        const stale = new Date(Date.now() - (TTL_MINUTES + 5) * 60 * 1000).toISOString()
        const { db } = makeClaimDb({
            inserts: [{ error: UNIQUE_VIOLATION }],
            existing: { data: { created_at: stale }, error: null },
            casDelete: { data: null, error: { code: 'XXXXX', message: 'cas delete boom' } },
        })
        await expect(claimUpgradeInFlight(db, COACH)).rejects.toThrow(/claimUpgradeInFlight \(cas-delete\)/)
    })
})
