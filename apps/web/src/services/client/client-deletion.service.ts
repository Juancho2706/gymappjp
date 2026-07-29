import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'

type DB = SupabaseClient<Database>

/**
 * services/client/client-deletion.service — borrado DURO de un alumno, fuente única de verdad.
 * NO importa de `app/` ni de Next: lo consumen la server action del coach web, la API móvil y el
 * borrado de cuenta del coach (que antes dejaba huérfanos los `auth.users` de sus alumnos).
 *
 * ⚠️ NO AUTORIZA. Corre con `service role` (bypassea RLS por completo): el caller DEBE haber
 * verificado ANTES la propiedad/scope del alumno (coach_id + org/team, o `mobileContextOwnsClient`).
 * Llamarlo sin esa verificación permite borrar el alumno de cualquier coach.
 */

const CHECKIN_BUCKET = 'checkins'
/** Tope de página del `list` de Storage (también usado como tamaño de lote del `remove`). */
const STORAGE_PAGE_SIZE = 100

/** Códigos estables que los callers HTTP reexponen tal cual (contrato de la API móvil). */
export type DeleteClientFailureCode = 'COACH_LOOKUP_FAILED' | 'DELETE_FAILED' | 'AUTH_DELETE_FAILED'

type ListedFolder = { files: string[]; folders: string[] }

/**
 * Lista una "carpeta" del bucket paginando de a `STORAGE_PAGE_SIZE`. Storage devuelve las carpetas
 * como filas sin `id`, así que se separan de los objetos reales (solo los objetos se pueden borrar).
 */
async function listCheckinFolder(adminDb: DB, prefix: string): Promise<ListedFolder> {
    const files: string[] = []
    const folders: string[] = []
    let offset = 0
    for (;;) {
        const { data, error } = await adminDb.storage
            .from(CHECKIN_BUCKET)
            .list(prefix, { limit: STORAGE_PAGE_SIZE, offset })
        if (error || !data || data.length === 0) break
        for (const item of data) {
            if (!item?.name) continue
            const path = `${prefix}/${item.name}`
            if (item.id === null) folders.push(path)
            else files.push(path)
        }
        if (data.length < STORAGE_PAGE_SIZE) break
        offset += STORAGE_PAGE_SIZE
    }
    return { files, folders }
}

/**
 * Borra las fotos de check-in del alumno (`checkins/<clientId>/…`). Best-effort: Storage NO tiene
 * cascada desde Postgres, pero un fallo acá jamás debe abortar el borrado de datos personales.
 * Recorre un nivel de subcarpetas (algunos flujos antiguos anidaban por fecha).
 */
async function purgeCheckinPhotos(adminDb: DB, clientId: string): Promise<void> {
    try {
        const root = await listCheckinFolder(adminDb, clientId)
        const paths = [...root.files]
        for (const folder of root.folders) {
            const nested = await listCheckinFolder(adminDb, folder)
            paths.push(...nested.files)
        }
        for (let i = 0; i < paths.length; i += STORAGE_PAGE_SIZE) {
            await adminDb.storage.from(CHECKIN_BUCKET).remove(paths.slice(i, i + STORAGE_PAGE_SIZE))
        }
    } catch (e) {
        console.warn('[client-deletion] no se pudieron borrar las fotos de check-in', {
            clientId,
            error: e instanceof Error ? e.message : String(e),
        })
    }
}

/**
 * Elimina definitivamente al alumno `clientId` y todo lo que cuelga de él.
 *
 * Dos caminos, según si ese `id` también tiene perfil de coach:
 * - Coach-como-alumno: solo se borra la fila `clients` (la cascada por `client_id` limpia las hijas).
 *   NUNCA `deleteUser`: mataría su propia cuenta de coach.
 * - Alumno puro: `auth.admin.deleteUser` → cascada total vía `clients_id_fkey`.
 *
 * El lookup de `coaches` es fail-closed: si falla, no se borra nada (borrar a ciegas podría eliminar
 * la cuenta de coach de alguien). Devuelve `{}` en éxito.
 *
 * @param adminDb cliente `service role` (`createServiceRoleClient()`).
 * @param clientId id del alumno — ownership/scope YA verificados por el caller.
 */
export async function deleteClientHard(
    adminDb: DB,
    clientId: string
): Promise<{ error?: string; code?: DeleteClientFailureCode }> {
    const { data: coachProfile, error: coachLookupError } = await adminDb
        .from('coaches')
        .select('id')
        .eq('id', clientId)
        .maybeSingle()
    if (coachLookupError) {
        return { error: 'No se pudo verificar la identidad del alumno.', code: 'COACH_LOOKUP_FAILED' }
    }
    const isCoachToo = Boolean(coachProfile)

    await purgeCheckinPhotos(adminDb, clientId)

    if (isCoachToo) {
        const { error } = await adminDb.from('clients').delete().eq('id', clientId)
        if (error) return { error: error.message, code: 'DELETE_FAILED' }
        return {}
    }

    // No borrar la fila primero: si GoTrue falla queremos un estado reintentable, no datos a medias.
    const { error } = await adminDb.auth.admin.deleteUser(clientId)
    if (error) {
        // Fila `clients` huérfana (sin usuario en GoTrue): no hay cascada que disparar. Se borra la
        // fila a mano para que un solo registro roto no bloquee el borrado para siempre.
        const status = (error as { status?: number }).status
        const authCode = (error as { code?: string }).code
        if (status !== 404 && authCode !== 'user_not_found') {
            return { error: error.message, code: 'AUTH_DELETE_FAILED' }
        }
        const { error: rowError } = await adminDb.from('clients').delete().eq('id', clientId)
        if (rowError) return { error: rowError.message, code: 'DELETE_FAILED' }
    }
    return {}
}
