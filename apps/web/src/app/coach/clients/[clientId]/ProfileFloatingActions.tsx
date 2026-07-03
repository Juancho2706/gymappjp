'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ClipboardCheck, Dumbbell } from 'lucide-react'

function digitsForWhatsApp(phone: string) {
    const d = phone.replace(/\D/g, '')
    if (d.length >= 10) return d
    return null
}

/** Camina hacia arriba buscando el ancestro con scroll (la `.scroll` del diseño). */
function getScrollParent(el: HTMLElement | null): HTMLElement | null {
    let node = el?.parentElement ?? null
    while (node) {
        const style = getComputedStyle(node)
        if (/(auto|scroll|overlay)/.test(style.overflowY) && node.scrollHeight > node.clientHeight) {
            return node
        }
        node = node.parentElement
    }
    return null
}

type ProfileFloatingActionsProps = {
    clientId: string
    coachSlug?: string | null
    clientPhone?: string | null
}

/**
 * Barra de acción persistente de la ficha (chrome) — 1:1 con coach-ficha.jsx:
 * botones flotantes sobre la nav (WhatsApp verde con label · check-in · builder),
 * sticky abajo, contenedor `pointer-events:none` y los hijos `auto`. Se encoge/junta
 * al bajar el scroll (>8px) y vuelve al subir o al volver arriba (<36px). Sin banda
 * full-width que tape el contenido (los "Módulos" / "Editar plan" del Resumen).
 */
export function ProfileFloatingActions({
    clientId,
    coachSlug,
    clientPhone,
}: ProfileFloatingActionsProps) {
    // actMin = barra encogida (igual que la nav flotante del diseño).
    const [actMin, setActMin] = useState(false)
    const lastY = useRef(0)
    const rootRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const root = rootRef.current
        if (!root) return
        const sc = getScrollParent(root)
        const target: EventTarget = sc ?? window
        const getY = () => (sc ? sc.scrollTop : window.scrollY)
        const onScroll = () => {
            const y = getY()
            if (y < 36) setActMin(false)
            else if (y - lastY.current > 8) setActMin(true)
            else if (lastY.current - y > 8) setActMin(false)
            lastY.current = y
        }
        target.addEventListener('scroll', onScroll, { passive: true })
        return () => target.removeEventListener('scroll', onScroll)
    }, [])

    const waDigits = clientPhone ? digitsForWhatsApp(clientPhone) : null
    const waHref = waDigits ? `https://wa.me/${waDigits}` : null
    const checkInHref = coachSlug ? `/c/${coachSlug}/check-in` : null
    const builderHref = `/coach/builder/${clientId}`

    // Botón-ícono (clipboard / dumbbell) — espejo de `fichaActBtn` del diseño.
    const iconBtn: React.CSSProperties = {
        width: actMin ? 38 : 50,
        height: actMin ? 38 : 44,
        flexShrink: 0,
        borderRadius: 'var(--radius-control)',
        border: '1px solid var(--border-default)',
        background: 'var(--surface-card)',
        color: 'var(--text-strong)',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: 'var(--shadow-md)',
        pointerEvents: 'auto',
        transition:
            'width var(--dur-slow) var(--ease-spring), height var(--dur-base) var(--ease-out)',
    }

    return (
        <div
            ref={rootRef}
            className="sticky bottom-[calc(var(--mobile-content-bottom-offset)+0.5rem)] z-40 -mx-5 print:hidden md:bottom-0 lg:-mx-6"
            style={{
                boxSizing: 'border-box',
                minHeight: 'calc(72px + env(safe-area-inset-bottom))',
                padding: actMin
                    ? '0 56px calc(8px + env(safe-area-inset-bottom))'
                    : '0 20px calc(8px + env(safe-area-inset-bottom))',
                display: 'flex',
                gap: actMin ? 6 : 8,
                alignItems: 'center',
                justifyContent: 'center',
                pointerEvents: 'none',
                transition:
                    'padding var(--dur-slow) var(--ease-spring), gap var(--dur-base) var(--ease-out)',
            }}
        >
            {/* WhatsApp — verde, con label */}
            {waHref ? (
                <a
                    href={waHref}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Contactar por WhatsApp"
                    className="eva-press"
                    style={{
                        flex: 1,
                        height: actMin ? 38 : 44,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                        borderRadius: 'var(--radius-control)',
                        background: '#25D366',
                        color: '#fff',
                        fontSize: 14,
                        fontWeight: 700,
                        boxShadow: 'var(--shadow-md)',
                        pointerEvents: 'auto',
                        textDecoration: 'none',
                        transition: 'height var(--dur-base) var(--ease-out)',
                    }}
                >
                    <WhatsAppGlyph />
                    WhatsApp
                </a>
            ) : (
                <button
                    type="button"
                    disabled
                    aria-label="Sin teléfono para WhatsApp"
                    style={{
                        flex: 1,
                        height: actMin ? 38 : 44,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                        borderRadius: 'var(--radius-control)',
                        background: '#25D366',
                        color: '#fff',
                        fontSize: 14,
                        fontWeight: 700,
                        boxShadow: 'var(--shadow-md)',
                        opacity: 0.5,
                        cursor: 'not-allowed',
                        pointerEvents: 'auto',
                        border: 'none',
                        transition: 'height var(--dur-base) var(--ease-out)',
                    }}
                >
                    <WhatsAppGlyph />
                    WhatsApp
                </button>
            )}

            {/* Check-in del alumno (clipboard) */}
            {checkInHref ? (
                <Link
                    href={checkInHref}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Registrar check-in del alumno"
                    className="eva-press"
                    style={iconBtn}
                >
                    <ClipboardCheck size={20} />
                </Link>
            ) : (
                <button
                    type="button"
                    disabled
                    aria-label="Check-in no disponible"
                    style={{ ...iconBtn, opacity: 0.5, cursor: 'not-allowed' }}
                >
                    <ClipboardCheck size={20} />
                </button>
            )}

            {/* Builder de entrenamiento (dumbbell) */}
            <Link
                href={builderHref}
                aria-label="Abrir builder de entrenamiento"
                className="eva-press"
                style={iconBtn}
            >
                <Dumbbell size={20} />
            </Link>
        </div>
    )
}

/** Glifo de WhatsApp (mismo path del diseño). */
function WhatsAppGlyph() {
    return (
        <svg
            width="19"
            height="19"
            viewBox="0 0 24 24"
            fill="currentColor"
            style={{ flexShrink: 0 }}
            aria-hidden="true"
        >
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.076 4.487.709.306 1.262.489 1.694.626.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.247-.694.247-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.885-9.885 9.885m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
        </svg>
    )
}
