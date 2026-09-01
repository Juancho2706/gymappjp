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
 * `getVisibleNavItems` / `groupNavItems` (y las heredadas `splitNavItems` / `splitForSidebar`, hoy
 * `@deprecated`) son funciones PURAS (unit-testeables sin render). `coachWorkspaceTypeFromKind`
 * puentea el enum de mobile
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
     * Dominio de feature-prefs al que pertenece. Valores validos = keys de `FEATURE_DOMAINS`
     * (@eva/feature-prefs): 'nutrition' | 'training' | 'cardio' | 'movement' | 'bodycomp'. Se
     * declara como `string` para no acoplar este registro a ese paquete (ambos son puros y no se
     * importan entre si, patron de `ModuleKey` mas arriba).
     *
     * Si el coach apago el master switch `_enabled` de ese dominio, la entrada se oculta.
     * Ortogonal a `entitlement` (billing): esto es PREFERENCIA, no capability — y las dos reglas
     * COMPONEN (Cardio necesita el modulo comprado Y el dominio prendido). Onboarding v2: la
     * persona del coach siembra ese `_enabled` por dominio, asi el panel se achica solo
     * (SPEC coach-onboarding-v2 §2). Fail-open: dominio sin preferencia => visible.
     */
    featureDomain?: string
    /**
     * Rutas EXTRA (además de `href`) bajo las cuales esta entrada se marca como activa en el nav.
     * Uso: swaps bajo canary donde una ruta alterna (ej. `/coach/nutrition-v2`) debe iluminar el
     * mismo item que la ruta canónica (`/coach/nutrition-plans`). El matcher (`isNavItemActiveForPath`)
     * trata cada alias con el mismo prefijo que `href` (exacto o subruta). Ausente ⇒ solo `href`.
     */
    activeAliases?: ReadonlyArray<string>
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
    { key: 'programs', href: '/coach/workout-programs', label: 'Programas', shortLabel: 'Planes', icon: 'ClipboardList', contexts: ALL, featureDomain: 'training' },
    // Movida 2 (declutter IA): 'exercises' ya NO es entrada top-level (paso a un boton dentro de
    // Programas). La ruta /coach/exercises sigue VIVA (deep links / app alumno). Cero cambio de capability.
    { key: 'nutrition', href: '/coach/nutrition-plans', label: 'Nutrición', shortLabel: 'Nutri', icon: 'Apple', contexts: ALL, featureDomain: 'nutrition', activeAliases: ['/coach/nutrition-v2'] },
    // Ola de orden W2.2 — acceso DIRECTO a la pantalla que prende/apaga dominios (la ruta
    // /coach/settings/funciones ya existe desde el onboarding v2, commit d8286e95). Va ANTES de
    // "Opciones" porque el grupo Gestion y la hoja «Mas» de RN se leen Equipo -> Funciones ->
    // Opciones -> Soporte. Sin `entitlement` y sin `featureDomain`: es el interruptor, no puede
    // apagarse a si mismo.
    //
    // El label "Funciones" ADELANTA el renombre de W3: la pagina web hoy se titula «Mi panel» y
    // W3.1/W3.3 la renombran (y cambian `FUNCIONES_LABEL` en @eva/feature-prefs). Este paquete NO
    // importa @eva/feature-prefs a proposito (ambos son puros y desacoplados, ver el comentario de
    // `featureDomain` mas arriba), por eso el literal se repite aca.
    { key: 'funciones', href: '/coach/settings/funciones', label: 'Funciones', shortLabel: 'Func.', icon: 'SlidersHorizontal', contexts: ['coach_standalone', 'coach_team'] },
    // Movida 1 (hub "Opciones"): standalone colapsa Mi Marca + Suscripcion en UNA entrada
    // "Opciones" -> /coach/settings (cards dentro del hub). Cero cambio de capability.
    { key: 'options', href: '/coach/settings', label: 'Opciones', shortLabel: 'Opcs.', icon: 'Settings', contexts: ['coach_standalone'] },
    // C (Settings hub): mismo href que 'options' pero en contexto TEAM — la pagina es
    // context-aware (hub: modulos del pool + Mi Equipo + cuenta; sin marca personal).
    { key: 'settings_team', href: '/coach/settings', label: 'Opciones', shortLabel: 'Opcs.', icon: 'Settings', contexts: ['coach_team'] },
    { key: 'support', href: '/coach/support', label: 'Soporte', shortLabel: 'Ayuda', icon: 'LifeBuoy', contexts: ALL },
    // Cardio y Movimiento (Ola de orden W2.1B): ya NO llevan `entitlement`. D1 («todo incluido en
    // todos los planes, solo se cobra el cupo») dejo sin sentido el gate por modulo comprado, asi
    // que la visibilidad la gobierna SOLO `featureDomain` + `disabledDomains` — es decir, la
    // preferencia del coach. El kill-switch de operador, si algun dia hace falta, vive en la RUTA
    // (server-side), nunca en este registro. Siguen al final del array a proposito: en mobile el
    // bottom bar renderiza plano por orden de registro.
    { key: 'cardio', href: '/coach/cardio', label: 'Cardio', shortLabel: 'Cardio', icon: 'HeartPulse', contexts: ['coach_standalone', 'coach_team'], featureDomain: 'cardio' },
    { key: 'movement', href: '/coach/movement', label: 'Movimiento', shortLabel: 'Movim.', icon: 'PersonStanding', contexts: ['coach_standalone', 'coach_team'], featureDomain: 'movement' },
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
     *
     * El filtro es GENERICO: sirve para cualquier dominio del registro, no solo 'nutrition'. Los
     * consumidores que hoy solo resuelven nutricion (web `coach/layout.tsx`, RN
     * `CoachMobileChrome`) siguen viendo Programas/Cardio/Movimiento porque esos dominios no
     * llegan en el set. `disabledDomainsForPersona` (@eva/feature-prefs) arma el set completo.
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
 *  3. Cuentas managed (org_managed/team_managed) nunca ven "Opciones" standalone NI "Funciones"
 *     (cinturon extra): a un coach administrado por team/org el panel se lo define el tenant, y
 *     las dos pantallas ya lo rechazan (RN `settings/mi-panel.tsx`, web `settings/funciones`).
 *  4. Item con `entitlement` OFF => oculto (espejo visual; el gate real es server-side). Desde
 *     W2.1B NINGUNA entrada del registro declara `entitlement` — el mecanismo queda vivo para un
 *     modulo futuro, pero hoy no filtra nada.
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
        if (isManaged && (item.key === 'options' || item.key === 'funciones')) return false
        if (item.entitlement && ctx.enabledModules?.[item.entitlement] !== true) return false
        if (item.featureDomain && disabledDomains?.has(item.featureDomain)) return false
        return true
    })
}

