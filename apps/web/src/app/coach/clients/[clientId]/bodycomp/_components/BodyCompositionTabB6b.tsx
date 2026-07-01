'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { SegmentedControl } from '@/components/ui/segmented-control'
import type { BodyCompositionRow } from '@/infrastructure/db/body-composition.repository'
import { BiaCaptureForm } from './BiaCaptureForm'
import { IsakCaptureForm } from './IsakCaptureForm'
import { BiaTrendPanel } from './BiaTrendPanel'
import { IsakTrendPanel } from './IsakTrendPanel'

type Method = 'bia' | 'isak'

/**
 * Shell de composicion corporal con sub-pestanas SEPARADAS por metodo:
 *   - Bioimpedancia (entrenador): captura del reporte de la maquina.
 *   - Antropometria (nutri): ISAK -> 5C + somatotipo + %grasa.
 * Los datos NUNCA se mezclan: cada pestana tiene su propia serie filtrada por metodo. El peso del
 * alumno sigue viviendo en check_ins (pestana Progreso existente) — esta superficie no lo toca.
 */
export function BodyCompositionTabB6b({
    clientId,
    bia,
    isak,
}: {
    clientId: string
    bia: BodyCompositionRow[]
    isak: BodyCompositionRow[]
}) {
    const [method, setMethod] = useState<Method>('bia')
    const [capturing, setCapturing] = useState(false)

    return (
        <div className="mx-auto w-full max-w-3xl space-y-4">
            {/* Header — espejo del TopBar del kit (back · título+subtítulo · badge Módulo) */}
            <div className="flex items-center gap-3">
                <Link
                    href={`/coach/clients/${clientId}`}
                    className="inline-flex size-10 shrink-0 items-center justify-center rounded-control border-[1.5px] border-default bg-surface-card text-muted transition-colors hover:text-strong md:hidden"
                    aria-label="Volver a la ficha"
                >
                    <ArrowLeft className="size-5" />
                </Link>
                <div className="min-w-0 flex-1">
                    <h1 className="font-display text-xl font-extrabold tracking-[-0.02em] text-strong">
                        Composición corporal
                    </h1>
                    <p className="text-[12.5px] text-muted">Módulo · captura</p>
                </div>
                <Badge tone="sport" variant="soft" size="sm">
                    Módulo
                </Badge>
            </div>

            {/* Método (segmented DS). Cambiar de método cierra el form de captura. La distinción
                entrenador/nutri vive en el header de cada form de captura (espejo del kit). */}
            <SegmentedControl
                options={[
                    { value: 'bia', label: 'Bioimpedancia' },
                    { value: 'isak', label: 'Antropometría' },
                ]}
                value={method}
                onChange={(v) => {
                    setMethod(v as Method)
                    setCapturing(false)
                }}
            />

            {/* Toggle de captura — sport (abrir) / secondary (cancelar), fullWidth (kit) */}
            <button
                type="button"
                onClick={() => setCapturing((v) => !v)}
                className={cn(
                    'flex min-h-11 w-full items-center justify-center gap-1.5 rounded-control text-sm font-bold transition-colors',
                    capturing
                        ? 'border-[1.5px] border-default bg-surface-card text-strong hover:bg-surface-sunken'
                        : 'bg-[var(--cta-fill)] text-[color:var(--text-on-sport)] hover:opacity-90'
                )}
            >
                {capturing ? (
                    <>
                        <X className="size-4" /> Cancelar
                    </>
                ) : (
                    <>
                        <Plus className="size-4" /> Nueva medición
                    </>
                )}
            </button>

            {capturing &&
                (method === 'bia' ? (
                    <BiaCaptureForm clientId={clientId} onSaved={() => setCapturing(false)} />
                ) : (
                    <IsakCaptureForm clientId={clientId} onSaved={() => setCapturing(false)} />
                ))}

            {method === 'bia' ? (
                <BiaTrendPanel clientId={clientId} rows={bia} />
            ) : (
                <IsakTrendPanel clientId={clientId} rows={isak} />
            )}
        </div>
    )
}
