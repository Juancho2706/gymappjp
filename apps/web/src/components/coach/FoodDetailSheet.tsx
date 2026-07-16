'use client'

import { useEffect, useState } from 'react'
import { Barcode, ExternalLink, Loader2, Maximize2 } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { ImageLightbox } from '@/components/ImageLightbox'
import { MacroChipRow } from '@/components/nutrition-v2'
import { cn } from '@/lib/utils'
import {
  formatBarcode,
  getFoodSourceAttribution,
  getFoodVerificationLabel,
  resolveFoodDetailImage,
  type FoodDetailData,
  type FoodVerificationTone,
} from '@/lib/food-detail'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  detail: FoodDetailData | null
  loading?: boolean
}

const VERIFICATION_TONE_CLASSES: Record<FoodVerificationTone, string> = {
  verified:
    'border-emerald-300/60 bg-emerald-50 text-emerald-800 dark:border-emerald-700/50 dark:bg-emerald-950/30 dark:text-emerald-300',
  community:
    'border-sky-300/60 bg-sky-50 text-sky-800 dark:border-sky-700/50 dark:bg-sky-950/30 dark:text-sky-300',
  neutral: 'border-default bg-surface-sunken text-muted',
  danger:
    'border-rose-300/60 bg-rose-50 text-rose-800 dark:border-rose-700/50 dark:bg-rose-950/30 dark:text-rose-300',
}

function unitBasis(detail: FoodDetailData): string {
  return detail.isLiquid || detail.servingUnit === 'ml' ? '100 ml' : '100 g'
}

function fmt(value: number, digits = 1): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(digits)
}

function MicroRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-[13px] text-muted">{label}</span>
      <span className="eva-mono text-[13px] font-semibold tabular-nums text-body">{value}</span>
    </div>
  )
}

