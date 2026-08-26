import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

/**
 * ¿Este coach probó alguna vez su casilla de correo? (FCN W3.11)
 *
 * LA SEÑAL ES `coaches.email_verified_at`, NUNCA `auth.users.email_confirmed_at`. Bajo D1 = A el
 * alta free nace con `email_confirm: true`, así que la columna de GoTrue queda seteada para TODOS
 * en la creación y un banner que la mirara no se pintaría jamás (regla 11 del SPEC). La prueba real
 * la escribe `service_role` cuando el coach vuelve de un `verifyOtp` OK o entra por Google (W3.0).
 *
 * FAIL-CLOSED HACIA EL SILENCIO: si la fila no se puede leer se responde «verificado» y el banner no
 * aparece. Un aviso de correo sin verificar mostrado a TODO el padrón por un hipo de la DB es peor
 * que perderse el aviso: el banner no bloquea nada, solo informa.
 *
 * `React.cache` por request — el panel lo pide una vez por carga.
 */
export const getCoachEmailVerified = cache(async (coachId: string): Promise<boolean> => {
    const supabase = await createClient()
    const { data, error } = await supabase
        .from('coaches')
        .select('email_verified_at')
        .eq('id', coachId)
        .maybeSingle()

    if (error) {
        // Sin PII: ni email ni nombre. El id del coach ya viaja en el resto de los logs del panel.
        console.warn('[email-verification] lectura fallida — el banner se calla', {
            coachId,
            message: error.message,
        })
        return true
    }

    return Boolean(data?.email_verified_at)
})
