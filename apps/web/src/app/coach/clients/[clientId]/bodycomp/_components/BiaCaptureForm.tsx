'use client'

import { useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { GlassCard } from '@/components/ui/glass-card'
import { BodyCompositionCreateSchema } from '@eva/schemas/bodycomp'
import { saveBodyCompositionAction } from '../_actions/body-composition.actions'

// Los inputs son texto; la validacion numerica/rango la hace BodyCompositionCreateSchema (server +
// cliente) al ensamblar. El form solo acota largos de los campos string.
const optText = z
    .string()
    .max(20)
    .optional()
    .refine((v) => v == null || v === '' || Number.isFinite(Number(v.replace(',', '.'))), {
        message: 'Debe ser un número',
    })

const BiaFormSchema = z.object({
    deviceBrand: z.string().max(60).optional(),
    deviceModel: z.string().max(60).optional(),
    weightKg: optText,
    heightCm: optText,
    skeletalMuscleMassKg: optText,
    fatMassKg: optText,
    bodyFatPercent: optText,
    totalBodyWaterL: optText,
    intracellularWaterL: optText,
    extracellularWaterL: optText,
    ecwTbwRatio: optText,
    visceralFatAreaCm2: optText,
    visceralFatLevel: optText,
    basalMetabolicRateKcal: optText,
    phaseAngleDeg: optText,
    notes: z.string().max(1000).optional(),
})

type BiaFormValues = z.infer<typeof BiaFormSchema>

const METRIC_FIELDS: { name: keyof BiaFormValues; label: string }[] = [
    { name: 'skeletalMuscleMassKg', label: 'Masa muscular esquelética (kg)' },
    { name: 'fatMassKg', label: 'Masa grasa (kg)' },
    { name: 'bodyFatPercent', label: '% Grasa corporal' },
    { name: 'totalBodyWaterL', label: 'Agua corporal total (L)' },
    { name: 'intracellularWaterL', label: 'Agua intracelular (L)' },
    { name: 'extracellularWaterL', label: 'Agua extracelular (L)' },
    { name: 'ecwTbwRatio', label: 'Razón ECW/TBW' },
    { name: 'visceralFatAreaCm2', label: 'Grasa visceral — área (cm²)' },
    { name: 'visceralFatLevel', label: 'Grasa visceral — nivel' },
    { name: 'basalMetabolicRateKcal', label: 'Metabolismo basal (kcal)' },
    { name: 'phaseAngleDeg', label: 'Ángulo de fase (°)' },
]

const METRIC_KEYS = [
    'skeletalMuscleMassKg',
    'fatMassKg',
    'bodyFatPercent',
    'totalBodyWaterL',
    'intracellularWaterL',
    'extracellularWaterL',
    'ecwTbwRatio',
    'visceralFatAreaCm2',
    'visceralFatLevel',
    'basalMetabolicRateKcal',
    'phaseAngleDeg',
] as const

/**
 * Captura manual de un reporte de bioimpedancia (InBody / Tanita / Omron). NO hay calculo: los
 * campos se persisten tal cual (validados por Zod). Grasa visceral en area (cm², InBody/medico) y
 * nivel (Tanita/Omron consumer) son campos SEPARADOS — se captura el que reporte el dispositivo.
 */
export function BiaCaptureForm({
    clientId,
    onSaved,
}: {
    clientId: string
    onSaved?: () => void
}) {
    const [pending, startTransition] = useTransition()
    const [serverError, setServerError] = useState<string | null>(null)
    const {
        register,
        handleSubmit,
        reset,
        formState: { errors },
    } = useForm<BiaFormValues>({ resolver: zodResolver(BiaFormSchema) })

    function onSubmit(values: BiaFormValues) {
        setServerError(null)
        const toNum = (v: string | undefined): number | null => {
            if (v == null || v === '') return null
            const n = Number(v.replace(',', '.'))
            return Number.isFinite(n) ? n : null
        }
        const metrics: Record<string, number> = {}
        for (const key of METRIC_KEYS) {
            const n = toNum(values[key])
            if (n != null) metrics[key] = n
        }
        const payload = {
            method: 'bia' as const,
            clientId,
            metrics,
            deviceBrand: values.deviceBrand || null,
            deviceModel: values.deviceModel || null,
            weightKg: toNum(values.weightKg),
            heightCm: toNum(values.heightCm),
            notes: values.notes || null,
        }
        // Zod cliente con el MISMO schema del servidor (defensa en profundidad).
        const parsed = BodyCompositionCreateSchema.safeParse(payload)
        if (!parsed.success) {
            setServerError('Revisa los datos: hay valores fuera de rango.')
            return
        }
        startTransition(async () => {
            const res = await saveBodyCompositionAction(parsed.data)
            if (res.error) {
                setServerError(res.error)
                return
            }
            reset()
            onSaved?.()
        })
    }

    return (
        <GlassCard className="p-4 md:p-5">
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                        <Label htmlFor="bia-brand">Marca del equipo</Label>
                        <Input id="bia-brand" placeholder="InBody" {...register('deviceBrand')} />
                    </div>
                    <div>
                        <Label htmlFor="bia-model">Modelo</Label>
                        <Input id="bia-model" placeholder="570" {...register('deviceModel')} />
                    </div>
                    <div>
                        <Label htmlFor="bia-weight">Peso (kg)</Label>
                        <Input id="bia-weight" inputMode="decimal" {...register('weightKg')} />
                    </div>
                    <div>
                        <Label htmlFor="bia-height">Estatura (cm)</Label>
                        <Input id="bia-height" inputMode="decimal" {...register('heightCm')} />
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {METRIC_FIELDS.map((f) => (
                        <div key={f.name}>
                            <Label htmlFor={`bia-${f.name}`}>{f.label}</Label>
                            <Input id={`bia-${f.name}`} inputMode="decimal" {...register(f.name)} />
                            {errors[f.name] && (
                                <p className="mt-1 text-[11px] text-rose-500">Valor inválido</p>
                            )}
                        </div>
                    ))}
                </div>

                <div>
                    <Label htmlFor="bia-notes">Notas</Label>
                    <Input id="bia-notes" {...register('notes')} />
                </div>

                {serverError && <p className="text-xs font-semibold text-rose-500">{serverError}</p>}

                <Button type="submit" disabled={pending} className="min-h-11 w-full sm:w-auto">
                    {pending ? 'Guardando…' : 'Guardar medición BIA'}
                </Button>
            </form>
        </GlassCard>
    )
}
