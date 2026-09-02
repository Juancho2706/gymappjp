import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { fetchPublicCoachBranding, mapPublicCoachBranding, resolveEffectiveBrandColor } from './public-branding'
import { SYSTEM_PRIMARY_COLOR } from '@/lib/brand-assets'
import { getThemePreset } from '@eva/brand-kit'

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

/**
 * W1a — color EFECTIVO de las superficies públicas. El caso del owner (2026-09-02): `josefit`
 * tiene `primary_color = #F97316` (naranja libre LEGACY) y `theme_preset_key = sport-blue`; el
 * loader/manifest/splash pintaban el naranja porque leían la columna cruda.
 */
describe('resolveEffectiveBrandColor', () => {
    const SPORT_BLUE = getThemePreset('sport-blue')!.brandColor

    it('el preset curado PISA el primary_color crudo legacy (caso josefit)', () => {
        expect(
            resolveEffectiveBrandColor({
                primaryColor: '#F97316',
                themePresetKey: 'sport-blue',
                subscriptionTier: 'pro',
            }),
        ).toBe(SPORT_BLUE)
    })

    it('sin preset ⇒ passthrough del color libre (grandfather)', () => {
        expect(
            resolveEffectiveBrandColor({ primaryColor: '#F97316', themePresetKey: null, subscriptionTier: 'pro' }),
        ).toBe('#F97316')
    })

    it('key de preset desconocida ⇒ passthrough (no rompe el grandfather)', () => {
        expect(
            resolveEffectiveBrandColor({ primaryColor: '#F97316', themePresetKey: 'no-existe', subscriptionTier: 'free' }),
        ).toBe('#F97316')
    })

    it('marca gestionada (org/team) ⇒ el preset PERSONAL del coach no aplica', () => {
        expect(
            resolveEffectiveBrandColor({
                primaryColor: '#F97316',
                themePresetKey: 'sport-blue',
                subscriptionTier: 'pro',
                managed: true,
            }),
        ).toBe('#F97316')
    })

    it('free conserva su marca (Pricing v3: el white-label es de todos los planes)', () => {
        expect(
            resolveEffectiveBrandColor({ primaryColor: '#F97316', themePresetKey: 'sport-blue', subscriptionTier: 'free' }),
        ).toBe(SPORT_BLUE)
    })

    it('tier inválido/stale ⇒ fail-closed al azul de sistema', () => {
        expect(
            resolveEffectiveBrandColor({ primaryColor: '#F97316', themePresetKey: 'sport-blue', subscriptionTier: 'zzz' }),
        ).toBe(SYSTEM_PRIMARY_COLOR)
    })

    it('sin fila / sin color ⇒ azul de sistema', () => {
        expect(resolveEffectiveBrandColor(null)).toBe(SYSTEM_PRIMARY_COLOR)
        expect(resolveEffectiveBrandColor({ primaryColor: '   ', subscriptionTier: 'pro' })).toBe(SYSTEM_PRIMARY_COLOR)
    })
})
