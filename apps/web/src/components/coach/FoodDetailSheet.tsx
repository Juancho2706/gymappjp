'use client'

import { Barcode, ExternalLink, Loader2 } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import {
  formatBarcode,
  getFoodSourceAttribution,
  getFoodVerificationLabel,
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

function MacroTile({ label, value, unit, className }: { label: string; value: string; unit: string; className?: string }) {
  return (
    <div className="rounded-control border border-subtle bg-surface-sunken px-3 py-2.5">
      <p className="text-[10px] font-black uppercase tracking-widest text-muted">{label}</p>
      <p className={cn('eva-mono mt-0.5 text-base font-bold tabular-nums text-strong', className)}>
        {value}
        <span className="ml-0.5 text-[11px] font-semibold text-subtle">{unit}</span>
      </p>
    </div>
  )
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
  const attribution = detail ? getFoodSourceAttribution(detail.source) : null
  const verification = detail ? getFoodVerificationLabel(detail.verificationStatus) : null
  const basis = detail ? unitBasis(detail) : '100 g'

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
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <MacroTile label="Kcal" value={fmt(detail.calories, 0)} unit="" className="text-strong" />
                  <MacroTile label="Proteína" value={fmt(detail.proteinG)} unit="g" className="text-[var(--ember-600)]" />
                  <MacroTile label="Carbos" value={fmt(detail.carbsG)} unit="g" className="text-[var(--sport-600)]" />
                  <MacroTile label="Grasas" value={fmt(detail.fatsG)} unit="g" className="text-[var(--aqua-600)]" />
                </div>
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
    </Sheet>
  )
}
