import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * W-brand B2/B4 (SPEC whitelabel-color-consolidation) — updateBrandSettingsAction:
 * las escrituras de brand_secondary_color / accent_light / accent_dark / loader_text_color
 * desde standalone se DESCARTAN (whitelist explícita, sin error), mientras identidad,
 * welcome y el resto del branding permitido siguen persistiendo igual.
 */

const { createClientMock, createServiceRoleClientMock, revalidatePathMock, redirectMock } = vi.hoisted(() => ({
    createClientMock: vi.fn(),
    createServiceRoleClientMock: vi.fn(),
    revalidatePathMock: vi.fn(),
    redirectMock: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({ createClient: createClientMock }))
vi.mock('@/lib/supabase/admin-client', () => ({ createServiceRoleClient: createServiceRoleClientMock }))
vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }))
vi.mock('next/navigation', () => ({ redirect: redirectMock }))
vi.mock('@/lib/payments/provider', () => ({ getPaymentsProviderForCoach: vi.fn() }))
vi.mock('@/services/client/client-deletion.service', () => ({ deleteClientHard: vi.fn() }))

import { updateBrandSettingsAction } from '@/app/coach/settings/_actions/settings.actions'

const COACH_ID = '44444444-4444-4444-4444-444444444444'

function makeSupabase(opts: { tier?: string } = {}) {
    const calls = { update: [] as Record<string, unknown>[] }
    const auth = {
        getUser: vi.fn(async () => ({ data: { user: { id: COACH_ID } } })),
    }
    const from = vi.fn((table: string) => {
        if (table !== 'coaches') throw new Error(`tabla inesperada ${table}`)
        return {
            select: () => ({
                eq: () => ({
                    single: async () => ({
                        data: {
                            welcome_modal_enabled: false,
                            welcome_modal_content: null,
                            welcome_modal_type: 'text',
                            welcome_modal_version: 0,
                            subscription_tier: opts.tier ?? 'pro',
                        },
                    }),
                }),
            }),
            update: (payload: Record<string, unknown>) => {
                calls.update.push(payload)
                return { eq: async () => ({ error: null }) }
            },
        }
    })
    const storage = { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: 'https://x/logo.png' } }) }) }
    return { auth, from, storage, _calls: calls }
}

function baseFormData(extra: Record<string, string> = {}) {
    const fd = new FormData()
    fd.set('full_name', 'Coach Prueba')
    fd.set('brand_name', 'Marca Prueba')
    fd.set('primary_color', '#E11D48')
    fd.set('welcome_message', 'Hola equipo')
    fd.set('loader_text', 'MARCA')
    fd.set('use_custom_loader', 'on')
    fd.set('loader_icon_mode', 'eva')
    fd.set('neutral_tint', 'on')
    fd.set('brand_font_key', 'sora')
    fd.set('loader_variant', 'radar')
    fd.set('welcome_modal_type', 'text')
    fd.set('executor_theme', 'coach')
    for (const [k, v] of Object.entries(extra)) fd.set(k, v)
    return fd
}

beforeEach(() => {
    createClientMock.mockReset()
    revalidatePathMock.mockReset()
})

describe('updateBrandSettingsAction — whitelist B2 (standalone)', () => {
    it('descarta brand_secondary_color / accent_* / loader_text_color aunque el POST los traiga', async () => {
        const sb = makeSupabase({ tier: 'pro' })
        createClientMock.mockResolvedValue(sb)

        const res = await updateBrandSettingsAction({}, baseFormData({
            // Campos muertos (form viejo o POST directo): deben descartarse SIN error.
            brand_secondary_color: '#00FF00',
            accent_light: '#111111',
            accent_dark: '#EEEEEE',
            loader_text_color: '#FF00FF',
        }))

        expect(res).toEqual({ success: true })
        expect(sb._calls.update).toHaveLength(1)
        const payload = sb._calls.update[0]
        // B2: las 4 columnas NO aparecen en el payload (ni siquiera como null —
        // los valores almacenados quedan intactos en DB, inertes por contrato).
        expect(payload).not.toHaveProperty('brand_secondary_color')
        expect(payload).not.toHaveProperty('accent_light')
        expect(payload).not.toHaveProperty('accent_dark')
        expect(payload).not.toHaveProperty('loader_text_color')
        // Identidad + welcome + branding permitido siguen intactos.
        expect(payload).toMatchObject({
            full_name: 'Coach Prueba',
            brand_name: 'Marca Prueba',
            welcome_message: 'Hola equipo',
            primary_color: '#E11D48',
            loader_text: 'MARCA',
            use_custom_loader: true,
            neutral_tint: true,
            brand_font_key: 'sora',
            loader_variant: 'radar',
        })
        expect(revalidatePathMock).toHaveBeenCalledWith('/coach/settings')
    })

    it('un hex BASURA en los campos muertos no bloquea el guardado (descarte, no error)', async () => {
        const sb = makeSupabase({ tier: 'pro' })
        createClientMock.mockResolvedValue(sb)

        const res = await updateBrandSettingsAction({}, baseFormData({
            brand_secondary_color: 'no-soy-un-hex',
            accent_light: '</style><script>',
            loader_text_color: 'zzz',
        }))

        expect(res).toEqual({ success: true })
        expect(sb._calls.update).toHaveLength(1)
        expect(sb._calls.update[0]).not.toHaveProperty('brand_secondary_color')
        expect(sb._calls.update[0]).not.toHaveProperty('loader_text_color')
    })

    // Pricing v3 (owner 2026-08-21): el white-label es de TODOS los planes vendidos ⇒ un free SÍ
    // persiste su branding visual (primary_color…), y la whitelist B2 sigue descartando los campos muertos.
    it('coach free (pricing v3): identidad, welcome Y branding visual persisten; los campos muertos B2 siguen fuera', async () => {
        const sb = makeSupabase({ tier: 'free' })
        createClientMock.mockResolvedValue(sb)

        const res = await updateBrandSettingsAction({}, baseFormData({ brand_secondary_color: '#00FF00' }))

        expect(res).toEqual({ success: true })
        const payload = sb._calls.update[0]
        expect(payload).toMatchObject({ full_name: 'Coach Prueba', brand_name: 'Marca Prueba', primary_color: '#E11D48' })
        expect(payload).not.toHaveProperty('brand_secondary_color')
        expect(payload).not.toHaveProperty('loader_text_color')
    })

    // El gate fail-closed sigue vivo para un tier fuera del catálogo (dato legacy en la fila).
    it('coach con tier fuera del catálogo (sin white-label): identidad y welcome persisten; nada de branding visual (gate intacto)', async () => {
        const sb = makeSupabase({ tier: 'legacy_unknown' })
        createClientMock.mockResolvedValue(sb)

        const res = await updateBrandSettingsAction({}, baseFormData({ brand_secondary_color: '#00FF00' }))

        expect(res).toEqual({ success: true })
        const payload = sb._calls.update[0]
        expect(payload).toMatchObject({ full_name: 'Coach Prueba', brand_name: 'Marca Prueba' })
        expect(payload).not.toHaveProperty('primary_color')
        expect(payload).not.toHaveProperty('brand_secondary_color')
        expect(payload).not.toHaveProperty('loader_text_color')
    })
})
