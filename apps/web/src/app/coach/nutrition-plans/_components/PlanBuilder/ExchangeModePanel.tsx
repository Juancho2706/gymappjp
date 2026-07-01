'use client'

import { useState, useTransition } from 'react'
import { FileDown, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { InfoTooltip } from '@/components/ui/info-tooltip'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import type { DayVariant, ExchangeGroup, ExchangeMacroTotals, PdfBrand } from '@/domain/nutrition/exchange.types'

interface Props {
  /** Modo actual del plan (controlado por PlanBuilder). */
  active: boolean
  /** false ⇒ plan sin id (guardar primero). */
  canToggle: boolean
  togglePending: boolean
  onToggleMode: (next: boolean) => void
  groups: ExchangeGroup[]
  variants: DayVariant[]
  totalsByVariant: { variantId: string | null; name: string | null; totals: ExchangeMacroTotals }[]
  goals: { calories: number; protein: number; carbs: number; fats: number }
  provisional: boolean
  variantPending: boolean
  onCreateVariant: (name: string) => void
  onDeleteVariant: (variantId: string) => void
  brand: PdfBrand
  pdfPending: boolean
  onDownloadPdf: (format: 'compact' | 'equivalences') => void
}

const VARIANT_PRESETS = ['Descanso', 'Entreno AM', 'Entreno PM']

/**
 * Panel del modo intercambios en el builder: toggle Gramos ↔ Porciones, totales
 * derivados vs objetivo (por variante), gestor de variantes de día y descarga del
 * PDF branded (marca resuelta server-side; preview del nombre del tenant).
 */
export function ExchangeModePanel({
  active,
  canToggle,
  togglePending,
  onToggleMode,
  variants,
  totalsByVariant,
  goals,
  provisional,
  variantPending,
  onCreateVariant,
  onDeleteVariant,
  brand,
  pdfPending,
  onDownloadPdf,
}: Props) {
  const { t } = useTranslation()
  const [pdfFormat, setPdfFormat] = useState<'compact' | 'equivalences'>('compact')
  const [newVariant, setNewVariant] = useState('')
  const [, startTransition] = useTransition()

  return (
    <section className="rounded-2xl border border-subtle bg-surface-card p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-black tracking-tight text-strong">
            {t('nutrition.exchange.modeTitle')}
          </h3>
          <InfoTooltip content={t('nutrition.exchange.modeTooltip')} />
        </div>
        <label className="flex min-h-11 cursor-pointer items-center gap-2">
          <span className={cn('text-xs font-bold', !active ? 'text-strong' : 'text-muted')}>
            {t('nutrition.exchange.modeGrams')}
          </span>
          <Switch
            checked={active}
            disabled={!canToggle || togglePending}
            onCheckedChange={(checked) => {
              if (!canToggle) {
                toast.error(t('nutrition.exchange.savePlanFirst'))
                return
              }
              startTransition(() => onToggleMode(checked))
            }}
            aria-label={t('nutrition.exchange.modeTitle')}
          />
          <span className={cn('text-xs font-bold', active ? 'text-strong' : 'text-muted')}>
            {t('nutrition.exchange.modePortions')}
          </span>
        </label>
      </div>

      {!canToggle && (
        <p className="text-[11px] leading-snug text-muted">
          {t('nutrition.exchange.savePlanFirst')}
        </p>
      )}

      {active && (
        <>
          {provisional && (
            <p className="rounded-xl border border-[var(--warning-500)]/30 bg-[var(--warning-100)] px-3 py-2 text-[11px] leading-snug text-[var(--warning-700)]">
              {t('nutrition.exchange.provisionalNotice')}
            </p>
          )}

          <div className="space-y-1.5">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted">
              {t('nutrition.exchange.derivedVsGoal')}
            </p>
            {totalsByVariant.map((row) => {
              const d = row.totals
              return (
                <div
                  key={row.variantId ?? '__all__'}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface-sunken/30 px-3 py-2"
                >
                  <span className="text-xs font-bold text-strong">
                    {row.name ?? t('nutrition.exchange.wholeDay')}
                  </span>
                  <span className="text-[11px] font-bold tabular-nums text-muted">
                    {Math.round(d.calories)}/{goals.calories} kcal · P {d.proteinG}/{goals.protein} · C{' '}
                    {d.carbsG}/{goals.carbs} · G {d.fatsG}/{goals.fats}
                  </span>
                </div>
              )
            })}
          </div>

          <div className="space-y-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted">
              {t('nutrition.exchange.dayVariants')}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {variants.map((v) => (
                <span
                  key={v.id}
                  className="inline-flex items-center gap-1 rounded-lg border border-subtle bg-surface-app px-2 py-1 text-[11px] font-bold text-strong"
                >
                  {v.name}
                  <button
                    type="button"
                    disabled={variantPending}
                    onClick={() => onDeleteVariant(v.id)}
                    aria-label={`${t('nutrition.exchange.deleteVariant')} ${v.name}`}
                    className="flex h-6 w-6 items-center justify-center rounded-md text-muted hover:bg-surface-sunken hover:text-[var(--danger-600)] touch-manipulation"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </span>
              ))}
              {VARIANT_PRESETS.filter(
                (p) => !variants.some((v) => v.name.toLowerCase() === p.toLowerCase())
              ).map((preset) => (
                <button
                  key={preset}
                  type="button"
                  disabled={variantPending || !canToggle}
                  onClick={() => onCreateVariant(preset)}
                  className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-dashed border-subtle px-2 py-1 text-[11px] font-bold text-muted transition-colors hover:bg-surface-sunken touch-manipulation"
                >
                  <Plus className="h-3 w-3" />
                  {preset}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={newVariant}
                onChange={(e) => setNewVariant(e.target.value)}
                placeholder={t('nutrition.exchange.variantPlaceholder')}
                maxLength={40}
                className="h-11 flex-1"
              />
              <Button
                type="button"
                variant="outline"
                disabled={variantPending || !newVariant.trim() || !canToggle}
                className="h-11"
                onClick={() => {
                  onCreateVariant(newVariant.trim())
                  setNewVariant('')
                }}
              >
                {t('nutrition.exchange.addVariant')}
              </Button>
            </div>
          </div>

          <div className="space-y-2 border-t border-[var(--border-subtle)]/60 pt-3">
            <div className="flex items-center gap-1.5">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted">
                {t('nutrition.exchange.pdfTitle')}
              </p>
              <InfoTooltip content={t('nutrition.exchange.pdfTooltip')} />
            </div>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t('nutrition.exchange.pdfTitle')}>
              {(
                [
                  ['compact', t('nutrition.exchange.pdfCompact')],
                  ['equivalences', t('nutrition.exchange.pdfEquivalences')],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={pdfFormat === value}
                  onClick={() => setPdfFormat(value)}
                  className={cn(
                    'min-h-11 rounded-xl px-3 py-2 text-xs font-bold transition-colors touch-manipulation',
                    pdfFormat === value
                      ? 'bg-[color:var(--theme-primary)] text-white'
                      : 'border border-subtle bg-surface-app text-muted hover:bg-surface-sunken'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <Button
              type="button"
              disabled={pdfPending}
              onClick={() => onDownloadPdf(pdfFormat)}
              className="h-11 w-full gap-2"
            >
              <FileDown className="h-4 w-4" />
              {pdfPending ? t('nutrition.exchange.pdfGenerating') : t('nutrition.exchange.pdfDownload')}
            </Button>
            <p className="text-[10px] text-muted">
              {t('nutrition.exchange.pdfBrandPreview')}{' '}
              <span className="font-bold text-strong">{brand.brandName}</span>
            </p>
          </div>
        </>
      )}
    </section>
  )
}
