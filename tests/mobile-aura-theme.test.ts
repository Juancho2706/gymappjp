import { describe, expect, it } from 'vitest'
import { getThemePreset, resolveBrandTheme, sealPair } from '@eva/brand-kit'
import {
  applyEffectiveCoachBranding,
  darkTheme,
  effectiveBrandVars,
  lightTheme,
  resolveEffectiveCoachBrandTheme,
  resolveEffectiveCoachBrandPresentation,
  resolveNutritionMacroColors,
  resolveSportRamp,
} from '../apps/mobile/lib/theme'

const emberPreset = getThemePreset('ember')
const aquaPreset = getThemePreset('aqua')
const violetPreset = getThemePreset('violet')

if (!emberPreset || !aquaPreset || !violetPreset) {
  throw new Error('Los presets requeridos por la prueba deben existir')
}

describe('branding efectivo del tema mobile', () => {
  it('gatea un tier fuera del catálogo al color de sistema', () => {
    const fallback = resolveEffectiveCoachBrandTheme(null)
    const resolved = resolveEffectiveCoachBrandTheme({
      primaryColor: emberPreset.brandColor,
      subscriptionTier: 'legacy_unknown',
      themePresetKey: 'violet',
      accentLight: aquaPreset.brandColor,
    })

    expect(resolved).toEqual(fallback)
    expect(
      resolveEffectiveCoachBrandTheme({
        primaryColor: emberPreset.brandColor,
        subscriptionTier: null,
      }),
    ).toEqual(fallback)
  })

  it('resuelve preset y overrides antes de derivar el tema para Pro+', () => {
    const resolved = resolveEffectiveCoachBrandTheme({
      primaryColor: emberPreset.brandColor,
      subscriptionTier: 'pro',
      themePresetKey: 'violet',
    })

    expect(resolved.brandColor).toBe(violetPreset.brandColor)
    expect(resolved.accentLight).toBe(violetPreset.accentLight ?? null)
    expect(resolved.accentDark).toBe(violetPreset.accentDark ?? null)
  })

  it('falla cerrado con payloads legacy sin tier', () => {
    const fallback = resolveEffectiveCoachBrandTheme(null)
    const effective = resolveEffectiveCoachBrandTheme({
      primaryColor: emberPreset.brandColor,
      accentLight: aquaPreset.brandColor,
      accentDark: violetPreset.brandColor,
    })

    expect(effective).toEqual(fallback)
  })

  it('sanea logo, loader y colores crudos con un tier fuera del catálogo sin perder la identidad del coach', () => {
    const effective = resolveEffectiveCoachBrandPresentation({
      coachId: 'coach-1',
      displayName: 'Marca demo',
      primaryColor: emberPreset.brandColor,
      subscriptionTier: 'legacy_unknown',
      logoUrl: 'https://example.com/logo.png',
      useCustomLoader: true,
      loaderText: 'Cargando marca',
      loaderIconMode: 'coach',
    })

    expect(effective).toMatchObject({
      coachId: 'coach-1',
      displayName: 'Marca demo',
      primaryColor: resolveEffectiveCoachBrandTheme(null).brandColor,
      logoUrl: null,
      useCustomLoader: false,
      loaderText: null,
      loaderIconMode: 'eva',
    })
  })

  it('materializa el color del preset Pro para consumidores visuales legados', () => {
    const effective = resolveEffectiveCoachBrandPresentation({
      primaryColor: emberPreset.brandColor,
      subscriptionTier: 'pro',
      themePresetKey: 'violet',
      logoUrl: 'https://example.com/logo.png',
    })

    expect(effective?.primaryColor).toBe(violetPreset.brandColor)
    expect(effective?.logoUrl).toBe('https://example.com/logo.png')
  })

  // W-brand B2 (dueño 2026-08-17): los acentos por modo ALMACENADOS dejaron de resolverse
  // para standalone — el acento sale siempre del primario clampeado (o del preset).
  it('B2: los acentos almacenados ya no aplican — el tema sale del primario clampeado', () => {
    const effective = resolveEffectiveCoachBrandTheme({
      primaryColor: emberPreset.brandColor,
      subscriptionTier: 'pro',
      accentLight: aquaPreset.brandColor,
      accentDark: violetPreset.brandColor,
    })
    const expected = resolveBrandTheme({
      brandColor: effective.brandColor,
      accentLight: effective.accentLight,
      accentDark: effective.accentDark,
      secondaryLight: effective.secondaryColor,
      secondaryDark: effective.secondaryColor,
      neutralTint: effective.neutralTint,
    })

    expect(effective.brandColor).toBe(emberPreset.brandColor)
    expect(effective.accentLight).toBeNull()
    expect(effective.accentDark).toBeNull()
    expect(applyEffectiveCoachBranding(lightTheme, effective).primary).toBe(expected.light.accent)
    expect(applyEffectiveCoachBranding(darkTheme, effective).primary).toBe(expected.dark.accent)
    expect(effectiveBrandVars(effective, 'light')['--color-primary']).not.toBe(
      effectiveBrandVars(resolveEffectiveCoachBrandTheme(null), 'light')['--color-primary'],
    )
  })

  // Golden B2: legacy custom con secundario almacenado ≠ derivado ⇒ gana el DERIVADO (sealPair).
  it('B2: legacy custom deriva el par vía sealPair e ignora secundario/acentos almacenados', () => {
    const effective = resolveEffectiveCoachBrandTheme({
      primaryColor: '#E11D48',
      subscriptionTier: 'pro',
      themePresetKey: null,
      brandSecondaryColor: '#123456', // almacenado — NO debe salir jamás
      accentLight: '#654321',
      accentDark: '#ABCDEF',
    })

    expect(effective.brandColor).toBe('#E11D48') // grandfather: conserva SU primario tal cual
    // Golden de la fórmula D3.2 (mismo caso del contrato cruzado tests/brand-seal-pair.test.ts).
    expect(effective.secondaryColor).toBe('#df9866')
    expect(effective.secondaryColor).toBe(
      sealPair({ brandColor: '#E11D48', themePresetKey: null }).secondary,
    )
    expect(effective.secondaryColor).not.toBe('#123456')
    expect(effective.accentLight).toBeNull()
    expect(effective.accentDark).toBeNull()
  })

  // B2: con preset NADA cambia — par curado del catálogo (snapshot del contrato previo).
  it('B2: con preset aplicado sale el par curado del catálogo, no el derivado', () => {
    const effective = resolveEffectiveCoachBrandTheme({
      primaryColor: '#E11D48',
      subscriptionTier: 'pro',
      themePresetKey: 'violet',
      brandSecondaryColor: '#123456',
    })

    expect(effective.brandColor).toBe(violetPreset.brandColor)
    expect(effective.secondaryColor).toBe(violetPreset.secondaryColor)
    expect(effective.accentLight).toBe(violetPreset.accentLight ?? null)
    expect(effective.accentDark).toBe(violetPreset.accentDark ?? null)
  })

  // B2: el fail-closed también tiene su par (cada tema tiene par — derivado del azul de sistema).
  it('B2: el tema de sistema deriva su propio par', () => {
    const fallback = resolveEffectiveCoachBrandTheme(null)
    expect(fallback.secondaryColor).toBe(
      sealPair({ brandColor: fallback.brandColor, themePresetKey: null }).secondary,
    )
  })
})

describe('paleta imperativa de AuraHero', () => {
  // T2.7 F1: trio FIJO — ningun macro sigue la marca (antes carbos montaba la rampa sport).
  it('los macros son el trio fijo canonico y no dependen de ninguna marca', () => {
    const colors = resolveNutritionMacroColors()
    expect(colors).toEqual({ protein: '#5E9FD6', carbs: '#FFB74D', fats: '#81C784' })
    // Tres hues distintos (data-viz categorical) y ninguno igual al sport de una marca custom.
    expect(new Set(Object.values(colors)).size).toBe(3)
    expect(Object.values(colors)).not.toContain(resolveSportRamp(violetPreset.brandColor).sport500)
  })
})
