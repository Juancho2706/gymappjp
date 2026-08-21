'use client'

import { useState } from 'react'
import { AlertTriangle, Loader2, MailCheck } from 'lucide-react'
import { toast } from 'sonner'
import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
    countPricingV3NoticeRecipientsAction,
    sendPricingV3NoticeAction,
    sendPricingV3NoticeTestAction,
} from '../_actions/coach-actions'

// Resumen del correo que dispara la accion (buildFreePlanV3NoticeEmail): el owner tiene que
// ver QUE se manda y A CUANTOS antes de confirmar un envio irreversible.
const EMAIL_SUMMARY =
    'Asunto: "Tu plan Free ahora incluye tu marca". Avisa que el white-label (logo, colores, tu app) pasa a estar en el plan Free con el sello "Hecho con EVA", y que el cupo Free queda en 1 alumno activo conservando los alumnos existentes. Sin precios ni descuentos.'

/**
 * Aviso de Pricing v3 a los coaches Free (F5.2, 2026-08-21).
 *
 * Dialogo propio (no `AdminConfirmDialog`) porque este envio necesita hospedar el control de
 * "prueba primero a la casilla del owner" DENTRO de la confirmacion, y el dialogo compartido no
 * acepta children. Copia su chrome y su severidad para no abrir un segundo lenguaje visual en
 * el panel; si algun dia `AdminConfirmDialog` acepta `children`, esto se colapsa contra el.
 */
export function PricingV3NoticeButton() {
    const [open, setOpen] = useState(false)
    const [counting, setCounting] = useState(false)
    const [sending, setSending] = useState(false)
    const [testing, setTesting] = useState(false)
    const [count, setCount] = useState(0)
    const [sample, setSample] = useState<string[]>([])
    const [testEmail, setTestEmail] = useState('')

    const accent = 'var(--danger-500)'
    const busy = counting || sending || testing

    // Click 1 = preview (conteo REAL de destinatarios tras la dedupe), nunca envio.
    async function handleClick() {
        setCounting(true)
        try {
            const res = await countPricingV3NoticeRecipientsAction()
            setCount(res.count)
            setSample(res.sample)
            setOpen(true)
        } catch {
            toast.error('No se pudo calcular cuantos coaches Free recibirian el aviso.')
        } finally {
            setCounting(false)
        }
    }

    async function handleTest() {
        if (!testEmail.trim()) {
            toast.error('Escribe un correo para la prueba.')
            return
        }
        setTesting(true)
        try {
            const res = await sendPricingV3NoticeTestAction(testEmail.trim())
            if ('error' in res) {
                toast.error(res.error)
                return
            }
            toast.success(`Prueba enviada a ${testEmail.trim()}`)
        } catch {
            toast.error('No se pudo enviar la prueba.')
        } finally {
            setTesting(false)
        }
    }

    async function handleSend() {
        setSending(true)
        try {
            const res = await sendPricingV3NoticeAction()
            if ('error' in res) {
                toast.error(res.error)
                return
            }
            toast.success(`Enviados ${res.sent}, fallidos ${res.failed}, omitidos ${res.skipped}`)
            // La dedupe vive en `admin_audit_logs`: si alguna fila no se escribio, un reintento
            // le manda el correo DE NUEVO a esos coaches. Se avisa aparte y en tono de error.
            if (res.auditFailed > 0) {
                toast.error(
                    `${res.auditFailed} envio${res.auditFailed !== 1 ? 's' : ''} sin fila de auditoria: revisa Auditoria antes de reintentar (se repetirian).`,
                    { duration: 12000 },
                )
            }
            setOpen(false)
        } catch {
            toast.error('El envio fallo a mitad de camino. Revisa Auditoria antes de reintentar.')
        } finally {
            setSending(false)
        }
    }

    return (
        <>
            <button
                type="button"
                onClick={handleClick}
                disabled={busy}
                className="flex items-center gap-1.5 rounded-lg border border-subtle bg-surface-sunken px-3 py-1.5 text-xs font-semibold text-body transition-colors hover:border-[var(--sport-500)] hover:text-[var(--sport-500)] disabled:opacity-50"
            >
                {counting
                    ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Calculando...</>
                    : <><MailCheck className="h-3.5 w-3.5" /> Aviso Pricing v3</>
                }
            </button>

            <AlertDialog open={open} onOpenChange={(next) => { if (!busy) setOpen(next) }}>
                <AlertDialogContent className="border-subtle bg-surface-card">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2 text-sm text-strong">
                            <AlertTriangle className="h-4 w-4 shrink-0" style={{ color: accent }} />
                            Enviar aviso de Pricing v3
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-xs text-body">
                            {EMAIL_SUMMARY}
                        </AlertDialogDescription>
                    </AlertDialogHeader>

                    <p
                        className="rounded-lg border px-3 py-2 text-xs font-medium"
                        style={{
                            borderColor: `color-mix(in srgb, ${accent} 35%, transparent)`,
                            background: `color-mix(in srgb, ${accent} 10%, transparent)`,
                            color: accent,
                        }}
                    >
                        Se enviara a {count} coach{count !== 1 ? 'es' : ''} Free con cupo 1 (sin cuentas
                        internas ni de QA, y sin los que ya lo recibieron). No se puede deshacer.
                        {sample.length > 0 && ` Muestra: ${sample.join(', ')}${count > sample.length ? '…' : ''}`}
                    </p>

                    <div className="rounded-lg border border-subtle bg-surface-sunken p-3">
                        <label htmlFor="pricing-v3-test-email" className="text-[11px] text-muted">
                            Enviar prueba a… (no consume destinatario ni marca el envio como hecho)
                        </label>
                        <div className="mt-1 flex items-center gap-2">
                            <input
                                id="pricing-v3-test-email"
                                type="email"
                                inputMode="email"
                                autoComplete="email"
                                placeholder="tu@correo.cl"
                                value={testEmail}
                                onChange={(e) => setTestEmail(e.target.value)}
                                className="min-w-0 flex-1 rounded-md border border-subtle bg-surface-card px-3 py-2 text-xs text-strong focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)]"
                            />
                            <button
                                type="button"
                                onClick={handleTest}
                                disabled={busy}
                                className="shrink-0 rounded-md border border-subtle bg-surface-card px-3 py-2 text-xs font-semibold text-body transition-colors hover:text-strong disabled:opacity-50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)]"
                            >
                                {testing ? 'Enviando…' : 'Enviar prueba'}
                            </button>
                        </div>
                    </div>

                    <AlertDialogFooter>
                        <button
                            type="button"
                            onClick={() => setOpen(false)}
                            disabled={busy}
                            className="rounded-lg border border-subtle bg-surface-sunken px-4 py-2 text-xs text-body transition-colors hover:text-strong disabled:opacity-50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)]"
                        >
                            Cancelar
                        </button>
                        <button
                            type="button"
                            onClick={handleSend}
                            disabled={busy || count === 0}
                            className="rounded-lg px-4 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)]"
                            style={{ background: accent }}
                        >
                            {sending ? 'Enviando…' : `Enviar a ${count} coach${count !== 1 ? 'es' : ''}`}
                        </button>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    )
}
