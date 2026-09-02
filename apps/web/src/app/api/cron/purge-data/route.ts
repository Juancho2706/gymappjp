import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import type { Json } from '@/lib/database.types'
import { deleteClientHard } from '@/services/client/client-deletion.service'

export const maxDuration = 60

type AdminClient = ReturnType<typeof createServiceRoleClient>

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Cuentas del revisor de Apple (`scripts/seed-appreview-demo.mjs`). NUNCA se purgan, ni siquiera si
 * alguien probo la baja en-app con ellas durante una revision: borrarlas deja a App Review sin
 * credenciales y el proximo envio se rechaza por guideline 2.1(a) — el mismo rechazo que costo la
 * build 1.1.0. Si aparecen con `deletion_requested_at`, se loguea y se saltan: el flag se limpia a
 * mano volviendo a correr el seed.
 */
const APP_REVIEW_PROTECTED_EMAILS = new Set(['appreview-coach@evatest.cl', 'appreview-alumno@evatest.cl'])

/** Paginado de GoTrue: `listUsers` no sabe filtrar por `app_metadata`, hay que barrer y filtrar acá. */
const AUTH_PAGE_SIZE = 1000
/** Techo de páginas por corrida (20 × 1000 = 20k identidades). Evita un barrido infinito. */
const AUTH_MAX_PAGES = 20
/**
 * Techo de borrados por corrida. Cada purga son varios round-trips (alumnos + storage + GoTrue) y el
 * handler tiene 60 s: mejor arrastrar el resto a la corrida siguiente que morir a mitad de camino.
 * Si se alcanza, la respuesta trae `truncated: true` y hay que relanzar el cron a mano (RUNBOOK).
 */
const MAX_ACCOUNT_PURGES_PER_RUN = 25

type AccountPurgeSummary = {
    /** Identidades leídas de GoTrue en esta corrida. */
    scanned: number
    /** Las que tenían `deletion_requested_at` vencido (≥30 días). */
    due: number
    deleted: number
    /** Saltadas por la lista de exclusión dura (App Review). */
    protectedSkipped: number
    failed: number
    /** `true` si quedó cola sin procesar (techo de borrados o de páginas). */
    truncated: boolean
}

type AuthUserLike = {
    id: string
    email?: string | null
    app_metadata?: Record<string, unknown> | null
    user_metadata?: Record<string, unknown> | null
}

/**
 * `/api/mobile/account/delete` escribe el pedido de baja en `app_metadata.deletion_requested_at`
 * (a proposito: sin migracion, y el ban de GoTrue ya cierra la cuenta). Se lee tambien
 * `user_metadata` como red de seguridad por si alguna via legacy lo dejo ahi.
 */
function readDeletionRequestedAt(user: AuthUserLike): Date | null {
    const raw =
        (user.app_metadata?.['deletion_requested_at'] as unknown) ??
        (user.user_metadata?.['deletion_requested_at'] as unknown)
    if (typeof raw !== 'string' || raw.trim() === '') return null
    const at = new Date(raw)
    return Number.isNaN(at.getTime()) ? null : at
}

/**
 * Borrado DEFINITIVO de una identidad ya dada de baja. Lanza con un mensaje accionable: el caller lo
 * cuenta como `failed` y sigue con el resto — ninguna cuenta rota puede frenar la cola.
 *
 * Coach: primero sus alumnos UNO A UNO con `deleteClientHard` (el `deleteUser` del coach cascadea las
 * filas `clients` por `clients_coach_id_fkey`, pero los `auth.users` de esos alumnos SOBREVIVEN →
 * logins zombie; mismo bug que arregló `deleteCoachAccountAction`). Después se vacían las tres tablas
 * cuyo FK a `coaches(id)` es NO ACTION (`foods`, `nutrition_plans`, `saved_meals`, baseline
 * 2239/2339/2379): sin eso Postgres rechaza el `deleteUser` con violación de FK.
 *
 * OTRAS FKs SIN CASCADA que pueden bloquear (a propósito NO se tocan acá): `organization_members`,
 * `organization_coach_assignments` y `workout_programs.created_by_coach_id` (equipos/Enterprise, hoy
 * congelado), y del lado `auth.users` toda la familia `enterprise_*` + `news_items.created_by`. Si
 * alguna dispara, el borrado queda `failed` con el nombre de la constraint en el log y se resuelve a
 * mano — antes que borrar en silencio una fila de auditoría o el registro de otro coach.
 */
