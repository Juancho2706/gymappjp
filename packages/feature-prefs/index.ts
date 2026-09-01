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

// Import de TIPO puro (se borra al compilar, no llega ni al bundle de RN ni al de web). El
// contrato de personas vive en @eva/schemas porque tambien lo validan los boundaries con zod;
// cruzarlo aca evita una segunda lista que se desincronice del CHECK de `coaches.persona`.
// Precedente de import entre paquetes: `@eva/brand-kit` -> `@eva/schemas`.
import type { Persona } from '@eva/schemas'

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
        tooltip: 'Micronutrientes calculados desde las porciones e intercambios del plan.',
        core: false,
        defaultOn: false,
        requiresModule: 'nutrition_exchanges',
        presets: PRO_PRESETS,
    },
    {
        key: 'goals_bodycomp',
        label: 'Objetivos por composicion corporal',
        tooltip: 'Objetivos del plan atados a la ultima medicion de composicion corporal del alumno.',
        core: false,
        defaultOn: false,
        requiresModule: 'body_composition',
        presets: PRO_PRESETS,
    },
]

/**
 * Config de secciones del dominio ENTRENAMIENTO (builder, programas, ejercicios).
 * Una sola seccion `core`: el dominio no se corta por dentro, se prende o se apaga entero con el
 * master switch `_enabled` (que es lo que escribe la persona del onboarding v2).
 */
export const TRAINING_SECTIONS: readonly FeatureSection<'programs'>[] = [
    {
        key: 'programs',
        label: 'Programas',
        tooltip: 'Rutinas, progresiones y ejercicios. Siempre visible dentro del dominio.',
        core: true,
        defaultOn: true,
        requiresModule: null,
        presets: CORE_PRESETS,
    },
]

/**
 * Config de secciones del dominio CARDIO (zonas de FC, ritmos, intervalos).
 * `requiresModule` va en `null` a proposito: el gate de PAGO del modulo `cardio` lo aplican el
 * entitlement server-side y `@eva/coach-nav` (`entitlement: 'cardio'`), no la preferencia. Aca
 * solo vive el master switch (preferencia = solo achica).
 */
export const CARDIO_SECTIONS: readonly FeatureSection<'zones'>[] = [
    {
        key: 'zones',
        label: 'Zonas y sesiones',
        tooltip: 'Zonas de frecuencia cardiaca, ritmos e intervalos.',
        core: true,
        defaultOn: true,
        requiresModule: null,
        presets: CORE_PRESETS,
    },
]

/** Config de secciones del dominio MOVIMIENTO (screening de 7 patrones + pauta domiciliaria). */
export const MOVEMENT_SECTIONS: readonly FeatureSection<'screening'>[] = [
    {
        key: 'screening',
        label: 'Screening de movimiento',
        tooltip: 'Screening de 7 patrones con semaforo y su evolucion.',
        core: true,
        defaultOn: true,
        requiresModule: null,
        presets: CORE_PRESETS,
    },
]

/** Config de secciones del dominio COMPOSICION CORPORAL (BIA / ISAK). */
export const BODYCOMP_SECTIONS: readonly FeatureSection<'measurements'>[] = [
    {
        key: 'measurements',
        label: 'Mediciones',
        tooltip: 'Composicion corporal por BIA o antropometria ISAK.',
        core: true,
        defaultOn: true,
        requiresModule: null,
        presets: CORE_PRESETS,
    },
]

/**
 * Registro de dominios soportados → su config de secciones.
 *
 * Onboarding v2 (SPEC §2): la persona del coach escribe un `_enabled` por dominio en
 * `coach_feature_prefs` (PK `(coach_id, domain)` con `domain text` libre ⇒ sin migracion de
 * tabla). `nutrition` es el unico con secciones internas toggleables; los otros cuatro existen
 * para que el master switch tenga un dominio al que apagar y para que `@eva/coach-nav` pueda
 * ocultar su entrada del menu con la MISMA fuente en web y en RN.
 */
export const FEATURE_DOMAINS = {
    nutrition: NUTRITION_SECTIONS,
    training: TRAINING_SECTIONS,
    cardio: CARDIO_SECTIONS,
    movement: MOVEMENT_SECTIONS,
    bodycomp: BODYCOMP_SECTIONS,
} as const

