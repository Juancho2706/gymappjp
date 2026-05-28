'use client'

import { useMemo } from 'react'
import { z } from 'zod'
import { isDangerousCell } from '@/lib/import/csv-injection'
import type { ParsedSheet, ColumnMapping, MappedRow } from './ImportWizard'

const rowSchema = z.object({
    full_name: z.string().min(2, 'Nombre muy corto').max(100),
    email: z.string().email('Email inválido'),
    phone: z.string().optional().nullable(),
    subscription_start_date: z.string().optional().nullable(),
})

type RowStatus = 'valid' | 'error' | 'warning'

interface AnnotatedRow extends MappedRow {
    _status: RowStatus
    _errors: string[]
    _warnings: string[]
    _isDuplicate: boolean
}

interface Props {
    sheet: ParsedSheet
    mapping: ColumnMapping
    mappedRows: MappedRow[]
    coachId: string
    onBack: () => void
    onComplete: (validRows: MappedRow[]) => void
}

export function Step3Preview({ mappedRows, onBack, onComplete }: Props) {
    const annotated: AnnotatedRow[] = useMemo(() => {
        const seenEmails = new Set<string>()
        return mappedRows.map((row) => {
            const errors: string[] = []
            const warnings: string[] = []
            const emailKey = row.email?.toLowerCase().trim()

            const parsed = rowSchema.safeParse(row)
            if (!parsed.success) {
                errors.push(...Object.values(parsed.error.flatten().fieldErrors).flat())
            }

            if (emailKey && seenEmails.has(emailKey)) {
                warnings.push('Email duplicado en este archivo (se omitirá)')
            }
            if (emailKey) seenEmails.add(emailKey)

            if (isDangerousCell(row.full_name) || isDangerousCell(row.email)) {
                warnings.push('Celda con carácter especial — se sanitizará automáticamente')
            }

            const status: RowStatus = errors.length > 0 ? 'error' : warnings.length > 0 ? 'warning' : 'valid'
            return { ...row, _status: status, _errors: errors, _warnings: warnings, _isDuplicate: warnings.some((w) => w.includes('duplicado')) }
        })
    }, [mappedRows])

    const validCount = annotated.filter((r) => r._status === 'valid').length
    const errorCount = annotated.filter((r) => r._status === 'error').length
    const warnCount = annotated.filter((r) => r._status === 'warning').length

    const handleContinue = () => {
        const validRows = annotated
            .filter((r) => r._status !== 'error' && !r._isDuplicate)
            .map(({ _status: _s, _errors: _e, _warnings: _w, _isDuplicate: _d, ...row }) => row as MappedRow)
        onComplete(validRows)
    }

    return (
        <div className="space-y-6">
            {/* Summary */}
            <div className="flex flex-wrap gap-3 text-sm">
                <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-emerald-700 font-medium">✅ {validCount} válidas</span>
                {warnCount > 0 && <span className="rounded-full bg-amber-500/15 px-3 py-1 text-amber-700 font-medium">⚠️ {warnCount} con advertencia</span>}
                {errorCount > 0 && <span className="rounded-full bg-destructive/15 px-3 py-1 text-destructive font-medium">❌ {errorCount} con error</span>}
            </div>

            {/* Preview table */}
            <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                        <tr>
                            <th className="px-3 py-2 text-left font-medium text-muted-foreground">#</th>
                            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Nombre</th>
                            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Email</th>
                            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Teléfono</th>
                            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Estado</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {annotated.slice(0, 50).map((row, idx) => (
                            <tr
                                key={idx}
                                className={
                                    row._status === 'error' ? 'bg-destructive/5' :
                                    row._status === 'warning' ? 'bg-amber-500/5' : ''
                                }
                            >
                                <td className="px-3 py-2 text-muted-foreground">{row._rowIndex + 1}</td>
                                <td className="px-3 py-2">{row.full_name ?? <span className="text-destructive text-xs">—</span>}</td>
                                <td className="px-3 py-2">{row.email ?? <span className="text-destructive text-xs">—</span>}</td>
                                <td className="px-3 py-2 text-muted-foreground">{row.phone ?? '—'}</td>
                                <td className="px-3 py-2">
                                    {row._status === 'error' && (
                                        <span title={row._errors.join(', ')} className="text-xs text-destructive cursor-help underline decoration-dashed">
                                            Error: {row._errors[0]}
                                        </span>
                                    )}
                                    {row._status === 'warning' && (
                                        <span title={row._warnings.join(', ')} className="text-xs text-amber-600 cursor-help underline decoration-dashed">
                                            ⚠ {row._warnings[0]}
                                        </span>
                                    )}
                                    {row._status === 'valid' && (
                                        <span className="text-xs text-emerald-600">✓ OK</span>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {annotated.length > 50 && (
                    <p className="px-4 py-2 text-xs text-muted-foreground border-t border-border">
                        Mostrando 50 de {annotated.length} filas.
                    </p>
                )}
            </div>

            <div className="flex items-center justify-between pt-2">
                <button
                    onClick={onBack}
                    className="rounded-xl border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
                >
                    ← Volver
                </button>
                <button
                    onClick={handleContinue}
                    disabled={validCount === 0}
                    className="rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors"
                >
                    Continuar con {validCount} alumnos →
                </button>
            </div>
        </div>
    )
}
