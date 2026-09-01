// Contrato de los 5 dominios de feature-prefs en el cliente mobile (Ola de orden W1.2).
// El modulo bajo test (`apps/mobile/lib/entitlements-core`) es PURO — no importa react-native /
// expo — asi que corre con el runner raiz del repo aunque viva en apps/mobile. `@eva/feature-prefs`
// ya esta aliasado en vitest.config.ts.
import { describe, expect, it } from 'vitest'
import { FEATURE_DOMAIN_KEYS, type FeatureDomain } from '@eva/feature-prefs'
import {
  DEFAULT_CONFIG,
  disabledDomainsFromFlags,
  isDomainEnabledIn,
  normalizeConfig,
  parseCachedConfigEnvelope,
  serializeConfigEnvelope,
} from '../apps/mobile/lib/entitlements-core'

const ALL_ON: Record<FeatureDomain, boolean> = {
  nutrition: true,
  training: true,
  cardio: true,
  movement: true,
  bodycomp: true,
}

describe('entitlements-core: contrato de forma', () => {
  it('DEFAULT_CONFIG.featurePrefs.domains tiene EXACTAMENTE las keys de FEATURE_DOMAIN_KEYS', () => {
    expect(Object.keys(DEFAULT_CONFIG.featurePrefs.domains).sort()).toEqual([...FEATURE_DOMAIN_KEYS].sort())
  })

  it('DEFAULT_CONFIG deja los 5 dominios prendidos (fail-open sin red ni cache)', () => {
    expect(DEFAULT_CONFIG.featurePrefs.domains).toEqual(ALL_ON)
    expect(DEFAULT_CONFIG.featurePrefs.nutritionEnabled).toBe(true)
  })

  it('DEFAULT_CONFIG no inventa un orden de barra (null = manda la especialidad)', () => {
    expect(DEFAULT_CONFIG.featurePrefs.navOrder).toBeNull()
  })
})

describe('entitlements-core: normalizeConfig -> domains', () => {
  it('payload CON domains se normaliza tal cual', () => {
    const cfg = normalizeConfig({
      featurePrefs: {
        domains: { nutrition: true, training: false, cardio: false, movement: true, bodycomp: false },
        nutritionEnabled: true,
      },
    })
    expect(cfg.featurePrefs.domains).toEqual({
      nutrition: true,
      training: false,
      cardio: false,
      movement: true,
      bodycomp: false,
    })
  })

  it('payload SIN domains y nutritionEnabled:false (servidor/binario viejo) => solo nutrition apagada', () => {
    const cfg = normalizeConfig({ featurePrefs: { nutritionEnabled: false } })
    expect(cfg.featurePrefs.domains).toEqual({ ...ALL_ON, nutrition: false })
    expect(cfg.featurePrefs.nutritionEnabled).toBe(false)
  })

  it('payload SIN domains y sin nutritionEnabled => los 5 prendidos', () => {
    expect(normalizeConfig({}).featurePrefs.domains).toEqual(ALL_ON)
    expect(normalizeConfig({ featurePrefs: null }).featurePrefs.domains).toEqual(ALL_ON)
  })

  it('SOLO el false explicito apaga: key ausente o valor no-bool => true (fail-open)', () => {
    const cfg = normalizeConfig({
      featurePrefs: {
        // `cardio` ausente; `training` con basura; `movement` con el string 'false'.
        domains: { nutrition: false, training: 0, movement: 'false', bodycomp: true },
      },
    })
    expect(cfg.featurePrefs.domains).toEqual({ ...ALL_ON, nutrition: false })
  })

  it('domains basura (no objeto) cae al fallback legacy', () => {
    expect(normalizeConfig({ featurePrefs: { domains: 'nope' } }).featurePrefs.domains).toEqual(ALL_ON)
    expect(
      normalizeConfig({ featurePrefs: { domains: 42, nutritionEnabled: false } }).featurePrefs.domains,
    ).toEqual({ ...ALL_ON, nutrition: false })
  })

  it('payload entero basura => DEFAULT_CONFIG', () => {
    expect(normalizeConfig(null)).toEqual(DEFAULT_CONFIG)
    expect(normalizeConfig(undefined)).toEqual(DEFAULT_CONFIG)
  })

  it('nutritionEnabled es SIEMPRE el espejo de domains.nutrition', () => {
    const cases = [
      {},
      { featurePrefs: { nutritionEnabled: false } },
      { featurePrefs: { domains: { nutrition: false } } },
      // El espejo legacy NUNCA gana sobre `domains`: si el servidor manda ambos, manda `domains`.
      { featurePrefs: { domains: { nutrition: true }, nutritionEnabled: false } },
      { featurePrefs: { domains: { nutrition: false }, nutritionEnabled: true } },
    ]
    for (const raw of cases) {
      const cfg = normalizeConfig(raw)
      expect(cfg.featurePrefs.nutritionEnabled).toBe(cfg.featurePrefs.domains.nutrition)
    }
  })
})

