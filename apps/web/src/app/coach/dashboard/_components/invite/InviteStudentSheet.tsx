'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import { Check, Copy, Link2, Share2 } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { toast } from 'sonner'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { buildStudentAppUrl, buildStudentLoginUrl } from '@/lib/coach/invite-code'
import { cn } from '@/lib/utils'

interface Props {
    open: boolean
    onOpenChange: (open: boolean) => void
    inviteCode: string
}

/** Cuánto dura el estado "copiado" antes de volver al texto normal. */
export const COPIED_RESET_MS = 1600

/**
 * Tinte de marca del bloque del código (fondo + borde), en CLASES y no como token de `:root`.
 *
 * El intento anterior declaraba `--invite-soft`/`--invite-line` en `:root` y `.dark`. No sirve: un
 * custom property se computa en el elemento DONDE SE DECLARA, y `--theme-primary` solo existe con
 * el color del coach en el contenedor que inyecta `coach/layout.tsx` (`style={{'--theme-primary'}}`).
 * En `:root` esa var vale el azul EVA por defecto, así que el bloque quedaba tenido de azul mientras
 * su propia etiqueta y el chip —que sí leen la var en su posición— salían del color del coach. Un
 * coach con marca verde veía dos colores en la misma pastilla.
 *
 * Resuelto en el componente, que es donde la var ya tiene el valor correcto. Mismo patrón que
 * `ExerciseBlock.tsx` y que los botones de `(auth)/register`.
 */
export const INVITE_TINT_CLASS = cn(
    'bg-[color-mix(in_srgb,var(--theme-primary,var(--sport-500))_9%,transparent)]',
    'dark:bg-[color-mix(in_srgb,var(--theme-primary,var(--sport-500))_20%,transparent)]',
    // `border-[color:...]` explícito: `border-[var(--x)]` es ambiguo para tailwind-merge.
    'border-[color:color-mix(in_srgb,var(--theme-primary,var(--sport-500))_26%,transparent)]',
    'dark:border-[color:color-mix(in_srgb,var(--theme-primary,var(--sport-500))_34%,transparent)]'
)

function subscribeMd(cb: () => void) {
    const mq = window.matchMedia('(min-width: 760px)')
    mq.addEventListener('change', cb)
    return () => mq.removeEventListener('change', cb)
}

/** matchMedia md-up (mismo patrón que ClientStatsSheet): desktop → side sheet, móvil → bottom sheet. */
export function useIsDesktopMd() {
    return useSyncExternalStore(
        subscribeMd,
        () => window.matchMedia('(min-width: 760px)').matches,
        () => true
    )
}

/**
 * Copiado al portapapeles compartido por la pastilla y la hoja.
 *
 * El éxito NO lanza toast: el feedback vive inline en el propio botón (chip verde con check), y
 * sumarle un toast sería doble aviso por un mismo toque. El toast queda reservado al FALLO, que es
 * el caso en que el coach necesita saber qué hacer (Safari sin gesto de usuario, http sin TLS,
 * WebView sin permiso: ahí `navigator.clipboard` no existe o rechaza).
 */
export async function copyToClipboard(value: string): Promise<boolean> {
    try {
        if (!navigator.clipboard?.writeText) throw new Error('sin portapapeles')
        await navigator.clipboard.writeText(value)
        return true
    } catch {
        toast.error('No pudimos copiar. Mantén presionado el código para copiarlo.')
        return false
    }
}

/** Apaga el estado "copiado" a los 1600 ms y limpia el timer si el componente se desmonta antes. */
export function useCopiedFlag() {
    const [copied, setCopied] = useState(false)
    useEffect(() => {
        if (!copied) return
        const t = window.setTimeout(() => setCopied(false), COPIED_RESET_MS)
        return () => window.clearTimeout(t)
    }, [copied])
    return [copied, setCopied] as const
}

