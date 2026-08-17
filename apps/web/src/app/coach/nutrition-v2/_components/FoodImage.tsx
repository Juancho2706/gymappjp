'use client'

import Image from 'next/image'

// Imagen de un alimento con respaldo GARANTIZADO: si hay foto del producto se muestra
// (next/image `unoptimized` -> se sirve la URL publica tal cual, cero Image
// Transformations); si no, el icono estatico de categoria (`/food-icons/<cat>.webp`,
// parte del build) centrado sobre un fondo suave. Nunca queda un hueco vacio.
// Reusado por la card de resultado (cover) y por el item dentro de una franja (thumb).

/** Card de resultado: imagen "cover" cuadrada arriba de la tarjeta. */
export function FoodCoverImage({
  imageUrl,
  iconUrl,
  alt,
}: {
  imageUrl: string | null
  iconUrl: string
  alt: string
}) {
  return (
    <span className="relative block aspect-square w-full overflow-hidden rounded-t-card bg-surface-sunken">
      {imageUrl ? (
        <Image
          alt={alt}
          src={imageUrl}
          fill
          unoptimized
          loading="lazy"
          sizes="(min-width: 1024px) 22vw, (min-width: 640px) 33vw, 50vw"
          className="object-cover"
        />
      ) : (
        <span className="absolute inset-0 grid place-items-center bg-primary/10 dark:bg-primary/10">
          <Image alt="" aria-hidden="true" src={iconUrl} width={48} height={48} unoptimized loading="lazy" className="h-12 w-12 object-contain" />
        </span>
      )}
    </span>
  )
}

/**
 * Tamanos del thumb. `md` (40 px) es el historico y sigue siendo el defecto — no se toca ni un
 * pixel de quien ya lo montaba. `sm` (34 px) lo agrega T3.v Cabina para la fila v2 del editor
 * unico, donde la fila entera mide ~60 px y 40 px la desbalancea (mockup «Cabina v2» A·1).
 * Las medidas van HARDCODEADAS por tamano (clase + width/height de next/image) para reservar el
 * espacio antes de que la foto cargue: cero layout shift, igual que antes.
 */
type FoodThumbSize = 'sm' | 'md'

const THUMB_STYLES: Record<FoodThumbSize, { box: string; px: number; icon: string; iconPx: number }> = {
  sm: { box: 'h-[34px] w-[34px]', px: 34, icon: 'h-5 w-5', iconPx: 20 },
  md: { box: 'h-10 w-10', px: 40, icon: 'h-6 w-6', iconPx: 24 },
}

/** Item dentro de una franja: thumbnail cuadrado de 40 px (34 px en `size="sm"`) a la izquierda. */
export function FoodThumb({
  imageUrl,
  iconUrl,
  alt,
  size = 'md',
}: {
  imageUrl: string | null
  iconUrl: string
  alt: string
  size?: FoodThumbSize
}) {
  const styles = THUMB_STYLES[size]
  return (
    <span
      className={`relative grid ${styles.box} shrink-0 place-items-center overflow-hidden rounded-control border border-border-subtle bg-surface-sunken`}
    >
      {imageUrl ? (
        <Image
          alt={alt}
          src={imageUrl}
          width={styles.px}
          height={styles.px}
          unoptimized
          loading="lazy"
          className={`${styles.box} object-cover`}
        />
      ) : (
        <span className="absolute inset-0 grid place-items-center bg-primary/10 dark:bg-primary/10">
          <Image
            alt=""
            aria-hidden="true"
            src={iconUrl}
            width={styles.iconPx}
            height={styles.iconPx}
            unoptimized
            loading="lazy"
            className={`${styles.icon} object-contain`}
          />
        </span>
      )}
    </span>
  )
}
