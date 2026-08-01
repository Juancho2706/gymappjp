// Lógica PURA de entitlements de mobile (E0-C1). El módulo bajo test no importa
// react-native/expo, así que corre con el runner del repo aunque viva en apps/mobile.
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CONFIG,
  MODULE_KEYS,
  STUDENT_ACCESS_CACHE_TTL_MS,
  hasModuleIn,
  normalizeConfig,
  parseCachedConfig,
  parseCachedConfigEnvelope,
  resolveEffectiveModules,
  serializeConfig,
  serializeConfigEnvelope,
  type MobileConfig,
} from '../../apps/mobile/lib/entitlements-core'

describe('entitlements-core: MODULE_KEYS', () => {
  it('espeja las 4 module keys de la web (fuente de verdad entitlements.service)', () => {
    expect([...MODULE_KEYS]).toEqual([
      'cardio',
      'movement_assessment',
      'body_composition',
      'nutrition_exchanges',
    ])
  })
})

describe('entitlements-core: normalizeConfig', () => {
  it('payload completo se normaliza tal cual (filtrando keys desconocidas)', () => {
    const cfg = normalizeConfig({
      enabledModules: ['cardio', 'body_composition', 'no_existe'],
      disabledModules: ['body_composition'],
      featurePrefs: { nutritionEnabled: false },
      featurePrefsEnabled: true,
    })
    expect(cfg.enabledModules).toEqual(['cardio', 'body_composition'])
    expect(cfg.disabledModules).toEqual(['body_composition'])
    expect(cfg.featurePrefs.nutritionEnabled).toBe(false)
  })

  it('null / undefined / no-objeto => DEFAULT_CONFIG (fail-safe)', () => {
    expect(normalizeConfig(null)).toEqual(DEFAULT_CONFIG)
    expect(normalizeConfig(undefined)).toEqual(DEFAULT_CONFIG)
  })

  it('nutritionEnabled: solo el false EXPLÍCITO oculta; ausente / no-bool => fail-open true', () => {
    expect(normalizeConfig({}).featurePrefs.nutritionEnabled).toBe(true)
    expect(normalizeConfig({ featurePrefs: null }).featurePrefs.nutritionEnabled).toBe(true)
    expect(normalizeConfig({ featurePrefs: { nutritionEnabled: 'no' as unknown as boolean } }).featurePrefs.nutritionEnabled).toBe(true)
    expect(normalizeConfig({ featurePrefs: { nutritionEnabled: false } }).featurePrefs.nutritionEnabled).toBe(false)
  })

  it('enabledModules ausente / no-array => []', () => {
    expect(normalizeConfig({ enabledModules: 'cardio' as unknown as string[] }).enabledModules).toEqual([])
    expect(normalizeConfig({}).enabledModules).toEqual([])
  })

  it('deduplica módulos repetidos en el payload', () => {
    expect(normalizeConfig({ enabledModules: ['cardio', 'cardio'] }).enabledModules).toEqual(['cardio'])
  })
})

describe('entitlements-core: resolveEffectiveModules (merge kill-switch)', () => {
  const cfg = (enabled: string[], disabled: string[] = []): MobileConfig =>
    normalizeConfig({ enabledModules: enabled, disabledModules: disabled })

  it('sin kill-switch: efectivos = enabled', () => {
    const eff = resolveEffectiveModules(cfg(['cardio', 'movement_assessment']))
    expect([...eff].sort()).toEqual(['cardio', 'movement_assessment'])
  })

  it('el kill-switch resta de enabled aunque venga habilitado', () => {
    const eff = resolveEffectiveModules(cfg(['cardio', 'body_composition'], ['body_composition']))
    expect([...eff]).toEqual(['cardio'])
  })

  it('config default: sin módulos', () => {
    expect(resolveEffectiveModules(DEFAULT_CONFIG).size).toBe(0)
  })
})

