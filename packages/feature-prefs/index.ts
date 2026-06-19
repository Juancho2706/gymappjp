/**
 * @eva/feature-prefs — config PURA de secciones por dominio + resolver framework-agnostico
 * del modelo `visible = ENTITLED (billing) AND ENABLED (preferencia)`.
 *
 * Paquete PURO TypeScript: CERO Next.js / Supabase / React / RN. La MISMA config y el MISMO
 * resolver corren en web (`/coach/settings` zona "Funciones", NutritionShell, widgets del
 * dashboard) y en `apps/mobile` (que habla PostgREST directo y tiene su propia nav) — mata el
 * drift que aparecera si el resolver vive solo en web (ver plan-mejorado-menus-preferencias §4.3).
 *
 * Invariante de oro (plan §4.1): la PREFERENCIA SOLO ACHICA, nunca amplia. El entitlement
 * (billing, server-side, fail-closed) es el unico gate de dinero; la preferencia es input no
 * confiable que solo puede ocultar lo ya permitido. Las secciones `core` estan SIEMPRE ON y no
 * son toggleables. El resolver de este paquete NO resuelve entitlement — recibe
 * `entitledByModule` ya computado por los helpers server-side (`hasModule` /
 * `hasExchangesModuleForClientContext` / `findPlanModuleContext`), que NO se reimplementan.
 *
 * Fuente de verdad de las ModuleKeys: `MODULE_KEYS` en
 * apps/web/src/services/entitlements.service.ts. Este paquete es puro y no puede importar de la
 * app; el test cruza cada `requiresModule` contra `MODULE_KEYS` y falla si divergen.
 */

/**
 * Las keys de modulos de pago de EVA. Subconjunto/espejo de `MODULE_KEYS` (verificado en test).
 * Tipada localmente para mantener el paquete puro (no importa de la app).
 */
export type ModuleKey =
    | 'cardio'
    | 'movement_assessment'
    | 'body_composition'
    | 'nutrition_exchanges'

/** Los 3 presets del coach/team (plan §4.7). El default seguro es `'basico'`. */
export type Preset = 'basico' | 'intermedio' | 'profesional'

/** Lista canonica de presets (orden de menor a mayor amplitud). */
export const PRESETS = ['basico', 'intermedio', 'profesional'] as const

/** Keys de secciones del dominio Nutricion (plan §4.3). */
export type NutritionSectionKey =
    | 'plan'
    | 'macros'
    | 'adherence'
    | 'micros_base'
    | 'plate'
    | 'off_plan_log'
    | 'notes'
    | 'habits'
    | 'recipes'
    | 'shopping'
    | 'micros_advanced'
    | 'goals_bodycomp'

/** Mapa de presencia por preset para una seccion. */
export interface PresetMap {
    basico: boolean
    intermedio: boolean
    profesional: boolean
}

/** Config declarativa de UNA seccion de un dominio (plan §4.3). */
export interface FeatureSection<K extends string = string> {
    /** Identificador estable (key del jsonb `sections` y del resolver). */
    key: K
    /** Nombre visible (latam neutro). */
    label: string
    /** Explainer corto para el toggle. */
    tooltip: string
    /** `true` = SIEMPRE ON, no toggleable, no gateable por entitlement. */
    core: boolean
    /** Valor por defecto cuando no hay preferencia ni preset que la cubra. */
    defaultOn: boolean
    /** Modulo de pago requerido para que el entitlement la permita; `null` = gratis. */
    requiresModule: ModuleKey | null
    /** En que presets aparece prendida (las `core` van ON en todos). */
    presets: PresetMap
}

const CORE_PRESETS: PresetMap = { basico: true, intermedio: true, profesional: true }
const INTERMEDIO_PRESETS: PresetMap = { basico: false, intermedio: true, profesional: true }
const PRO_PRESETS: PresetMap = { basico: false, intermedio: false, profesional: true }

/**
 * Config de secciones del dominio Nutricion.
 * - core (`plan`/`macros`/`adherence`): siempre ON en todos los presets, no toggleables.
 * - opcionales default-OFF: `micros_base`/`plate`/`off_plan_log`/`notes`/`habits`/`recipes`/
 *   `shopping` entran en `intermedio` (gratis); `micros_advanced` (req `nutrition_exchanges`) y
 *   `goals_bodycomp` (req `body_composition`) entran en `profesional`.
 */
