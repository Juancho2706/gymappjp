'use client'

import { useState, useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Copy, ExternalLink, Eye, Loader2, Smartphone } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { toast } from 'sonner'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { openViveTuAppAction } from '../_actions/vive-tu-app.actions'

/**
 * «Vive tu app» — el coach entra a SU app de alumno como su alumno de ejemplo y ve su marca
 * funcionando (SPEC coach-onboarding-v2 §5). Lo usan el paso 2 de la guía y la tarjeta del demo.
 *
 * El link es un magic link de un solo uso. Las cookies de Supabase son del host, no de la pestaña:
 * abrirlo en este navegador reemplaza la sesión del panel por la del alumno. Por eso la hoja ofrece
 * PRIMERO el QR (el celular no tiene la sesión del panel y además la app del alumno es móvil) y
 * deja «abrir aquí» como segunda opción, con el aviso.
 */
const DESKTOP_QUERY = '(min-width: 768px)'
const subscribeDesktop = (cb: () => void) => {
    const mql = window.matchMedia(DESKTOP_QUERY)
    mql.addEventListener('change', cb)
    return () => mql.removeEventListener('change', cb)
}
const readDesktop = () => window.matchMedia(DESKTOP_QUERY).matches

type LinkState = { url: string; demoName: string }

export function ViveTuAppButton({
    label,
    className,
    onOpened,
}: {
    label: string
    className?: string
    onOpened: () => void
}) {
    const router = useRouter()
    const isDesktop = useSyncExternalStore(subscribeDesktop, readDesktop, () => false)
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const [link, setLink] = useState<LinkState | null>(null)
    const [copied, setCopied] = useState(false)

    async function generate(): Promise<LinkState | null> {
        const result = await openViveTuAppAction()
        if (!result.ok) {
            toast.error(
                result.reason === 'sin_demo'
                    ? 'Todavía no tienes alumno de ejemplo.'
                    : (result.detail ?? 'No pudimos abrir tu app.')
            )
            return null
        }
        return { url: result.url, demoName: result.demoName }
    }

    async function openSheet() {
        if (loading) return
        setLoading(true)
        try {
            const fresh = await generate()
            if (!fresh) return
            setLink(fresh)
            setCopied(false)
            setOpen(true)
            onOpened()
            router.refresh()
        } catch {
            toast.error('No pudimos abrir tu app. Intenta de nuevo.')
        } finally {
            setLoading(false)
        }
    }

    async function openHere() {
        // La pestaña se abre ANTES del await: después ya no cuenta como gesto y el bloqueador la mata.
        const tab = window.open('about:blank', '_blank', 'noopener,noreferrer')
        try {
            // Link nuevo: el del QR es de un solo uso y puede estar gastado.
            const fresh = await generate()
            if (!fresh) {
                tab?.close()
                return
            }
            if (tab) tab.location.href = fresh.url
            else window.location.href = fresh.url
        } catch {
            tab?.close()
            toast.error('No pudimos abrir tu app. Intenta de nuevo.')
        }
    }

    async function copyLink() {
        if (!link) return
        try {
            await navigator.clipboard.writeText(link.url)
            setCopied(true)
            toast.success('Link copiado. Sirve una sola vez.')
            window.setTimeout(() => setCopied(false), 2500)
        } catch {
            toast.error('No pudimos copiar el link.')
        }
    }

    const firstName = link?.demoName.split(' ')[0] ?? 'tu alumno de ejemplo'

    return (
        <>
            <button
                type="button"
                onClick={() => void openSheet()}
                disabled={loading}
                className={cn(
                    'inline-flex h-11 touch-manipulation items-center gap-1.5 rounded-control border border-subtle px-3.5 text-[13px] font-bold text-[var(--text-strong)] transition-colors hover:bg-surface-sunken disabled:opacity-60',
                    className
                )}
            >
                {loading ? <Loader2 className="size-4 animate-spin" /> : <Eye className="size-4" />}
                {label}
            </button>

            <Sheet open={open} onOpenChange={setOpen}>
                <SheetContent
                    side={isDesktop ? 'right' : 'bottom'}
                    className={cn('flex flex-col gap-0 overflow-y-auto p-5', isDesktop ? 'w-full sm:max-w-md' : 'max-h-[92dvh] rounded-t-[20px]')}
                >
                    <SheetHeader className="border-0 bg-transparent p-0 text-left">
                        <SheetTitle className="font-display text-[20px] font-extrabold normal-case tracking-[-0.02em] text-strong" style={{ fontFamily: 'inherit' }}>
                            Vive tu app
                        </SheetTitle>
                        <SheetDescription className="text-[13.5px] font-medium text-muted">
                            Así ve {firstName} tu app: con tu logo, tu color y lo que le dejaste cargado.
                        </SheetDescription>
                    </SheetHeader>

                    {link && (
                        <>
                            <div className="mt-4 flex items-center gap-4 rounded-control border border-subtle bg-surface-sunken p-4">
                                {/* Fondo blanco LITERAL (no token): en dark el QR sobre superficie oscura pierde
                                    contraste y las cámaras dejan de leerlo. */}
                                <div className="shrink-0 rounded-[12px] border border-black/10 p-2" style={{ background: '#FFFFFF' }}>
                                    <QRCodeSVG value={link.url} size={132} level="M" />
                                </div>
                                <div className="min-w-0">
                                    <div className="flex items-center gap-1.5 text-[14px] font-bold text-strong">
                                        <Smartphone className="size-4 shrink-0" />
                                        Escanéalo con tu celular
                                    </div>
                                    <p className="mt-1 text-[12.5px] leading-snug text-subtle">
                                        Entras directo, sin contraseña, como {firstName}. Es la misma app que van a usar tus alumnos.
                                    </p>
                                    <p className="mt-1.5 text-[11.5px] text-[var(--text-muted)]">El link sirve una vez y vence en una hora.</p>
                                </div>
                            </div>

                            <div className="mt-3 flex flex-col gap-2">
                                <button
                                    type="button"
                                    onClick={() => void copyLink()}
                                    className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-control border border-subtle text-[13.5px] font-bold text-strong transition-colors hover:bg-surface-sunken"
                                >
                                    {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                                    {copied ? 'Copiado' : 'Copiar el link'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => void openHere()}
                                    className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-control px-3 text-[13px] font-bold text-[var(--text-muted)] transition-colors hover:bg-surface-sunken"
                                >
                                    <ExternalLink className="size-4" />
                                    Abrir en este navegador
                                </button>
                                {/* Aviso antes, no después: abrirlo acá reemplaza la sesión del panel. */}
                                <p className="text-center text-[11.5px] leading-snug text-[var(--text-muted)]">
                                    Si lo abres aquí, tu panel te pedirá iniciar sesión de nuevo. Por eso el celular es mejor.
                                </p>
                            </div>
                        </>
                    )}
                </SheetContent>
            </Sheet>
        </>
    )
}
