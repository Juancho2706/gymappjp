'use client'

/**
 * Circulito de identidad del grupo de intercambio (patrón V1 probado en light/dark):
 * código sobre el color del catálogo (`exchangeGroupColor`), letra blanca. Regla
 * white-label del SPEC: el color del grupo se usa SOLO aquí como identidad — jamás
 * colorea texto sobre superficie ni estados activos (eso es del `primary` del coach).
 */

import { exchangeGroupColor, type ExchangeGroup } from '@eva/nutrition-engine'

export function PortionsGroupDot({
  group,
  size = 'sm',
}: {
  group: Pick<ExchangeGroup, 'code' | 'color' | 'sortOrder'>
  /** sm = 20 px (filas de franja, wireframe UX-a); md = 28 px (opciones del picker). */
  size?: 'sm' | 'md'
}) {
  return (
    <span
      aria-hidden="true"
      className={
        'flex shrink-0 items-center justify-center rounded-full font-black leading-none text-white ' +
        (size === 'md' ? 'h-7 w-7 ' : 'h-5 w-5 ') +
        (group.code.length > 2 ? 'text-[7px]' : size === 'md' ? 'text-[10px]' : 'text-[8px]')
      }
      style={{ backgroundColor: exchangeGroupColor(group) }}
    >
      {group.code}
    </span>
  )
}