export function FoodDetailSheet({ open, onOpenChange, detail, loading = false }: Props) {
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [headerFailed, setHeaderFailed] = useState(false)

  // Al cambiar de alimento, reinicia el estado de la foto del header.
  useEffect(() => {
    setHeaderFailed(false)
  }, [detail?.id])

  const attribution = detail ? getFoodSourceAttribution(detail.source) : null
  const verification = detail ? getFoodVerificationLabel(detail.verificationStatus) : null
  const basis = detail ? unitBasis(detail) : '100 g'
  const image = detail ? resolveFoodDetailImage(detail) : null
  const showPhoto = !!image?.hasPhoto && !headerFailed
  // Credito de la foto: OFF solo cuando la procedencia lo respalda.
  const photoIsOff = !!detail && (detail.source === 'open_food_facts' || !!image?.sourceUrl)

  const micros = detail
    ? ([
        detail.fiberG != null ? { label: 'Fibra', value: fmt(detail.fiberG) + ' g' } : null,
        detail.sugarG != null ? { label: 'Azúcares', value: fmt(detail.sugarG) + ' g' } : null,
        detail.saturatedFatG != null ? { label: 'Grasa saturada', value: fmt(detail.saturatedFatG) + ' g' } : null,
        detail.sodiumMg != null ? { label: 'Sodio', value: fmt(detail.sodiumMg, 0) + ' mg' } : null,
      ].filter(Boolean) as { label: string; value: string }[])
    : []

  const household =
    detail && detail.householdLabel && detail.householdGrams
      ? '1 ' + detail.householdLabel + ' ≈ ' + fmt(detail.householdGrams, 0) + ' g'
      : detail?.householdLabel ?? null

  const pkg =
    detail && detail.packageQuantity && detail.packageUnit
      ? fmt(detail.packageQuantity, 0) + ' ' + detail.packageUnit
      : null

  const lightboxFooter =
    detail && image ? (
      <span>
        {photoIsOff ? 'Foto: Open Food Facts (CC-BY-SA)' : 'Foto del producto'}
        {image.sourceUrl ? (
          <>
            {' · '}
            <a
              href={image.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-white underline underline-offset-2 hover:text-white"
            >
              Ver original
            </a>
          </>
        ) : null}
      </span>
    ) : null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton
        className="max-h-[min(90dvh,720px)] rounded-t-sheet border-subtle bg-surface-card text-body shadow-lg"
      >
        <SheetHeader className="border-0 bg-surface-card px-6 pt-2">
          <SheetTitle className="font-display text-[19px] font-extrabold normal-case leading-snug tracking-[-0.01em] text-strong">
            {detail?.name ?? (loading ? 'Cargando…' : 'Alimento')}
          </SheetTitle>
          <SheetDescription className="text-[12.5px] text-muted">
            {detail
              ? [detail.brand, detail.category].filter(Boolean).join(' · ') || 'Ficha del alimento'
              : 'Ficha del alimento'}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 pb-6">
          {loading && !detail ? (
            <div className="flex items-center justify-center gap-2 py-12 text-muted">
              <Loader2 className="size-4 animate-spin" />
              <span className="text-sm">Cargando ficha…</span>
            </div>
          ) : !detail ? (
            <p className="py-12 text-center text-sm text-muted">
              No se pudo cargar la ficha del alimento.
            </p>
          ) : (
            <>
              {/* Header visual: foto de producto (ampliable) o icono de categoria. */}
              {image ? (
                showPhoto ? (
                  <button
                    type="button"
                    onClick={() => setLightboxOpen(true)}
                    aria-label={'Ampliar foto de ' + detail.name}
                    className="eva-press group relative flex h-44 w-full items-center justify-center overflow-hidden rounded-card border border-subtle bg-surface-sunken sm:h-52"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- imagen de Storage: cero Image Transformations */}
                    <img
                      src={image.headerUrl ?? undefined}
                      alt={detail.name}
                      onError={() => setHeaderFailed(true)}
                      draggable={false}
                      className="max-h-full max-w-full select-none object-contain p-3"
                    />
                    <span className="absolute bottom-2 right-2 flex size-8 items-center justify-center rounded-full border border-black/10 bg-white/85 text-slate-700 shadow-sm backdrop-blur-sm transition-colors group-hover:bg-white dark:border-white/10 dark:bg-black/55 dark:text-white">
                      <Maximize2 className="size-4" aria-hidden />
                    </span>
                  </button>
                ) : (
                  <div
                    className="flex h-36 w-full items-center justify-center rounded-card border border-subtle bg-surface-sunken sm:h-40"
                    aria-hidden
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- icono estatico del build: cero Image Transformations */}
                    <img
                      src={image.iconUrl}
                      alt=""
                      width={80}
                      height={80}
                      className="size-[72px] opacity-90 sm:size-20"
                    />
                  </div>
                )
              ) : null}

              {verification && (
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      'inline-flex h-6 items-center rounded-pill border px-2.5 text-[11px] font-bold',
                      VERIFICATION_TONE_CLASSES[verification.tone],
                    )}
                  >
                    {verification.label}
                  </span>
                </div>
              )}

              <section>
                <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-muted">
                  Por {basis}
                </p>
                <MacroChipRow
                  calories={detail.calories}
                  proteinG={detail.proteinG}
                  carbsG={detail.carbsG}
                  fatsG={detail.fatsG}
                  size="md"
                />
              </section>

              {micros.length > 0 && (
                <section className="rounded-card border border-subtle bg-surface-card px-4 py-2">
                  <p className="py-1.5 text-[10px] font-black uppercase tracking-widest text-muted">
                    Detalle (por {basis})
                  </p>
                  <div className="divide-y divide-border/50">
                    {micros.map((m) => (
                      <MicroRow key={m.label} label={m.label} value={m.value} />
                    ))}
                  </div>
                </section>
              )}

              {(household || pkg) && (
                <section className="grid gap-2 sm:grid-cols-2">
                  {household && (
                    <div className="rounded-control border border-subtle bg-surface-sunken px-3 py-2.5">
                      <p className="text-[10px] font-black uppercase tracking-widest text-muted">Porción casera</p>
                      <p className="mt-0.5 text-[13px] font-semibold text-body">{household}</p>
                    </div>
                  )}
                  {pkg && (
                    <div className="rounded-control border border-subtle bg-surface-sunken px-3 py-2.5">
                      <p className="text-[10px] font-black uppercase tracking-widest text-muted">Envase</p>
                      <p className="mt-0.5 text-[13px] font-semibold text-body">{pkg}</p>
                    </div>
                  )}
                </section>
              )}

              {detail.barcode && (
                <section className="flex items-center gap-2.5 rounded-control border border-subtle bg-surface-sunken px-3.5 py-2.5">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-surface-card text-muted">
                    <Barcode className="size-4" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted">Código de barras</p>
                    <p className="eva-mono truncate text-[13px] font-semibold tabular-nums text-body">
                      {formatBarcode(detail.barcode)}
                    </p>
                  </div>
                </section>
              )}

              {attribution && (
                <section className="rounded-card border border-subtle bg-surface-sunken/60 px-4 py-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted">Fuente</p>
                  <p className="mt-1 text-[13px] font-semibold text-body">{attribution.label}</p>
                  {attribution.href ? (
                    <a
                      href={attribution.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1.5 inline-flex items-center gap-1 text-[12px] font-semibold text-[var(--theme-primary)] hover:underline"
                    >
                      {attribution.attributionLine}
                      <ExternalLink className="size-3" aria-hidden />
                    </a>
                  ) : (
                    <p className="mt-1 text-[11.5px] text-subtle">{attribution.attributionLine}</p>
                  )}
                </section>
              )}
            </>
          )}
        </div>
      </SheetContent>

      <ImageLightbox
        open={lightboxOpen}
        onOpenChange={setLightboxOpen}
        src={image?.lightboxUrl ?? null}
        fallbackSrc={image?.fallbackUrl ?? null}
        alt={detail?.name ?? ''}
        title={detail?.name ? 'Foto de ' + detail.name : 'Foto del alimento'}
        footer={lightboxFooter}
      />
    </Sheet>
  )
}
