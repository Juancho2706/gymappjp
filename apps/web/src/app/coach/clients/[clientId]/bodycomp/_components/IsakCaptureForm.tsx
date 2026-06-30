'use client'

import { useMemo, useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { computeIsak } from '@/domain/bodycomp'
import {
    BodyCompositionCreateSchema,
    IsakRawInputSchema,
    type BodyFatEquationDto,
} from '@eva/schemas/bodycomp'
import { saveBodyCompositionAction } from '../_actions/body-composition.actions'
import { IsakResultCard } from './IsakResultCard'
import { isakRawToDomain, isakResultToMetricsJson } from '@/services/bodycomp/body-composition.mappers'
import { readIsakMetrics, type IsakMetricsView } from '@/lib/bodycomp/view-helpers'

type Field = { name: string; label: string }

const SKINFOLDS: Field[] = [
    { name: 'tricepsMm', label: 'Tríceps' },
    { name: 'subscapularMm', label: 'Subescapular' },
    { name: 'supraspinaleMm', label: 'Supraespinal' },
    { name: 'abdominalMm', label: 'Abdominal' },
    { name: 'frontThighMm', label: 'Muslo anterior' },
    { name: 'medialCalfMm', label: 'Pantorrilla medial' },
    { name: 'bicepsMm', label: 'Bíceps' },
    { name: 'iliacCrestMm', label: 'Cresta ilíaca' },
]

const GIRTHS: Field[] = [
    { name: 'headCm', label: 'Cabeza' },
    { name: 'armRelaxedCm', label: 'Brazo relajado' },
    { name: 'armFlexedCm', label: 'Brazo flexionado' },
    { name: 'forearmCm', label: 'Antebrazo' },
    { name: 'chestMesosternaleCm', label: 'Tórax (mesoesternal)' },
    { name: 'waistCm', label: 'Cintura' },
    { name: 'thighCm', label: 'Muslo' },
    { name: 'calfCm', label: 'Pantorrilla' },
]

const BREADTHS: Field[] = [
    { name: 'biacromialCm', label: 'Biacromial' },
    { name: 'biiliocristalCm', label: 'Biiliocristal' },
    { name: 'humerusCm', label: 'Húmero (biepicondíleo)' },
    { name: 'femurCm', label: 'Fémur (biepicondíleo)' },
    { name: 'transverseChestCm', label: 'Tórax transverso' },
    { name: 'apChestDepthCm', label: 'Tórax A-P (profundidad)' },
]

const STEPS = ['Datos base + pliegues', 'Perímetros', 'Diámetros', 'Revisión']

function toNum(v: unknown): number | undefined {
    if (v === '' || v == null) return undefined
    const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'))
    return Number.isFinite(n) ? n : undefined
}

/** Arma el DTO ISAK desde los valores planos del formulario (todos strings). */
function buildRawInput(values: Record<string, string>, sex: 'male' | 'female'): unknown {
    const grab = (fields: Field[]) =>
        Object.fromEntries(fields.map((f) => [f.name, toNum(values[f.name])]))
    return {
        sex,
        ageYears: toNum(values.ageYears),
        heightCm: toNum(values.heightCm),
        weightKg: toNum(values.weightKg),
        sittingHeightCm: toNum(values.sittingHeightCm),
        skinfolds: grab(SKINFOLDS),
        girths: grab(GIRTHS),
        breadths: grab(BREADTHS),
    }
}

/**
 * Captura antropometrica ISAK por pasos (pliegues -> perimetros -> diametros -> revision). El
 * preview en vivo de la revision usa las MISMAS funciones puras de `domain/bodycomp` que el
 * servidor (paridad garantizada): lo que se ve es exactamente lo que se persistira en `metrics`.
 */
export function IsakCaptureForm({
    clientId,
    onSaved,
}: {
    clientId: string
    onSaved?: () => void
}) {
    const [step, setStep] = useState(0)
    const [pending, startTransition] = useTransition()
    const [, startStep] = useTransition()
    const [serverError, setServerError] = useState<string | null>(null)
    const [sex, setSex] = useState<'male' | 'female'>('male')
    const [equation, setEquation] = useState<BodyFatEquationDto>('durnin_womersley')

    const { register, watch, reset } = useForm<Record<string, string>>({ defaultValues: {} })
    const values = watch()

    const rawCandidate = useMemo(() => buildRawInput(values, sex), [values, sex])
    const parsedRaw = IsakRawInputSchema.safeParse(rawCandidate)

    const previewView: IsakMetricsView | null = useMemo(() => {
        if (!parsedRaw.success) return null
        try {
            const result = computeIsak(isakRawToDomain(parsedRaw.data), { bodyFatEquation: equation })
            // Reutiliza el lector de metrics (misma forma que persiste el server) para el preview.
            return readIsakMetrics({
                method: 'isak',
                is_validated: false,
                metrics: isakResultToMetricsJson(result),
            } as never)
        } catch {
            return null
        }
    }, [parsedRaw, equation])

    function goStep(next: number) {
        startStep(() => setStep(Math.max(0, Math.min(STEPS.length - 1, next))))
    }

    function onSubmit() {
        setServerError(null)
        if (!parsedRaw.success) {
            setServerError('Faltan medidas o hay valores fuera de rango.')
            return
        }
        const payload = {
            method: 'isak' as const,
            clientId,
            rawInput: parsedRaw.data,
            bodyFatEquation: equation,
            weightKg: parsedRaw.data.weightKg,
            heightCm: parsedRaw.data.heightCm,
        }
        const validated = BodyCompositionCreateSchema.safeParse(payload)
        if (!validated.success) {
            setServerError('Revisa los datos: hay valores fuera de rango.')
            return
        }
        startTransition(async () => {
            const res = await saveBodyCompositionAction(validated.data)
            if (res.error) {
                setServerError(res.error)
                return
            }
            reset()
            setStep(0)
            onSaved?.()
        })
    }

    const fieldGrid = (fields: Field[], unit: string) => (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {fields.map((f) => (
                <div key={f.name}>
                    <Label htmlFor={`isak-${f.name}`} className="text-xs">
                        {f.label} <span className="text-muted">({unit})</span>
                    </Label>
                    <Input id={`isak-${f.name}`} inputMode="decimal" {...register(f.name)} />
                </div>
            ))}
        </div>
    )

    return (
        <Card padding="md">
            {/* Header del form — espejo del IsakCapture del kit (título de paso + rol) */}
            <div className="mb-4 flex items-center justify-between gap-2">
                <span className="font-display text-base font-extrabold text-strong">
                    Nueva ISAK · {STEPS[step]}
                </span>
                <Badge tone="success" variant="soft" size="sm">
                    Nutri
                </Badge>
            </div>

            {/* Stepper */}
            <div className="mb-4 flex flex-wrap gap-1.5">
                {STEPS.map((label, i) => (
                    <button
                        key={label}
                        type="button"
                        onClick={() => goStep(i)}
                        className={cn(
                            'min-h-9 rounded-pill px-3.5 text-[11px] font-bold transition-colors',
                            i === step
                                ? 'bg-[var(--ink-950)] text-white'
                                : 'bg-surface-sunken text-muted hover:text-strong'
                        )}
                    >
                        {i + 1}. {label}
                    </button>
                ))}
            </div>

            <div className="space-y-4">
                {step === 0 && (
                    <>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                            <div>
                                <Label htmlFor="isak-sex" className="text-xs">Sexo</Label>
                                <select
                                    id="isak-sex"
                                    value={sex}
                                    onChange={(e) => setSex(e.target.value as 'male' | 'female')}
                                    className="h-10 w-full rounded-control border-[1.5px] border-default bg-surface-card px-3 text-sm text-strong"
                                >
                                    <option value="male">Masculino</option>
                                    <option value="female">Femenino</option>
                                </select>
                            </div>
                            <div>
                                <Label htmlFor="isak-ageYears" className="text-xs">Edad (años)</Label>
                                <Input id="isak-ageYears" inputMode="numeric" {...register('ageYears')} />
                            </div>
                            <div>
                                <Label htmlFor="isak-heightCm" className="text-xs">Estatura (cm)</Label>
                                <Input id="isak-heightCm" inputMode="decimal" {...register('heightCm')} />
                            </div>
                            <div>
                                <Label htmlFor="isak-weightKg" className="text-xs">Peso (kg)</Label>
                                <Input id="isak-weightKg" inputMode="decimal" {...register('weightKg')} />
                            </div>
                            <div>
                                <Label htmlFor="isak-sittingHeightCm" className="text-xs">Talla sentado (cm)</Label>
                                <Input id="isak-sittingHeightCm" inputMode="decimal" {...register('sittingHeightCm')} />
                            </div>
                        </div>
                        <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted">
                            Pliegues (mm)
                        </p>
                        {fieldGrid(SKINFOLDS, 'mm')}
                    </>
                )}

                {step === 1 && fieldGrid(GIRTHS, 'cm')}
                {step === 2 && fieldGrid(BREADTHS, 'cm')}

                {step === 3 && (
                    <div className="space-y-3">
                        <div>
                            <Label htmlFor="isak-equation" className="text-xs">Ecuación de % grasa</Label>
                            <select
                                id="isak-equation"
                                value={equation}
                                onChange={(e) => setEquation(e.target.value as BodyFatEquationDto)}
                                className="h-10 w-full rounded-control border-[1.5px] border-default bg-surface-card px-3 text-sm text-strong sm:w-72"
                            >
                                <option value="durnin_womersley">Durnin-Womersley (general)</option>
                                <option value="yuhasz">Yuhasz (atletas)</option>
                                <option value="faulkner">Faulkner (atletas)</option>
                            </select>
                        </div>

                        {previewView ? (
                            <IsakResultCard view={previewView} isValidated={false} title="Vista previa" />
                        ) : (
                            <p className="rounded-control bg-[var(--warning-100)] px-3 py-2.5 text-xs text-[var(--warning-700)]">
                                Completa todas las medidas para ver el cálculo. Faltan datos o hay valores fuera de rango.
                            </p>
                        )}
                    </div>
                )}

                {serverError && (
                    <p className="text-xs font-semibold text-[var(--danger-600)]">{serverError}</p>
                )}

                <div className="flex items-center justify-between gap-2">
                    <Button
                        type="button"
                        variant="ghost"
                        className="min-h-11"
                        disabled={step === 0}
                        onClick={() => goStep(step - 1)}
                    >
                        Atrás
                    </Button>
                    {step < STEPS.length - 1 ? (
                        <Button type="button" className="min-h-11" onClick={() => goStep(step + 1)}>
                            Siguiente
                        </Button>
                    ) : (
                        <Button
                            type="button"
                            className="min-h-11"
                            disabled={pending || !previewView}
                            onClick={onSubmit}
                        >
                            {pending ? 'Guardando…' : 'Guardar medición ISAK'}
                        </Button>
                    )}
                </div>
            </div>
        </Card>
    )
}
