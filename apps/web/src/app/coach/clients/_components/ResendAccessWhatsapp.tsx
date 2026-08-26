'use client'

import { MessageCircle } from 'lucide-react'
import { buildInviteMessage, buildWhatsappUrl } from '../_lib/add-student-invite'
import type { ResendAccessInvite } from '../_actions/clients.actions'

/**
 * Reenvío del acceso por WhatsApp (W2.11 de flujo-coach-nuevo).
 *
 * Es el MISMO mensaje del alta guiada —mismo builder, mismo copy por persona— con la clave recién
 * generada adentro. No es una superficie nueva: se monta dentro del diálogo de «clave temporal
 * lista» que ya existía, debajo de la clave.
 *
 * Dos reglas de la SPEC §5 que este componente NO puede relajar:
 *
 *  - **Regla 4:** solo se monta si el alumno tiene teléfono. Quien decide es el servidor
 *    (`resolveResendInvite`): sin teléfono no devuelve `resend` y acá no hay nada que pintar.
 *    `buildWhatsappUrl` vuelve a filtrar por su cuenta, así que la credencial no puede colarse a
 *    `wa.me/?text=` (el selector de contactos) ni por error de un call site.
 *  - **Regla 10:** la URL con la clave se arma en el HANDLER DEL CLICK, nunca como `href`. Esta
 *    pantalla se graba en PostHog cuando el coach aceptó cookies y el default enmascara *inputs*,
 *    no `href`s ni texto del DOM. Por eso el bloque entero va con `ph-no-capture`.
 */
export function ResendAccessWhatsapp({
    invite,
    tempPassword,
}: {
    invite: ResendAccessInvite
    tempPassword: string
}) {
    // Mismo criterio que el alta guiada: el mensaje saluda por el nombre de pila, no por el
    // nombre completo de la ficha («Hola Ana», no «Hola Ana Pérez González»).
    const firstName = invite.clientName.trim().split(/\s+/)[0] ?? ''

    const message = buildInviteMessage(invite.persona, {
        name: firstName,
        link: invite.loginUrl,
        email: invite.clientEmail,
        tempPassword,
    })

    const openWhatsapp = () => {
        const url = buildWhatsappUrl({
            persona: invite.persona,
            name: firstName,
            link: invite.loginUrl,
            phone: invite.clientPhone,
            email: invite.clientEmail,
            tempPassword,
        })
        // Si el navegador bloquea la ventana el CTA no puede quedar muerto: la clave vieja ya no
        // sirve y este es el camino al alumno.
        if (!window.open(url, '_blank', 'noopener,noreferrer')) window.location.href = url
    }

    return (
        // Sin margen propio: el espaciado lo pone quien lo monta (dos diálogos distintos).
        <div className="ph-no-capture text-left">
            <p className="text-[12px] font-bold uppercase tracking-[0.06em] text-muted">
                Mándasela por WhatsApp
            </p>
            <p className="mt-1.5 rounded-control bg-surface-sunken p-3 text-[12.5px] leading-relaxed text-body">
                {message}
            </p>
            <button
                type="button"
                onClick={openWhatsapp}
                className="eva-press mt-3 inline-flex h-12 w-full items-center justify-center gap-2 rounded-control bg-[#25D366] font-ui text-[15px] font-bold text-white"
            >
                <MessageCircle className="size-5" />
                Abrir WhatsApp
            </button>
        </div>
    )
}
