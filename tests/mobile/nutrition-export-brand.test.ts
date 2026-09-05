// Marca del PDF de nutrición en RN bajo Pricing v3 (docs/specs/pricing-v3, owner 2026-08-21).
//
// Lo que fija este test: el white-label del export dejó de ser un privilegio de Pro. Un coach FREE
// exporta con SU marca (nombre + color + logo) y encima lleva el sello «Hecho con EVA»; Pro exporta
// con su marca y SIN sello (ese es el gancho que se paga); un tier corrupto cae a EVA CON sello
// (isBrandingAllowed es fail-closed, showsEvaBadge es fail-OPEN — direcciones opuestas a propósito).
//
// `nutrition-day-export` importa expo-print/expo-sharing en el tope solo para el efecto de
// impresión+share; el resolutor de marca es puro. Se mockean para que el módulo cargue en jsdom
// (sin el mock, expo-print arrastra `react-native/index.js`, que usa `import typeof` de Flow y
// rollup no parsea).
//
// GOTCHA pnpm: los paquetes expo NO están hoisteados a la raíz — viven en
// `apps/mobile/node_modules`. `vi.mock('expo-print')` resuelve relativo al ARCHIVO DE TEST y no
// encuentra nada, así que el mock se registra bajo otro id y el módulo real se carga igual. Hay
// que apuntar al path del paquete para que el id resuelto coincida con el del importador.
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../apps/mobile/node_modules/expo-print', () => ({ printToFileAsync: vi.fn() }))
vi.mock('../../apps/mobile/node_modules/expo-sharing', () => ({
  isAvailableAsync: vi.fn(async () => false),
  shareAsync: vi.fn(),
}))

const { EVA_EXPORT_BRAND, resolveNutritionExportBrand } = await import(
  '../../apps/mobile/lib/nutrition-day-export'
)

const source = (subscriptionTier: string | null) => ({
  displayName: 'Movida Fit',
  primaryColor: '#EC4899',
  logoUrl: 'https://cdn.example/logo.png',
  subscriptionTier,
})

describe('resolveNutritionExportBrand (Pricing v3)', () => {
  it('free ⇒ marca PROPIA del coach + sello «Hecho con EVA»', () => {
    const brand = resolveNutritionExportBrand(source('free'))
    expect(brand.brandName).toBe('Movida Fit')
    expect(brand.primaryColor).toBe('#EC4899')
    expect(brand.logoUrl).toBe('https://cdn.example/logo.png')
    expect(brand.poweredByEva).toBe(false)
    expect(brand.showsEvaBadge).toBe(true)
  })

  it('pro ⇒ marca propia SIN sello (el gancho que se paga)', () => {
    const brand = resolveNutritionExportBrand(source('pro'))
    expect(brand.brandName).toBe('Movida Fit')
    expect(brand.poweredByEva).toBe(false)
    expect(brand.showsEvaBadge).toBe(false)
  })

  it('elite ⇒ marca propia SIN sello', () => {
    expect(resolveNutritionExportBrand(source('elite')).showsEvaBadge).toBe(false)
  })

  it('tier inválido ⇒ EVA exacto CON sello (fail-closed de marca + fail-open de sello)', () => {
    const brand = resolveNutritionExportBrand(source('tier-corrupto'))
    expect(brand).toEqual(EVA_EXPORT_BRAND)
    expect(brand.poweredByEva).toBe(true)
    expect(brand.showsEvaBadge).toBe(true)
  })

  it('tier fuera del catálogo (dato legacy, sin white-label) ⇒ EVA exacto CON sello', () => {
    const brand = resolveNutritionExportBrand(source('legacy_unknown'))
    expect(brand).toEqual(EVA_EXPORT_BRAND)
    expect(brand.showsEvaBadge).toBe(true)
  })

  it('sin fuente o sin nombre de marca ⇒ EVA exacto (nunca un PDF "a medias")', () => {
    expect(resolveNutritionExportBrand(null)).toEqual(EVA_EXPORT_BRAND)
    expect(resolveNutritionExportBrand({ ...source('pro'), displayName: '   ' })).toEqual(EVA_EXPORT_BRAND)
  })

  it('el default EVA firma siempre: es la única atribución cuando no hay marca de coach', () => {
    expect(EVA_EXPORT_BRAND.showsEvaBadge).toBe(true)
  })
})
