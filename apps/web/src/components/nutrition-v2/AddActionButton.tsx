'use client'

import Image from 'next/image'
import * as React from 'react'

import { getContrastInfo } from '@/lib/color-utils'
import { cn } from '@/lib/utils'

/**
 * AddActionButton (T3.v Cabina — «Familia N» de botones de alta) — la pastilla única con la que se
 * agrega CUALQUIER cosa en el editor de nutrición V2: franja, porciones, día, plantilla, versión,
 * comida libre y alimento.
 *
 * Por qué existe: hoy cada superficie del editor inventa su propio botón de alta (texto pelado acá,
 * ícono lucide allá, un `+` suelto más abajo) y el coach tiene que releer cada uno. La Familia N los
 * unifica en una sola forma — [ícono 24px] + [«+» en el acento] + [label] — así el ojo aprende
 * «esto agrega algo» una vez y después lo reconoce por silueta, sin leer.
 *
 * Esta tanda SOLO crea la fundación; el swap de las superficies (EditableSlotCard, PublishBar,
 * ribbon, rail de días) va en la tanda siguiente. Nada de esto está cableado todavía.
 *
 * Presentacional puro: sin estado, sin efectos, sin datos. Los colores salen de tokens del DS,
 * salvo el color de marca (white-label) que ENTRA por prop `brandColor` — el componente no lee
 * branding por su cuenta para no atarse al provider de cada superficie.
 *
 * Contraste dinámico (requisito del owner): en `primary` el fondo es el color de marca del coach y
 * ese color es libre — puede ser amarillo. La tinta del texto y del «+» se decide con
 * `getContrastInfo` (WCAG, la misma matemática que ya usa `generateBrandPalette`), no a ojo. Cero
 * `text-shadow` y cero contornos: si el contraste no alcanza se arregla eligiendo la tinta, no
 * tapando el problema con efectos.
 */

/* ------------------------------------------------------------------------------------------------
 * Íconos de acción
 * ---------------------------------------------------------------------------------------------- */

/**
 * Los seis íconos ilustrados de la familia viven en `apps/web/public/action-icons/{name}.webp`.
 * El tipo es cerrado a propósito: un nombre inválido tiene que romper en `tsc`, no quedar como un
 * 404 silencioso en producción.
 */
export const ADD_ACTION_ICONS = [
  'franja',
  'porciones',
  'dia',
  'plantilla',
  'version',
  'libre',
] as const

export type AddActionIcon = (typeof ADD_ACTION_ICONS)[number]

export function addActionIconSrc(icon: AddActionIcon): string {
  return `/action-icons/${icon}.webp`
}

/* ------------------------------------------------------------------------------------------------
 * Tinta con contraste real
 * ---------------------------------------------------------------------------------------------- */

export type AddActionVariant = 'neutral' | 'primary' | 'dashed'

/** Token primary de EVA. Es el fallback cuando la superficie no pasa `brandColor`. */
export const ADD_ACTION_DEFAULT_BRAND = '#2563EB'

/**
 * Tinta oscura de la familia. NO es negro puro: sobre un amarillo o un lima saturado el `#000`
 * se ve duro y sucio, mientras que este gris-azulado (el mismo tono de la rampa ink del DS)
 * conserva el contraste AAA y se lee como tipografía, no como un agujero.
 */
export const ADD_ACTION_DARK_INK = '#101418'

const ADD_ACTION_LIGHT_INK = '#ffffff'

/** Tinta de las variantes sin fondo de marca: token del DS, no hex (dark mode incluido). */
const ADD_ACTION_TOKEN_INK = 'var(--color-text-strong)'

const HEX6 = /^[0-9a-f]{6}$/i
const HEX3 = /^[0-9a-f]{3}$/i

/**
 * `branding.primaryColor` viene de la base y lo escribe un humano: puede llegar sin `#`, en forma
 * corta (`#0af`) o directamente basura. `getContrastInfo` asume 6 dígitos, así que normalizamos
 * antes y ante cualquier duda caemos al primary de EVA — jamás a `NaN`, que devolvería luminancia
 * inválida y tinta al azar.
 */