export type FeatureDomain = keyof typeof FEATURE_DOMAINS

/** Lista canonica de dominios (orden estable para iterar y para pintar Opciones › Funciones). */
export const FEATURE_DOMAIN_KEYS = [
    'nutrition',
    'training',
    'cardio',
    'movement',
    'bodycomp',
] as const satisfies readonly FeatureDomain[]

/** Coacciona un preset desconocido/ausente a `'basico'` (deterministico, plan §4.4). */
export function normalizePreset(preset: unknown): Preset {
    return preset === 'intermedio' || preset === 'profesional'
        ? preset
        : 'basico'
}

/**
 * Key RESERVADA del jsonb `sections`: master switch del DOMINIO completo (plan §4.8).
 * Distinta de los presets/secciones: si vale `false`, el dominio entero se oculta (menu +
 * TODAS las secciones, incluidas las `core`). No es una `NutritionSectionKey` — nunca se
 * itera como seccion. Ausente => `true` (dominio prendido) para no afectar a los coaches ya
 * backfilleados.
 */
export const DOMAIN_ENABLED_KEY = '_enabled' as const

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
 * Resuelve el MASTER SWITCH del dominio (key reservada `_enabled`, plan §4.8) — distinto de
 * los presets/secciones. Resolucion mas-especifico-gana, espejando el orden de `wants`:
 *   `clientSections._enabled ?? base._enabled ?? true`
 * donde `base` es `teamSections` si `useTeamBase`, si no `coachSections`. Default `true` (ON)
 * para no afectar a coaches existentes/backfilleados (sin la key => dominio prendido).
 *
 * Cuando devuelve `false`, el dominio entero esta apagado: `resolveSections` fuerza TODAS las
 * secciones (incluidas las `core`) a `false`, porque el menu y su contenido se ocultan.
 */
export function resolveDomainEnabled(input: ResolveSectionsInput): boolean {
    const base: SectionPrefs | null | undefined = input.useTeamBase
        ? input.teamSections
        : input.coachSections
    return (
        input.clientSections?.[DOMAIN_ENABLED_KEY] ??
        base?.[DOMAIN_ENABLED_KEY] ??
        true
    )
}

/**
 * Resolver PURO del modelo `visible = core OR (entitled AND wants)`.
 *
 * Antes que nada honra el MASTER SWITCH del dominio (`resolveDomainEnabled`): si el dominio
 * esta apagado (`_enabled === false`), TODAS las secciones (incluidas las `core`) resuelven
 * `false` — el menu y su contenido completo se ocultan.
 *
 * Por seccion (con el dominio prendido):
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

    // Master switch del dominio: si esta apagado, TODO el dominio se oculta (incluso core).
    const domainEnabled = resolveDomainEnabled(input)

    const result: Record<string, boolean> = {}
    if (!domainEnabled) {
        for (const section of sections) result[section.key] = false
        return result
    }

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

/**
 * MATRIZ DE PERSONA → dominios visibles (onboarding v2, SPEC §2).
 *
 * La pregunta «¿A qué te dedicas?» REDUCE lo que se muestra: cada rama deja prendidos los
 * dominios de su mundo y apaga los demás, siempre reactivables desde Opciones › Funciones. Lo que
 * devuelve esta funcion es EXACTAMENTE lo que se persiste en `coach_feature_prefs` (una fila por
 * dominio, `sections` = `{ _enabled: boolean }`), asi que web y RN siembran lo mismo.
 *
 * `alsoOther` es la segunda pregunta de la pantalla (`coaches.persona_also_other`): nutricion
 * para strength/rehab/endurance, entrenamiento para nutrition. `other` deja el panel completo y
 * la ignora.
 *
 * Invariante: esto es PREFERENCIA, no capability. Prender `cardio` aca NO compra el modulo — el
 * entitlement server-side sigue siendo el unico gate de dinero (`@eva/coach-nav` filtra primero
 * por `entitlement` y despues por dominio apagado).
 */
