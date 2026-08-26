import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import type { WorkspaceSummary } from '@/domain/auth/types'
import {
    findActiveMobileStudentOrgCoach,
    findMobileStudentClient,
    findMobileStudentCoach,
} from '@/infrastructure/db/mobile-student-workspace.repository'
import { listClientWorkspaces, setLastWorkspace } from './workspace.service'

type DB = SupabaseClient<Database>
type CoachScopedStudentWorkspace = Extract<
    WorkspaceSummary,
    { type: 'student_standalone' | 'student_enterprise' }
>

export type MobileStudentWorkspaceValidationResult =
    // `clientId` es la fila de `clients` YA validada (scope + activa + no archivada), no el
    // `coachId` del body ni el `userId` del bearer: identidades divididas por
    // `client_memberships.account_id` tienen `clients.id != auth.uid()`. Lo consume el call site
    // para sellar `first_login_at` (W1.2/W1.3 de flujo-coach-nuevo); la respuesta HTTP no lo expone.
    | { ok: true; forcePasswordChange: boolean; clientId: string }
    | { ok: false; reason: 'access_denied' | 'account_paused' | 'dependency_error' }

export async function validateMobileStudentWorkspace(
    db: DB,
    userId: string,
    coachId: string,
): Promise<MobileStudentWorkspaceValidationResult> {
    const coachResult = await findMobileStudentCoach(db, coachId)
    if (coachResult.error) return { ok: false, reason: 'dependency_error' }
    const coach = coachResult.data
    if (!coach) return { ok: false, reason: 'access_denied' }

    // `client_memberships.account_id` es la fuente actual para identidades que participan en más de
    // un workspace. `listClientWorkspaces` conserva el fallback legacy `clients.id = auth.uid()`.
    const available = (await listClientWorkspaces(db, userId)).filter(
        (candidate): candidate is CoachScopedStudentWorkspace =>
            candidate.type === 'student_standalone' || candidate.type === 'student_enterprise',
    )
    let workspace: CoachScopedStudentWorkspace | null =
        available.find(candidate =>
            candidate.type === 'student_standalone' && candidate.coachId === coach.id,
        ) ?? null

    if (!workspace) {
        for (const candidate of available) {
            if (candidate.type !== 'student_enterprise') continue

            if (candidate.coachId === coach.id) {
                workspace = candidate
                break
            }

            // La sesión del alumno no puede leer esta relación por RLS. El service role comprueba
            // solo orgId (derivado de membresía activa) + coach solicitado.
            const orgCoachResult = await findActiveMobileStudentOrgCoach(db, candidate.orgId, coach.id)
            if (orgCoachResult.error) return { ok: false, reason: 'dependency_error' }
            if (orgCoachResult.data) {
                workspace = {
                    ...candidate,
                    coachId: coach.id,
                    slug: coach.slug,
                }
                break
            }
        }
    }

    if (!workspace) return { ok: false, reason: 'access_denied' }

    const clientResult = await findMobileStudentClient(db, workspace.clientId)
    if (clientResult.error) return { ok: false, reason: 'dependency_error' }
    const client = clientResult.data
    if (!client) return { ok: false, reason: 'access_denied' }

    if (client.is_active === false || client.is_archived === true) {
        return { ok: false, reason: 'account_paused' }
    }

    // Paridad web: la preferencia se registra solo después de confirmar el scope. Un fallo
    // best-effort de preferencia no convierte una credencial válida en un rechazo de acceso.
    await setLastWorkspace(db, workspace)

    return {
        ok: true,
        forcePasswordChange: client.force_password_change === true,
        clientId: client.id,
    }
}
