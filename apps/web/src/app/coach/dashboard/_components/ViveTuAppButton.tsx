'use client'

import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Copy, ExternalLink, Eye, Loader2, RotateCcw, Smartphone } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { toast } from 'sonner'
import { personaNoun, type Persona } from '@eva/schemas'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { reseedDemoStudentAction } from '../../settings/funciones/_actions/mi-panel.actions'
import { openViveTuAppAction } from '../_actions/vive-tu-app.actions'

/**
 * «Vive tu app» — el coach entra a SU app de alumno como su alumno de ejemplo y ve su marca
 * funcionando (SPEC coach-onboarding-v2 §5). Lo usan el paso 2 de la guía y la tarjeta del demo.
 *
 * El link es un magic link de un solo uso. Las cookies de Supabase son del host, no de la pestaña.
 *
 * DOS caminos, y la diferencia es el dispositivo (docs/specs/vive-tu-app-directo/SPEC.md §1, tras
 * la auditoría del 23-08: 4 de 6 coaches se quedaron mirando un QR **con el celular en la mano**):
 *  - MÓVIL: un toque = un `generate()` y `location.assign` en el MISMO gesto. Sin hoja, sin QR.
 *    Volver a su panel es un toque y lo resuelve el banner de la app del alumno (W2).
 *  - ESCRITORIO: la hoja conserva el QR primero (el teléfono no tiene la sesión del panel) y
 *    «Abrir en este navegador» como segunda opción, ahora sin miedo: se abre en otra pestaña.
 *
 * `autoOpen` (cierres guiados) NO navega solo en móvil: navegar sin gesto es un secuestro de
 * pantalla y en el builder hay borrador local. Muestra el CTA y espera el toque.
 *
 * SIN alumno de ejemplo el botón no es un toast (D8 = A): explica y, si la especialidad admite
 * demo, ofrece «Volver a sembrar» con la MISMA acción de `Opciones › Mi panel`.
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
    autoOpen = false,
    demoClientId,
    persona,
}: {
    label: string
    className?: string
    /**
     * Aviso de «el coach pidió el link». YA NO tilda el paso 2 (V1.17): el tilde llega por la señal
     * del servidor cuando el coach ENTRÓ de verdad (`vive_tu_app_entered`).
     */
    onOpened: () => void
    /**
     * Abre la hoja sola al montar (una vez) EN ESCRITORIO. Lo usan los cierres de las tareas
     * guiadas («Asignar y ver como …», «Publicar y ver como …»): el CTA ya fue el gesto del coach.
     * En móvil solo pinta el botón: la navegación necesita su propio toque.
     */
    autoOpen?: boolean
    /**
     * Alumno de ejemplo del coach (`getCoachOnboardingEmptyContext.demoClientId` /
     * `DemoStudentSnapshot.clientId`). `null` = no tiene; `undefined` = el llamador no lo sabe y ya
     * está en un contexto con demo (builder, cierre de pauta).
     */
    demoClientId?: string | null
    /** Especialidad vigente: decide el vocabulario y si el demo se puede volver a sembrar. */
    persona?: Persona | null
}) {
    const router = useRouter()
    const isDesktop = useSyncExternalStore(subscribeDesktop, readDesktop, () => false)
    const [sheetOpen, setSheetOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const [link, setLink] = useState<LinkState | null>(null)
    const [copied, setCopied] = useState(false)
    /** `sin_demo` en runtime (el coach borró el ejemplo en otra pestaña) cae acá, no en un toast. */
    const [demoMissing, setDemoMissing] = useState(demoClientId === null)
    const [reseeding, startReseed] = useTransition()
    const autoOpenedRef = useRef(false)

    const noun = personaNoun(persona ?? 'strength')

    useEffect(() => {
        if (!autoOpen || autoOpenedRef.current) return
        autoOpenedRef.current = true
        // `readDesktop()` y no `isDesktop`: durante la hidratación el store todavía devuelve el
        // snapshot del servidor (`false`) y el escritorio perdería su apertura automática.
        if (!readDesktop()) return
        void open()
        // `open` cambia de identidad en cada render; el efecto debe correr UNA vez por montaje.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autoOpen])

    async function generate(): Promise<LinkState | null> {
        const result = await openViveTuAppAction()
        if (!result.ok) {
            if (result.reason === 'sin_demo') {
                // Sin toast: el botón mismo pasa a explicar y a ofrecer la salida (D8 = A).
                setDemoMissing(true)
                return null
            }
            toast.error(result.detail ?? 'No pudimos abrir tu app.')
            return null
        }
        return { url: result.url, demoName: result.demoName }
    }

    /**
     * El gesto del coach. En móvil termina en `location.assign` DENTRO del mismo gesto (nada de
     * `window.open`, que el bloqueador mata tras el await) y no abre hoja ni tilda nada.
     */
    async function open() {
        if (loading) return
        setLoading(true)
        try {
            const fresh = await generate()
            if (!fresh) return
            if (!readDesktop()) {
                window.location.assign(fresh.url)
                return
            }
            setLink(fresh)
            setCopied(false)
            setSheetOpen(true)
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
            // REUSA el link del QR: es el mismo gesto y volver a generarlo emitía un segundo
            // `vive_tu_app_opened` (el funnel contaba dos «pidió el link» por una sola intención).
            // Solo se regenera si no hay ninguno.
            const fresh = link ?? (await generate())
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

    function reseed() {
        startReseed(async () => {
            const result = await reseedDemoStudentAction()
            if (!result.ok) {
                toast.error(result.error)
                return
            }
            setDemoMissing(false)
            toast.success(result.message)
            router.refresh()
        })
    }

    const firstName = link?.demoName.split(' ')[0] ?? `tu ${noun} de ejemplo`

    if (demoMissing) {
        // `other` no tiene mundo propio que sembrar (y sin especialidad no hay qué sembrar):
        // se explica y se deja el botón apagado en vez de mandarlo a un toast sin salida.
        const canReseed = persona != null && persona !== 'other'
        return (
            <div className="flex min-w-0 flex-col gap-1.5">
                {canReseed ? (
                    <button
                        type="button"
                        onClick={reseed}
                        disabled={reseeding}
                        className={cn(
                            'inline-flex h-11 touch-manipulation items-center gap-1.5 rounded-control border border-subtle px-3.5 text-[13px] font-bold text-[var(--text-strong)] transition-colors hover:bg-surface-sunken disabled:opacity-60',
                            className
                        )}
                    >
                        {reseeding ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
                        Volver a sembrar
                    </button>
                ) : (
                    <button
                        type="button"
                        disabled
                        className={cn(
                            'inline-flex h-11 touch-manipulation items-center gap-1.5 rounded-control border border-subtle px-3.5 text-[13px] font-bold text-[var(--text-strong)] opacity-60',
                            className
                        )}
                    >
                        <Eye className="size-4" />
                        {label}
                    </button>
                )}
                <p className="text-[11.5px] leading-snug text-[var(--text-muted)]">
                    {persona === 'other'
                        ? 'Tu especialidad no tiene alumno de ejemplo todavía.'
                        : `Todavía no tienes tu ${noun} de ejemplo.`}
                </p>
            </div>
        )
    }

    return (
        <>
            <button
                type="button"
                onClick={() => void open()}
                disabled={loading}
                className={cn(
                    'inline-flex h-11 touch-manipulation items-center gap-1.5 rounded-control border border-subtle px-3.5 text-[13px] font-bold text-[var(--text-strong)] transition-colors hover:bg-surface-sunken disabled:opacity-60',
                    className
                )}
            >
                {loading ? <Loader2 className="size-4 animate-spin" /> : <Eye className="size-4" />}
                {label}
            </button>

            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
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
                                        Entras directo, sin contraseña, como {firstName}. Es la misma app que van a
                                        usar tus {noun}s.
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
                                {/* Ya no hay miedo que anunciar: la pestaña vieja del panel sigue viva y el
                                    árbol del alumno trae el banner «Volver a mi panel» (W2). */}
                                <p className="text-center text-[11.5px] leading-snug text-[var(--text-muted)]">
                                    Se abre en otra pestaña. Cuando termines, vuelves a tu panel con un toque.
                                </p>
                            </div>
                        </>
                    )}
                </SheetContent>
            </Sheet>
        </>
    )
}
