import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import {
    CoachEmailLedgerDbError,
    deleteActiveByCoachAndKey,
    findActiveByCoachAndKeys,
    insertLedgerRow,
} from '@/infrastructure/db/coach-email-ledger.repository'
import { EMAIL_OPT_OUT_TEMPLATE_KEY } from '@/lib/email/automated-email-policy'

/**
 * Baja de los correos AUTOMÁTICOS de un coach (plan «Correos y activación», 01-10): la serie de
 * bienvenida (W6), el aviso de cupo por barrido y el de carrito abandonado. Los correos de cuenta,
 * contraseña y pagos siguen saliendo siempre.
 *
 * La marca es una fila de `coach_email_ledger` con `EMAIL_OPT_OUT_TEMPLATE_KEY`,
 * `trigger = 'transactional'` y `status = 'cancelled'` («lo decidimos nosotros»). Sin DDL: el índice
 * único parcial del ledger ya garantiza una sola marca viva por coach. La leen los tres barridos vía
 * `automated-email-history.service.ts`. La escribe SOLO el panel admin, cuando el coach responde
 * «no quiero más» a `contacto@eva-app.cl`.
 */

type Db = SupabaseClient<Database>

/** Cuándo pidió la baja (instante de la marca viva), o `null` si recibe correos. Lanza si no lee. */
export async function readCoachEmailOptOut(admin: Db, coachId: string): Promise<string | null> {
    const rows = await findActiveByCoachAndKeys(admin, coachId, [EMAIL_OPT_OUT_TEMPLATE_KEY])
    return rows[0]?.created_at ?? null
}

/** Da de baja. Idempotente: si la marca ya existe (el índice único devuelve `23505`), no hace nada. */
export async function optOutCoachEmails(admin: Db, coachId: string, by: string | null): Promise<void> {
    try {
        await insertLedgerRow(admin, {
            coach_id: coachId,
            template_key: EMAIL_OPT_OUT_TEMPLATE_KEY,
            trigger: 'transactional',
            status: 'cancelled',
            payload: { source: 'admin', by },
        })
    } catch (err) {
        if (err instanceof CoachEmailLedgerDbError && err.code === '23505') return
        throw err
    }
}

/** Vuelve a activar los correos automáticos: borra la marca viva. */
export async function optInCoachEmails(admin: Db, coachId: string): Promise<void> {
    await deleteActiveByCoachAndKey(admin, coachId, EMAIL_OPT_OUT_TEMPLATE_KEY)
}
