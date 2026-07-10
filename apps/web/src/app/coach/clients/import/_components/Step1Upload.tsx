'use client'

import { useState, useRef } from 'react'
import type { ParsedSheet } from './ImportWizard'

interface Props {
    onComplete: (sheet: ParsedSheet) => void
}

const MAX_BYTES = 5 * 1024 * 1024 // 5MB
const MAX_ROWS = 1000
const ACCEPTED_EXTS = ['.xlsx', '.xls', '.csv']
const ACCEPTED_MIME = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'text/csv',
    'application/csv',
]

export function Step1Upload({ onComplete }: Props) {
    const [dragging, setDragging] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [parsing, setParsing] = useState(false)
    const inputRef = useRef<HTMLInputElement>(null)

    const processFile = async (file: File) => {
        setError(null)

        const ext = '.' + file.name.split('.').pop()?.toLowerCase()
        if (!ACCEPTED_EXTS.includes(ext) && !ACCEPTED_MIME.includes(file.type)) {
            setError('Formato no soportado. Usa .xlsx, .xls o .csv.')
            return
        }
        if (file.size > MAX_BYTES) {
            setError('El archivo supera el límite de 5 MB.')
            return
        }

        setParsing(true)
        try {
            const XLSX = await import('xlsx')
            const buffer = await file.arrayBuffer()
            const wb = XLSX.read(buffer, { type: 'array', cellDates: true, raw: false })
            const sheet = wb.Sheets[wb.SheetNames[0]]
            const aoa: (string | number | null)[][] = XLSX.utils.sheet_to_json(sheet, {
                header: 1,
                blankrows: false,
                defval: null,
            }) as (string | number | null)[][]

            if (aoa.length < 2) {
                setError('El archivo está vacío o solo tiene encabezados.')
                setParsing(false)
                return
            }

            const [headerRow, ...dataRows] = aoa
            const headers = (headerRow as (string | null)[]).map((h) => String(h ?? ''))
            const rows = dataRows.slice(0, MAX_ROWS)

            if (dataRows.length > MAX_ROWS) {
                setError(`El archivo tiene más de ${MAX_ROWS} filas. Dividilo en partes de hasta ${MAX_ROWS} alumnos.`)
                setParsing(false)
                return
            }

            onComplete({ headers, rows, filename: file.name })
        } catch {
            setError('No se pudo leer el archivo. Verifica que sea un Excel o CSV válido.')
        } finally {
            setParsing(false)
        }
    }

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault()
        setDragging(false)
        const file = e.dataTransfer.files[0]
        if (file) processFile(file)
    }

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (file) processFile(file)
    }

    return (
        <div className="space-y-6">
            <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => inputRef.current?.click()}
                className={`relative flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed p-12 cursor-pointer transition-colors ${
                    dragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/30'
                }`}
            >
                <input
                    ref={inputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    className="sr-only"
                    onChange={handleChange}
                />
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                    <svg className="h-7 w-7 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                    </svg>
                </div>
                <div className="text-center">
                    <p className="font-semibold text-foreground">
                        {parsing ? 'Procesando archivo...' : 'Arrastra tu archivo o haz click para seleccionar'}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                        .xlsx, .xls o .csv · Máximo 5 MB · Hasta 1.000 alumnos
                    </p>
                </div>
            </div>

            {error && (
                <p className="text-sm text-destructive rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3">
                    {error}
                </p>
            )}

            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">¿Qué columnas necesito?</p>
                    <a
                        href="/templates/import-alumnos.xlsx"
                        download
                        className="flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/20 transition-colors"
                    >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                        </svg>
                        Descargar template
                    </a>
                </div>
                <ul className="space-y-1 text-sm text-muted-foreground">
                    <li><span className="font-medium text-foreground">Nombre completo</span> — requerido</li>
                    <li><span className="font-medium text-foreground">Email</span> — requerido</li>
                    <li><span className="font-medium text-foreground">Teléfono</span> — opcional</li>
                    <li><span className="font-medium text-foreground">Fecha de inicio</span> — opcional (DD/MM/AAAA)</li>
                </ul>
                <p className="text-xs text-muted-foreground">
                    Los nombres de columna pueden estar en español o inglés. Los detectamos automáticamente.
                </p>
            </div>
        </div>
    )
}