/**
 * ¿La entrada `item` está activa para `pathname`? Coincide su `href` o cualquiera de sus
 * `activeAliases`, con el criterio de prefijo estándar del nav: match EXACTO o SUBRUTA
 * (`pathname === base || pathname.startsWith(base + '/')`). PURA (sin React/router), para que web
 * y mobile compartan el matcher y sea unit-testeable. Habilita que rutas alternas bajo canary
 * (ej. `/coach/nutrition-v2`) iluminen el mismo item que la ruta canónica.
 */
export function isNavItemActiveForPath(item: NavModule, pathname: string): boolean {
    const matches = (base: string) => pathname === base || pathname.startsWith(base + '/')
    if (matches(item.href)) return true
    return (item.activeAliases ?? []).some(matches)
}

/**
 * Particiona los items visibles en `core` (siempre presentes) y `modules` (toggleables).
 * Discriminador: `item.entitlement != null`. Funcion PURA; preserva el orden relativo.
 *
 * @deprecated Ola de orden W2.1B — ninguna entrada del registro declara ya `entitlement`, asi que
 * `modules` sale SIEMPRE vacio y `core` es la lista entera. Se conserva porque el mecanismo
 * `entitlement` sigue vivo en el tipo para un modulo futuro. Para agrupar el nav usar
 * `groupNavItems`.
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
 *
 * @deprecated Ola de orden W2.3 — su unico consumidor real (`CoachSidebar.tsx`) destructura solo
 * `primary`, por lo que `secondary` NUNCA se pinta: Soporte (y antes Cardio/Movimiento) quedaban
 * invisibles en el sidebar. Ademas, tras W2.1B el tramo de modulos de `secondary` sale siempre
 * vacio. Usar `groupNavItems`; W2.4 migra CoachSidebar y ahi esta funcion se retira.
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

/**
 * Orden CANONICO del grupo «Gestion» (`groupNavItems`). Es un orden de LECTURA, no el del
 * registro: primero el equipo, despues el interruptor del panel, despues el hub de opciones y al
 * final la ayuda. Las keys que no figuren aca caen al final del grupo, en orden de registro.
 */
