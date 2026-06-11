import {
    LayoutDashboard,
    Users,
    UsersRound,
    Dumbbell,
    Settings,
    Apple,
    ClipboardList,
    CreditCard,
    LifeBuoy,
    type LucideIcon,
} from 'lucide-react'
import { SUBSCRIPTION_BLOCKED_STATUSES } from '@/lib/constants'
import type { WorkspaceType } from '@/domain/auth/types'
import type { ModuleKey } from '@/services/entitlements.service'

/**
 * NAV COMO REGISTRO DE MÓDULOS — única fuente de verdad del menú del coach.
 *
 * Cada flujo (standalone / enterprise / team) muestra SOLO sus módulos:
 *  - `contexts`: workspaces donde el módulo existe. "Equipo" SOLO en coach_team;
 *    Mi Marca/Suscripción SOLO en standalone (en org/team la marca y el cobro son del tenant).
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
    { key: 'exercises', href: '/coach/exercises', label: 'Ejercicios', shortLabel: 'Ejer.', icon: Dumbbell, contexts: ALL },
    { key: 'nutrition', href: '/coach/nutrition-plans', label: 'Nutrición', shortLabel: 'Nutri', icon: Apple, contexts: ALL },
    { key: 'brand', href: '/coach/settings', label: 'Mi Marca', shortLabel: 'Marca', icon: Settings, contexts: ['coach_standalone'] },
    // C (Settings hub): mismo href que 'brand' pero en contexto TEAM — la página es
    // context-aware (hub: módulos del pool + Mi Equipo + cuenta; sin marca personal).
    { key: 'settings_team', href: '/coach/settings', label: 'Opciones', shortLabel: 'Opcs.', icon: Settings, contexts: ['coach_team'] },
    { key: 'billing', href: '/coach/subscription', label: 'Suscripción', shortLabel: 'Plan', icon: CreditCard, contexts: ['coach_standalone'] },
    { key: 'support', href: '/coach/support', label: 'Soporte', shortLabel: 'Ayuda', icon: LifeBuoy, contexts: ALL },
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
}

/**
 * Módulos visibles para el contexto activo. Reglas:
 *  1. Status bloqueado (past_due/expired/...) ⇒ solo "Reactivar".
 *  2. Cada módulo se muestra solo en sus `contexts`. Sin workspace ⇒ standalone.
 *  3. Cuentas managed (org_managed/team_managed) nunca ven Marca/Suscripción aunque el
 *     workspace activo sea standalone-like (no tienen identidad standalone — cinturón extra).
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
        if (isManaged && (item.key === 'brand' || item.key === 'billing')) return false
        return true
    })
}
