'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
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
            <div className="flex items-center gap-3">
                <Link
                    href={`/coach/clients/${clientId}`}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border/40 text-muted-foreground hover:text-foreground dark:border-white/10"
                    aria-label="Volver a la ficha"
                >
                    <ArrowLeft className="h-5 w-5" />
                </Link>
                <h1 className="text-lg font-black tracking-tight text-foreground">Composición corporal</h1>
            </div>

            {/* Sub-pestanas por metodo (segmented). Cambiar de metodo cierra el form de captura. */}
            <div className="flex gap-1.5 rounded-2xl bg-secondary/30 p-1.5">
                {([
                    { key: 'bia', label: 'Bioimpedancia', sub: 'Entrenador' },
                    { key: 'isak', label: 'Antropometría', sub: 'Nutri' },
                ] as const).map((t) => (
                    <button
                        key={t.key}
                        type="button"
                        onClick={() => {
                            setMethod(t.key)
                            setCapturing(false)
                        }}
                        className={cn(
                            'flex min-h-12 flex-1 flex-col items-center justify-center rounded-xl px-3 py-2 text-sm font-bold transition-colors',
                            method === t.key
                                ? 'bg-background text-foreground shadow-sm'
                                : 'text-muted-foreground hover:text-foreground'
                        )}
                    >
                        <span>{t.label}</span>
                        <span className="text-[10px] font-semibold text-muted-foreground">{t.sub}</span>
                    </button>
                ))}
            </div>

            <div className="flex justify-end">
                <Button
                    type="button"
                    variant={capturing ? 'ghost' : 'default'}
                    className="min-h-11"
                    onClick={() => setCapturing((v) => !v)}
                >
                    {capturing ? (
                        <>
                            <X className="mr-1.5 h-4 w-4" /> Cancelar
                        </>
                    ) : (
                        <>
                            <Plus className="mr-1.5 h-4 w-4" /> Nueva medición
                        </>
                    )}
                </Button>
            </div>

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
