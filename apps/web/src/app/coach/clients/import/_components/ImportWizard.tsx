'use client'

import { useState } from 'react'
import { Step1Upload } from './Step1Upload'
import { Step2MapColumns } from './Step2MapColumns'
import { Step3Preview } from './Step3Preview'
import { Step4Confirm } from './Step4Confirm'
import type { ImportField } from '@/lib/import/header-matcher'
import type { ImportRow } from '../_actions/import.actions'

export type ParsedSheet = {
    headers: string[]
    rows: (string | number | null)[][]
    filename: string
}

export type ColumnMapping = Record<number, ImportField | null>

export type MappedRow = ImportRow & { _rowIndex: number }

interface Props {
    coachId: string
    orgId?: string | null
    maxClients: number
    activeCount: number
    /** Embebido en el pane "Importar alumnos" de Opciones: el SettingsShell ya rotula el título
     *  (panehd) y aporta el scroll/ancho de la sección → ocultamos el encabezado propio y aflojamos
     *  el padding superior para no duplicar. Página directa (false) = layout autónomo original. */
    embedded?: boolean
}

const STEP_LABELS = ['Subir archivo', 'Mapear columnas', 'Revisar datos', 'Confirmar']

export function ImportWizard({ coachId, orgId: _orgId, maxClients, activeCount, embedded = false }: Props) {
    const [step, setStep] = useState(1)
    const [sheet, setSheet] = useState<ParsedSheet | null>(null)
    const [mapping, setMapping] = useState<ColumnMapping>({})
    const [mappedRows, setMappedRows] = useState<MappedRow[]>([])

    return (
        <div className={`max-w-4xl mx-auto animate-fade-in ${embedded ? 'px-4 pb-10 pt-2 md:px-8' : 'p-4 md:p-8'}`}>
            {!embedded && (
                <div className="mb-8">
                    <h1 className="text-2xl font-extrabold text-foreground">Importar Alumnos</h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Importá tu cartera desde un archivo Excel o CSV.
                    </p>
                </div>
            )}

            {/* Stepper */}
            <div className="flex items-center gap-0 mb-8 overflow-x-auto pb-1">
                {STEP_LABELS.map((label, idx) => {
                    const num = idx + 1
                    const isDone = step > num
                    const isCurrent = step === num
                    return (
                        <div key={label} className="flex items-center min-w-0">
                            <button
                                onClick={() => isDone && setStep(num)}
                                disabled={!isDone}
                                className="flex items-center gap-2 shrink-0"
                            >
                                <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                                    isDone ? 'bg-primary text-primary-foreground cursor-pointer' :
                                    isCurrent ? 'bg-primary text-primary-foreground' :
                                    'bg-muted text-muted-foreground'
                                }`}>
                                    {isDone ? '✓' : num}
                                </span>
                                <span className={`text-sm font-medium hidden sm:inline ${isCurrent ? 'text-foreground' : 'text-muted-foreground'}`}>
                                    {label}
                                </span>
                            </button>
                            {idx < STEP_LABELS.length - 1 && (
                                <div className={`mx-3 h-px w-8 shrink-0 ${step > num ? 'bg-primary' : 'bg-border'}`} />
                            )}
                        </div>
                    )
                })}
            </div>

            {/* Steps */}
            {step === 1 && (
                <Step1Upload
                    onComplete={(parsedSheet) => {
                        setSheet(parsedSheet)
                        setStep(2)
                    }}
                />
            )}
            {step === 2 && sheet && (
                <Step2MapColumns
                    sheet={sheet}
                    initialMapping={mapping}
                    onBack={() => setStep(1)}
                    onComplete={(newMapping, rows) => {
                        setMapping(newMapping)
                        setMappedRows(rows)
                        setStep(3)
                    }}
                />
            )}
            {step === 3 && sheet && (
                <Step3Preview
                    sheet={sheet}
                    mapping={mapping}
                    mappedRows={mappedRows}
                    coachId={coachId}
                    onBack={() => setStep(2)}
                    onComplete={(validRows) => {
                        setMappedRows(validRows)
                        setStep(4)
                    }}
                />
            )}
            {step === 4 && (
                <Step4Confirm
                    rows={mappedRows}
                    filename={sheet?.filename ?? 'import.xlsx'}
                    maxClients={maxClients}
                    activeCount={activeCount}
                    onBack={() => setStep(3)}
                />
            )}
        </div>
    )
}
