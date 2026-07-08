// Logica PURA de entitlements de mobile (E0-C1). El modulo bajo test no importa
// react-native/expo (solo el TYPE de @eva/feature-prefs, borrado en runtime), asi que corre con
// el runner del repo aunque viva en apps/mobile. Vitest lo colecta por el glob `tests/**`.
import { describe, it, expect } from 'vitest'
import {
    DEFAULT_CONFIG,
    MODULE_KEYS,
    hasModuleIn,
    normalizeConfig,
    parseCachedConfig,
    resolveEffectiveModules,
    serializeConfig,
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
            flags: { executorV2: true, ruido: 'x' as unknown as boolean },
        })
        expect(cfg.enabledModules).toEqual(['cardio', 'body_composition'])
        expect(cfg.disabledModules).toEqual(['body_composition'])
        expect(cfg.featurePrefs.nutritionEnabled).toBe(false)
        // solo booleans sobreviven en flags (drift de tipos ignorado).
        expect(cfg.flags).toEqual({ executorV2: true })
    })

    it('null / undefined / no-objeto => DEFAULT_CONFIG (fail-safe)', () => {
        expect(normalizeConfig(null)).toEqual(DEFAULT_CONFIG)
        expect(normalizeConfig(undefined)).toEqual(DEFAULT_CONFIG)
    })

    it('nutritionEnabled: solo el false EXPLICITO oculta; ausente / no-bool => fail-open true', () => {
        expect(normalizeConfig({}).featurePrefs.nutritionEnabled).toBe(true)
        expect(normalizeConfig({ featurePrefs: null }).featurePrefs.nutritionEnabled).toBe(true)
        expect(normalizeConfig({ featurePrefs: { nutritionEnabled: 'no' as unknown as boolean } }).featurePrefs.nutritionEnabled).toBe(true)
        expect(normalizeConfig({ featurePrefs: { nutritionEnabled: false } }).featurePrefs.nutritionEnabled).toBe(false)
    })

    it('enabledModules ausente / no-array => []', () => {
        expect(normalizeConfig({ enabledModules: 'cardio' as unknown as string[] }).enabledModules).toEqual([])
        expect(normalizeConfig({}).enabledModules).toEqual([])
    })

    it('deduplica modulos repetidos en el payload', () => {
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

    it('el kill-switch (disabledModules) resta de enabled aunque venga habilitado', () => {
        const eff = resolveEffectiveModules(cfg(['cardio', 'body_composition'], ['body_composition']))
        expect([...eff]).toEqual(['cardio'])
    })

    it('config default: sin modulos', () => {
        expect(resolveEffectiveModules(DEFAULT_CONFIG).size).toBe(0)
    })
})

describe('entitlements-core: hasModuleIn', () => {
    it('true solo para modulos efectivos', () => {
        const cfg = normalizeConfig({ enabledModules: ['cardio'], disabledModules: [] })
        expect(hasModuleIn(cfg, 'cardio')).toBe(true)
        expect(hasModuleIn(cfg, 'nutrition_exchanges')).toBe(false)
    })

    it('un modulo killeado no cuenta como habilitado', () => {
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
            flags: { executorV2: true },
        })
        const parsed = parseCachedConfig(serializeConfig(original))
        expect(parsed).toEqual(original)
    })

    it('cache nula / corrupta => DEFAULT_CONFIG (nunca lanza)', () => {
        expect(parseCachedConfig(null)).toEqual(DEFAULT_CONFIG)
        expect(parseCachedConfig('')).toEqual(DEFAULT_CONFIG)
        expect(parseCachedConfig('{no es json')).toEqual(DEFAULT_CONFIG)
    })

    it('cache con forma vieja/parcial se re-normaliza (fail-open nutricion)', () => {
        const parsed = parseCachedConfig('{"enabledModules":["cardio"]}')
        expect(parsed.enabledModules).toEqual(['cardio'])
        expect(parsed.featurePrefs.nutritionEnabled).toBe(true)
        expect(parsed.flags).toEqual({})
    })
})
