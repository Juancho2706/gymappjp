/**
 * @eva/coach-nav — registro PURO del nav del coach (SEAM E7-09).
 *
 * DATO puro y compartido (items, labels, iconos como KEY string, orden, reglas de
 * visibilidad/gating por modulo + workspace + estado de suscripcion). TypeScript puro:
 * CERO React / Next / Supabase / React Native / lucide. El componente de icono se resuelve
 * por LADO (web mapea `icon` -> lucide-react; mobile -> lucide-react-native), por eso el
 * registro guarda el nombre del icono como string, no el componente.
 *
 * Fuente de verdad UNICA reutilizada por web (CoachSidebar) y mobile (CoachMobileChrome +
 * layout de tabs). Extraido desde apps/web/src/components/coach/coach-nav.ts en E7-09 para
 * que web y mobile deriven la MISMA matriz de tabs (evita el drift del smoke 2026-06-09:
 * josefit standalone veia "Equipo").
 *
 * `getVisibleNavItems` / `splitNavItems` / `splitForSidebar` son funciones PURAS
 * (unit-testeables sin render). `coachWorkspaceTypeFromKind` puentea el enum de mobile
 * (`WorkspaceKind`) al de la web (`CoachWorkspaceType`) para que mobile no re-derive.
 */

/**
 * Las 4 keys de modulos de pago. Espejo de MODULE_KEYS
 * (apps/web/src/services/entitlements.service.ts) y de MODULE_CATALOG_KEYS
 * (@eva/module-catalog). Se declara local (paquete puro, sin depender de la app ni de otro
 * paquete) siguiendo el patron de workspace-core.ts, que tambien espeja constantes.
 */
export type ModuleKey = 'cardio' | 'movement_assessment' | 'body_composition' | 'nutrition_exchanges'

/** Mapa parcial modulo -> habilitado. Estructuralmente identico a EnabledModules de la web. */
export type EnabledModules = Partial<Record<ModuleKey, boolean>>

/**
 * Estados que bloquean el panel del coach SIN gracia. Espejo EXACTO de
 * SUBSCRIPTION_BLOCKED_STATUSES (apps/web/src/lib/constants.ts) y de la copia de
 * workspace-core.ts (mobile). `canceled` NO esta (conserva acceso hasta current_period_end);
 * `org_managed`/`team_managed` tampoco (acceso siempre).
 */
export const SUBSCRIPTION_BLOCKED_STATUSES = ['pending_payment', 'expired', 'past_due', 'paused'] as const

/** Los 3 contextos (flujos) del coach — subset coach de WorkspaceType (web). */
export type CoachWorkspaceType = 'coach_standalone' | 'enterprise_coach' | 'coach_team'

/**
 * Enum de contexto que expone el hook de workspace de MOBILE (workspace-core `WorkspaceKind`).
 * `coachWorkspaceTypeFromKind` lo colapsa a `CoachWorkspaceType` (owner|member -> coach_team).
 */
export type CoachWorkspaceKind = 'standalone' | 'team_owner' | 'team_member' | 'enterprise'

export type NavModule = {
    key: string
    href: string
    label: string
    shortLabel?: string
    /**
     * KEY del icono (nombre lucide, p. ej. 'HeartPulse'). El componente se resuelve por lado:
     * web -> lucide-react; mobile -> lucide-react-native. Cada plataforma puede overridear el
     * icono visible por `key` (diseno) sin tocar el registro.
     */
    icon: string
    contexts: ReadonlyArray<CoachWorkspaceType>
    /**
     * Gancho de modulo toggleable (cardio, movimiento, ...) de enabled_modules. La entrada se
     * muestra solo con el entitlement ON para el contexto activo.
     */
    entitlement?: ModuleKey
    /**
     * Dominio de feature-prefs al que pertenece (ej. 'nutrition'). Si el coach apago el master
     * switch `_enabled` de ese dominio, la entrada se oculta. Ortogonal a `entitlement` (billing):
     * esto es PREFERENCIA, no capability.
     */
    featureDomain?: string
}

