'use client'

import Image from 'next/image'
import { BadgeCheck, ShieldCheck, Utensils } from 'lucide-react'
import type { FoodCatalogItem } from '@eva/nutrition-v2'

// Resultado de busqueda del catalogo como CARD (no fila plana): thumbnail, marca
// prominente, envase, badge de fuente/verificacion y macros por 100. Reemplaza la
// lista de "Arroz" indistinguibles por tarjetas legibles. Solo presentacion.

function mediaUrl(item: FoodCatalogItem): string | null {
  const media = item.media
  if (!media) return null
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '')
  if (!base) return null
  const path = media.objectPath.split('/').map(encodeURIComponent).join('/')
  return `${base}/storage/v1/object/public/${encodeURIComponent(media.bucket)}/${path}?v=${media.version}`
}

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

export function FoodResultCard({ item, onPick }: { item: FoodCatalogItem; onPick: () => void }) {
  const src = mediaUrl(item)
  const badge = foodBadge(item)
  const pkg = packageLabel(item)
  const unitPer100 = item.servingUnit === 'ml' ? 'ml' : 'g'

  return (
    <button
      type="button"
      onClick={onPick}
      className="flex w-full items-stretch gap-3 rounded-control border border-border-subtle bg-surface-card p-3 text-left transition hover:border-ember-400"
    >
      <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-control border border-border-subtle bg-surface-sunken">
        {src ? (
          <Image
            alt={item.name}
            src={src}
            width={48}
            height={48}
            loading="lazy"
            className="h-12 w-12 object-cover"
            unoptimized
          />
        ) : (
          <span aria-hidden="true" className="flex h-full w-full items-center justify-center text-subtle">
            <Utensils className="h-5 w-5" />
          </span>
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="min-w-0 truncate text-sm font-semibold text-strong">{item.name}</span>
          <span
            className={
              'inline-flex shrink-0 items-center gap-1 rounded-pill border px-2 py-0.5 text-[11px] font-semibold ' +
              badge.className
            }
          >
            <BadgeIcon status={item.verificationStatus} />
            {badge.label}
          </span>
        </span>
        {item.brand ? <span className="mt-0.5 block truncate text-xs font-medium text-body">{item.brand}</span> : null}
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
          {pkg ? <span>{pkg}</span> : null}
          {item.category ? <span className="truncate">{item.category}</span> : null}
        </span>
        <span className="mt-1 block font-mono text-[11px] tabular-nums text-subtle">
          {Math.round(item.calories)} kcal - P {Math.round(item.proteinG)} - C {Math.round(item.carbsG)} - G{' '}
          {Math.round(item.fatsG)} <span className="text-muted">/ 100 {unitPer100}</span>
        </span>
      </span>
    </button>
  )
}
