'use client'

import { useState } from 'react'
import { BadgeCheck, ShieldCheck } from 'lucide-react'
import type { FoodCatalogItem } from '@eva/nutrition-v2'
import { MacroChipRow } from '@/components/nutrition-v2'
import { ImageLightbox } from '@/components/ImageLightbox'
import { foodCardImage } from './food-card-presentation'
import { FoodCoverImage } from './FoodImage'

// Resultado de busqueda del catalogo: SIEMPRE una fila horizontal delgada (QA CEO 08-04) —
// thumbnail cuadrado a la izquierda (clickeable: abre la foto en lightbox), nombre + marca +
// envase al centro y, en md+, las macros por 100 en la MISMA linea a la derecha (en movil
// caen debajo del nombre). Sin variante vertical: la grilla vive en una sola columna.
//
// La capsula "Catalogo XX" se elimino (ruido para el coach); solo quedan las capsulas con
// senal real: "Verificado EVA" y "Propio".
//
// Solo presentacion (tokens del DS, cero hex).

const SUPABASE_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL ?? null

interface FoodBadge {
  label: string
  className: string
}

function foodBadge(item: FoodCatalogItem): FoodBadge | null {
  if (item.verificationStatus === 'eva_verified') {
    return {
      label: 'Verificado EVA',
      className:
        'border-emerald-300/60 bg-emerald-50 text-emerald-700 dark:border-emerald-700/50 dark:bg-emerald-950/30 dark:text-emerald-300',
    }
  }
  if (item.verificationStatus === 'coach_verified' || item.source === 'coach' || item.source === 'team') {
    return {
      label: 'Propio',
      className:
        'border-sport-300/60 bg-sport-100/70 text-sport-700 dark:border-sport-600/40 dark:bg-sport-100/20 dark:text-sport-300',
    }
  }
  return null
}

function BadgeIcon({ status }: { status: FoodCatalogItem['verificationStatus'] }) {
  if (status === 'eva_verified') return <BadgeCheck aria-hidden="true" className="h-3 w-3" />
  if (status === 'coach_verified') return <ShieldCheck aria-hidden="true" className="h-3 w-3" />
  return null
}

function packageLabel(item: FoodCatalogItem): string | null {
  if (item.packageQuantity == null) return null
  const unit = item.packageUnit ?? item.servingUnit ?? 'g'
  const qty = Number.isInteger(item.packageQuantity) ? item.packageQuantity : Math.round(item.packageQuantity * 10) / 10
  return `Envase ${qty} ${unit}`
}

export function FoodResultCard({
  item,
  onPick,
  showBadge = true,
}: {
  item: FoodCatalogItem
  onPick: () => void
  /** Oculta la capsula de verificacion para dar todo el ancho al nombre (sheet movil). */
  showBadge?: boolean
}) {
  const image = foodCardImage(item, SUPABASE_BASE)
  const badge = foodBadge(item)
  const pkg = packageLabel(item)
  const unitPer100 = item.servingUnit === 'ml' ? 'ml' : 'g'
  const meta = [pkg, item.category].filter(Boolean).join(' · ')
  const [zoomOpen, setZoomOpen] = useState(false)

  return (
    <div className="group flex w-full flex-row items-center gap-3 overflow-hidden rounded-card border border-border-subtle bg-surface-card p-2 transition focus-within:border-primary/50 hover:border-primary/50">
      {/* Con foto real el thumbnail es un boton propio (zoom en lightbox); con icono de
          categoria no hay nada que ampliar y queda estatico. */}
      {image.imageUrl ? (
        <>
          <button
            type="button"
            onClick={() => setZoomOpen(true)}
            aria-label={`Ver foto de ${item.name}`}
            className="w-14 shrink-0 cursor-zoom-in overflow-hidden rounded-control transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:w-16"
          >
            <FoodCoverImage imageUrl={image.imageUrl} iconUrl={image.iconUrl} alt={item.name} />
          </button>
          <ImageLightbox
            open={zoomOpen}
            onOpenChange={setZoomOpen}
            src={image.imageUrl}
            alt={item.name}
            title={item.name}
          />
        </>
      ) : (
        <span className="w-14 shrink-0 overflow-hidden rounded-control md:w-16">
          <FoodCoverImage imageUrl={image.imageUrl} iconUrl={image.iconUrl} alt={item.name} />
        </span>
      )}

      <button
        type="button"
        onClick={onPick}
        aria-label={`Agregar ${item.name}${item.brand ? ` (${item.brand})` : ''}`}
        className="flex min-w-0 flex-1 flex-col gap-1.5 rounded-control text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:flex-row md:items-center md:gap-3"
      >
        <span className="flex min-w-0 flex-col gap-0.5 md:flex-1">
          <span className="flex items-start gap-2">
            <span className="line-clamp-2 min-w-0 text-sm font-semibold leading-snug text-strong">{item.name}</span>
            {showBadge && badge ? (
              <span
                className={
                  'inline-flex shrink-0 items-center gap-1 rounded-pill border px-1.5 py-0.5 text-[10px] font-semibold ' +
                  badge.className
                }
              >
                <BadgeIcon status={item.verificationStatus} />
                {badge.label}
              </span>
            ) : null}
          </span>

          {item.brand ? <span className="truncate text-xs font-medium text-body">{item.brand}</span> : null}
          {meta ? <span className="truncate text-[11px] text-muted">{meta}</span> : null}
        </span>

        <span className="md:shrink-0">
          <MacroChipRow
            calories={item.calories}
            proteinG={item.proteinG}
            carbsG={item.carbsG}
            fatsG={item.fatsG}
            per={`/ 100 ${unitPer100}`}
            size="sm"
          />
        </span>
      </button>
    </div>
  )
}
