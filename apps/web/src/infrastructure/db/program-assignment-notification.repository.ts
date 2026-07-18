import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import type {
  ProgramAssignmentNotificationProgram,
  ProgramAssignmentNotificationRepository,
  ProgramAssignmentNotificationScope,
} from '@/services/workout/program-assignment-notification.service'

function applyProgramScope(
  query: any,
  scope: ProgramAssignmentNotificationScope,
) {
  if (scope.type === 'enterprise') return query.eq('org_id', scope.orgId)
  return query.is('org_id', null)
}

function applyClientScope(
  query: any,
  userId: string,
  scope: ProgramAssignmentNotificationScope,
) {
  if (scope.type === 'standalone') {
    return query.eq('coach_id', userId).is('team_id', null).is('org_id', null)
  }
  if (scope.type === 'team') {
    return query.eq('team_id', scope.teamId).is('org_id', null)
  }
  return query.eq('org_id', scope.orgId).is('team_id', null)
}

/** DB adapter del servicio; todos los selects permanecen scopeados aun usando service-role. */
export function createProgramAssignmentNotificationRepository(
  db: SupabaseClient<Database>,
): ProgramAssignmentNotificationRepository {
  return {
    async loadSnapshot({ userId, programIds, scope }) {
      const [coachResult, programsResult] = await Promise.all([
        db
          .from('coaches')
          .select('brand_name, slug, subscription_tier, primary_color, logo_url')
          .eq('id', userId)
          .maybeSingle(),
        applyProgramScope(
          db
            .from('workout_programs')
            .select('id, client_id, coach_id, org_id, name, start_date, source_template_id, is_active, created_at')
            .eq('coach_id', userId)
            .in('id', programIds),
          scope,
        ),
      ])
      if (coachResult.error) throw new Error('No se pudo cargar la marca del coach.')
      if (programsResult.error) throw new Error('No se pudieron validar los programas asignados.')

      const programs = (programsResult.data ?? []) as ProgramAssignmentNotificationProgram[]
      const clientIds = [...new Set(programs.flatMap((program) => program.client_id ? [program.client_id] : []))]
      if (clientIds.length === 0) {
        return {
          coach: coachResult.data,
          programs,
          clients: [],
          enterpriseAssignedClientIds: [],
        }
      }

      const clientsPromise = applyClientScope(
        db
          .from('clients')
          .select('id, full_name, email, coach_id, team_id, org_id')
          .in('id', clientIds),
        userId,
        scope,
      )
      const enterpriseAssignmentsPromise = scope.type === 'enterprise'
        ? db
            .from('coach_client_assignments')
            .select('client_id')
            .eq('org_id', scope.orgId)
            .eq('coach_id', userId)
            .in('client_id', clientIds)
            .is('deleted_at', null)
        : Promise.resolve({ data: [] as { client_id: string }[], error: null })

      const [clientsResult, enterpriseAssignmentsResult] = await Promise.all([
        clientsPromise,
        enterpriseAssignmentsPromise,
      ])
      if (clientsResult.error) throw new Error('No se pudieron validar los clientes asignados.')
      if (enterpriseAssignmentsResult.error) throw new Error('No se pudo validar la asignación enterprise.')

      return {
        coach: coachResult.data,
        programs,
        clients: clientsResult.data ?? [],
        enterpriseAssignedClientIds: (enterpriseAssignmentsResult.data ?? []).map((row) => row.client_id),
      }
    },
  }
}
