/**
 * SEC-01 fase 2 — `fetchBrandingByCoachIdentifier` (`apps/mobile/lib/branding.ts`) resuelve la
 * marca del coach por el RPC `get_coach_public_branding` en vez de leer `coaches` con la anon key.
 * Es el camino PRE-LOGIN («ingresá tu código»), el único que corre como `anon` en la app.
 *
 * GOTCHA de resolucion (mismo patron que coach-access.test.ts): los ids bare (async-storage)
 * resuelven DISTINTO desde `tests/` que desde `apps/mobile/`, asi que se mockean por PATH ABSOLUTO
 * tal como los ve apps/mobile (createRequire con `paths: [mobileDir]`) con `vi.doMock` + import()
 * dinamico.
 */
import path from 'node:path'
import { createRequire } from 'node:module'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const requireFromTest = createRequire(import.meta.url)
const mobileDir = path.resolve(__dirname, '..', '..', 'apps', 'mobile')
const mobileLib = (name: string) => path.resolve(mobileDir, 'lib', name)
const mobileDep = (spec: string) => requireFromTest.resolve(spec, { paths: [mobileDir] })

/** Fila que devuelve el RPC (jsonb con las columnas publicas de `coaches`). */
const ROW = {
    id: 'coach-1',
    slug: 'josefit',
    invite_code: 'AB3KP',
    brand_name: 'Josefit',
    primary_color: '#FF5500',
    logo_url: 'https://cdn/logo.png',
    logo_url_dark: null,
    welcome_message: 'Bienvenida',
    subscription_tier: 'pro',
    instagram_handle: 'josefit',
    login_layout_key: 'hero',
    neutral_tint: true,
    brand_font_key: 'inter',
    theme_preset_key: null,
    loader_variant: 'eva',
    loader_config: { kind: 'energia' },
    use_custom_loader: true,
    loader_text: 'JF',
    loader_icon_mode: 'coach',
    executor_theme: 'coach',
    // El RPC la devuelve; el camino anonimo debe IGNORARLA (es del panel propio del coach).
    use_brand_colors_coach: false,
}

async function setup(result: { data: unknown; error: unknown }) {
    const rpc = vi.fn(async () => result)

    vi.resetModules()
    vi.doMock(mobileDep('@react-native-async-storage/async-storage'), () => ({
        default: { getItem: vi.fn(async () => null), setItem: vi.fn(async () => {}), removeItem: vi.fn(async () => {}) },
    }))
    vi.doMock(mobileLib('supabase.ts'), () => ({ supabase: { rpc } }))

    const mod = (await import(mobileLib('branding.ts'))) as typeof import('../../apps/mobile/lib/branding')
    return { ...mod, rpc }
}

beforeEach(() => {
    vi.clearAllMocks()
})

describe('fetchBrandingByCoachIdentifier (RPC publico)', () => {
    it('manda el codigo NORMALIZADO al RPC y mapea el payload de marca', async () => {
        const { fetchBrandingByCoachIdentifier, rpc } = await setup({ data: ROW, error: null })

        const branding = await fetchBrandingByCoachIdentifier('ab3kp')

        expect(rpc).toHaveBeenCalledWith('get_coach_public_branding', { p_identifier: 'AB3KP' })
        expect(branding).toMatchObject({
            coachId: 'coach-1',
            coachSlug: 'josefit',
            displayName: 'Josefit',
            inviteCode: 'AB3KP',
            primaryColor: '#FF5500',
            logoUrl: 'https://cdn/logo.png',
            subscriptionTier: 'pro',
            instagramHandle: 'josefit',
            loginLayoutKey: 'hero',
            useCustomLoader: true,
            executorTheme: 'coach',
        })
        // `loader_config` viaja como string JSON (contrato del payload cacheado en el device).
        expect(branding?.loaderConfig).toBe(JSON.stringify(ROW.loader_config))
        // Preferencia del panel PROPIO del coach: el camino anonimo no la adopta.
        expect(branding?.useBrandColorsCoach).toBeNull()
    })

    it('un link/slug legacy usa el MISMO RPC (la bifurcacion vive en la funcion)', async () => {
        const { fetchBrandingByCoachIdentifier, rpc } = await setup({ data: ROW, error: null })

        await fetchBrandingByCoachIdentifier('https://www.eva-app.cl/c/JoseFit')

        expect(rpc).toHaveBeenCalledWith('get_coach_public_branding', { p_identifier: 'josefit' })
    })

    it('identificador invalido: ni siquiera consulta', async () => {
        const { fetchBrandingByCoachIdentifier, rpc } = await setup({ data: ROW, error: null })

        expect(await fetchBrandingByCoachIdentifier('??')).toBeNull()
        expect(rpc).not.toHaveBeenCalled()
    })

    it('coach inexistente ⇒ null (el RPC devuelve null)', async () => {
        const { fetchBrandingByCoachIdentifier } = await setup({ data: null, error: null })

        expect(await fetchBrandingByCoachIdentifier('ZZZZZ')).toBeNull()
    })

    it('error del RPC ⇒ CoachBrandingLookupError (la pantalla muestra fallo de red, no "no existe")', async () => {
        const { fetchBrandingByCoachIdentifier, CoachBrandingLookupError } = await setup({
            data: null,
            error: { message: 'network' },
        })

        await expect(fetchBrandingByCoachIdentifier('AB3KP')).rejects.toBeInstanceOf(CoachBrandingLookupError)
    })
})
