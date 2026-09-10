import { supabase } from './supabase'
import { selectWithFallback } from './db-compat'

export interface ClientProfile {
  id: string
  userId: string
  fullName: string
  coachId: string
  orgId: string | null
  isActive: boolean
  isArchived: boolean
  forcePasswordChange: boolean
  /** Ola 0: el alumno está pausado/archivado → no debe operar la app. */
  blocked: boolean
  /**
   * Alumno DEMO del coach (`clients.is_demo`). Se lee en el fetch RAÍZ del alumno —no en un select
   * condicional— porque el coach entra como su demo por «Vive tu app» (`lib/vive-tu-app.ts`) y NO
   * debe ver el modal de una sola vez de D5 (specs/cuenta-atras-en-pantalla, W5.5 · A7/R14/R32).
   * Aditivo: 0 queries nuevas. Si la columna no llega, `false` ⇒ el fallback es confiar en el
   * historial, que en el demo ya viene sembrado.
   */
  isDemo: boolean
}

const RICH = 'id, full_name, coach_id, org_id, is_active, is_archived, force_password_change, is_demo'
const MIN = 'id, full_name, coach_id, is_active, is_archived, force_password_change, is_demo'

export async function getClientProfile(): Promise<ClientProfile | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // selectWithFallback: si org_id no existe (prod standalone vieja), cae a la query sin org.
  const { data } = await selectWithFallback<any>(
    () => supabase.from('clients').select(RICH).eq('id', user.id).maybeSingle(),
    () => supabase.from('clients').select(MIN).eq('id', user.id).maybeSingle()
  )

  if (!data) return null
  const isActive = data.is_active !== false // default true si null/ausente
  const isArchived = data.is_archived === true
  return {
    id: data.id,
    userId: user.id,
    fullName: data.full_name,
    coachId: data.coach_id,
    orgId: data.org_id ?? null,
    isActive,
    isArchived,
    forcePasswordChange: data.force_password_change === true,
    blocked: isArchived || !isActive,
    isDemo: data.is_demo === true,
  }
}