export const GESTION_ORDER: ReadonlyArray<string> = ['team', 'funciones', 'options', 'settings_team', 'support']

/** Los 3 grupos con los que el sidebar (W2.4) y la hoja «Mas» de RN (W2.6) pintan el nav. */
export type NavGroups = {
    /** Entrada al panel: Dashboard + Alumnos, en ese orden. */
    principal: NavModule[]
    /** Los dominios de trabajo prendidos (items con `featureDomain`), en orden de registro. */
    trabajo: NavModule[]
    /** Todo lo demas (equipo, funciones, opciones, soporte), en `GESTION_ORDER`. */
    gestion: NavModule[]
}

/**
 * Agrupa los items YA FILTRADOS por `getVisibleNavItems` en Principal / Tu trabajo / Gestion.
 * PURA: no vuelve a filtrar nada (ni contexto, ni dominios, ni status) — lo que entra, sale.
 *
 * Por que existe: `splitForSidebar` devolvia `{primary, secondary}` y `CoachSidebar` solo pintaba
 * `primary` (observacion wf-webIA), asi que Soporte —y, con el entitlement puesto, Cardio y
 * Movimiento— eran invisibles en el sidebar aunque estuvieran habilitados. Agrupar por SIGNIFICADO
 * (`featureDomain` != null = «tu trabajo») en vez de por mecanismo de gating deja los 3 grupos
 * pintables y hace imposible que un item se pierda: la union de los 3 es la lista de entrada.
 *
 * Reglas:
 *  - `principal`: keys `dashboard` y `clients`, en ESE orden (no el de entrada).
 *  - `trabajo`: items con `featureDomain != null`, en orden de entrada (= orden de registro:
 *    programs, nutrition, cardio, movement). `bodycomp` no tiene entrada de nav (OUTLINE §3).
 *  - `gestion`: el resto, reordenado por `GESTION_ORDER`; lo no listado (p. ej. `reactivate`, si
 *    el llamador pasa el item de status bloqueado) va al final en orden de entrada.
 *
 * Consumidores: `CoachSidebar` (W2.4) y la hoja «Mas» de RN (W2.6).
 */
export function groupNavItems(items: NavModule[]): NavGroups {
    const principal: NavModule[] = []
    const trabajo: NavModule[] = []
    const gestion: NavModule[] = []

    for (const item of items) {
        if (item.key === 'dashboard' || item.key === 'clients') principal.push(item)
        else if (item.featureDomain != null) trabajo.push(item)
        else gestion.push(item)
    }

    // Principal se pinta en orden fijo (Dashboard, Alumnos), no en el de entrada.
    const principalOrder = ['dashboard', 'clients']
    principal.sort((a, b) => principalOrder.indexOf(a.key) - principalOrder.indexOf(b.key))

    // Gestion: las keys conocidas en GESTION_ORDER; las desconocidas quedan al final, estables.
    const rank = (item: NavModule) => {
        const i = GESTION_ORDER.indexOf(item.key)
        return i === -1 ? GESTION_ORDER.length : i
    }
    gestion.sort((a, b) => rank(a) - rank(b))

    return { principal, trabajo, gestion }
}
