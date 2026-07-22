import { describe, expect, it } from 'vitest'
import { getThemePreset, resolveBrandTheme } from '@eva/brand-kit'
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
  it('gatea un tier conocido sin white-label al color de sistema', () => {
    const fallback = resolveEffectiveCoachBrandTheme(null)
    const resolved = resolveEffectiveCoachBrandTheme({
      primaryColor: emberPreset.brandColor,
      subscriptionTier: 'starter',
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

  it('sanea logo, loader y colores crudos fuera de Pro sin perder la identidad del coach', () => {
    const effective = resolveEffectiveCoachBrandPresentation({
      coachId: 'coach-1',
      displayName: 'Marca demo',
      primaryColor: emberPreset.brandColor,
      subscriptionTier: 'starter',
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

  it('aplica overrides por modo solo con entitlement Pro+', () => {
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
    expect(applyEffectiveCoachBranding(lightTheme, effective).primary).toBe(expected.light.accent)
    expect(applyEffectiveCoachBranding(darkTheme, effective).primary).toBe(expected.dark.accent)
    expect(effectiveBrandVars(effective, 'light')['--color-primary']).not.toBe(
      effectiveBrandVars(resolveEffectiveCoachBrandTheme(null), 'light')['--color-primary'],
    )
  })
})

describe('paleta imperativa de AuraHero', () => {
  it('solo carbohidratos sigue la rampa sport white-label', () => {
    const base = resolveNutritionMacroColors(emberPreset.brandColor)
    const custom = resolveNutritionMacroColors(violetPreset.brandColor)

    expect(custom.protein).toBe(base.protein)
    expect(custom.fats).toBe(base.fats)
    expect(custom.carbs).not.toBe(base.carbs)
    expect(custom.carbs).toBe(resolveSportRamp(violetPreset.brandColor).sport500)
  })
})