const ALL: ReadonlyArray<CoachWorkspaceType> = ['coach_standalone', 'enterprise_coach', 'coach_team']

/**
 * NAV COMO REGISTRO DE MODULOS — unica fuente de verdad del menu del coach. Cada flujo
 * (standalone / enterprise / team) muestra SOLO sus modulos via `contexts`:
 *  - "Equipo" SOLO en coach_team; "Opciones" (hub marca + suscripcion) SOLO en standalone
 *    (en org/team la marca y el cobro son del tenant; el team usa su propio hub `settings_team`).
 *  - Los modulos toggleables (cardio/movement) van AL FINAL a proposito: en mobile el bottom bar
 *    renderiza plano por orden de registro => quedan contiguos al final. En desktop el orden lo
 *    impone `splitForSidebar` (grupo "Mas"), no el registro.
 */
export const NAV_MODULES: ReadonlyArray<NavModule> = [
    { key: 'dashboard', href: '/coach/dashboard', label: 'Dashboard', shortLabel: 'Inicio', icon: 'LayoutDashboard', contexts: ALL },
    { key: 'clients', href: '/coach/clients', label: 'Alumnos', icon: 'Users', contexts: ALL },
    { key: 'team', href: '/coach/team', label: 'Equipo', shortLabel: 'Team', icon: 'UsersRound', contexts: ['coach_team'] },
    { key: 'programs', href: '/coach/workout-programs', label: 'Programas', shortLabel: 'Planes', icon: 'ClipboardList', contexts: ALL },
    // Movida 2 (declutter IA): 'exercises' ya NO es entrada top-level (paso a un boton dentro de
    // Programas). La ruta /coach/exercises sigue VIVA (deep links / app alumno). Cero cambio de capability.
    { key: 'nutrition', href: '/coach/nutrition-plans', label: 'Nutrición', shortLabel: 'Nutri', icon: 'Apple', contexts: ALL, featureDomain: 'nutrition' },
    // Movida 1 (hub "Opciones"): standalone colapsa Mi Marca + Suscripcion en UNA entrada
    // "Opciones" -> /coach/settings (cards dentro del hub). Cero cambio de capability.
    { key: 'options', href: '/coach/settings', label: 'Opciones', shortLabel: 'Opcs.', icon: 'Settings', contexts: ['coach_standalone'] },
    // C (Settings hub): mismo href que 'options' pero en contexto TEAM — la pagina es
    // context-aware (hub: modulos del pool + Mi Equipo + cuenta; sin marca personal).
    { key: 'settings_team', href: '/coach/settings', label: 'Opciones', shortLabel: 'Opcs.', icon: 'Settings', contexts: ['coach_team'] },
    { key: 'support', href: '/coach/support', label: 'Soporte', shortLabel: 'Ayuda', icon: 'LifeBuoy', contexts: ALL },
    // Modulos toggleables (compra-only): visibles solo con el entitlement ON; enterprise excluido en v1.
    { key: 'cardio', href: '/coach/cardio', label: 'Cardio', shortLabel: 'Cardio', icon: 'HeartPulse', contexts: ['coach_standalone', 'coach_team'], entitlement: 'cardio' },
    { key: 'movement', href: '/coach/movement', label: 'Movimiento', shortLabel: 'Movim.', icon: 'PersonStanding', contexts: ['coach_standalone', 'coach_team'], entitlement: 'movement_assessment' },
]

export const REACTIVATE_NAV_ITEM: NavModule = {
    key: 'reactivate',
    href: '/coach/reactivate',
    label: 'Reactivar',
    shortLabel: 'Pago',
    icon: 'LayoutDashboard',
    contexts: ALL,
}