export const NUTRITION_SECTIONS: readonly FeatureSection<NutritionSectionKey>[] = [
    {
        key: 'plan',
        label: 'Plan',
        tooltip: 'El plan nutricional y sus comidas. Siempre visible.',
        core: true,
        defaultOn: true,
        requiresModule: null,
        presets: CORE_PRESETS,
    },
    {
        key: 'macros',
        label: 'Macros',
        tooltip: 'Objetivos y totales de macronutrientes. Siempre visible.',
        core: true,
        defaultOn: true,
        requiresModule: null,
        presets: CORE_PRESETS,
    },
    {
        key: 'adherence',
        label: 'Adherencia',
        tooltip: 'Cumplimiento del plan a lo largo del tiempo. Siempre visible.',
        core: true,
        defaultOn: true,
        requiresModule: null,
        presets: CORE_PRESETS,
    },
    {
        key: 'micros_base',
        label: 'Micronutrientes (base)',
        tooltip: 'Vitaminas y minerales clave. Gratis, apagado por defecto.',
        core: false,
        defaultOn: false,
        requiresModule: null,
        presets: INTERMEDIO_PRESETS,
    },
    {
        key: 'plate',
        label: 'Metodo del plato',
        tooltip: 'Guia visual de proporciones del plato.',
        core: false,
        defaultOn: false,
        requiresModule: null,
        presets: INTERMEDIO_PRESETS,
    },
    {
        key: 'off_plan_log',
        label: 'Registro fuera de plan',
        tooltip: 'Permite al alumno registrar comidas fuera del plan.',
        core: false,
        defaultOn: false,
        requiresModule: null,
        presets: INTERMEDIO_PRESETS,
    },
    {
        key: 'notes',
        label: 'Notas',
        tooltip: 'Notas del coach sobre la nutricion del alumno.',
        core: false,
        defaultOn: false,
        requiresModule: null,
        presets: INTERMEDIO_PRESETS,
    },
    {
        key: 'habits',
        label: 'Habitos',
        tooltip: 'Seguimiento de habitos nutricionales.',
        core: false,
        defaultOn: false,
        requiresModule: null,
        presets: INTERMEDIO_PRESETS,
    },
    {
        key: 'recipes',
        label: 'Recetas',
        tooltip: 'Recetas asociadas al plan.',
        core: false,
        defaultOn: false,
        requiresModule: null,
        presets: INTERMEDIO_PRESETS,
    },
    {
        key: 'shopping',
        label: 'Lista de compras',
        tooltip: 'Lista de compras derivada del plan.',
        core: false,
        defaultOn: false,
        requiresModule: null,
        presets: INTERMEDIO_PRESETS,
    },
    {
        key: 'micros_advanced',
        label: 'Micronutrientes (avanzado)',
        tooltip: 'Micros por intercambios. Requiere Nutricion por intercambios.',
        core: false,
        defaultOn: false,
        requiresModule: 'nutrition_exchanges',
        presets: PRO_PRESETS,
    },
    {
        key: 'goals_bodycomp',
        label: 'Objetivos por composicion corporal',
        tooltip: 'Objetivos atados a composicion corporal. Requiere Composicion corporal.',
        core: false,
        defaultOn: false,
        requiresModule: 'body_composition',
        presets: PRO_PRESETS,
    },
]

/** Registro de dominios soportados → su config de secciones. */
export const FEATURE_DOMAINS = {
    nutrition: NUTRITION_SECTIONS,
} as const

export type FeatureDomain = keyof typeof FEATURE_DOMAINS

/** Coacciona un preset desconocido/ausente a `'basico'` (deterministico, plan §4.4). */
export function normalizePreset(preset: unknown): Preset {
    return preset === 'intermedio' || preset === 'profesional'
        ? preset
        : 'basico'
}

/** Mapa de preferencias persistido (`sections jsonb`): seccion → on/off elegido. */
export type SectionPrefs = Partial<Record<string, boolean>>

export interface ResolveSectionsInput {
    /** Entitlement YA computado server-side por modulo (fail-closed). */
    entitledByModule: Partial<Record<ModuleKey, boolean>>
    /** Preset base (coach o team). Desconocido → `'basico'`. */
    preset: Preset | string | null | undefined
    /** Preferencias del coach (capa base en standalone). */
    coachSections?: SectionPrefs | null
    /** Preferencias del team (capa base cuando `useTeamBase`). */
    teamSections?: SectionPrefs | null
    /** Override por-alumno (capa mas especifica). */
    clientSections?: SectionPrefs | null
    /** `true` = la base es el team (modo team); `false` = la base es el coach (standalone). */
    useTeamBase: boolean
    /** Dominio a resolver. Default `'nutrition'`. */
    domain?: FeatureDomain
}

/**
 * Resolver PURO del modelo `visible = core OR (entitled AND wants)`.
 *
 * Por seccion:
 * - core → SIEMPRE `true` (no se gatea, no se toggleable).
 * - `entitled = requiresModule ? entitledByModule[requiresModule] === true : true`.
 * - `wants = clientSections?.[k] ?? base?.[k] ?? section.presets[preset]`, donde `base` es
 *   `teamSections` si `useTeamBase` si no `coachSections`; preset desconocido → `'basico'`.
 * - resultado = `core || (entitled && wants)`.
 *
 * La preferencia NUNCA amplia: si la seccion no esta entitled, ningun `wants=true` la prende.
 */
export function resolveSections(
    input: ResolveSectionsInput,
): Record<string, boolean> {
    const {
        entitledByModule,
        coachSections,
        teamSections,
        clientSections,
        useTeamBase,
    } = input

    const preset = normalizePreset(input.preset)
    const sections = FEATURE_DOMAINS[input.domain ?? 'nutrition']
    const base: SectionPrefs | null | undefined = useTeamBase ? teamSections : coachSections

    const result: Record<string, boolean> = {}
    for (const section of sections) {
        if (section.core) {
            result[section.key] = true
            continue
        }

        const entitled = section.requiresModule
            ? entitledByModule[section.requiresModule] === true
            : true

        const wants =
            clientSections?.[section.key] ??
            base?.[section.key] ??
            section.presets[preset]

        result[section.key] = entitled && wants === true
    }

    return result
}
