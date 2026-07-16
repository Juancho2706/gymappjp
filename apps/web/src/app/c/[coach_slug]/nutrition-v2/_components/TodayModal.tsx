'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'

/**
 * Modal ligero y autocontenido (sin dependencias externas) para los flujos del
 * Today: registrar alimento, editar cantidad y retirar. Cierra con Escape y con
 * click en el backdrop. Alto por dvh (nunca vh fuera de md:).
 */
export function TodayModal({
  title,
  description,
  open,
  onClose,
  children,
  footer,
}: {
  title: string
  description?: string
  open: boolean
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}) {
  const panelRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panelRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      aria-hidden={false}
      // z-[100]: por ENCIMA de la capsula flotante del nav del alumno (ClientNav, z-index 59) y
      // del sheet "Mas" (z-[60]). El backdrop cubre el nav para que no tape los inputs ni los
      // botones Registrar/Cambiar del sheet (bug QA: navbar encima del dialogo).
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 p-0 pb-safe backdrop-blur-sm md:items-center md:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={panelRef}
        aria-describedby={description ? 'today-modal-desc' : undefined}
        aria-labelledby="today-modal-title"
        aria-modal="true"
        className="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-card border border-border-subtle bg-surface-card shadow-xl outline-none md:rounded-card"
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