async function hardDeleteAccount(admin: AdminClient, userId: string): Promise<void> {
    const { data: coach, error: coachError } = await admin
        .from('coaches')
        .select('id')
        .eq('id', userId)
        .maybeSingle()
    // fail-closed: sin saber si es coach, borrar a ciegas podría matar la cuenta equivocada.
    if (coachError) throw new Error(`coach lookup: ${coachError.message}`)

    if (!coach) {
        // Alumno puro o identidad huérfana (registro a medias): `deleteClientHard` cubre ambos,
        // incluido el 404 de GoTrue, y se lleva las fotos de check-in del bucket.
        const { error, code } = await deleteClientHard(admin, userId)
        if (error) throw new Error(`${code ?? 'DELETE_FAILED'}: ${error}`)
        return
    }

    const { data: clients, error: clientsError } = await admin
        .from('clients')
        .select('id')
        .eq('coach_id', userId)
    if (clientsError) throw new Error(`clients lookup: ${clientsError.message}`)

    for (const client of clients ?? []) {
        const { error } = await deleteClientHard(admin, client.id)
        if (error) throw new Error(`alumno ${client.id}: ${error}`)
    }

    for (const table of ['saved_meals', 'foods', 'nutrition_plans'] as const) {
        const { error } = await admin.from(table).delete().eq('coach_id', userId)
        if (error) throw new Error(`${table}: ${error.message}`)
    }

    const { error: authError } = await admin.auth.admin.deleteUser(userId)
    if (authError) {
        const status = (authError as { status?: number }).status
        const authCode = (authError as { code?: string }).code
        if (status !== 404 && authCode !== 'user_not_found') throw new Error(`auth: ${authError.message}`)
        // Fila `coaches` huérfana (sin usuario en GoTrue): no hay cascada que disparar, se borra a mano.
        const { error: rowError } = await admin.from('coaches').delete().eq('id', userId)
        if (rowError) throw new Error(`coaches: ${rowError.message}`)
    }
}

/**
 * Purga a 30 días de las cuentas dadas de baja desde la app (guideline 5.1.1(v) de Apple + derecho de
 * supresión de la Ley 21.719). `/api/mobile/account/delete` BANEA y deja el pedido fechado; hasta hoy
 * nadie leía esa cola, así que el dato seguía vivo indefinidamente. Best-effort por usuario.
 */
async function purgeDeletedAccounts(admin: AdminClient, cutoff: Date): Promise<AccountPurgeSummary> {
    const summary: AccountPurgeSummary = {
        scanned: 0,
        due: 0,
        deleted: 0,
        protectedSkipped: 0,
        failed: 0,
        truncated: false,
    }

    for (let page = 1; page <= AUTH_MAX_PAGES; page++) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: AUTH_PAGE_SIZE })
        if (error) {
            summary.failed++
            console.error('[cron/purge-data] listUsers falló — cola de bajas sin barrer', {
                page,
                message: error.message,
            })
            return summary
        }

        const users = (data?.users ?? []) as AuthUserLike[]
        summary.scanned += users.length

        for (const user of users) {
            const requestedAt = readDeletionRequestedAt(user)
            if (!requestedAt || requestedAt.getTime() > cutoff.getTime()) continue
            summary.due++

            const email = (user.email ?? '').trim().toLowerCase()
            if (APP_REVIEW_PROTECTED_EMAILS.has(email)) {
                summary.protectedSkipped++
                console.warn('[cron/purge-data] cuenta de App Review con pedido de baja — NO se purga', {
                    userId: user.id,
                    email,
                })
                continue
            }

            if (summary.deleted >= MAX_ACCOUNT_PURGES_PER_RUN) {
                summary.truncated = true
                continue
            }

            try {
                await hardDeleteAccount(admin, user.id)
                summary.deleted++
                console.info('[cron/purge-data] cuenta purgada', {
                    userId: user.id,
                    requested_at: requestedAt.toISOString(),
                })
            } catch (err) {
                summary.failed++
                console.error('[cron/purge-data] purga de cuenta fallida (sigue el resto)', {
                    userId: user.id,
                    requested_at: requestedAt.toISOString(),
                    message: err instanceof Error ? err.message : String(err),
                })
            }
        }

        if (users.length < AUTH_PAGE_SIZE) return summary
        if (page === AUTH_MAX_PAGES) summary.truncated = true
    }

    return summary
}

