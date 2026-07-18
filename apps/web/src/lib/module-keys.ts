/**
 * Fuente canónica de las claves de módulo — módulo HOJA sin imports.
 *
 * Vive separado de entitlements.service a propósito: constants.ts necesita estas
 * claves y coach-subscription-gate (importado por entitlements.service desde la
 * derivación "plan pago ⇒ módulos incluidos") necesita constants.ts. Si las claves
 * vivieran en el service, el ciclo entitlements → gate → constants → entitlements
 * revienta la evaluación ESM en el build de producción (TDZ: "Cannot access 't'
 * before initialization" — visto en Vercel 2026-07-17).
 */

export const MODULE_KEYS = [
    'cardio',
    'movement_assessment',
    'body_composition',
    'nutrition_exchanges',
] as const

export type ModuleKey = (typeof MODULE_KEYS)[number]

export type EnabledModules = Partial<Record<ModuleKey, boolean>>
