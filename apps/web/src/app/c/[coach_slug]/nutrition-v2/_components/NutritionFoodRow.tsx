import Image from 'next/image'
import type { ReactNode } from 'react'
import { MacroChipRow } from '@/components/nutrition-v2'
import { foodCategoryIconUrl, foodCategoryIconUrlFromName } from '@/lib/food-image'

/**
 * Fila de alimento del alumno (nutrición V2) con MINIATURA + MacroChipRow, al mismo
 * nivel visual que las cards del coach. Fuente única de las filas de "Tu plan de
 * hoy", "Consumido hoy" (tab Hoy) y del tab "Plan".
 *
 * Miniatura: foto real del producto (`imageUrl`, cuando el read model traiga `media`)
 * con respaldo GARANTIZADO al icono estático de categoría. Como los read models del
 * alumno hoy solo traen el `name` (sin `media`/`category`), el respaldo se deriva del
 * nombre (`foodCategoryIconUrlFromName`) — el mismo camino sancionado que usa el
 * builder del coach para los items dentro de una franja. Una fila NUNCA queda sin
 * imagen y NO consume Image Transformations (iconos estáticos del build).
 *
 * Solo presentación: sin estado, sin hooks, sin Supabase → válida tanto en Server
 * Components (tab Plan) como dentro de client components (tab Hoy).
 *
 * Pendiente (requiere SQL): enriquecer `NutritionIntakeReadItem` /
 * `NutritionPrescriptionItemRead` con `media` + `category` (o un RPC batch por ids)
 * para pintar la foto real del producto en vez del icono de categoría.
 */
export interface NutritionFoodRowProps {
  name: string
  /** Marca u origen; se muestra tras la cantidad. */
  detail?: string | null
  quantityLabel: string
  calories?: number | null
  proteinG?: number | null
  carbsG?: number | null
  fatsG?: number | null
  /** Sufijo de contexto de los macros (ej. "por 100 g"). */
  perLabel?: string | null
  /** Foto real del producto (cuando el read model traiga media); null → icono de categoría. */
  imageUrl?: string | null
  /** Categoría del catálogo si el read model la trae; si no, se deriva del nombre. */
  category?: string | null
  /** Nota corta bajo los macros (guía del plan: indicaciones del item). */
  note?: string | null
  /** Etiqueta de estado (ej. "Corregido"). */
  statusLabel?: string | null
  /** Nodo al final de la fila (acciones o badge). */
  actions?: ReactNode
}

function FoodListThumb({
  imageUrl,
  iconUrl,
  alt,
}: {
  imageUrl: string | null
  iconUrl: string
  alt: string
}) {
  return (
    <span className="relative grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-control border border-border-subtle bg-surface-sunken">
      {imageUrl ? (
        <Image
          alt={alt}
          src={imageUrl}
          width={44}
          height={44}
          unoptimized
          loading="lazy"
          className="h-11 w-11 object-cover"
        />
      ) : (
        <span className="absolute inset-0 grid place-items-center bg-primary/10">
          <Image
            alt=""
            aria-hidden="true"
            src={iconUrl}
            width={24}
            height={24}
            unoptimized
            loading="lazy"
            className="h-6 w-6 object-contain"
          />
        </span>
      )}
    </span>
  )
}

export function NutritionFoodRow({
  name,
  detail,
  quantityLabel,
  calories,
  proteinG,
  carbsG,
  fatsG,
  perLabel,
  imageUrl = null,
  category,
  note,
  statusLabel,
  actions,
}: NutritionFoodRowProps) {
  const iconUrl = category ? foodCategoryIconUrl(category) : foodCategoryIconUrlFromName(name)
  return (
    <div className="flex min-w-0 items-center gap-3 py-3">
      <FoodListThumb imageUrl={imageUrl} iconUrl={iconUrl} alt={name} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-semibold text-strong">{name}</p>
          {statusLabel ? (
            <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">{statusLabel}</span>
          ) : null}
        </div>
        <p className="mt-0.5 truncate text-xs text-muted">
          {quantityLabel}
          {detail ? ` · ${detail}` : ''}
        </p>
        <span className="mt-1 block">
          <MacroChipRow
            calories={calories}
            proteinG={proteinG}
            carbsG={carbsG}
            fatsG={fatsG}
            per={perLabel ?? null}
            size="sm"
          />
        </span>
        {note ? <p className="mt-1 text-[11px] leading-4 text-subtle">{note}</p> : null}
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </div>
  )
}
