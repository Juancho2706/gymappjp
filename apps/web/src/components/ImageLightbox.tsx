'use client'

import * as React from 'react'
import { Dialog as LightboxPrimitive } from '@base-ui/react/dialog'
import { ImageOff, Loader2, RotateCcw, X } from 'lucide-react'
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
  // `loaded`: la variante grande ya pintó (dispara el fade). `failed`: se agotaron
  // src + respaldo. `reloadKey` fuerza un remonte del <img> al reintentar (mismo src).
  const [loaded, setLoaded] = React.useState(false)
  const [failed, setFailed] = React.useState(false)
  const [reloadKey, setReloadKey] = React.useState(0)
  const triedFallback = React.useRef(false)

  // Reinicia el estado cada vez que cambia la imagen o se reabre el lightbox.
  React.useEffect(() => {
    setCurrentSrc(src)
    setLoaded(false)
    setFailed(false)
    triedFallback.current = false
  }, [src, open])

  const handleError = React.useCallback(() => {
    if (!triedFallback.current && fallbackSrc && fallbackSrc !== currentSrc) {
      // Primer fallo: cae a la miniatura ya cargada antes de rendirse.
      triedFallback.current = true
      setCurrentSrc(fallbackSrc)
      setLoaded(false)
    } else {
      setFailed(true)
    }
  }, [fallbackSrc, currentSrc])

  const retry = React.useCallback(() => {
    triedFallback.current = false
    setCurrentSrc(src)
    setLoaded(false)
    setFailed(false)
    setReloadKey((key) => key + 1)
  }, [src])

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

          <div
            className={cn(
              'relative flex max-h-[82dvh] max-w-[92vw] items-center justify-center',
              // Marco estable mientras carga: sin él, el <img> aún sin pintar colapsa
              // a 0 y el placeholder/spinner no tendrían espacio.
              !loaded && !failed ? 'h-[60dvh] w-[80vw]' : null,
            )}
          >
            {/* Placeholder difuminado: la miniatura ya cargada mientras baja la grande. */}
            {fallbackSrc && !loaded && !failed ? (
              // eslint-disable-next-line @next/next/no-img-element -- imagen de Storage: cero Image Transformations
              <img
                src={fallbackSrc}
                alt=""
                aria-hidden
                draggable={false}
                className="pointer-events-none absolute inset-0 h-full w-full scale-105 select-none rounded-xl object-contain opacity-50 blur-lg"
              />
            ) : null}

            {failed ? (
              <div className="flex flex-col items-center gap-3 rounded-xl bg-white/5 px-8 py-12 text-center text-white/80">
                <ImageOff className="size-9" aria-hidden />
                <p className="text-sm font-medium">No pudimos cargar la imagen</p>
                <button
                  type="button"
                  onClick={retry}
                  className={cn(
                    'eva-press inline-flex min-h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold',
                    'border border-white/25 bg-white/10 text-white transition-colors hover:bg-white/20',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70',
                  )}
                >
                  <RotateCcw className="size-4" aria-hidden />
                  Reintentar
                </button>
              </div>
            ) : (
              <>
                {!loaded ? (
                  <Loader2
                    className="absolute left-1/2 top-1/2 size-8 -translate-x-1/2 -translate-y-1/2 animate-spin text-[var(--theme-primary)]"
                    aria-label="Cargando imagen"
                  />
                ) : null}
                {/* eslint-disable-next-line @next/next/no-img-element -- imagen de Storage: cero Image Transformations */}
                <img
                  key={reloadKey}
                  src={currentSrc ?? undefined}
                  alt={alt}
                  onLoad={() => setLoaded(true)}
                  onError={handleError}
                  draggable={false}
                  className={cn(
                    'max-h-[82dvh] max-w-[92vw] select-none rounded-xl bg-white/5 object-contain shadow-2xl',
                    'transition-opacity duration-200 motion-reduce:transition-none',
                    loaded ? 'opacity-100' : 'opacity-0',
                  )}
                />
              </>
            )}
          </div>

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
