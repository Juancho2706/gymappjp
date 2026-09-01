/**
 * entitlements-core — logica PURA de entitlements de mobile (E0-C1). CERO react-native / expo /
 * supabase: normaliza y valida el payload de /api/mobile/config, re-aplica el kill-switch de
 * operador (defensa en profundidad) y (de)serializa la cache. La glue de red/AsyncStorage/hook
 * vive en `entitlements.ts`; aca solo va lo testeable con el runner del repo (vitest).
 *
 * El TYPE `ModuleKey` se importa de @eva/feature-prefs (paquete puro, cuyo test lo cruza contra
 * `MODULE_KEYS` de la app => sin drift). El ARRAY runtime `MODULE_KEYS` se declara local porque el
 * paquete NO exporta ese array (solo el type). En cambio los DOMINIOS sí viajan completos desde el
 * paquete: `FEATURE_DOMAIN_KEYS` es un export runtime y se usa tal cual, sin espejo local.
 */
import { FEATURE_DOMAIN_KEYS, type FeatureDomain, type ModuleKey, type NutritionSectionKey } from '@eva/feature-prefs'

export type { FeatureDomain, ModuleKey, NutritionSectionKey }
export { FEATURE_DOMAIN_KEYS }

/** Espejo runtime de MODULE_KEYS (fuente de verdad: entitlements.service.ts de la web). */
export const MODULE_KEYS: readonly ModuleKey[] = [
    'cardio',
    'movement_assessment',
    'body_composition',
    'nutrition_exchanges',
] as const

export interface MobileFeaturePrefs {
    /**
     * Master switch por DOMINIO (los 5 de `FEATURE_DOMAIN_KEYS`), ya resuelto server-side por
     * /api/mobile/config (aplica el `_enabled` de `coach_feature_prefs`/`team_feature_prefs`).
     * Fail-OPEN: ausente / no-bool => `true`; SOLO el `false` explicito apaga.
     */
    domains: Record<FeatureDomain, boolean>
    /**
     * DERIVADO = `domains.nutrition`. Se conserva para los consumidores existentes (tab del
     * alumno, hub de nutricion, home) que ya leen este campo; no es una segunda fuente de verdad.
     */
    nutritionEnabled: boolean
    /**
     * Visibilidad por seccion del dominio Nutricion (espejo de `sectionFlags` de web). Fail-OPEN:
     * key ausente / `true` => visible; solo `false` explicito oculta. Solo se guardan las keys
     * booleanas del payload (el resto queda ausente = visible).
     */
    nutritionSections: Partial<Record<NutritionSectionKey, boolean>>
}

/**
 * Estado de acceso del ALUMNO por suscripcion de su coach (politica CEO 2026-07-18), resuelto
 * server-side por /api/mobile/config:
 *  - 'active': acceso normal (incluye coach free vigente y managed/team/enterprise).
 *  - 'grace': el coach perdio acceso efectivo pero corre la ventana de 7 dias post period_end —
 *    alumno 100% funcional + banner discreto.
 *  - 'blocked': post-gracia — SOLO-LECTURA (ve plan/historial/rachas; el registro rebota en DB
 *    con COACH_ACCOUNT_PAUSED; la UI explica, no solo falla).
 * Fail-OPEN a 'active' (payload ausente/viejo/corrupto): el guard duro vive en DB; esta capa es
 * solo mensaje. Espejo del contrato web (apps/web/src/lib/student-access.ts).
 */
export type StudentAccessState = 'active' | 'grace' | 'blocked'
export interface StudentAccess {
    state: StudentAccessState
    /** ISO del fin de la gracia (informativo; el banner del alumno NO muestra countdown). */
    graceEndsAt: string | null
}

export const DEFAULT_STUDENT_ACCESS: StudentAccess = { state: 'active', graceEndsAt: null }

/** Forma CRUDA del payload de /api/mobile/config (campos opcionales por version/db-compat). */
export interface RawMobileConfig {
    enabledModules?: unknown
    disabledModules?: unknown
    featurePrefs?: { domains?: unknown; nutritionEnabled?: unknown; sections?: unknown } | null
    // legacy: el servidor lo manda como espejo, la app ya no lo lee
    featurePrefsEnabled?: unknown
    studentAccess?: unknown
}

