import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { fetchPublicCoachBranding, mapPublicCoachBranding } from './public-branding'

/**
 * SEC-01 fase 2 — el branding público anónimo pasa por el RPC `get_coach_public_branding`.
 * Lo que se fija acá: el identificador viaja CRUDO (la bifurcación código/slug la resuelve el
 * RPC) y el `{ data, error }` conserva la semántica del `.maybeSingle()` que reemplazó.
 */

const ROW = {
    id: 'coach-1',
    slug: 'josefit',
    invite_code: 'AB3KP',
    brand_name: 'Josefit',
    primary_color: '#1462DC',
    logo_url: null,
    subscription_tier: 'pro',
}

function clientWith(result: { data: unknown; error: unknown }) {
    const rpc = vi.fn(async () => result)
    return { client: { rpc } as unknown as SupabaseClient<Database>, rpc }
}

describe('mapPublicCoachBranding', () => {
    it('devuelve la fila cuando el jsonb es un objeto', () => {
        expect(mapPublicCoachBranding(ROW)).toEqual(ROW)
    })

    it('null cuando el coach no existe (el RPC devuelve null)', () => {
        expect(mapPublicCoachBranding(null)).toBeNull()
    })

    it('null ante un payload que no es una fila', () => {
        expect(mapPublicCoachBranding([ROW])).toBeNull()
        expect(mapPublicCoachBranding('josefit')).toBeNull()
        expect(mapPublicCoachBranding(undefined)).toBeNull()
    })
})

describe('fetchPublicCoachBranding', () => {
    it('llama al RPC con el identificador crudo y mapea la fila', async () => {
        const { client, rpc } = clientWith({ data: ROW, error: null })

        const res = await fetchPublicCoachBranding(client, 'AB3KP')

        expect(rpc).toHaveBeenCalledWith('get_coach_public_branding', { p_identifier: 'AB3KP' })
        expect(res).toEqual({ data: ROW, error: null })
    })

    it('el slug legacy usa el MISMO RPC (la bifurcación vive en la función)', async () => {
        const { client, rpc } = clientWith({ data: ROW, error: null })

        await fetchPublicCoachBranding(client, 'josefit')

        expect(rpc).toHaveBeenCalledWith('get_coach_public_branding', { p_identifier: 'josefit' })
    })

    it('coach inexistente ⇒ data null sin error (igual que maybeSingle con cero filas)', async () => {
        const { client } = clientWith({ data: null, error: null })

        expect(await fetchPublicCoachBranding(client, 'ZZZZZ')).toEqual({ data: null, error: null })
    })

    it('error de la DB ⇒ se propaga en `error` con data null (el caller decide degradar)', async () => {
        const error = { message: 'permission denied', code: '42501' }
        const { client } = clientWith({ data: null, error })

        expect(await fetchPublicCoachBranding(client, 'josefit')).toEqual({ data: null, error })
    })
})