describe('entitlements-core: normalizeConfig -> navOrder', () => {
  const SAVED = ['cardio', 'nutrition', 'training', 'movement', 'bodycomp']

  it('el orden guardado por el coach viaja tal cual', () => {
    expect(normalizeConfig({ featurePrefs: { navOrder: SAVED } }).featurePrefs.navOrder).toEqual(SAVED)
  })

  it('sin navOrder (servidor viejo) => null: la barra cae en el orden de la especialidad', () => {
    expect(normalizeConfig({}).featurePrefs.navOrder).toBeNull()
    expect(normalizeConfig({ featurePrefs: {} }).featurePrefs.navOrder).toBeNull()
    expect(normalizeConfig({ featurePrefs: null }).featurePrefs.navOrder).toBeNull()
  })

  it('basura => null, nunca un orden a medias', () => {
    for (const navOrder of ['cardio', 42, {}, [], ['nope', 7], null]) {
      expect(normalizeConfig({ featurePrefs: { navOrder } }).featurePrefs.navOrder).toBeNull()
    }
  })

  it('un orden PARCIAL se completa con los dominios que falten (orden canonico)', () => {
    expect(normalizeConfig({ featurePrefs: { navOrder: ['bodycomp'] } }).featurePrefs.navOrder).toEqual([
      'bodycomp',
      'nutrition',
      'training',
      'cardio',
      'movement',
    ])
  })

  it('el orden NO decide visibilidad: convive con dominios apagados', () => {
    const cfg = normalizeConfig({
      featurePrefs: { navOrder: SAVED, domains: { cardio: false } },
    })
    expect(cfg.featurePrefs.navOrder).toEqual(SAVED)
    expect(cfg.featurePrefs.domains.cardio).toBe(false)
  })
})

describe('entitlements-core: isDomainEnabledIn / disabledDomainsFromFlags', () => {
  it('isDomainEnabledIn refleja el flag del dominio', () => {
    const cfg = normalizeConfig({ featurePrefs: { domains: { cardio: false } } })
    expect(isDomainEnabledIn(cfg, 'cardio')).toBe(false)
    expect(isDomainEnabledIn(cfg, 'training')).toBe(true)
  })

  it('disabledDomainsFromFlags devuelve SOLO los false', () => {
    expect(disabledDomainsFromFlags(ALL_ON)).toEqual(new Set())
    expect(disabledDomainsFromFlags({ ...ALL_ON, nutrition: false, movement: false })).toEqual(
      new Set(['nutrition', 'movement']),
    )
    expect(disabledDomainsFromFlags({ nutrition: false, training: false, cardio: false, movement: false, bodycomp: false })).toEqual(
      new Set([...FEATURE_DOMAIN_KEYS]),
    )
  })
})

describe('entitlements-core: cache', () => {
  it('el roundtrip del envelope conserva los 5 dominios', () => {
    const original = normalizeConfig({
      enabledModules: ['cardio'],
      featurePrefs: {
        domains: { nutrition: false, training: true, cardio: false, movement: true, bodycomp: true },
      },
    })
    const now = 1_700_000_000_000
    const parsed = parseCachedConfigEnvelope(serializeConfigEnvelope(original, now), now + 1000)
    expect(parsed.featurePrefs.domains).toEqual(original.featurePrefs.domains)
    expect(parsed.featurePrefs.nutritionEnabled).toBe(false)
  })

  it('el roundtrip conserva el orden de la barra', () => {
    const now = 1_700_000_000_000
    const original = normalizeConfig({
      featurePrefs: { navOrder: ['movement', 'cardio', 'nutrition', 'training', 'bodycomp'] },
    })
    const parsed = parseCachedConfigEnvelope(serializeConfigEnvelope(original, now), now + 1000)
    expect(parsed.featurePrefs.navOrder).toEqual(original.featurePrefs.navOrder)
  })

  it('cache con la forma VIEJA (sin domains) se re-normaliza fail-open', () => {
    const now = 1_700_000_000_000
    const raw = JSON.stringify({ fetchedAt: now, config: { featurePrefs: { nutritionEnabled: false } } })
    expect(parseCachedConfigEnvelope(raw, now).featurePrefs.domains).toEqual({ ...ALL_ON, nutrition: false })
  })
})
