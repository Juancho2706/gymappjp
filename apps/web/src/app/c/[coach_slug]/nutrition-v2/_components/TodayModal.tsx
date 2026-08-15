'use client'

import { useEffect, useRef, type ReactNode, type RefObject } from 'react'
import { X } from 'lucide-react'
import { useSheetBodyMarker } from './useSheetBodyMarker'

/**
 * Modal ligero y autocontenido (sin dependencias externas) para los flujos del
 * Today: registrar alimento, editar cantidad y retirar. Cierra con Escape y con
 * click en el backdrop. Alto por dvh (nunca vh fuera de md:).
 *
 * Diálogo CENTRADO en TODOS los viewports (QA CEO): antes era hoja inferior en
 * mobile (`items-end` + `rounded-t-card`) y sólo se centraba desde `md:`.
 */
export function TodayModal({
  title,
  description,
  open,
  onClose,
  children,
  footer,
  initialFocusRef,
}: {
  title: string
  description?: string
  open: boolean
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  /**
   * Elemento que recibe el foco al abrir (p.ej. el input de búsqueda). Si no se pasa
   * —o si el ref todavía es null— el foco cae en el panel, que mantiene el foco-trap
   * y el cierre con Escape.
   */
  initialFocusRef?: RefObject<HTMLElement | null>
}) {
  const panelRef = useRef<HTMLDivElement | null>(null)

  // Marca el <body> mientras el sheet está abierto para que el nav del alumno (cápsula flotante)
  // se oculte por CSS y nunca tape los inputs ni los botones del sheet.
  useSheetBodyMarker(open)

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    // Scroll-lock en <html>, NO en <body>: globals.css fija `html { overflow-x: clip }` y con
    // eso el overflow del body deja de propagar al viewport (spec: solo propaga si el root es
    // `visible` en ambos ejes). Bloquear el body era un no-op (la página seguía scrolleable
    // detrás del modal) y ADEMÁS convertía al body en scroll container: el sidebar sticky del
    // alumno se re-anclaba a él y "se iba" con el scroll congelado (bug QA 2026-08-14).
    const previousOverflow = document.documentElement.style.overflow
    document.documentElement.style.overflow = 'hidden'
    const target = initialFocusRef?.current ?? panelRef.current
    target?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.documentElement.style.overflow = previousOverflow
    }
  }, [open, onClose, initialFocusRef])

  if (!open) return null

  return (
    <div
      aria-hidden={false}
      // z-[100]: por ENCIMA de la capsula flotante del nav del alumno (ClientNav, z-index 59) y
      // del sheet "Mas" (z-[60]). El backdrop cubre el nav para que no tape los inputs ni los
      // botones Registrar/Cambiar del sheet (bug QA: navbar encima del dialogo).
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={panelRef}
        aria-describedby={description ? 'today-modal-desc' : undefined}
        aria-labelledby="today-modal-title"
        aria-modal="true"
        // max-h-full (no 92dvh): el contenedor ya reserva el padding p-4, así el panel centrado
        // nunca se sale de la pantalla en mobile.
        className="flex max-h-full w-full max-w-lg flex-col overflow-hidden rounded-card border border-border-subtle bg-surface-card shadow-xl outline-none"
        role="dialog"
        tabIndex={-1}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border-subtle p-4">
          <div className="min-w-0">
            <h2 className="font-display text-lg font-semibold text-strong" id="today-modal-title">
              {title}
            </h2>
            {description ? (
              <p className="mt-1 text-sm text-muted" id="today-modal-desc">
                {description}
              </p>
            ) : null}
          </div>
          <button
            aria-label="Cerrar"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-control text-muted hover:bg-surface-sunken hover:text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={onClose}
            type="button"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
        {footer ? <div className="border-t border-border-subtle p-4">{footer}</div> : null}
      </div>
    </div>
  )
}
