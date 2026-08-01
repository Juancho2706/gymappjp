'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { deleteClientHard } from '@/services/client/client-deletion.service'
import { bulkArchiveClients } from '@/services/client/client-archive.service'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

const ClientIdsSchema = z.array(z.guid()).min(1).max(500)

/**
 * Archivar alumnos DESDE la pantalla de reactivación (deadlock de cupo).
 *
 * Un coach con la suscripción bloqueada (expired/pending_payment) y MÁS de 3 alumnos activos
 * queda atrapado: el proxy manda `/coach/clients` a `/coach/reactivate`, y ahí el plan gratuito
 * está deshabilitado por estar sobre cupo → la única salida era pagar. Esta acción vive en la
 * ruta reactivate (que SÍ pasa el gate del proxy) y deja archivar sin salir de la página, para
 * bajar a ≤3 y habilitar "Continuar gratis" (que a su vez re-valida el cupo server-side en
 * `/api/payments/activate-free`).
 *
 * Solo toca alumnos STANDALONE propios. El servicio central vuelve a validar scope, apaga
 * asignaciones y sincroniza Auth; esta ruta no puede saltarse la invariante mediante un UPDATE
 * genérico. Archivar es reversible (no borra nada).
 */
export async function archiveClientsForFreeAction(
    clientIds: string[]
): Promise<{ archived?: number; error?: string }> {
    const parsed = ClientIdsSchema.safeParse(clientIds)
    if (!parsed.success) return { error: 'Selección de alumnos inválida.' }

    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado.' }

    const archived = await bulkArchiveClients(createServiceRoleClient(), {
        coachId: user.id,
        workspace: { type: 'standalone' },
    }, parsed.data)
    if (!archived.ok) return { error: archived.error }

    // El panel recarga la página tras archivar → el server recomputa activeClientCount y habilita
    // "Continuar gratis". No hace falta devolver el conteo (era un round-trip muerto).
    revalidatePath('/coach/reactivate')
    if (archived.authFailures.length > 0) {
        return {
            archived: archived.clients.length,
            error: `${archived.authFailures.length} alumno(s) quedaron archivados; falta sincronizar Auth. Reintenta para cerrar sus sesiones.`,
        }
    }
    return { archived: archived.clients.length }
}

/**
 * Eliminar DEFINITIVAMENTE alumnos DESDE la pantalla de reactivación (deadlock de cupo).
 *
 * Gemela NO reversible de `archiveClientsForFreeAction`: baja el cupo igual, pero para el coach que
 * ya no va a volver a entrenar a esos alumnos y no quiere arrastrarlos archivados. Borra la cuenta
 * y todo lo que cuelga de ella (cascada + fotos de check-in); la UI lo confirma antes.
 *
 * Mismo scope que archivar — alumnos STANDALONE propios (`coach_id = user.id`, `org_id IS NULL`):
 * ese SELECT con el cliente user-scoped ES la autorización, porque `deleteClientHard` corre con
 * service role y bypassea la RLS. Los ids que no pasen el filtro simplemente no se borran.
 *
 * Secuencial a propósito: cada borrado toca GoTrue Admin + Storage, y en paralelo un lote grande
 * se comería el rate limit. Ante un fallo corta ahí y reporta cuántos alcanzaron a borrarse (lo ya
 * borrado no se puede deshacer, y reintentar es seguro: esos ids ya no existen).
 */
export async function deleteClientsForFreeAction(
    clientIds: string[]
): Promise<{ deleted?: number; error?: string }> {
    const parsed = ClientIdsSchema.safeParse(clientIds)
    if (!parsed.success) return { error: 'Selección de alumnos inválida.' }

    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado.' }

    const { data: owned, error: lookupError } = await supabase
        .from('clients')
        .select('id')
        .in('id', parsed.data)
        .eq('coach_id', user.id)
        .is('org_id', null)

    if (lookupError) return { error: 'No se pudieron eliminar los alumnos. Intenta de nuevo.' }

    const adminDb = createServiceRoleClient()
    let deleted = 0
    for (const { id } of owned ?? []) {
        const { error } = await deleteClientHard(adminDb, id)
        if (error) {
            revalidatePath('/coach/reactivate')
            return {
                deleted,
                error:
                    deleted > 0
                        ? `Se eliminaron ${deleted} alumno${deleted !== 1 ? 's' : ''}, pero uno falló. Recarga la página e intenta de nuevo.`
                        : 'No se pudieron eliminar los alumnos. Intenta de nuevo.',
            }
        }
        deleted += 1
    }

    // El panel recarga la página tras eliminar → el server recomputa activeClientCount y habilita
    // "Continuar gratis".
    revalidatePath('/coach/reactivate')
    return { deleted }
}
