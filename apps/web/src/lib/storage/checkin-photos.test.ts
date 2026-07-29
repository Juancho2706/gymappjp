import { describe, expect, it } from 'vitest'
import { resolveCheckinPhotoUrls, toCheckinPath } from './checkin-photos'

/**
 * Poda 2026-07-29: `resolveCheckinPhotoUrls` acepta `{ fullPhotoRows, tailFields }` para NO
 * firmar los 3 campos de foto de TODAS las filas (un alumno con 2 años de check-ins semanales
 * pagaba ~300 signatures por carga de ficha para mostrar 3 miniaturas). Estos tests fijan el
 * contrato: cuántas URLs se piden y qué campos quedan poblados.
 *
 * OJO: `signPaths` mantiene un cache de módulo por path => cada test usa paths ÚNICOS.
 */

type FakeAdmin = {
    calls: string[][]
    storage: { from: (bucket: string) => { createSignedUrls: (paths: string[], ttl: number) => Promise<{ data: { path: string; signedUrl: string }[] }> } }
}

function fakeAdmin(): FakeAdmin {
    const calls: string[][] = []
    return {
        calls,
        storage: {
            from: () => ({
                createSignedUrls: async (paths: string[]) => {
                    calls.push([...paths])
                    return { data: paths.map((p) => ({ path: p, signedUrl: `https://signed/${p}?t=1` })) }
                },
            }),
        },
    }
}

function row(tag: string) {
    return {
        id: tag,
        front_photo_url: `${tag}/front.jpg`,
        back_photo_url: `${tag}/back.jpg`,
        side_photo_url: `${tag}/side.jpg`,
    }
}

const asDb = (a: FakeAdmin) => a as unknown as Parameters<typeof resolveCheckinPhotoUrls>[0]

describe('resolveCheckinPhotoUrls', () => {
    it('sin opciones firma los 3 campos de todas las filas (comportamiento historico)', async () => {
        const admin = fakeAdmin()
        const out = await resolveCheckinPhotoUrls(asDb(admin), [row('h1'), row('h2')])

        expect(admin.calls[0]).toHaveLength(6)
        expect(out[0]!.front_photo_url).toBe('https://signed/h1/front.jpg?t=1')
        expect(out[1]!.side_photo_url).toBe('https://signed/h2/side.jpg?t=1')
    })

    it('acota a front_photo_url fuera de las primeras N filas con foto', async () => {
        const admin = fakeAdmin()
        const rows = [row('s1'), row('s2'), row('s3'), row('s4'), row('s5')]

        const out = await resolveCheckinPhotoUrls(asDb(admin), rows, {
            fullPhotoRows: 2,
            tailFields: ['front_photo_url'],
        })

        // 2 filas x 3 campos + 3 filas x 1 campo = 9 (antes: 15).
        expect(admin.calls[0]).toHaveLength(9)

        // Las 2 primeras conservan los 3 campos (la UI usa front||side||back ahi).
        expect(out[1]!.back_photo_url).toBe('https://signed/s2/back.jpg?t=1')
        expect(out[1]!.side_photo_url).toBe('https://signed/s2/side.jpg?t=1')

        // El resto solo front (comparativa / historial / dossier PDF); back y side en null.
        expect(out[4]!.front_photo_url).toBe('https://signed/s5/front.jpg?t=1')
        expect(out[4]!.back_photo_url).toBeNull()
        expect(out[4]!.side_photo_url).toBeNull()
    })

    it('cuenta filas CON foto, no indices: las filas sin foto no consumen el cupo', async () => {
        const admin = fakeAdmin()
        const rows = [
            { id: 'g0', front_photo_url: null, back_photo_url: null, side_photo_url: null },
            { id: 'g1', front_photo_url: null, back_photo_url: null, side_photo_url: `g1/side.jpg` },
            row('g2'),
        ]

        const out = await resolveCheckinPhotoUrls(asDb(admin), rows, {
            fullPhotoRows: 1,
            tailFields: ['front_photo_url'],
        })

        // g1 es la 1ra fila CON foto => entra al cupo completo y su `side` se firma
        // (si el cupo se contara por indice, g1 caeria al tail y "Evolucion visual" la perderia).
        expect(out[1]!.side_photo_url).toBe('https://signed/g1/side.jpg?t=1')
        expect(out[2]!.front_photo_url).toBe('https://signed/g2/front.jpg?t=1')
        expect(out[2]!.side_photo_url).toBeNull()
    })

    it('no llama a storage cuando ninguna fila tiene path firmable', async () => {
        const admin = fakeAdmin()
        const rows = [{ id: 'n1', front_photo_url: null, back_photo_url: null, side_photo_url: null }]

        const out = await resolveCheckinPhotoUrls(asDb(admin), rows, { fullPhotoRows: 3 })

        expect(admin.calls).toHaveLength(0)
        expect(out).toEqual(rows)
    })
})

describe('toCheckinPath', () => {
    it('normaliza URL publica legacy a path del bucket', () => {
        expect(
            toCheckinPath('https://x.supabase.co/storage/v1/object/public/checkins/c/1/front.jpg?x=1')
        ).toBe('c/1/front.jpg')
    })

    it('descarta URLs externas no firmables y vacios', () => {
        expect(toCheckinPath('https://cdn.otro.com/a.jpg')).toBeNull()
        expect(toCheckinPath('')).toBeNull()
        expect(toCheckinPath(null)).toBeNull()
    })
})
