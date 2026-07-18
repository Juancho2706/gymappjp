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
    featurePrefs?: { nutritionEnabled?: unknown; sections?: unknown } | null
    featurePrefsEnabled?: unknown
    flags?: unknown
    studentAccess?: unknown
}

/** Config NORMALIZADA que consume la app (tipos garantizados). */
export interface MobileConfig {
    enabledModules: ModuleKey[]
    disabledModules: ModuleKey[]
    featurePrefs: MobileFeaturePrefs
    flags: RemoteFlagsPayload
    studentAccess: StudentAccess
}

/** Config por defecto fail-safe (sin red / sin cache): 0 modulos, nutricion visible, sin gating. */
export const DEFAULT_CONFIG: MobileConfig = {
    enabledModules: [],
    disabledModules: [],
    featurePrefs: { nutritionEnabled: true, nutritionSections: {} },
    flags: {},
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
    // Solo el `false` explicito oculta la nutricion; ausente / no-bool => fail-open (true).
    const nutritionEnabled = raw.featurePrefs?.nutritionEnabled === false ? false : true
    return {
        enabledModules: toModuleKeys(raw.enabledModules),
        disabledModules: toModuleKeys(raw.disabledModules),
        featurePrefs: { nutritionEnabled, nutritionSections: toSectionFlags(raw.featurePrefs?.sections) },
        flags: toFlags(raw.flags),
        studentAccess: toStudentAccess(raw.studentAccess),
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

/**
 * TTL de los flags de rollout tecnico (Nutricion V2) en la cache de entitlements. El enforcement real
 * es server-side (el gate movil revalida el rollout por request); este TTL solo acota cuanto tiempo la
 * UI puede seguir mostrando V2 tras un apagado, sin romper el arranque offline del alumno dentro de la
 * ventana. Los modulos comerciales conservan su semantica actual (no expiran aca).
 */
export const ENTITLEMENTS_CACHE_TTL_MS = 24 * 60 * 60 * 1000

/** Flags fail-closed que NO deben sobrevivir un cache vencido (quedan en su default local `false`). */
const ROLLOUT_FLAG_KEYS = ['nutritionV2Student', 'nutritionV2Coach'] as const

/** Envelope persistido: config + momento de la ultima obtencion exitosa (para el TTL de rollout). */
export function serializeConfigEnvelope(config: MobileConfig, fetchedAt: number): string {
    return JSON.stringify({ fetchedAt, config })
}

function stripRolloutFlags(config: MobileConfig): MobileConfig {
    const flags = { ...config.flags }
    let changed = false
    for (const key of ROLLOUT_FLAG_KEYS) {
        if (key in flags) {
            delete flags[key]
            changed = true
        }
    }
    // studentAccess tampoco sobrevive un cache vencido: un 'grace'/'blocked' viejo no debe seguir
    // banneando a un alumno cuyo coach ya reactivo (fail-open; el guard duro vive en DB).
    if (config.studentAccess.state !== 'active') {
        return { ...config, flags, studentAccess: DEFAULT_STUDENT_ACCESS }
    }
    return changed ? { ...config, flags } : config
}

/**
 * Parsea el envelope cacheado y decide que flags aplican. Si la ultima obtencion exitosa supera el TTL
 * (o el formato es viejo sin timestamp, imposible de fechar), descarta SOLO los flags de rollout V2 —
 * los deja fail-closed — y conserva el resto del config. Cualquier corrupcion => DEFAULT_CONFIG.
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
    const fresh = hasEnvelope && now - (envelope.fetchedAt as number) <= ENTITLEMENTS_CACHE_TTL_MS
    return fresh ? config : stripRolloutFlags(config)
}