export function resolvePersonaPrefs(
    persona: Persona,
    alsoOther: boolean,
): Record<FeatureDomain, { [DOMAIN_ENABLED_KEY]: boolean }> {
    const prefs = (
        enabled: Record<FeatureDomain, boolean>,
    ): Record<FeatureDomain, { _enabled: boolean }> => ({
        nutrition: { _enabled: enabled.nutrition },
        training: { _enabled: enabled.training },
        cardio: { _enabled: enabled.cardio },
        movement: { _enabled: enabled.movement },
        bodycomp: { _enabled: enabled.bodycomp },
    })

    switch (persona) {
        case 'strength':
            return prefs({
                training: true,
                nutrition: alsoOther,
                cardio: false,
                movement: false,
                bodycomp: false,
            })
        case 'nutrition':
            // Composicion corporal entra SIEMPRE con nutricion: la evaluacion corporal es parte
            // del trabajo del nutricionista (SPEC §1, bajada de la tarjeta).
            return prefs({
                nutrition: true,
                training: alsoOther,
                bodycomp: true,
                cardio: false,
                movement: false,
            })
        case 'rehab':
            return prefs({
                training: true,
                movement: true,
                nutrition: alsoOther,
                cardio: false,
                bodycomp: false,
            })
        case 'endurance':
            return prefs({
                training: true,
                cardio: true,
                nutrition: alsoOther,
                movement: false,
                bodycomp: false,
            })
        case 'other':
        default:
            // El escape: panel completo, se ajusta despues desde Opciones › Funciones.
            return prefs({
                nutrition: true,
                training: true,
                cardio: true,
                movement: true,
                bodycomp: true,
            })
    }
}

/**
 * Dominios APAGADOS por la persona, en la forma que consume `getVisibleNavItems`
 * (`disabledDomains`). Azucar sobre `resolvePersonaPrefs` para que el nav de web y RN no
 * re-derive el set cada uno por su lado.
 */
export function disabledDomainsForPersona(
    persona: Persona,
    alsoOther: boolean,
): Set<FeatureDomain> {
    const prefs = resolvePersonaPrefs(persona, alsoOther)
    const disabled = new Set<FeatureDomain>()
    for (const domain of FEATURE_DOMAIN_KEYS) {
        if (!prefs[domain][DOMAIN_ENABLED_KEY]) disabled.add(domain)
    }
    return disabled
}

/**
 * ORDEN DE PRIORIDAD de los 5 dominios por persona (Ola de orden W2.1).
 *
 * Es la MISMA tabla de `resolvePersonaPrefs` leida de otra forma: primero los dominios que la
 * persona deja PRENDIDOS con la segunda pregunta en [No] (en el orden en que los usa en su dia a
 * dia), despues el resto. No decide visibilidad — eso lo siguen haciendo `_enabled` /
 * `disabledDomains`; esto solo decide QUE VA PRIMERO cuando la superficie hay que recortarla o
 * agruparla.
 *
 * Consumidores: la barra inferior de RN (W2.5), que pinta «2 dominios + Mas» y necesita saber
 * CUALES 2, y la hoja «Mas» (W2.6), que lista el resto en el mismo orden. El sidebar web (W2.4)
 * no la usa: alli manda el orden del registro de `@eva/coach-nav`.
 *
 * `other` es ademas el FALLBACK para persona `null` (coach anterior al onboarding v2, o que la
 * salteo): panel completo, orden neutro entrenamiento-primero.
 *
 * Invariante testeado: cada array trae los 5 `FEATURE_DOMAIN_KEYS` sin duplicados, y los
 * dominios ON de `resolvePersonaPrefs(persona, false)` ocupan el PREFIJO del array.
 */
export const PERSONA_DOMAIN_ORDER: Record<Persona, readonly FeatureDomain[]> = {
    strength: ['training', 'nutrition', 'cardio', 'movement', 'bodycomp'],
    nutrition: ['nutrition', 'bodycomp', 'training', 'cardio', 'movement'],
    rehab: ['training', 'movement', 'nutrition', 'cardio', 'bodycomp'],
    endurance: ['training', 'cardio', 'nutrition', 'movement', 'bodycomp'],
    other: ['training', 'nutrition', 'cardio', 'movement', 'bodycomp'],
}

