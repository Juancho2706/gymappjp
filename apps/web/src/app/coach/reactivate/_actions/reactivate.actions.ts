'use server'

import { createClient } from '@/lib/supabase/server'
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
 * Solo toca alumnos STANDALONE propios (`org_id IS NULL`): el techo real es la RLS
 * `clients_standalone_coach_manage` (`org_id IS NULL AND coach_id = auth.uid()`); el filtro
 * explícito evita rozar alumnos de org por accidente. Archivar es reversible (no borra nada).
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

    const { data: archived, error } = await supabase
        .from('clients')
        .update({ is_archived: true })
        .in('id', parsed.data)
        .eq('coach_id', user.id)
        .is('org_id', null)
        .eq('is_archived', false)
        .select('id')

    if (error) return { error: 'No se pudieron archivar los alumnos. Intenta de nuevo.' }

    // El panel recarga la página tras archivar → el server recomputa activeClientCount y habilita
    // "Continuar gratis". No hace falta devolver el conteo (era un round-trip muerto).
    revalidatePath('/coach/reactivate')
    return { archived: archived?.length ?? 0 }
}
