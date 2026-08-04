'use client'

import { BadgeCheck, ShieldCheck } from 'lucide-react'
import type { FoodCatalogItem } from '@eva/nutrition-v2'
import { MacroChipRow } from '@/components/nutrition-v2'
import { foodCardImage } from './food-card-presentation'
import { FoodCoverImage } from './FoodImage'

// Resultado de busqueda del catalogo. DOS densidades con el mismo markup:
//
// - Movil (<sm) y desktop (md+): FILA compacta — thumbnail cuadrado a la izquierda y, al
//   lado, nombre (2 lineas), marca, envase/categoria y macros por 100. Es lo que el coach
//   necesita para escanear 20 resultados sin scrollear (queja del CEO 08-04: en desktop la
//   grilla pintaba imagenes de ~300 px y cortaba los nombres a "18 HUE...").
// - Banda intermedia (sm..md, tablets angostas): card VERTICAL con la foto arriba, que es
//   donde una grilla de 2 columnas justifica el formato grande.
//
// Solo presentacion (tokens del DS, cero hex).

const SUPABASE_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL ?? null

interface FoodBadge {
  label: string
  className: string
}

function foodBadge(item: FoodCatalogItem): FoodBadge {
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
  if (item.countryCode) {
    return {
      label: 'Catalogo ' + item.countryCode.toUpperCase(),
      className: 'border-border-subtle bg-surface-sunken text-muted',
    }
  }
  return { label: 'Catalogo', className: 'border-border-subtle bg-surface-sunken text-muted' }
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
  /** Oculta la capsula de verificacion/catalogo para dar todo el ancho al nombre (sheet movil). */
  showBadge?: boolean
}) {
  const image = foodCardImage(item, SUPABASE_BASE)
  const badge = foodBadge(item)
  const pkg = packageLabel(item)
  const unitPer100 = item.servingUnit === 'ml' ? 'ml' : 'g'
  const meta = [pkg, item.category].filter(Boolean).join(' · ')

  return (
    <button
      type="button"
      onClick={onPick}
      aria-label={`Agregar ${item.name}${item.brand ? ` (${item.brand})` : ''}`}
      className="group flex h-full w-full flex-row items-center gap-3 overflow-hidden rounded-card border border-border-subtle bg-surface-card p-2 text-left transition hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-col sm:items-stretch sm:gap-0 sm:p-0 md:flex-row md:items-center md:gap-3 md:p-2"
    >
      <span className="w-14 shrink-0 overflow-hidden rounded-control sm:w-full sm:rounded-none md:w-16 md:rounded-control">
        <FoodCoverImage imageUrl={image.imageUrl} iconUrl={image.iconUrl} alt={item.name} />
      </span>

      <span className="flex min-w-0 flex-1 flex-col gap-1.5 p-0 sm:p-3 md:gap-1 md:p-0">
        <span className="flex items-start justify-between gap-2">
          <span className="line-clamp-2 min-w-0 text-sm font-semibold leading-snug text-strong">{item.name}</span>
          {showBadge ? (
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

        {/* En fila compacta (md+) el divisor sobra: cada resultado ya es su propia tarjeta. */}
        <span className="mt-auto block border-t border-border-subtle pt-2 md:mt-0 md:border-t-0 md:pt-0">
          <MacroChipRow
            calories={item.calories}
            proteinG={item.proteinG}
            carbsG={item.carbsG}
            fatsG={item.fatsG}
            per={`/ 100 ${unitPer100}`}
            size="sm"
          />
        </span>
      </span>
    </button>
  )
}