function isAuthorized(req: Request) {
    const expected = process.env.CRON_SECRET
    if (!expected) return false
    const auth = req.headers.get('authorization') ?? ''
    return auth === `Bearer ${expected}`
}

export async function GET(req: Request) {
    if (!isAuthorized(req)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = createServiceRoleClient()
    const now = Date.now()
    const cutoffDate = new Date(now - 30 * DAY_MS)
    const cutoff = cutoffDate.toISOString()
    /** Retención de solicitudes de alumnos (decisión del owner 2026-09-02): 90 días. */
    const leadsCutoff = new Date(now - 90 * DAY_MS).toISOString()
    let purged = 0
    let errors = 0

    // ── Purge org_audit_logs older than 90 days ──────────────────────────────
    try {
        const { error } = await admin.rpc('purge_old_audit_logs' as never)
        if (error) throw error
        console.info('[cron/purge-data] purge_old_audit_logs done')
    } catch (err) {
        console.warn('[cron/purge-data] purge_old_audit_logs failed (may not exist yet):', err)
    }

    // ── Purge soft-deleted org members (deleted >30 days ago) ────────────────
    try {
        const { count, error } = await admin
            .from('organization_members')
            .delete({ count: 'exact' })
            .lt('deleted_at', cutoff)
            .not('deleted_at', 'is', null)

        if (error) throw error
        purged += count ?? 0
    } catch (err) {
        console.error('[cron/purge-data] org_members purge failed:', err)
        errors++
    }

    // ── Purge soft-deleted coach_client_assignments (deleted >30 days ago) ───
    try {
        const { count, error } = await admin
            .from('coach_client_assignments')
            .delete({ count: 'exact' })
            .lt('deleted_at', cutoff)
            .not('deleted_at', 'is', null)

        if (error) throw error
        purged += count ?? 0
    } catch (err) {
        console.error('[cron/purge-data] assignments purge failed:', err)
        errors++
    }

    // ── Solicitudes de alumnos sin gestionar (retención 90 días) ─────────────
    // `converted` y `contacted` se CONSERVAN: la primera es la trazabilidad de cómo entró un alumno
    // que hoy existe, la segunda es el historial de gestión del coach. Solo se van las que nadie
    // tocó (`new`) y las descartadas (`dismissed`) — contacto de un desconocido sin relación viva.
    let leadsPurged = 0
    try {
        const { count, error } = await admin
            .from('coach_leads')
            .delete({ count: 'exact' })
            .in('status', ['new', 'dismissed'])
            .lt('created_at', leadsCutoff)

        if (error) throw error
        leadsPurged = count ?? 0
        console.info(`[cron/purge-data] coach_leads purgados=${leadsPurged} (cutoff ${leadsCutoff})`)
    } catch (err) {
        console.error('[cron/purge-data] coach_leads purge failed:', err)
        errors++
    }

    // ── Cuentas dadas de baja en-app hace ≥30 días (Apple 5.1.1(v) + Ley 21.719) ──
    let accounts: AccountPurgeSummary = {
        scanned: 0,
        due: 0,
        deleted: 0,
        protectedSkipped: 0,
        failed: 0,
        truncated: false,
    }
    try {
        accounts = await purgeDeletedAccounts(admin, cutoffDate)
        if (accounts.failed > 0) errors += accounts.failed
        if (accounts.truncated) {
            console.warn('[cron/purge-data] quedó cola de bajas sin purgar — relanzar el cron a mano', {
                deleted: accounts.deleted,
                due: accounts.due,
            })
        }
    } catch (err) {
        console.error('[cron/purge-data] barrido de bajas falló entero:', err)
        errors++
    }

    await admin.from('admin_audit_logs').insert({
        admin_email: 'cron',
        action: 'cron.purge_data_ran',
        target_table: 'system',
        target_id: null,
        payload: {
            purged,
            errors,
            cutoff_date: cutoff,
            leads_purged: leadsPurged,
            leads_cutoff_date: leadsCutoff,
            accounts,
        } as Json,
    })

    console.info(
        `[cron/purge-data] done — purged=${purged} leads=${leadsPurged} accounts=${accounts.deleted} errors=${errors}`
    )
    return NextResponse.json({ ok: true, purged, errors, leadsPurged, accounts })
}