// ---------------------------------------------------------------------------------------------
// Copy compartido del aviso «dominio apagado» (Ola de orden W1, mockup `9801fec7` 1A/2A/3A).
// Vive ACA y no en `apps/web/src/lib` porque lo pintan web (DomainOffNotice, DomainOffBanner) y
// RN (DomainOffNotice) con las MISMAS palabras: el coach no puede leer «Funciones» en un lado y
// «Mi panel» en el otro. Decision 1A del owner: se nombra la pantalla como se llama HOY
// («Opciones › Funciones»); W3 la renombro a «Funciones» cambiando SOLO `FUNCIONES_LABEL` (01-09).
// Las RUTAS no se comparten (web `/coach/settings/funciones`, RN `/coach/settings/mi-panel`):
// cada app las declara en su propio `lib/domain-off.ts`.
// ---------------------------------------------------------------------------------------------

/** Nombre visible de la pantalla donde se prende/apaga un dominio (W3: «Funciones» en web y RN). */
export const FUNCIONES_LABEL = 'Funciones' as const

/** Ruta de migas que precede a `FUNCIONES_LABEL` en el copy («Opciones › Funciones»). */
export const FUNCIONES_BREADCRUMB = `Opciones › ${FUNCIONES_LABEL}` as const

/** Nombre visible de cada dominio (banner, avisos in-page y pantalla de funciones). */
export const DOMAIN_LABELS: Record<FeatureDomain, string> = {
    nutrition: 'Nutrición',
    training: 'Entrenamiento',
    cardio: 'Cardio',
    movement: 'Movimiento',
    bodycomp: 'Composición corporal',
}

/** Genero gramatical del label, para concordar «apagado/apagada», «préndelo/préndela». */
export const DOMAIN_GENDER: Record<FeatureDomain, 'm' | 'f'> = {
    nutrition: 'f',
    training: 'm',
    cardio: 'm',
    movement: 'm',
    bodycomp: 'f',
}

/** Que se conserva y que se recupera al prender, por dominio (segunda oracion del aviso in-page). */
const DOMAIN_OFF_KEEP: Record<FeatureDomain, string> = {
    nutrition: 'Tus planes se conservan; préndela para volver a verlos.',
    training: 'Tus programas se conservan; préndelo para volver a verlos.',
    cardio: 'Tus datos se conservan; préndelo para volver a usar zonas, pace e intervalos.',
    movement: 'Tus screenings se conservan; préndelo para volver a evaluar.',
    bodycomp: 'Tus mediciones se conservan; préndela para volver a verlas.',
}

export interface DomainOffCopy {
    /** «Cardio está apagado en tu panel» */
    title: string
    /** «Lo apagaste en Opciones › Funciones. Tus datos se conservan; préndelo para…» */
    body: string
    /** «Prender en Funciones» */
    cta: string
}

/**
 * Copy del aviso IN-PAGE «dominio apagado» (`DomainOffNotice` web y RN, mockup 3A/C). Sin plan,
 * sin precio, sin urgencia: es una preferencia del propio coach, no un upsell.
 */
export function domainOffCopy(domain: FeatureDomain): DomainOffCopy {
    const label = DOMAIN_LABELS[domain]
    const f = DOMAIN_GENDER[domain] === 'f'
    return {
        title: `${label} está ${f ? 'apagada' : 'apagado'} en tu panel`,
        body: `${f ? 'La' : 'Lo'} apagaste en ${FUNCIONES_BREADCRUMB}. ${DOMAIN_OFF_KEEP[domain]}`,
        cta: `Prender en ${FUNCIONES_LABEL}`,
    }
}

export interface DomainOffBannerCopy {
    /** «Nutrición está apagada en tu panel.» */
    title: string
    /** «Préndela en Opciones › Funciones para volver a verla.» */
    hint: string
    /** «Ir a Mi panel» */
    cta: string
}

/**
 * Copy del BANNER del dashboard cuando una ruta apagada devolvio al coach
 * (`?notice=domain_off&domain=…`, mockup 1A/2A). Una linea, tono neutro, se cierra con ×.
 */
export function domainOffBannerCopy(domain: FeatureDomain): DomainOffBannerCopy {
    const label = DOMAIN_LABELS[domain]
    const f = DOMAIN_GENDER[domain] === 'f'
    return {
        title: `${label} está ${f ? 'apagada' : 'apagado'} en tu panel.`,
        hint: `${f ? 'Préndela' : 'Préndelo'} en ${FUNCIONES_BREADCRUMB} para volver a ${f ? 'verla' : 'verlo'}.`,
        cta: `Ir a ${FUNCIONES_LABEL}`,
    }
}
