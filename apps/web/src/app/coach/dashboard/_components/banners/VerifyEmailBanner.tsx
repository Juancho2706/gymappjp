'use client'

import { useState, useTransition } from 'react'
import { Loader2, MailWarning } from 'lucide-react'
import { resendCoachEmailVerificationAction } from '../../_actions/verify-email.actions'

/**
 * «Verificación blanda» de D1 = A, con superficie (FCN W3.11).
 *
 * D1 = A promete «el correo sigue saliendo, no bloquea», y hasta acá lo único que existía era el
 * correo. Con `email_confirm: true` y un dominio mal tipeado (la cohorte ya tiene un `gmail.` +
 * `con`) la cuenta queda VIVA e IRRECUPERABLE: sin correo no hay reset de clave. Este banner es lo
 * único que se lo dice al coach, y le da el botón para arreglarlo.
 *
 * TRES REGLAS que no se tocan:
 * · Se pinta mientras `coaches.email_verified_at IS NULL` — NUNCA contra
 *   `auth.users.email_confirmed_at`, que bajo D1 = A nace seteada para todos (regla 11 del SPEC).
 * · NO BLOQUEA NADA: es un aviso arriba del panel, sin modal, sin gate y sin cortar ninguna acción.
 * · CERO CTA DE PAGO. El único botón manda un correo. (Regla de tiendas: en iOS no puede haber
 *   ningún camino a comprar; acá directamente no hay ninguno en ninguna plataforma.)
 *
 * El coach DE PAGO también lo ve hasta que confirme: nace `email_confirm: true` porque el pago
 * prueba identidad, no la casilla (W3.0 c). Es deliberado — él tampoco puede recuperar su clave.
 */
export function VerifyEmailBanner() {
    const [pending, startTransition] = useTransition()
    const [sent, setSent] = useState(false)
    const [error, setError] = useState<string | null>(null)

    function resend() {
        setError(null)
        startTransition(async () => {
            const result = await resendCoachEmailVerificationAction()
            if (result.ok) setSent(true)
            else setError(result.error)
        })
    }

    return (
        <div
            role="status"
            className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-card border border-[var(--warning-500)]/30 bg-[var(--warning-100)] px-4 py-3 text-sm text-[var(--warning-700)]"
        >
            <MailWarning className="size-4 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1">
                Verifica tu correo para poder recuperar tu clave.
            </span>
            {sent ? (
                <span className="text-xs font-semibold opacity-90">
                    Listo, te lo reenviamos. Revisa tu bandeja (y el spam).
                </span>
            ) : (
                <button
                    type="button"
                    onClick={resend}
                    disabled={pending}
                    className="inline-flex h-9 shrink-0 touch-manipulation items-center gap-1.5 rounded-control border border-[var(--warning-500)]/40 px-3 text-xs font-bold transition-colors hover:bg-[var(--warning-500)]/10 disabled:opacity-60"
                >
                    {pending && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
                    Reenviar correo
                </button>
            )}
            {error && (
                <span className="w-full text-xs opacity-90" role="alert">
                    {error}
                </span>
            )}
        </div>
    )
}
