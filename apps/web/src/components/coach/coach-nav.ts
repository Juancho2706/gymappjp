import {
    LayoutDashboard,
    Users,
    UsersRound,
    Settings,
    Apple,
    ClipboardList,
    LifeBuoy,
    HeartPulse,
    PersonStanding,
    type LucideIcon,
} from 'lucide-react'
import { SUBSCRIPTION_BLOCKED_STATUSES } from '@/lib/constants'
import type { WorkspaceType } from '@/domain/auth/types'
import type { EnabledModules, ModuleKey } from '@/services/entitlements.service'

/**
 * NAV COMO REGISTRO DE MÓDULOS — única fuente de verdad del menú del coach.
 *
 * Cada flujo (standalone / enterprise / team) muestra SOLO sus módulos:
 *  - `contexts`: workspaces donde el módulo existe. "Equipo" SOLO en coach_team;
 *    "Opciones" (hub de marca + suscripción) SOLO en standalone (en org/team la marca y el
 *    cobro son del tenant; el team usa su propio hub `settings_team`).
 *  - `entitlement`: gancho para los módulos toggleables (cardio, antropometría, intercambios…)
 *    de enabled_modules — declarado hoy, enforcement cuando entren esos módulos.
 *
 * `getVisibleNavItems` es una función PURA (unit-testeable sin render).
 */

export type CoachWorkspaceType = Extract<WorkspaceType, 'coach_standalone' | 'enterprise_coach' | 'coach_team'>

export type NavModule = {
    key: string
    href: string
    label: string
    shortLabel?: string
    icon: LucideIcon
    contexts: ReadonlyArray<CoachWorkspaceType>
    entitlement?: ModuleKey
}

const ALL: ReadonlyArray<CoachWorkspaceType> = ['coach_standalone', 'enterprise_coach', 'coach_team']

export const NAV_MODULES: ReadonlyArray<NavModule> = [
    { key: 'dashboard', href: '/coach/dashboard', label: 'Dashboard', shortLabel: 'Inicio', icon: LayoutDashboard, contexts: ALL },
    { key: 'clients', href: '/coach/clients', label: 'Alumnos', icon: Users, contexts: ALL },
    { key: 'team', href: '/coach/team', label: 'Equipo', shortLabel: 'Team', icon: UsersRound, contexts: ['coach_team'] },
    { key: 'programs', href: '/coach/workout-programs', label: 'Programas', shortLabel: 'Planes', icon: ClipboardList, contexts: ALL },
    // Movida 2 (declutter IA): 'exercises' ya NO es entrada top-level del nav — pasa a un botón
    // "Lista de ejercicios" dentro de Programas. La ruta /coach/exercises sigue VIVA (deep links,
    // bookmarks, app alumno /c/[slug]/exercises). Cero cambio de capability.
    { key: 'nutrition', href: '/coach/nutrition-plans', label: 'Nutrición', shortLabel: 'Nutri', icon: Apple, contexts: ALL },
    // Movida 1 (hub "Opciones"): standalone colapsa 'brand' (Mi Marca) + 'billing' (Suscripción)
    // en UNA sola entrada "Opciones" → /coach/settings. Marca y Suscripción pasan a ser CARDS
    // dentro del hub (el hub lo arma el UI agent). Cero cambio de capability.
    { key: 'options', href: '/coach/settings', label: 'Opciones', shortLabel: 'Opcs.', icon: Settings, contexts: ['coach_standalone'] },
    // C (Settings hub): mismo href que 'options' pero en contexto TEAM — la página es
    // context-aware (hub: módulos del pool + Mi Equipo + cuenta; sin marca personal).
    { key: 'settings_team', href: '/coach/settings', label: 'Opciones', shortLabel: 'Opcs.', icon: Settings, contexts: ['coach_team'] },
    { key: 'support', href: '/coach/support', label: 'Soporte', shortLabel: 'Ayuda', icon: LifeBuoy, contexts: ALL },
    // Módulos toggleables (compra-only — plan estrategia 03): visibles solo con el entitlement ON
    // para el contexto activo (enabledModules en getVisibleNavItems); enterprise excluido en v1.
    // AL FINAL del registro a propósito: en mobile el bottom bar renderiza plano por orden de
    // registro ⇒ los módulos comprados quedan contiguos al final del scroll horizontal. En desktop
    // el orden lo impone `splitNavItems` (grupo "MÓDULOS" bajo divisor), no el registro.
    { key: 'cardio', href: '/coach/cardio', label: 'Cardio', shortLabel: 'Cardio', icon: HeartPulse, contexts: ['coach_standalone', 'coach_team'], entitlement: 'cardio' },
    { key: 'movement', href: '/coach/movement', label: 'Movimiento', shortLabel: 'Movim.', icon: PersonStanding, contexts: ['coach_standalone', 'coach_team'], entitlement: 'movement_assessment' },
]

export const REACTIVATE_NAV_ITEM: NavModule = {
    key: 'reactivate',
    href: '/coach/reactivate',
    label: 'Reactivar',
    shortLabel: 'Pago',
    icon: LayoutDashboard,
    contexts: ALL,
}

export type VisibleNavContext = {
    /** Workspace ACTIVO del coach; null/undefined ⇒ standalone (coach single-contexto sin preferencia). */
    activeWorkspaceType?: WorkspaceType | null
    subscriptionStatus?: string | null
    /** Módulos habilitados del CONTEXTO activo (team ⇒ del pool; standalone ⇒ propios).
     *  Ausente/undefined ⇒ los items con `entitlement` se ocultan (default OFF). */
    enabledModules?: EnabledModules | null
}

/**
 * Módulos visibles para el contexto activo. Reglas:
 *  1. Status bloqueado (past_due/expired/...) ⇒ solo "Reactivar".
 *  2. Cada módulo se muestra solo en sus `contexts`. Sin workspace ⇒ standalone.
 *  3. Cuentas managed (org_managed/team_managed) nunca ven "Opciones" standalone (marca +
 *     suscripción) aunque el workspace activo sea standalone-like (no tienen identidad
 *     standalone — cinturón extra). El hub de team es `settings_team`, gateado por `contexts`.
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

    return NAV_MODULES.filter((item) => {
        if (!item.contexts.includes(active)) return false
        if (isManaged && item.key === 'options') return false
        // Módulos toggleables: solo con el entitlement ON (el gate real es server-side
        // via assertModule; esto es espejo visual — default OFF).
        if (item.entitlement && ctx.enabledModules?.[item.entitlement] !== true) return false
        return true
    })
}

/**
 * Particiona los items visibles del nav en `core` (siempre presentes) y `modules`
 * (módulos comprados/toggleables). Discriminador: `item.entitlement != null`.
 *
 * Se aplica SOBRE el resultado de `getVisibleNavItems` — los módulos OFF ya vienen filtrados,
 * así que `modules` solo contiene módulos con su entitlement ON. Cuando no hay ninguno,
 * `modules` queda vacío ⇒ el sidebar no renderiza el divisor "MÓDULOS" (grupo gratis).
 *
 * Función PURA (unit-testeable sin render); preserva el orden relativo de `items`.
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
