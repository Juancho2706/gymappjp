'use client'

import { useMemo, useState } from 'react'
import { Copy, CopyCheck } from 'lucide-react'
import { sortNutritionDayVariantsForDisplay } from '@eva/nutrition-v2'
import type { BuilderSlot, BuilderVariant } from '../_lib/draft-builder'
import type { SlotCopyRequest } from '../_lib/builder-view-model'
import { secondaryButtonClass } from '../_lib/builder-ui-classes'
// El menu "Copiar a otros dias" de la franja usa el MISMO patron responsive que el resto de las
// afordancias del paso (popover en desktop / bottom sheet en movil), asi que reusa el hook.
import { useIsDesktopMd } from './AddDayPopover'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'

/**
 * Menú de la franja: "Copiar a otros días" (P0-4). El flujo real del coach es "el sábado es
 * igual pero cambia el almuerzo": sin esto había que duplicar el día entero o retipear cada
 * alimento buscándolo de nuevo en el catálogo.
 *
 * Un solo panel (popover en desktop / bottom sheet en móvil, mismo patrón que "Agregar día"):
 * atajo "Aplicar a todos los días" + multi-select de días destino. La copia lleva alimentos,
 * reemplazos y porciones, y REEMPLAZA la franja del mismo nombre del destino (merge por
 * nombre del reducer) — se dice explícito en el panel, no se descubre después.
 */
export function CopySlotMenu({
  slot,
  variantKey,
  variants,
  onCopySlot,
}: {
  slot: BuilderSlot
  variantKey: string
  variants: BuilderVariant[]
  onCopySlot: (request: SlotCopyRequest) => void
}) {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const isDesktop = useIsDesktopMd()
  // Días destino en el orden canónico de lectura (base + Lu→Do), sin el día de origen.
  const targets = useMemo(
    () => sortNutritionDayVariantsForDisplay(variants).filter((variant) => variant.key !== variantKey),
    [variants, variantKey],
  )
  const slotLabel = slot.name.trim() || 'esta franja'

  function handleOpenChange(next: boolean) {
    if (next) setSelected([])
    setOpen(next)
  }

  function copyTo(targetVariantKeys: string[]) {
    if (targetVariantKeys.length === 0) return
    onCopySlot({ sourceVariantKey: variantKey, slotKey: slot.key, targetVariantKeys })
    setOpen(false)
  }

  const body = (
    <div className="space-y-3 p-1">
      <p className="text-xs leading-relaxed text-muted">
        Copia <span className="font-semibold text-strong">{slotLabel}</span> con sus alimentos y porciones. Reemplaza
        la franja del mismo nombre en el día destino.
      </p>
      <button
        type="button"
        onClick={() => copyTo(targets.map((variant) => variant.key))}
        className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-control border border-border-default bg-surface-card px-3 text-sm font-semibold text-strong transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <CopyCheck aria-hidden="true" className="h-4 w-4 text-muted" />
        Aplicar a todos los días
      </button>
      <div>
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">O elige los días</p>
        <div className="flex flex-wrap gap-1.5">
          {targets.map((variant) => {
            const isOn = selected.includes(variant.key)
            return (
              <button
                key={variant.key}
                type="button"
                aria-pressed={isOn}
                onClick={() =>
                  setSelected((prev) =>
                    prev.includes(variant.key) ? prev.filter((key) => key !== variant.key) : [...prev, variant.key],
                  )
                }
                className={
                  'inline-flex min-h-11 items-center rounded-control border px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ' +
                  (isOn
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border-default bg-surface-card text-strong hover:border-primary/40')
                }
              >
                {variant.label}
              </button>
            )
          })}
        </div>
      </div>
      <button
        type="button"
        disabled={selected.length === 0}
        onClick={() => copyTo(selected)}
        className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-control bg-primary/100 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
      >
        <Copy aria-hidden="true" className="h-4 w-4" />
        {selected.length <= 1 ? 'Copiar al día elegido' : `Copiar a ${selected.length} días`}
      </button>
    </div>
  )

  // El nombre accesible empieza con el texto visible (WCAG 2.5.3) y agrega de qué franja habla.
  const triggerLabel = `Copiar a otros días: ${slot.name.trim() || 'franja sin nombre'}`
  const trigger = (
    <>
      <Copy aria-hidden="true" className="h-4 w-4" />
      Copiar a otros días
    </>
  )

  if (isDesktop) {
    return (
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger aria-label={triggerLabel} className={secondaryButtonClass}>
          {trigger}
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-80 rounded-card border border-border-subtle bg-surface-card p-2 text-body shadow-lg"
        >
          {body}
        </PopoverContent>
      </Popover>
    )
  }

  return (
    <>
      <button type="button" aria-label={triggerLabel} onClick={() => handleOpenChange(true)} className={secondaryButtonClass}>
        {trigger}
      </button>
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent side="bottom" className="max-h-[85dvh] rounded-t-card bg-surface-card text-body dark:bg-surface-card">
          <SheetHeader className="border-border-subtle bg-transparent p-4 pb-2 dark:border-border-subtle">
            <SheetTitle className="pr-10 font-display text-base font-semibold normal-case tracking-tight text-strong">
              Copiar a otros días
            </SheetTitle>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-[max(env(safe-area-inset-bottom,0px),0.75rem)] pt-1">
            {body}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