/** Config NORMALIZADA que consume la app (tipos garantizados). */
export interface MobileConfig {
    enabledModules: ModuleKey[]
    disabledModules: ModuleKey[]
    featurePrefs: MobileFeaturePrefs
    studentAccess: StudentAccess
}

/** Los 5 dominios en `true` (fail-OPEN). Se construye desde `FEATURE_DOMAIN_KEYS` => sin drift. */
function allDomainsEnabled(): Record<FeatureDomain, boolean> {
    const out = {} as Record<FeatureDomain, boolean>
    for (const domain of FEATURE_DOMAIN_KEYS) out[domain] = true
    return out
}

/** Config por defecto fail-safe (sin red / sin cache): 0 modulos, los 5 dominios visibles, sin gating. */
export const DEFAULT_CONFIG: MobileConfig = {
    enabledModules: [],
    disabledModules: [],
    featurePrefs: { domains: allDomainsEnabled(), nutritionEnabled: true, nutritionSections: {} },
    studentAccess: DEFAULT_STUDENT_ACCESS,
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

/** Extrae el mapa de secciones (solo valores booleanos) del payload. Basura => `{}`. */
function toSectionFlags(v: unknown): Partial<Record<NutritionSectionKey, boolean>> {
    if (!v || typeof v !== 'object') return {}
    const out: Partial<Record<NutritionSectionKey, boolean>> = {}
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        if (typeof val === 'boolean') out[k as NutritionSectionKey] = val
    }
    return out
}

/**
 * Master switch por dominio a partir del payload. Fail-OPEN en dos niveles:
 *  - por key: `false` SOLO si el payload trae el `false` explicito (ausente / no-bool => `true`);
 *  - por payload: si `rawDomains` no es objeto (binario viejo contra servidor nuevo, servidor
 *    viejo que todavia no manda `domains`, o basura) los 5 quedan en `true` SALVO `nutrition`,
 *    que hereda el unico gate que ya existia en el contrato viejo (`nutritionEnabled === false`).
 * Asi una app vieja no se queda con nutricion prendida cuando el coach ya la apago.
 */
function toDomainFlags(rawDomains: unknown, legacyNutritionEnabled: unknown): Record<FeatureDomain, boolean> {
    const legacyNutritionOff = legacyNutritionEnabled === false
    if (!rawDomains || typeof rawDomains !== 'object') {
        const fallback = allDomainsEnabled()
        if (legacyNutritionOff) fallback.nutrition = false
        return fallback
    }
    const source = rawDomains as Record<string, unknown>
    const out = {} as Record<FeatureDomain, boolean>
    for (const domain of FEATURE_DOMAIN_KEYS) out[domain] = source[domain] === false ? false : true
    return out
}

/**
 * Normaliza `studentAccess` del payload. Acepta ambos vocabularios del server (web
 * student-access.ts emite 'ok'/'grace'/'readonly'; el espejo mobile usa 'active'/'grace'/'blocked'):
 * 'readonly' => 'blocked', 'ok'/desconocido/invalido => fail-OPEN a 'active'.
 */
function toStudentAccess(v: unknown): StudentAccess {
    if (!v || typeof v !== 'object') return DEFAULT_STUDENT_ACCESS
    const raw = (v as { state?: unknown }).state
    const state: StudentAccessState | null =
        raw === 'grace' ? 'grace' : raw === 'blocked' || raw === 'readonly' ? 'blocked' : null
    if (state === null) return DEFAULT_STUDENT_ACCESS
    const rawEnds = (v as { graceEndsAt?: unknown }).graceEndsAt
    const graceEndsAt = typeof rawEnds === 'string' && rawEnds.length > 0 ? rawEnds : null
    return { state, graceEndsAt }
}