function normalizeBrandHex(hex: string | null | undefined): string {
  const clean = (hex ?? '').trim().replace(/^#/, '')
  if (HEX6.test(clean)) return `#${clean.toLowerCase()}`
  if (HEX3.test(clean)) {
    const [r, g, b] = clean.toLowerCase().split('')
    return `#${r}${r}${g}${g}${b}${b}`
  }
  return ADD_ACTION_DEFAULT_BRAND
}

export type AddActionInk = {
  /** Color del label. */
  text: string
  /** Color del «+». */
  plus: string
}

/**
 * Helper puro con la regla de tinta de la familia (exportado para que el test y las superficies
 * puedan verificarlo sin montar el componente):
 *
 * - `primary`: el fondo ES el color de marca ⇒ texto y «+» comparten la tinta que gana en contraste
 *   contra ese fondo (`getContrastInfo`). El «+» no puede ir en el acento acá: el acento y el fondo
 *   serían el mismo color y el «+» desaparecería.
 * - `neutral` / `dashed`: el fondo es una superficie del DS ⇒ el texto usa el token de tinta fuerte
 *   (que ya flipea solo en dark mode) y el «+» va en el acento de marca, que es justamente el punto
 *   de color que hace reconocible a la familia.
 */
export function addActionInk(
  brandHex?: string | null,
  variant: AddActionVariant = 'primary',
): AddActionInk {
  const brand = normalizeBrandHex(brandHex)
  if (variant !== 'primary') return { text: ADD_ACTION_TOKEN_INK, plus: brand }
  const ink =
    getContrastInfo(brand).textColor === '#000000' ? ADD_ACTION_DARK_INK : ADD_ACTION_LIGHT_INK
  return { text: ink, plus: ink }
}

/* ------------------------------------------------------------------------------------------------
 * Estilos
 * ---------------------------------------------------------------------------------------------- */

/**
 * Alto: 34 px en puntero fino (el editor en desktop es denso y una fila de altas de 44 px lo
 * infla), 44 px en puntero grueso — el mínimo táctil no es negociable. `[@media(pointer:coarse)]`
 * es el idiom del editor (ver EditorRibbon/EditorDayRail), no una invención de este archivo.
 */
const BASE_CLASSES =
  'group inline-flex min-h-[34px] shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap rounded-pill px-3 text-[13px] font-semibold ' +
  'transition-[background-color,border-color,filter,box-shadow] duration-150 ' +
  // Anillo SIN offset: es el mismo focus que ya usan los botones del editor (EditorRibbon,
  // MacroSparkPopover). Un `ring-offset-2` pelado tomaría el color de offset por defecto (blanco)
  // y en dark mode dibujaría un halo claro alrededor del botón.
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ' +
  'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:filter-none ' +
  '[@media(pointer:coarse)]:min-h-11'

const VARIANT_CLASSES: Record<AddActionVariant, string> = {
  // Idioma del DS: la misma card + borde sutil que usan las pastillas del editor.
  neutral: 'border border-border-subtle bg-surface-card hover:bg-surface-sunken',
  // Fondo de marca ⇒ SIN borde (el color ya separa del fondo). El hover no cambia de color porque
  // el color es del coach: se oscurece un punto con `brightness`, que funciona igual sobre un
  // amarillo que sobre un azul marino.
  primary: 'border-0 shadow-sm hover:brightness-95 active:brightness-90',
  // Igual que neutral pero punteado (affordance de «hueco por llenar»: agregar día, comida libre).
  // El borde sube a `border-default` porque un dashed sobre `border-subtle` se pierde: la línea
  // discontinua tiene la mitad de tinta que una sólida del mismo color.
  dashed: 'border border-dashed border-border-default bg-surface-card hover:bg-surface-sunken',
}

/**
 * Tilt del ícono en hover (mockup: rotate -8deg + scale 1.14 en .18s).
 *
 * Va con `motion-safe:` y no con un `motion-reduce:` que después lo cancele: así, con «Reducir
 * movimiento» activo, la regla ni siquiera se genera y no hay pelea de cascada entre dos utilidades
 * de la misma especificidad (que Tailwind resuelve por orden de generación, no por el orden en el
 * `className`). Sin movimiento el botón sigue dando feedback por color.
 */
const ICON_TILT_CLASSES =
  'motion-safe:transition-transform motion-safe:duration-[180ms] motion-safe:ease-out ' +
  'motion-safe:group-hover:-rotate-[8deg] motion-safe:group-hover:scale-[1.14]'

/**
 * Abanico del `stack` en hover: las tres monedas se abren como cartas. Los ángulos van
 * PRECOMPUTADOS por índice y como strings literales porque el scanner de Tailwind lee el archivo
 * como texto — una clase armada con template string no existiría en el CSS final.
 */
const STACK_FAN_CLASSES = [
  'motion-safe:group-hover:-translate-x-[3px] motion-safe:group-hover:-rotate-[10deg]',
  'motion-safe:group-hover:-translate-y-[2px] motion-safe:group-hover:scale-[1.06]',
  'motion-safe:group-hover:translate-x-[3px] motion-safe:group-hover:rotate-[10deg]',
] as const

const STACK_ITEM_CLASSES =
  'relative inline-flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-full ' +
  'motion-safe:transition-transform motion-safe:duration-[180ms] motion-safe:ease-out'

/** Máximo de monedas del stack: con cuatro ya no se lee «unos alimentos», se lee ruido. */
const STACK_MAX = 3

/* ------------------------------------------------------------------------------------------------
 * Componente
 * ---------------------------------------------------------------------------------------------- */

type AddActionButtonBaseProps = Omit<
  React.ComponentPropsWithoutRef<'button'>,
  'children' | 'style' | 'type'
> & {
  /** Texto del botón (ej. «Agregar franja»). Es el nombre accesible. */
  label: string
  variant?: AddActionVariant
  /**
   * Color de marca del coach en hex (`branding.primaryColor`). Pinta el fondo en `primary` y el
   * «+» en `neutral`/`dashed`. Sin prop se usa el primary de EVA.
   */
  brandColor?: string | null
}

/**
 * `icon` y `stack` son MUTUAMENTE EXCLUYENTES por tipo, no por un `if` en runtime: pasar los dos
 * tiene que ser un error de compilación.
 */
export type AddActionButtonProps = AddActionButtonBaseProps &
  (
    | { icon: AddActionIcon; stack?: never }
    /** 2-3 URLs de íconos de categoría, solapadas (para «Agregar alimento»). */
    | { stack: readonly string[]; icon?: never }
  )

export function AddActionButton({
  label,
  variant = 'neutral',
  brandColor,
  icon,
  stack,
  className,
  ...buttonProps
}: AddActionButtonProps) {
  const brand = normalizeBrandHex(brandColor)
  const ink = addActionInk(brandColor, variant)
  const isPrimary = variant === 'primary'

  // El halo de las monedas del stack es el PROPIO fondo del botón: así el disco opaco + el anillo
  // de 2 px separan una moneda de la otra sin inventar un color nuevo que después no combine.
  const surface = isPrimary ? brand : 'var(--color-surface-card)'

  return (
    <button
      {...buttonProps}
      type="button"
      data-variant={variant}
      className={cn(BASE_CLASSES, VARIANT_CLASSES[variant], className)}
      style={{
        color: ink.text,
        ...(isPrimary ? { backgroundColor: brand } : null),
      }}
    >
      {icon ? (
        <Image
          alt=""
          aria-hidden="true"
          src={addActionIconSrc(icon)}
          // width/height explícitos = el hueco de 24 px queda reservado antes de que cargue el
          // webp: cero layout shift en una fila de botones (mismo criterio que FoodThumb).
          width={24}
          height={24}
          // `unoptimized`: es un asset estático del build, no hay nada que transformar — y las
          // Image Transformations de Supabase/Vercel son cuota (ver incidente de cuota).
          unoptimized
          className={cn('size-6 shrink-0 object-contain', ICON_TILT_CLASSES)}
        />
      ) : null}

      {stack ? (
        <span aria-hidden="true" className="inline-flex shrink-0 items-center">
          {stack.slice(0, STACK_MAX).map((src, index) => (
            <span
              key={`${src}-${index}`}
              className={cn(
                STACK_ITEM_CLASSES,
                index > 0 && '-ml-[7px]',
                STACK_FAN_CLASSES[index],
              )}
              style={{
                backgroundColor: surface,
                boxShadow: `0 0 0 2px ${surface}`,
                // La primera moneda arriba: el abanico se lee de izquierda a derecha.
                zIndex: STACK_MAX - index,
              }}
            >
              <Image
                alt=""
                aria-hidden="true"
                src={src}
                width={24}
                height={24}
                unoptimized
                className="size-6 object-contain"
              />
            </span>
          ))}
        </span>
      ) : null}

      <span className="inline-flex items-baseline gap-1">
        {/* El «+» es decorativo: el nombre accesible del botón ya es el label («Agregar franja»),
            así que un lector de pantalla que además dijera «más» leería la acción dos veces. */}
        <span aria-hidden="true" className="text-[15px] font-bold leading-none" style={{ color: ink.plus }}>
          +
        </span>
        <span className="leading-none">{label}</span>
      </span>
    </button>
  )
}
