'use client'

import { useState } from 'react'
import { Megaphone, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { AdminConfirmDialog } from '../../_components/AdminConfirmDialog'
import {
    countAnnouncementRecipientsAction,
    sendAnnouncementEmailAction,
} from '../_actions/coach-actions'

// Resumen del mail que dispara la accion (buildExistingCoachAnnouncementEmail):
// el CEO tiene que ver QUE se manda y A CUANTOS antes de confirmar.
const EMAIL_SUMMARY =
    'Asunto: "EVA pronto en las tiendas (iOS y Android) + mejoras en curso". Anuncia la app nativa, avisa de los cambios estructurales en curso y pide disculpas por la transicion.'

export function AnnouncementEmailButton() {
    const [open, setOpen] = useState(false)
    const [counting, setCounting] = useState(false)
    const [sending, setSending] = useState(false)
    const [count, setCount] = useState(0)

    // Click 1 = preview (conteo real de destinatarios), no envio. El envio solo sale del dialogo.
    async function handleClick() {
        setCounting(true)
        try {
            const { count: recipients } = await countAnnouncementRecipientsAction()
            setCount(recipients)
            setOpen(true)
        } catch {
            toast.error('No se pudo calcular cuantos coaches recibirian el anuncio.')
        } finally {
            setCounting(false)
        }
    }

    async function handleConfirm() {
        setSending(true)
        try {
            const res = await sendAnnouncementEmailAction()
            if ('error' in res) {
                toast.error(res.error)
                return
            }
            toast.success(`Enviados ${res.sent}, fallidos ${res.failed}`)
        } catch {
            toast.error('El envio fallo a mitad de camino. Revisa los logs antes de reintentar.')
        } finally {
            setSending(false)
        }
    }

    const busy = counting || sending

    return (
        <>
            <button
                type="button"
                onClick={handleClick}
                disabled={busy}
                className="flex items-center gap-1.5 rounded-lg border border-subtle bg-surface-sunken px-3 py-1.5 text-xs font-semibold text-body transition-colors hover:border-[var(--sport-500)] hover:text-[var(--sport-500)] disabled:opacity-50"
            >
                {busy
                    ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> {sending ? 'Enviando...' : 'Calculando...'}</>
                    : <><Megaphone className="h-3.5 w-3.5" /> Anunciar novedades</>
                }
            </button>

            <AdminConfirmDialog
                open={open}
                onOpenChange={setOpen}
                title="Enviar anuncio masivo"
                description={EMAIL_SUMMARY}
                blastRadius={`Se enviara un email a ${count} coaches activos. No se puede deshacer.`}
                severity="danger"
                confirmLabel="Enviar anuncio"
                onConfirm={handleConfirm}
            />
        </>
    )
}
