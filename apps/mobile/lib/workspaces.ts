import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from './supabase'
import { getMyTeamOverview } from './team'
import { getCoachOrgContext } from './org'
import type { CoachWorkspaceType } from './coach-nav'

/**
 * Workspaces del coach (mobile) — espejo de la lista que la web arma con
 * listUserWorkspacesForRender + getPreferredWorkspaceForRender (apps/web/src/services/auth/
 * workspace-render-cache.ts) y consume WorkspaceSwitcher.
 *
 * Mobile coach v1 deriva los workspaces disponibles de la sesión:
 *  - standalone (siempre, salvo cuenta puramente org-managed)
 *  - team (si el coach pertenece a un pool — getMyTeamOverview)
 *  - enterprise (si la sesión trae org_id en app_metadata)
 *
 * El workspace ACTIVO se persiste local (AsyncStorage) — el cambio de contexto en mobile no
 * requiere round-trip de cookie/server-action (el nav gating es client-side, espejo visual; el
 * gate real de datos es RLS). Si solo hay 1 workspace, el switcher no se muestra (igual que web).
 */

export interface WorkspaceSummary {
  key: string
  type: CoachWorkspaceType
  label: string
  /** id del contexto: teamId para team, orgId para enterprise, null para standalone. */
  contextId: string | null
}

const ACTIVE_WS_KEY = 'eva_active_workspace_key'

const TYPE_LABELS: Record<CoachWorkspaceType, string> = {
  coach_standalone: 'coach standalone',
  enterprise_coach: 'enterprise coach',
  coach_team: 'coach team',
}

export function workspaceTypeLabel(type: CoachWorkspaceType): string {
  return TYPE_LABELS[type] ?? type
}

/** Lista los workspaces disponibles para el coach actual (>=1). */
export async function listWorkspaces(): Promise<WorkspaceSummary[]> {
  const { data: auth } = await supabase.auth.getUser()
  const userId = auth.user?.id
  if (!userId) return []

  const [team, org, coachRow] = await Promise.all([
    getMyTeamOverview().catch(() => null),
    getCoachOrgContext().catch(() => ({ orgId: null, orgName: null } as any)),
    supabase.from('coaches').select('brand_name, full_name').eq('id', userId).maybeSingle(),
  ])

  const out: WorkspaceSummary[] = []
  const coachLabel =
    (coachRow.data as any)?.brand_name || (coachRow.data as any)?.full_name || 'Mi negocio EVA'

  // Enterprise context (si la sesión lo trae) reemplaza el standalone como contexto base.
  if (org?.orgId) {
    out.push({ key: `enterprise_coach:${org.orgId}`, type: 'enterprise_coach', label: org.orgName ?? 'Mi organización', contextId: org.orgId })
  } else {
    out.push({ key: 'coach_standalone', type: 'coach_standalone', label: coachLabel, contextId: null })
  }

  if (team) {
    out.push({ key: `coach_team:${team.id}`, type: 'coach_team', label: team.name, contextId: team.id })
  }

  return out
}

/** Devuelve el workspace activo persistido (o el primero como default). */
export async function getActiveWorkspace(workspaces: WorkspaceSummary[]): Promise<WorkspaceSummary | null> {
  if (workspaces.length === 0) return null
  try {
    const saved = await AsyncStorage.getItem(ACTIVE_WS_KEY)
    if (saved) {
      const found = workspaces.find((w) => w.key === saved)
      if (found) return found
    }
  } catch {
    // ignore
  }
  return workspaces[0]
}

/** Persiste la selección de workspace activo. */
export async function setActiveWorkspace(key: string): Promise<void> {
  try {
    await AsyncStorage.setItem(ACTIVE_WS_KEY, key)
  } catch {
    // ignore
  }
}
