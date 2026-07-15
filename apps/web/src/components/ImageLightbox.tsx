'use client'

import * as React from 'react'
import { Dialog as LightboxPrimitive } from '@base-ui/react/dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Lightbox de imagen reutilizable.
 *
 * Overlay fullscreen montado por portal (Base UI Dialog) — hereda foco atrapado,
 * cierre por Escape, `aria-modal` y una pila de foco que compone limpio cuando se
 * abre POR ENCIMA de otro diálogo/sheet (mismo stack que `@/components/ui/*`).
 *
 * Imagen SIN Image Transformations: `<img>` plano con `object-contain`. Si la
 * variante grande (`src`) falla, cae a `fallbackSrc`. La animación respeta
 * `prefers-reduced-motion` (`motion-reduce:*`).
 */
type ImageLightboxProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** URL de la imagen grande. Si es null, el lightbox no renderiza contenido. */
  src: string | null
  /** URL de respaldo si `src` falla al cargar (ej. la variante chica). */
  fallbackSrc?: string | null
  alt?: string
  /** Título accesible (oculto visualmente) para `aria-labelledby`. */
  title?: string
  /** Pie del lightbox: crédito de la foto + enlace "Ver original". */
  footer?: React.ReactNode
}

export function ImageLightbox({
  open,
  onOpenChange,
  src,
  fallbackSrc = null,
  alt = '',
  title = 'Imagen ampliada',
  footer,
}: ImageLightboxProps) {
  const [currentSrc, setCurrentSrc] = React.useState<string | null>(src)
  const triedFallback = React.useRef(false)

  // Reinicia la fuente cada vez que cambia la imagen o se reabre el lightbox.
  React.useEffect(() => {
    setCurrentSrc(src)
    triedFallback.current = false
  }, [src, open])

  const handleError = React.useCallback(() => {
    if (!triedFallback.current && fallbackSrc && fallbackSrc !== currentSrc) {
      triedFallback.current = true
      setCurrentSrc(fallbackSrc)
    }
  }, [fallbackSrc, currentSrc])

  if (!src) return null

  return (
    <LightboxPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <LightboxPrimitive.Portal>
        <LightboxPrimitive.Backdrop
          className={cn(
            'fixed inset-0 z-[90] bg-black/85 supports-backdrop-filter:backdrop-blur-sm',
            'duration-200 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0',
            'motion-reduce:animate-none motion-reduce:duration-0',
          )}
        />
        <LightboxPrimitive.Popup
          aria-label={title}
          onClick={(e) => {
            // Click fuera de la imagen (sobre el fondo) cierra.
            if (e.target === e.currentTarget) onOpenChange(false)
          }}
          className={cn(
            'fixed inset-0 z-[91] flex flex-col items-center justify-center gap-3 p-4 outline-none pt-safe pb-safe',
            'duration-200 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
            'motion-reduce:animate-none motion-reduce:duration-0',
          )}
        >
          <LightboxPrimitive.Title className="sr-only">{title}</LightboxPrimitive.Title>

          <LightboxPrimitive.Close
            aria-label="Cerrar"
            className={cn(
              'eva-press absolute right-3 top-3 z-10 flex size-10 items-center justify-center rounded-full',
              'border border-white/20 bg-black/50 text-white backdrop-blur-sm transition-colors hover:bg-black/70',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70',
            )}
          >
            <X className="size-5" aria-hidden />
          </LightboxPrimitive.Close>

          {/* eslint-disable-next-line @next/next/no-img-element -- imagen de Storage: cero Image Transformations */}
          <img
            src={currentSrc ?? undefined}
            alt={alt}
            onError={handleError}
            draggable={false}
            className={cn(
              'max-h-[82dvh] max-w-[92vw] select-none rounded-xl bg-white/5 object-contain shadow-2xl',
            )}
          />

          {footer ? (
            <div className="pointer-events-auto max-w-[92vw] text-center text-[12px] leading-relaxed text-white/80">
              {footer}
            </div>
          ) : null}
        </LightboxPrimitive.Popup>
      </LightboxPrimitive.Portal>
    </LightboxPrimitive.Root>
  )
}
