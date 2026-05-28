'use client'

import { useMemo, useState } from 'react'
import { matchHeaders, IMPORT_FIELD_LABELS, type ImportField } from '@/lib/import/header-matcher'
import type { ParsedSheet, ColumnMapping, MappedRow } from './ImportWizard'

interface Props {
    sheet: ParsedSheet
    initialMapping: ColumnMapping
    onBack: () => void
    onComplete: (mapping: ColumnMapping, rows: MappedRow[]) => void
}

const FIELD_OPTIONS: { value: ImportField | 'ignore'; label: string }[] = [
    { value: 'ignore', label: '-- No importar --' },
    { value: 'full_name', label: 'Nombre completo' },
    { value: 'email', label: 'Email' },
    { value: 'phone', label: 'Teléfono' },
    { value: 'subscription_start_date', label: 'Fecha de inicio' },
]

const REQUIRED: ImportField[] = ['full_name', 'email']

export function Step2MapColumns({ sheet, initialMapping, onBack, onComplete }: Props) {
    const autoMatches = useMemo(() => matchHeaders(sheet.headers), [sheet.headers])

    const [mapping, setMapping] = useState<ColumnMapping>(() => {
        if (Object.keys(initialMapping).length > 0) return initialMapping
        const m: ColumnMapping = {}
        autoMatches.forEach((match, idx) => {
            m[idx] = match.field
        })
        return m
    })

    const mappedFields = Object.values(mapping).filter(Boolean) as ImportField[]
    const missingRequired = REQUIRED.filter((f) => !mappedFields.includes(f))
    const canContinue = missingRequired.length === 0

    const handleContinue = () => {
        const rows: MappedRow[] = sheet.rows.map((row, rowIdx) => {
            const mapped: Partial<MappedRow> = { _rowIndex: rowIdx }
            Object.entries(mapping).forEach(([colIdx, field]) => {
                if (!field) return
                const val = row[Number(colIdx)]
                ;(mapped as Record<string, unknown>)[field] = val != null ? String(val).trim() : null
            })
            return mapped as MappedRow
        })
        onComplete(mapping, rows)
    }

    return (
        <div className="space-y-6">
            <p className="text-sm text-muted-foreground">
                Detectamos las siguientes columnas. Verificá que el mapeo sea correcto.
            </p>

            <div className="rounded-xl border border-border overflow-hidden">
                <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                        <tr>
                            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Columna del archivo</th>
                            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Ejemplos</th>
                            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Campo EVA</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {sheet.headers.map((header, colIdx) => {
                            const match = autoMatches[colIdx]
                            const examples = sheet.rows.slice(0, 3).map((r) => r[colIdx]).filter(Boolean)
                            const currentValue = mapping[colIdx] ?? 'ignore'
                            const confidence = match.confidence

                            return (
                                <tr key={colIdx}>
                                    <td className="px-4 py-3 font-medium">{header}</td>
                                    <td className="px-4 py-3 text-muted-foreground text-xs">
                                        {examples.slice(0, 2).map(String).join(', ')}
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-2">
                                            <select
                                                value={currentValue ?? 'ignore'}
                                                onChange={(e) => {
                                                    const val = e.target.value === 'ignore' ? null : e.target.value as ImportField
                                                    setMapping((prev) => ({ ...prev, [colIdx]: val }))
                                                }}
                                                className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                                            >
                                                {FIELD_OPTIONS.map(({ value, label }) => (
                                                    <option key={value} value={value}>{label}</option>
                                                ))}
                                            </select>
                                            {confidence === 'exact' && currentValue !== 'ignore' && (
                                                <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-600">
                                                    Auto
                                                </span>
                                            )}
                                            {confidence === 'fuzzy' && currentValue !== 'ignore' && (
                                                <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-600">
                                                    Sugerido
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>

            {missingRequired.length > 0 && (
                <p className="text-sm text-destructive rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3">
                    Debés mapear: {missingRequired.map((f) => IMPORT_FIELD_LABELS[f]).join(', ')}
                </p>
            )}

            <div className="flex items-center justify-between pt-2">
                <button
                    onClick={onBack}
                    className="rounded-xl border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
                >
                    ← Volver
                </button>
                <button
                    onClick={handleContinue}
                    disabled={!canContinue}
                    className="rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors"
                >
                    Continuar →
                </button>
            </div>
        </div>
    )
}
