import { useCallback, useEffect, useState } from 'react'
import { AppState } from 'react-native'
import { supabase } from './supabase'
import { getCoachEnabledModules } from './entitlements'
import { getNutritionPrefs, DOMAIN_ENABLED_KEY, NUTRITION_DOMAIN } from './feature-prefs'
import { getCoachOrgContext } from './org'
import {
  getActiveWorkspace,
  listWorkspaces,
  setActiveWorkspace,
  type WorkspaceSummary,
} from './workspaces'
import type { CoachWorkspaceType, EnabledModules } from './coach-nav'

/**
 * Contexto de navegación del coach (mobile) — espejo de lo que el layout web
 * (apps/web/src/app/coach/layout.tsx) resuelve server-side y pasa a CoachSidebar:
 *  - subscriptionStatus (con override org_managed/team_managed por contexto activo)
 *  - activeWorkspaceType (gobierna qué módulos del nav se muestran)
 *  - enabledModules (toggleables del contexto activo)
 *  - disabledDomains (master switch de feature-prefs apagado por el coach)
 *  - workspaces + activeKey (para el WorkspaceSwitcher)
 *
 * Todo client-side (espejo visual del nav). El gate REAL de datos es RLS server-side.
 */

export interface CoachNavContext {
  loading: boolean
  subscriptionStatus: string | null
  activeWorkspaceType: CoachWorkspaceType | null
  enabledModules: EnabledModules
  disabledDomains: ReadonlySet<string>
  workspaces: WorkspaceSummary[]
  activeWorkspaceKey: string | null
  selectWorkspace: (ws: WorkspaceSummary) => void
}

export function useCoachNavContext(): CoachNavContext {
  const [loading, setLoading] = useState(true)
  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(null)
  const [enabledModules, setEnabledModules] = useState<EnabledModules>({})
  const [disabledDomains, setDisabledDomains] = useState<ReadonlySet<string>>(new Set())
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([])
  const [active, setActive] = useState<WorkspaceSummary | null>(null)

  const load = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser()
    const userId = auth.user?.id
    if (!userId) {
      setLoading(false)
      return
    }

    const [wsList, org, coachRow, modules, prefs] = await Promise.all([
      listWorkspaces().catch(() => [] as WorkspaceSummary[]),
      getCoachOrgContext().catch(() => ({ isOrgManaged: false } as any)),
      supabase.from('coaches').select('subscription_status').eq('id', userId).maybeSingle(),
      getCoachEnabledModules().catch(() => ({})),
      getNutritionPrefs().catch(() => null),
    ])

    const activeWs = await getActiveWorkspace(wsList)
    setWorkspaces(wsList)
    setActive(activeWs)

    // Override de estado por contexto activo (espejo del layout web).
    const rawStatus = (coachRow.data as any)?.subscription_status ?? null
    let status = rawStatus
    if (activeWs?.type === 'enterprise_coach' || org?.isOrgManaged) status = 'org_managed'
    else if (activeWs?.type === 'coach_team') status = 'team_managed'
    setSubscriptionStatus(status)

    // Módulos del contexto activo: team ⇒ del pool; standalone ⇒ propios.
    if (activeWs?.type === 'coach_team' && activeWs.contextId) {
      try {
        const { data: team } = await supabase
          .from('teams')
          .select('enabled_modules')
          .eq('id', activeWs.contextId)
          .maybeSingle()
        const em = (team as any)?.enabled_modules
        setEnabledModules(em && typeof em === 'object' ? em : {})
      } catch {
        setEnabledModules({})
      }
    } else if (activeWs?.type === 'enterprise_coach') {
      setEnabledModules({})
    } else {
      setEnabledModules(modules)
    }

    // Dominios apagados (master switch del coach). Nutrición v1.
    const sections = prefs?.sections ?? {}
    const nutritionEnabled = sections[DOMAIN_ENABLED_KEY] !== false
    setDisabledDomains(nutritionEnabled ? new Set() : new Set([NUTRITION_DOMAIN]))

    setLoading(false)
  }, [])

  useEffect(() => {
    load().catch(() => setLoading(false))
    // Refrescar al volver a foreground (espejo del visibilitychange web).
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') load().catch(() => {})
    })
    return () => sub.remove()
  }, [load])

  const selectWorkspace = useCallback((ws: WorkspaceSummary) => {
    setActive(ws)
    setActiveWorkspace(ws.key).catch(() => {})
    load().catch(() => {})
  }, [load])

  return {
    loading,
    subscriptionStatus,
    activeWorkspaceType: active?.type ?? null,
    enabledModules,
    disabledDomains,
    workspaces,
    activeWorkspaceKey: active?.key ?? null,
    selectWorkspace,
  }
}
