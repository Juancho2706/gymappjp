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
        <span className="absolute inset-0 grid place-items-center bg-ember-100/40 dark:bg-ember-100/10">
          <Image alt="" aria-hidden="true" src={iconUrl} width={48} height={48} unoptimized loading="lazy" className="h-12 w-12 object-contain" />
        </span>
      )}
    </span>
  )
}

/** Item dentro de una franja: thumbnail cuadrado de 40 px a la izquierda. */
export function FoodThumb({
  imageUrl,
  iconUrl,
  alt,
}: {
  imageUrl: string | null
  iconUrl: string
  alt: string
}) {
  return (
    <span className="relative grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-control border border-border-subtle bg-surface-sunken">
      {imageUrl ? (
        <Image alt={alt} src={imageUrl} width={40} height={40} unoptimized loading="lazy" className="h-10 w-10 object-cover" />
      ) : (
        <Image alt="" aria-hidden="true" src={iconUrl} width={24} height={24} unoptimized loading="lazy" className="h-6 w-6 object-contain" />
      )}
    </span>
  )
}
