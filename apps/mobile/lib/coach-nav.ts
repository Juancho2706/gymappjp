import {
  Apple,
  ClipboardList,
  HeartPulse,
  LayoutDashboard,
  LifeBuoy,
  PersonStanding,
  Settings,
  Users,
  UsersRound,
  type LucideIcon,
} from 'lucide-react-native'
import type { ModuleKey } from './entitlements'

/**
 * NAV COMO REGISTRO DE MÓDULOS — espejo MOBILE de la web
 * (apps/web/src/components/coach/coach-nav.ts: NAV_MODULES / getVisibleNavItems / splitNavItems).
 *
 * ── Anti-drift ──────────────────────────────────────────────────────────────────
 * El registro, los `contexts`, los `entitlement` y la lógica de visibilidad se espejan INLINE acá
 * porque @/components/coach/coach-nav NO es resoluble desde mobile (paths/deps distintos). Si cambia
 * NAV_MODULES o getVisibleNavItems en la web, actualizar este archivo.
 *
 * Diferencias intencionales web↔mobile (no son drift):
 *  - La web colapsa 'brand' (Mi Marca) + 'billing' (Suscripción) en la entrada "Opciones"
 *    (key 'options', href /coach/settings). En mobile el hub "Opciones" vive en la pantalla
 *    `perfil` (tab) que consolida Mi Marca + Suscripción + Áreas + Funciones + Módulos + cuenta.
 *    Por eso la entrada del registro mobile apunta a la ruta de tab '/coach/perfil'.
 *  - 'team' (key) en web es /coach/team. En mobile el acceso a "Mi equipo" vive dentro del hub
 *    perfil; igual lo declaramos en el registro para que aparezca en "Más" cuando el contexto sea
 *    team (paridad de visibilidad).
 */

export type CoachWorkspaceType = 'coach_standalone' | 'enterprise_coach' | 'coach_team'

export type NavModule = {
  key: string
  /** Nombre del screen de la tab (expo-router) — NO una URL. Match con (tabs)/<route>. */
  route: string
  label: string
  shortLabel: string
  icon: LucideIcon
  contexts: ReadonlyArray<CoachWorkspaceType>
  entitlement?: ModuleKey
  featureDomain?: string
}

const ALL: ReadonlyArray<CoachWorkspaceType> = ['coach_standalone', 'enterprise_coach', 'coach_team']

/**
 * Espejo de SUBSCRIPTION_BLOCKED_STATUSES (apps/web/src/lib/constants.ts). Status bloqueado ⇒ el
 * nav colapsa a [Reactivar]. 'canceled' NO está (acceso hasta current_period_end); 'org_managed'/
 * 'team_managed' tampoco (cuentas gestionadas siempre tienen acceso).
 */
export const SUBSCRIPTION_BLOCKED_STATUSES = ['pending_payment', 'expired', 'past_due', 'paused'] as const

/**
 * Registro de tabs del coach (mobile). El ORDEN define el orden del bottom bar + "Más".
 * Espejo de NAV_MODULES: dashboard, clients, team, programs, nutrition, options, support, +módulos.
 */
export const NAV_MODULES: ReadonlyArray<NavModule> = [
  { key: 'dashboard', route: 'home', label: 'Dashboard', shortLabel: 'Inicio', icon: LayoutDashboard, contexts: ALL },
  { key: 'clients', route: 'clientes', label: 'Alumnos', shortLabel: 'Alumnos', icon: Users, contexts: ALL },
  { key: 'team', route: 'team', label: 'Equipo', shortLabel: 'Team', icon: UsersRound, contexts: ['coach_team'] },
  { key: 'programs', route: 'builder', label: 'Programas', shortLabel: 'Planes', icon: ClipboardList, contexts: ALL },
  { key: 'nutrition', route: 'nutricion', label: 'Nutrición', shortLabel: 'Nutri', icon: Apple, contexts: ALL, featureDomain: 'nutrition' },
  // Hub "Opciones" — en mobile es la pantalla `perfil` (consolida Mi Marca + Suscripción + cuenta).
  { key: 'options', route: 'perfil', label: 'Opciones', shortLabel: 'Opcs.', icon: Settings, contexts: ['coach_standalone'] },
  { key: 'settings_team', route: 'perfil', label: 'Opciones', shortLabel: 'Opcs.', icon: Settings, contexts: ['coach_team'] },
  { key: 'support', route: 'support', label: 'Soporte', shortLabel: 'Ayuda', icon: LifeBuoy, contexts: ALL },
  // Módulos toggleables (compra-only): visibles solo con el entitlement ON. AL FINAL del registro
  // (igual que web) ⇒ quedan contiguos al final del overflow.
  { key: 'cardio', route: 'cardio', label: 'Cardio', shortLabel: 'Cardio', icon: HeartPulse, contexts: ['coach_standalone', 'coach_team'], entitlement: 'cardio' },
  { key: 'movement', route: 'movimiento', label: 'Movimiento', shortLabel: 'Movim.', icon: PersonStanding, contexts: ['coach_standalone', 'coach_team'], entitlement: 'movement_assessment' },
]

/** Item único cuando la suscripción está bloqueada. Espejo de REACTIVATE_NAV_ITEM. */
export const REACTIVATE_NAV_ITEM: NavModule = {
  key: 'reactivate',
  route: 'reactivar',
  label: 'Reactivar',
  shortLabel: 'Pago',
  icon: LayoutDashboard,
  contexts: ALL,
}

export type EnabledModules = Partial<Record<ModuleKey, boolean>>

export type VisibleNavContext = {
  activeWorkspaceType?: CoachWorkspaceType | null
  subscriptionStatus?: string | null
  enabledModules?: EnabledModules | null
  disabledDomains?: ReadonlySet<string> | null
}

/**
 * Módulos visibles para el contexto activo. Espejo EXACTO de getVisibleNavItems (web):
 *  1. Status bloqueado ⇒ solo [Reactivar].
 *  2. Cada módulo se muestra solo en sus `contexts`. Sin workspace ⇒ standalone.
 *  3. Cuentas managed (org_managed/team_managed) nunca ven "Opciones" standalone.
 *  4. Módulos toggleables: solo con el entitlement ON (default OFF).
 *  5. featureDomain apagado (master switch del coach) ⇒ ocultar la entrada.
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
 * Particiona en `core` (siempre presentes) y `modules` (comprados/toggleables). Espejo de
 * splitNavItems. Discriminador: `item.entitlement != null`. Preserva el orden de `items`.
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
 * Keys de los tabs PRIMARIOS del bottom bar (zona del pulgar). Espejo de MOBILE_PRIMARY_KEYS (web).
 * El resto del nav visible vive detrás de "Más".
 */
export const MOBILE_PRIMARY_KEYS = ['dashboard', 'clients', 'programs', 'nutrition'] as const
