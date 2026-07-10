/**
 * entitlements-core — logica PURA de entitlements de mobile (E0-C1). CERO react-native / expo /
 * supabase: normaliza y valida el payload de /api/mobile/config, re-aplica el kill-switch de
 * operador (defensa en profundidad) y (de)serializa la cache. La glue de red/AsyncStorage/hook
 * vive en `entitlements.ts`; aca solo va lo testeable con el runner del repo (vitest).
 *
 * El TYPE `ModuleKey` se importa de @eva/feature-prefs (paquete puro, cuyo test lo cruza contra
 * `MODULE_KEYS` de la app => sin drift). El ARRAY runtime se declara local porque el paquete
 * solo exporta el type.
 */
import type { ModuleKey, NutritionSectionKey } from '@eva/feature-prefs'

export type { ModuleKey, NutritionSectionKey }

/** Espejo runtime de MODULE_KEYS (fuente de verdad: entitlements.service.ts de la web). */
export const MODULE_KEYS: readonly ModuleKey[] = [
    'cardio',
    'movement_assessment',
    'body_composition',
    'nutrition_exchanges',
] as const

export interface MobileFeaturePrefs {
    /** Master switch del dominio Nutricion (gate del tab del alumno). Fail-open => true. */
    nutritionEnabled: boolean
    /**
     * Visibilidad por seccion del dominio Nutricion (espejo de `sectionFlags` de web). Fail-OPEN:
     * key ausente / `true` => visible; solo `false` explicito oculta. Solo se guardan las keys
     * booleanas del payload (el resto queda ausente = visible).
     */
    nutritionSections: Partial<Record<NutritionSectionKey, boolean>>
}

export type RemoteFlagsPayload = Record<string, boolean>

/** Forma CRUDA del payload de /api/mobile/config (campos opcionales por version/db-compat). */
export interface RawMobileConfig {
    enabledModules?: unknown
    disabledModules?: unknown
    featurePrefs?: { nutritionEnabled?: unknown; sections?: unknown } | null
    featurePrefsEnabled?: unknown
    flags?: unknown
}

/** Config NORMALIZADA que consume la app (tipos garantizados). */
export interface MobileConfig {
    enabledModules: ModuleKey[]
    disabledModules: ModuleKey[]
    featurePrefs: MobileFeaturePrefs
    flags: RemoteFlagsPayload
}

/** Config por defecto fail-safe (sin red / sin cache): 0 modulos, nutricion visible, sin gating. */
export const DEFAULT_CONFIG: MobileConfig = {
    enabledModules: [],
    disabledModules: [],
    featurePrefs: { nutritionEnabled: true, nutritionSections: {} },
    flags: {},
}

function isModuleKey(v: unknown): v is ModuleKey {
    return typeof v === 'string' && (MODULE_KEYS as readonly string[]).includes(v)
}

function toModuleKeys(v: unknown): ModuleKey[] {
    if (!Array.isArray(v)) return []
    const out: ModuleKey[] = []
    for (const item of v) if (isModuleKey(item) && !out.includes(item)) out.push(item)
    return out
}

function toFlags(v: unknown): RemoteFlagsPayload {
    if (!v || typeof v !== 'object') return {}
    const out: RemoteFlagsPayload = {}
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        if (typeof val === 'boolean') out[k] = val
    }
    return out
}

/** Extrae el mapa de secciones (solo valores booleanos) del payload. Basura => `{}`. */
function toSectionFlags(v: unknown): Partial<Record<NutritionSectionKey, boolean>> {
    if (!v || typeof v !== 'object') return {}
    const out: Partial<Record<NutritionSectionKey, boolean>> = {}
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        if (typeof val === 'boolean') out[k as NutritionSectionKey] = val
    }
    return out
}

/** Normaliza (y valida tipos de) el payload crudo del endpoint. NUNCA lanza. */
export function normalizeConfig(raw: RawMobileConfig | null | undefined): MobileConfig {
    if (!raw || typeof raw !== 'object') return DEFAULT_CONFIG
    // Solo el `false` explicito oculta la nutricion; ausente / no-bool => fail-open (true).
    const nutritionEnabled = raw.featurePrefs?.nutritionEnabled === false ? false : true
    return {
        enabledModules: toModuleKeys(raw.enabledModules),
        disabledModules: toModuleKeys(raw.disabledModules),
        featurePrefs: { nutritionEnabled, nutritionSections: toSectionFlags(raw.featurePrefs?.sections) },
        flags: toFlags(raw.flags),
    }
}

/**
 * ¿Es visible la seccion `key` del dominio Nutricion? Fail-OPEN, espejo de web `sectionFlags`:
 * key ausente / `true` => visible; SOLO el `false` explicito la oculta. PURA => testeable.
 */
export function isNutritionSectionVisibleIn(config: MobileConfig, key: NutritionSectionKey): boolean {
    return config.featurePrefs.nutritionSections[key] !== false
}

/**
 * Modulos EFECTIVOS = enabledModules MENOS los killeados por el operador (disabledModules).
 * El servidor ya aplica el kill-switch, pero re-aplicarlo en cliente es defensa en profundidad
 * (espejo de applyOperatorKillSwitch de la web): si un modulo aparece en ambas listas, gana el
 * kill-switch. PURA => testeable.
 */
export function resolveEffectiveModules(config: MobileConfig): Set<ModuleKey> {
    const killed = new Set(config.disabledModules)
    return new Set(config.enabledModules.filter((k) => !killed.has(k)))
}

/** ¿El modulo `key` esta efectivamente habilitado en esta config? */
export function hasModuleIn(config: MobileConfig, key: ModuleKey): boolean {
    return resolveEffectiveModules(config).has(key)
}

/** Serializa la config para AsyncStorage (JSON estable). */
export function serializeConfig(config: MobileConfig): string {
    return JSON.stringify(config)
}

/** Parsea la config cacheada; cualquier corrupcion => DEFAULT_CONFIG (NUNCA lanza). */
export function parseCachedConfig(raw: string | null | undefined): MobileConfig {
    if (!raw) return DEFAULT_CONFIG
    try {
        return normalizeConfig(JSON.parse(raw) as RawMobileConfig)
    } catch {
        return DEFAULT_CONFIG
    }
}