export type VisibleNavContext = {
    /**
     * Workspace ACTIVO del coach. Acepta el `WorkspaceType` de la web o cualquier string; solo se
     * reconocen 'enterprise_coach' / 'coach_team' (el resto -> standalone). null/undefined => standalone.
     */
    activeWorkspaceType?: string | null
    subscriptionStatus?: string | null
    /** Modulos habilitados del CONTEXTO activo. Ausente => los items con `entitlement` se ocultan (default OFF). */
    enabledModules?: EnabledModules | null
    /**
     * Dominios de feature-prefs cuyo master switch `_enabled` el coach apago. Una entrada con
     * `featureDomain` en este set se oculta. Ausente/vacio => mostrar todo (fail-open, comportamiento de HOY).
     */
    disabledDomains?: ReadonlySet<string> | null
}

/**
 * Puente enum mobile (`WorkspaceKind`) -> `CoachWorkspaceType` (web). Owner y member colapsan a
 * coach_team (misma superficie de nav). Pura y testeable — mobile la usa para alimentar el ctx.
 */
export function coachWorkspaceTypeFromKind(kind: CoachWorkspaceKind): CoachWorkspaceType {
    switch (kind) {
        case 'team_owner':
        case 'team_member':
            return 'coach_team'
        case 'enterprise':
            return 'enterprise_coach'
        default:
            return 'coach_standalone'
    }
}

/**
 * Modulos visibles para el contexto activo. Reglas:
 *  1. Status bloqueado (past_due/expired/...) => solo "Reactivar".
 *  2. Cada modulo se muestra solo en sus `contexts`. Sin workspace => standalone.
 *  3. Cuentas managed (org_managed/team_managed) nunca ven "Opciones" standalone (cinturon extra).
 *  4. Item con `entitlement` OFF => oculto (espejo visual; el gate real es server-side).
 *  5. Item con `featureDomain` en `disabledDomains` (master switch apagado) => oculto.
 */
export function getVisibleNavItems(ctx: VisibleNavContext): NavModule[] {
    const status = ctx.subscriptionStatus ?? ''
    if (new Set<string>(SUBSCRIPTION_BLOCKED_STATUSES).has(status)) {
        return [REACTIVATE_NAV_ITEM]
    }

    const active: CoachWorkspaceType =
        ctx.activeWorkspaceType === 'enterprise_coach' || ctx.activeWorkspaceType === 'coach_team'
            ? ctx.activeWorkspaceType
            : 'coach_standalone'

    const isManaged = status === 'org_managed' || status === 'team_managed'
    const disabledDomains = ctx.disabledDomains ?? null

    return NAV_MODULES.filter((item) => {
        if (!item.contexts.includes(active)) return false
        if (isManaged && item.key === 'options') return false
        if (item.entitlement && ctx.enabledModules?.[item.entitlement] !== true) return false
        if (item.featureDomain && disabledDomains?.has(item.featureDomain)) return false
        return true
    })
}

/**
 * Particiona los items visibles en `core` (siempre presentes) y `modules` (toggleables).
 * Discriminador: `item.entitlement != null`. Funcion PURA; preserva el orden relativo.
 */
export function splitNavItems(items: NavModule[]): { core: NavModule[]; modules: NavModule[] } {
    const core: NavModule[] = []
    const modules: NavModule[] = []
    for (const item of items) {
        if (item.entitlement != null) modules.push(item)
        else core.push(item)
    }
    return { core, modules }
}

/**
 * Particion para el SIDEBAR/CHROME. Separa los items visibles en:
 *  - `primary`: navegacion principal (nucleo de trabajo).
 *  - `secondary`: grupo "Mas" (Soporte + los modulos comprados/toggleables).
 * Discriminador: `item.key === 'support'` OR `item.entitlement != null`. PURA; preserva el orden.
 */
export function splitForSidebar(items: NavModule[]): { primary: NavModule[]; secondary: NavModule[] } {
    const primary: NavModule[] = []
    const secondary: NavModule[] = []
    for (const item of items) {
        if (item.key === 'support' || item.entitlement != null) secondary.push(item)
        else primary.push(item)
    }
    return { primary, secondary }
}
