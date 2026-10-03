'use client'

import { useId, useMemo, useState, useTransition } from 'react'
import { FileDown, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import type { NutritionItemSubstitutionRead, NutritionPlanReadModel } from '@eva/nutrition-v2'
import type { PdfBrand } from '@/domain/nutrition/exchange.types'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import type { PlanPdfEquivalenceFood, PlanPdfOptions, PlanPdfPageSize } from '@/lib/nutrition-v2-plan-pdf'

/** Lo que el servidor resuelve al tocar «Descargar»: marca del tenant, logo y equivalencias. */
export type PlanPdfAssetsResult =
    | {
          ok: true
          brand: PdfBrand
          logoDataUrl: string | null
          equivalences: PlanPdfEquivalenceFood[]
          todayIso: string
      }
    | { ok: false; error: string }

/**
 * «Descargar PDF» de la pauta V2, con sus opciones a la vista (formato, metas, equivalencias y
 * registro semanal). Lo usan la ficha del coach y la pestaña Plan del alumno; cada superficie pasa
 * su propia server action para la marca y las equivalencias (el coach lee su lista con dueño, el
 * alumno la del read-model). El PDF se arma en el navegador: el plan no viaja a ningún servidor.
 */
export function PlanPdfDownload({
    plan,
    clientName,
    loadAssets,
    extraSubstitutions,
    audience,
    className,
}: {
    plan: NutritionPlanReadModel
    clientName: string | null
    loadAssets: (input: { groupIds: string[] }) => Promise<PlanPdfAssetsResult>
    /** Reemplazos leídos aparte (la ficha del coach no los recibe dentro del read-model). */
    extraSubstitutions?: readonly NutritionItemSubstitutionRead[]
    audience: 'coach' | 'student'
    className?: string
}) {
    const id = useId()
    const [open, setOpen] = useState(false)
    const [pending, startTransition] = useTransition()
    const [options, setOptions] = useState<PlanPdfOptions>({
        pageSize: 'letter',
        includeMacros: true,
        includeEquivalences: true,
        includeTracker: false,
    })

    const groupIds = useMemo(
        () => [
            ...new Set(
                plan.dayVariants.flatMap((v) =>
                    v.mealSlots.flatMap((s) => (s.exchangeTargets ?? []).map((t) => t.exchangeGroupId)),
                ),
            ),
        ],
        [plan],
    )
    const hasPortions = groupIds.length > 0
    const pageCount =
        1 +
        plan.dayVariants.length +
        (hasPortions && options.includeEquivalences ? 1 : 0) +
        (options.includeTracker ? 1 : 0)

    const set = <K extends keyof PlanPdfOptions>(key: K, value: PlanPdfOptions[K]) =>
        setOptions((prev) => ({ ...prev, [key]: value }))

    const download = () => {
        startTransition(async () => {
            try {
                const assets = await loadAssets({ groupIds })
                if (!assets.ok) {
                    toast.error(assets.error)
                    return
                }
                const { downloadNutritionV2PlanPdf } = await import('@/lib/nutrition-v2-plan-pdf')
                await downloadNutritionV2PlanPdf({
                    plan: withSubstitutions(plan, extraSubstitutions),
                    brand: assets.brand,
                    logoDataUrl: assets.logoDataUrl,
                    clientName,
                    equivalences: assets.equivalences,
                    options,
                    todayIso: assets.todayIso,
                })
                toast.success('PDF descargado')
                setOpen(false)
            } catch {
                toast.error('No pudimos armar el PDF. Revisa tu conexión e inténtalo de nuevo.')
            }
        })
    }

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger
                type="button"
                className={cn(
                    'inline-flex min-h-11 items-center gap-2 rounded-control border-[1.5px] border-default bg-surface-card px-3.5 text-sm font-semibold text-strong shadow-sm transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)]',
                    className,
                )}
            >
                <FileDown className="h-4 w-4" aria-hidden="true" />
                Descargar PDF
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 gap-3 p-4">
                <div className="space-y-0.5">
                    <p className="font-display text-base font-bold text-strong">
                        {audience === 'coach' ? 'PDF de la pauta' : 'Tu pauta en PDF'}
                    </p>
                    <p className="text-xs leading-5 text-muted">
                        {audience === 'coach'
                            ? 'Sale con tu logo y tu color. Se arma en tu navegador: el plan no se sube a ningún lado.'
                            : 'Para imprimir o tenerla a mano sin conexión.'}
                    </p>
                </div>

                <fieldset className="space-y-1.5">
                    <legend className="text-[11px] font-semibold uppercase tracking-wide text-subtle">Tamaño de hoja</legend>
                    <div className="grid grid-cols-2 gap-1 rounded-control bg-surface-sunken p-1">
                        {(
                            [
                                ['letter', 'Carta'],
                                ['a4', 'A4'],
                            ] as [PlanPdfPageSize, string][]
                        ).map(([value, label]) => (
                            <label
                                key={value}
                                className={cn(
                                    'cursor-pointer rounded-[8px] py-1.5 text-center text-sm font-semibold transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--focus-ring)]',
                                    options.pageSize === value ? 'bg-surface-card text-strong shadow-sm' : 'text-muted',
                                )}
                            >
                                <input
                                    type="radio"
                                    name={`${id}-size`}
                                    value={value}
                                    checked={options.pageSize === value}
                                    onChange={() => set('pageSize', value)}
                                    className="sr-only"
                                />
                                {label}
                            </label>
                        ))}
                    </div>
                </fieldset>

                <fieldset className="space-y-2">
                    <legend className="text-[11px] font-semibold uppercase tracking-wide text-subtle">Incluir</legend>
                    <OptionCheck
                        id={`${id}-macros`}
                        checked={options.includeMacros}
                        onChange={(v) => set('includeMacros', v)}
                        label="Metas de calorías y macros"
                        hint={audience === 'coach' ? 'Apágalo si prefieres que tu paciente no vea cifras.' : null}
                    />
                    {hasPortions ? (
                        <OptionCheck
                            id={`${id}-eq`}
                            checked={options.includeEquivalences}
                            onChange={(v) => set('includeEquivalences', v)}
                            label="Lista de equivalencias"
                            hint="Qué alimentos valen 1 porción de cada grupo."
                        />
                    ) : null}
                    <OptionCheck
                        id={`${id}-tracker`}
                        checked={options.includeTracker}
                        onChange={(v) => set('includeTracker', v)}
                        label="Registro semanal para imprimir"
                        hint={null}
                    />
                </fieldset>

                <button
                    type="button"
                    onClick={download}
                    disabled={pending}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-control bg-[var(--cta-fill)] px-4 text-sm font-bold text-[var(--text-on-sport)] shadow-sm transition-colors hover:bg-[color-mix(in_oklab,var(--cta-fill)_92%,#000)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)] disabled:opacity-60"
                >
                    {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <FileDown className="h-4 w-4" aria-hidden="true" />}
                    {pending ? 'Armando el PDF…' : `Descargar · ${pageCount} ${pageCount === 1 ? 'página' : 'páginas'}`}
                </button>
            </PopoverContent>
        </Popover>
    )
}

function OptionCheck({
    id,
    checked,
    onChange,
    label,
    hint,
}: {
    id: string
    checked: boolean
    onChange: (value: boolean) => void
    label: string
    hint: string | null
}) {
    return (
        <label htmlFor={id} className="flex cursor-pointer items-start gap-2.5">
            <input
                id={id}
                type="checkbox"
                checked={checked}
                onChange={(e) => onChange(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--cta-fill)]"
            />
            <span className="min-w-0">
                <span className="block text-sm font-semibold text-strong">{label}</span>
                {hint ? <span className="block text-xs leading-5 text-muted">{hint}</span> : null}
            </span>
        </label>
    )
}

/** Inyecta los reemplazos leídos aparte en los ítems que no los traen dentro del read-model. */
function withSubstitutions(
    plan: NutritionPlanReadModel,
    extra: readonly NutritionItemSubstitutionRead[] | undefined,
): NutritionPlanReadModel {
    if (!extra || extra.length === 0) return plan
    const byItem = new Map<string, NutritionItemSubstitutionRead[]>()
    for (const sub of extra) {
        const list = byItem.get(sub.prescriptionItemId) ?? []
        list.push(sub)
        byItem.set(sub.prescriptionItemId, list)
    }
    return {
        ...plan,
        dayVariants: plan.dayVariants.map((variant) => ({
            ...variant,
            mealSlots: variant.mealSlots.map((slot) => ({
                ...slot,
                prescriptionItems: slot.prescriptionItems.map((item) =>
                    item.substitutions && item.substitutions.length > 0
                        ? item
                        : { ...item, substitutions: byItem.get(item.id) ?? item.substitutions },
                ),
            })),
        })),
    }
}
