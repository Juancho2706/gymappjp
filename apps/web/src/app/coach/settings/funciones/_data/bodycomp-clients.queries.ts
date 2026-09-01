import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { resolvePreferredWorkspace } from '@/services/auth/workspace.service'
import { listCardioClients } from '@/services/cardio-zones.service'

/** Lo minimo que el picker necesita de un alumno: a quien medir. */
export type BodycompClient = { id: string; full_name: string | null }

/**
 * Alumnos del workspace ACTIVO para el selector de Composicion corporal en «Funciones»
 * (Ola de orden W3.1). Hereda de `getToolsHubData` (launcher `/coach/tools`, demolido en W3.2)
 * el listado scoped 3-vias: team manda sobre el coach; enterprise v1 no tiene esta zona.
 *
 * A diferencia del original NO se gatea por `enabled_modules`: la regla del owner es que todo
 * esta en todos los planes y aca solo se decide QUE se ve (visibilidad). El techo real de quien
 * puede abrir la ficha lo siguen poniendo RLS y la pantalla destino.
 *
 * Se lee siempre (no solo con el dominio prendido) porque el master switch se prende sin
 * recargar: si la lista llegara condicionada, el «Abrir» recien prendido abriria un picker vacio.
 */
export const getBodycompClients = cache(async (): Promise<BodycompClient[]> => {
    const supabase = await createClient()
    // getClaims(): verificacion local del JWT (ES256), sin /user. El proxy ya validó la sesión.
    const { data: claims } = await supabase.auth.getClaims()
    const coachId = claims?.claims?.sub as string | undefined
    if (!coachId) return []

    const workspace = await resolvePreferredWorkspace(supabase, coachId)
    if (workspace?.type === 'enterprise_coach') return []
    const activeTeamId = workspace?.type === 'coach_team' ? workspace.teamId : null

    const rows = await listCardioClients(supabase, { coachId, activeTeamId })
    return rows.map((c) => ({ id: c.id, full_name: c.full_name }))
})