export function InviteStudentSheet({ open, onOpenChange, inviteCode }: Props) {
    const isDesktop = useIsDesktopMd()
    // Los dos copiados son independientes: copiar el link no debe apagar el "Código copiado".
    const [codeCopied, setCodeCopied] = useCopiedFlag()
    const [linkCopied, setLinkCopied] = useCopiedFlag()

    const loginUrl = buildStudentLoginUrl(inviteCode)

    const copyCode = async () => {
        if (await copyToClipboard(inviteCode)) setCodeCopied(true)
    }

    const copyLink = async () => {
        if (await copyToClipboard(loginUrl)) setLinkCopied(true)
    }

    const shareWhatsApp = () => {
        // El código va en SU PROPIA LÍNEA: pegado al final de la URL, WhatsApp se comía el punto
        // dentro del enlace y al alumno le llegaba un link roto (reportado 2026-08-12).
        const message = `Entrena conmigo: ${buildStudentAppUrl(inviteCode)}\nTu código: ${inviteCode}`
        window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer')
    }

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent
                side={isDesktop ? 'right' : 'bottom'}
                showCloseButton={isDesktop}
                className={
                    isDesktop
                        ? 'w-full gap-0 border-subtle bg-surface-card p-0 text-body sm:max-w-md'
                        : 'max-h-[min(88dvh,88svh)] gap-0 rounded-t-sheet border-subtle bg-surface-card p-0 text-body'
                }
            >
                <div
                    className={`flex flex-col overflow-y-auto overscroll-contain px-[18px] ${
                        isDesktop
                            ? 'h-full pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]'
                            : 'max-h-[min(88dvh,88svh)] pt-2.5 pb-[max(1.5rem,env(safe-area-inset-bottom))]'
                    }`}
                >
                    {!isDesktop && (
                        <div
                            className="mx-auto mb-3.5 h-1 w-[38px] shrink-0 rounded-pill bg-[var(--ink-200)]"
                            aria-hidden="true"
                        />
                    )}

                    <SheetHeader className="border-0 bg-transparent p-0">
                        {/* SheetTitle trae Montserrat hardcodeado por `style` y `uppercase`: los anulamos
                            para que gane la display de la marca del coach (font-display es @theme inline,
                            así que la familia NO puede pasarse como var). */}
                        <SheetTitle
                            className="font-display text-[21px] font-black normal-case tracking-[-0.025em] text-strong"
                            style={{ fontFamily: undefined }}
                        >
                            Invitar alumno
                        </SheetTitle>
                        <SheetDescription className="text-[13.5px] font-medium text-muted">
                            Tu alumno entra desde el navegador con este link. No necesita instalar nada.
                        </SheetDescription>
                    </SheetHeader>

                    {/* Bloque del código — tinte de marca resuelto en clases (ver INVITE_TINT_CLASS). */}
                    <div className={cn('mt-4 shrink-0 rounded-control border px-4 py-5 text-center', INVITE_TINT_CLASS)}>
                        {/* `pl` = el tracking: la letra final arrastra su 0.24em de espacio y el bloque
                            centrado quedaba corrido a la izquierda. */}
                        <div className="eva-mono pl-[0.24em] text-[36px] font-extrabold leading-none tracking-[0.24em] text-strong">
                            {inviteCode}
                        </div>
                        <div className="mt-2.5 text-[11.5px] font-bold uppercase tracking-[0.06em] text-[var(--theme-primary,var(--sport-500))]">
                            TU CÓDIGO ES PERMANENTE
                        </div>
                    </div>

                    <div className="mt-3.5 flex shrink-0 flex-col gap-2.5">
                        <button
                            type="button"
                            onClick={copyCode}
                            className="eva-press inline-flex h-12 w-full items-center justify-center gap-2 rounded-control border-[1.5px] border-transparent font-ui text-[15px] font-bold leading-none tracking-[-0.01em] outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)]"
                            style={
                                codeCopied
                                    ? { background: 'var(--success-100)', color: 'var(--success-700)' }
                                    : {
                                          background: 'var(--theme-primary, var(--sport-500))',
                                          color: 'var(--text-on-sport)',
                                      }
                            }
                        >
                            {codeCopied ? (
                                <Check className="size-[17px] shrink-0" strokeWidth={2.1} />
                            ) : (
                                <Copy className="size-[17px] shrink-0" strokeWidth={2.1} />
                            )}
                            {codeCopied ? 'Código copiado' : 'Copiar código'}
                        </button>

                        <button
                            type="button"
                            onClick={copyLink}
                            className={`eva-press inline-flex h-12 w-full items-center justify-center gap-2 rounded-control border-[1.5px] font-ui text-[15px] font-bold leading-none tracking-[-0.01em] outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)] ${
                                linkCopied
                                    ? 'border-transparent'
                                    : 'border-[var(--border-default)] bg-surface-card text-strong'
                            }`}
                            style={
                                linkCopied
                                    ? { background: 'var(--success-100)', color: 'var(--success-700)' }
                                    : undefined
                            }
                        >
                            {linkCopied ? (
                                <Check className="size-[17px] shrink-0" strokeWidth={2.1} />
                            ) : (
                                <Link2 className="size-[17px] shrink-0" strokeWidth={2.1} />
                            )}
                            {linkCopied ? 'Link copiado' : 'Copiar link'}
                        </button>

                        <button
                            type="button"
                            onClick={shareWhatsApp}
                            className="eva-press inline-flex h-12 w-full items-center justify-center gap-2 rounded-control font-ui text-[13.5px] font-bold leading-none text-subtle outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)]"
                        >
                            <Share2 className="size-4 shrink-0" strokeWidth={2.1} />
                            Compartir por WhatsApp
                        </button>
                    </div>

                    <div className="my-4 h-px w-full shrink-0 bg-[var(--border-subtle)]" aria-hidden="true" />

                    <div className="flex shrink-0 items-center gap-3.5">
                        {/* Fondo blanco LITERAL (no token): en dark el QR sobre superficie oscura pierde
                            contraste y las cámaras dejan de leerlo. */}
                        <div
                            className="shrink-0 rounded-[12px] border border-black/10 p-[7px]"
                            style={{ background: '#FFFFFF' }}
                        >
                            <QRCodeSVG value={loginUrl} size={76} level="M" />
                        </div>
                        <div className="min-w-0">
                            <div className="text-[13.5px] font-bold text-strong">O que lo escanee</div>
                            <div className="mt-1 text-[12px] text-subtle">
                                La cámara lo lleva a tu app con el código ya puesto.
                            </div>
                        </div>
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    )
}