/** Normaliza (y valida tipos de) el payload crudo del endpoint. NUNCA lanza. */
export function normalizeConfig(raw: RawMobileConfig | null | undefined): MobileConfig {
    if (!raw || typeof raw !== 'object') return DEFAULT_CONFIG
    // Solo el `false` explicito apaga un dominio; ausente / no-bool => fail-open (true).
    const domains = toDomainFlags(raw.featurePrefs?.domains, raw.featurePrefs?.nutritionEnabled)
    return {
        enabledModules: toModuleKeys(raw.enabledModules),
        disabledModules: toModuleKeys(raw.disabledModules),
        featurePrefs: {
            domains,
            // DERIVADO: una sola fuente de verdad (el espejo legacy del payload ya se consumio arriba).
            nutritionEnabled: domains.nutrition,
            nutritionSections: toSectionFlags(raw.featurePrefs?.sections),
        },
        studentAccess: toStudentAccess(raw.studentAccess),
    }
}

/**
 * ¿Esta prendido el dominio `domain` en esta config? Fail-OPEN (ver `toDomainFlags`). PURA =>
 * testeable. Es el predicado que consume `useDomainGuard` (domain-guard.ts) y, por su lado, el
 * armado de `disabledDomains` del nav.
 */
export function isDomainEnabledIn(config: MobileConfig, domain: FeatureDomain): boolean {
    return config.featurePrefs.domains[domain] !== false
}

/**
 * Dominios APAGADOS, en la forma que consume `getVisibleNavItems` (`disabledDomains`) — espejo
 * exacto de `disabledDomainsFromPrefs` / `disabledDomainsForPersona` de la web, para que el nav de
 * ambas plataformas derive el set desde la MISMA regla. Solo entran los `false`. PURA.
 */
export function disabledDomainsFromFlags(domains: Record<FeatureDomain, boolean>): Set<FeatureDomain> {
    const disabled = new Set<FeatureDomain>()
    for (const domain of FEATURE_DOMAIN_KEYS) {
        if (domains[domain] === false) disabled.add(domain)
    }
    return disabled
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

/**
 * TTL de `studentAccess` en la cache de entitlements. Un estado suspendido cacheado no debe impedir
 * volver a entrar si el coach ya reactivó su cuenta; el gate duro sigue viviendo en servidor/RLS.
 */
export const STUDENT_ACCESS_CACHE_TTL_MS = 24 * 60 * 60 * 1000

/** Envelope persistido: config + momento de la ultima obtencion exitosa. */
export function serializeConfigEnvelope(config: MobileConfig, fetchedAt: number): string {
    return JSON.stringify({ fetchedAt, config })
}

function resetStaleStudentAccess(config: MobileConfig): MobileConfig {
    // Un `grace`/`blocked` viejo no debe seguir suspendiendo a un alumno cuyo coach ya reactivó.
    // El enforcement duro vive en DB y el endpoint de estado de cuenta.
    if (config.studentAccess.state !== 'active') {
        return { ...config, studentAccess: DEFAULT_STUDENT_ACCESS }
    }
    return config
}

/**
 * Parsea el envelope cacheado. Si la ultima obtencion exitosa supera el TTL (o el formato es viejo sin
 * timestamp), conserva módulos/preferencias pero reinicia el estado informativo de acceso del alumno.
 * Cualquier corrupción devuelve DEFAULT_CONFIG.
 */
export function parseCachedConfigEnvelope(raw: string | null | undefined, now: number): MobileConfig {
    if (!raw) return DEFAULT_CONFIG
    let parsed: unknown
    try {
        parsed = JSON.parse(raw)
    } catch {
        return DEFAULT_CONFIG
    }
    if (!parsed || typeof parsed !== 'object') return DEFAULT_CONFIG

    const envelope = parsed as { fetchedAt?: unknown; config?: unknown }
    const hasEnvelope =
        typeof envelope.fetchedAt === 'number' &&
        !!envelope.config &&
        typeof envelope.config === 'object'
    const config = normalizeConfig((hasEnvelope ? envelope.config : parsed) as RawMobileConfig)
    const fresh = hasEnvelope && now - (envelope.fetchedAt as number) <= STUDENT_ACCESS_CACHE_TTL_MS
    return fresh ? config : resetStaleStudentAccess(config)
}