describe('entitlements-core: hasModuleIn', () => {
  it('true solo para módulos efectivos', () => {
    const cfg = normalizeConfig({ enabledModules: ['cardio'], disabledModules: [] })
    expect(hasModuleIn(cfg, 'cardio')).toBe(true)
    expect(hasModuleIn(cfg, 'nutrition_exchanges')).toBe(false)
  })

  it('un módulo killeado no cuenta como habilitado', () => {
    const cfg = normalizeConfig({ enabledModules: ['cardio'], disabledModules: ['cardio'] })
    expect(hasModuleIn(cfg, 'cardio')).toBe(false)
  })
})

describe('entitlements-core: cache serialize/parse', () => {
  it('roundtrip preserva la config', () => {
    const original = normalizeConfig({
      enabledModules: ['cardio', 'nutrition_exchanges'],
      disabledModules: ['cardio'],
      featurePrefs: { nutritionEnabled: false },
      studentAccess: { state: 'grace', graceEndsAt: '2026-08-01T00:00:00.000Z' },
    })
    const parsed = parseCachedConfig(serializeConfig(original))
    expect(parsed).toEqual(original)
  })

  it('cache nula / corrupta => DEFAULT_CONFIG (nunca lanza)', () => {
    expect(parseCachedConfig(null)).toEqual(DEFAULT_CONFIG)
    expect(parseCachedConfig('')).toEqual(DEFAULT_CONFIG)
    expect(parseCachedConfig('{no es json')).toEqual(DEFAULT_CONFIG)
  })

  it('cache con forma vieja/parcial se re-normaliza (fail-open nutrición)', () => {
    const parsed = parseCachedConfig('{"enabledModules":["cardio"]}')
    expect(parsed.enabledModules).toEqual(['cardio'])
    expect(parsed.featurePrefs.nutritionEnabled).toBe(true)
    expect(parsed.studentAccess).toEqual({ state: 'active', graceEndsAt: null })
  })
})

describe('entitlements-core: TTL de studentAccess', () => {
  const now = 1_000_000_000_000
  const cfg = normalizeConfig({
    enabledModules: ['cardio'],
    studentAccess: { state: 'blocked', graceEndsAt: null },
  })

  it('envelope fresco preserva el estado informativo de acceso', () => {
    const raw = serializeConfigEnvelope(cfg, now)
    const parsed = parseCachedConfigEnvelope(raw, now + STUDENT_ACCESS_CACHE_TTL_MS - 1)
    expect(parsed.studentAccess).toEqual({ state: 'blocked', graceEndsAt: null })
    expect(parsed.enabledModules).toEqual(['cardio'])
  })

  it('envelope vencido reinicia solo studentAccess y conserva módulos', () => {
    const raw = serializeConfigEnvelope(cfg, now)
    const parsed = parseCachedConfigEnvelope(raw, now + STUDENT_ACCESS_CACHE_TTL_MS + 1)
    expect(parsed.studentAccess).toEqual({ state: 'active', graceEndsAt: null })
    expect(parsed.enabledModules).toEqual(['cardio'])
  })

  it('formato viejo sin timestamp reinicia el estado de acceso por no poder fecharlo', () => {
    const legacy = serializeConfig(cfg)
    const parsed = parseCachedConfigEnvelope(legacy, now)
    expect(parsed.studentAccess).toEqual({ state: 'active', graceEndsAt: null })
    expect(parsed.enabledModules).toEqual(['cardio'])
  })

  it('cache nula / corrupta => DEFAULT_CONFIG (nunca lanza)', () => {
    expect(parseCachedConfigEnvelope(null, now)).toEqual(DEFAULT_CONFIG)
    expect(parseCachedConfigEnvelope('', now)).toEqual(DEFAULT_CONFIG)
    expect(parseCachedConfigEnvelope('{no es json', now)).toEqual(DEFAULT_CONFIG)
  })
})
