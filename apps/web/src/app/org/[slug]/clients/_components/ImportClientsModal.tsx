'use client'

import { useState, useTransition, useRef } from 'react'
import { Upload, X, CheckCircle, XCircle, Loader2, Download } from 'lucide-react'
import { importClientsFromCSVAction, type ImportClientRow, type ImportClientResult } from '../../_actions/clients.actions'

interface Coach {
    id: string
    name: string
    slug: string | null
}

interface Props {
    orgSlug: string
    coaches: Coach[]
}

type Step = 'idle' | 'preview' | 'results'

type ParsedRow = ImportClientRow & { _rawCoach: string; _coachResolved: boolean }

function parseCSV(text: string, coachMap: Map<string, string>): ParsedRow[] {
    const lines = text.trim().split(/\r?\n/)
    const rows: ParsedRow[] = []

    // skip header if first line contains 'nombre' or 'name' or 'email'
    const start = /nombre|name|email/i.test(lines[0]) ? 1 : 0

    for (let i = start; i < lines.length; i++) {
        const line = lines[i].trim()
        if (!line) continue

        // basic CSV split — handles quoted fields
        const cols: string[] = []
        let cur = ''
        let inQuote = false
        for (const ch of line) {
            if (ch === '"') { inQuote = !inQuote; continue }
            if (ch === ',' && !inQuote) { cols.push(cur.trim()); cur = ''; continue }
            cur += ch
        }
        cols.push(cur.trim())

        const [full_name = '', email = '', phone = '', rawCoach = ''] = cols
        if (!full_name || !email) continue

        // resolve coach by slug, name (case-insensitive), or id
        const coachKey = rawCoach.toLowerCase().trim()
        let coach_id: string | undefined
        for (const [key, id] of coachMap) {
            if (key === coachKey) { coach_id = id; break }
        }

        rows.push({
            full_name: full_name.trim(),
            email: email.toLowerCase().trim(),
            phone: phone.trim() || undefined,
            coach_id,
            _rawCoach: rawCoach.trim(),
            _coachResolved: rawCoach.trim() === '' || !!coach_id,
        })
    }
    return rows
}

const TEMPLATE = `nombre,email,telefono,coach_slug
Juan Pérez,juan@ejemplo.com,+56912345678,coach-slug-aqui
María López,maria@ejemplo.com,,`

export function ImportClientsModal({ orgSlug, coaches }: Props) {
    const [open, setOpen] = useState(false)
    const [step, setStep] = useState<Step>('idle')
    const [rows, setRows] = useState<ParsedRow[]>([])
    const [results, setResults] = useState<ImportClientResult[]>([])
    const [pending, startTransition] = useTransition()
    const fileRef = useRef<HTMLInputElement>(null)

    // build lookup: slug → id, name lowercase → id
    const coachMap = new Map<string, string>()
    for (const c of coaches) {
        if (c.slug) coachMap.set(c.slug.toLowerCase(), c.id)
        coachMap.set(c.name.toLowerCase(), c.id)
        coachMap.set(c.id, c.id)
    }

    function handleFile(file: File) {
        const reader = new FileReader()
        reader.onload = e => {
            const text = e.target?.result as string
            const parsed = parseCSV(text, coachMap)
            setRows(parsed)
            setStep('preview')
        }
        reader.readAsText(file, 'utf-8')
    }

    function handleImport() {
        const importRows: ImportClientRow[] = rows.map(r => ({
            full_name: r.full_name,
            email: r.email,
            phone: r.phone,
            coach_id: r.coach_id,
        }))
        startTransition(async () => {
            const res = await importClientsFromCSVAction(orgSlug, importRows)
            setResults(res.results)
            setStep('results')
        })
    }

    function handleClose() {
        setOpen(false)
        setStep('idle')
        setRows([])
        setResults([])
        if (fileRef.current) fileRef.current.value = ''
    }

    const invalidRows = rows.filter(r => !r.email || !r.full_name)
    const unresolvedCoach = rows.filter(r => r._rawCoach && !r._coachResolved)
    const canImport = rows.length > 0 && invalidRows.length === 0

    const successCount = results.filter(r => r.success).length
    const failCount = results.filter(r => !r.success).length

    return (
        <>
            <button
                onClick={() => setOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-sm hover:bg-muted transition-colors"
            >
                <Upload className="w-3.5 h-3.5" />
                Importar CSV
            </button>

            {open && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 pl-safe pr-safe"
                    onClick={e => { if (e.target === e.currentTarget) handleClose() }}
                >
                    <div className="w-full max-w-2xl rounded-xl border border-border bg-background shadow-xl flex flex-col max-h-[85dvh]">
                        {/* Header */}
                        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
                            <h2 className="font-semibold text-sm">Importar alumnos desde CSV</h2>
                            <button onClick={handleClose} className="text-muted-foreground hover:text-foreground">
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="overflow-y-auto flex-1 p-5 space-y-4">
                            {step === 'idle' && (
                                <>
                                    <div className="rounded-lg bg-muted/50 p-3 space-y-1">
                                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Formato CSV esperado</p>
                                        <pre className="text-[11px] text-foreground font-mono whitespace-pre-wrap">{TEMPLATE}</pre>
                                        <p className="text-[11px] text-muted-foreground">Columna coach_slug: slug del coach (opcional). Dejar vacío para sin asignar.</p>
                                        {coaches.length > 0 && (
                                            <p className="text-[11px] text-muted-foreground">
                                                Coaches disponibles: {coaches.map(c => c.slug ?? c.name).join(', ')}
                                            </p>
                                        )}
                                    </div>

                                    <button
                                        onClick={() => {
                                            const blob = new Blob([TEMPLATE], { type: 'text/csv' })
                                            const a = document.createElement('a')
                                            a.href = URL.createObjectURL(blob)
                                            a.download = 'plantilla-alumnos.csv'
                                            a.click()
                                        }}
                                        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                                    >
                                        <Download className="w-3.5 h-3.5" />
                                        Descargar plantilla
                                    </button>

                                    <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-border rounded-xl p-8 cursor-pointer hover:border-violet-500/50 hover:bg-muted/30 transition-colors">
                                        <Upload className="w-6 h-6 text-muted-foreground" />
                                        <span className="text-sm text-muted-foreground">Seleccionar archivo CSV</span>
                                        <input
                                            ref={fileRef}
                                            type="file"
                                            accept=".csv,text/csv"
                                            className="hidden"
                                            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
                                        />
                                    </label>
                                </>
                            )}

                            {step === 'preview' && (
                                <>
                                    <div className="flex items-center justify-between">
                                        <p className="text-sm font-medium">{rows.length} filas detectadas</p>
                                        <button
                                            onClick={() => { setStep('idle'); setRows([]) }}
                                            className="text-xs text-muted-foreground hover:text-foreground"
                                        >
                                            Cambiar archivo
                                        </button>
                                    </div>

                                    {unresolvedCoach.length > 0 && (
                                        <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3">
                                            <p className="text-xs text-amber-700 dark:text-amber-400">
                                                <strong>{unresolvedCoach.length}</strong> fila(s) con coach no reconocido: {unresolvedCoach.map(r => `"${r._rawCoach}"`).join(', ')}. Se importarán sin asignar.
                                            </p>
                                        </div>
                                    )}

                                    <div className="rounded-lg border border-border overflow-hidden">
                                        <table className="w-full text-xs">
                                            <thead className="bg-muted">
                                                <tr>
                                                    <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Nombre</th>
                                                    <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Email</th>
                                                    <th className="text-left px-3 py-2 font-semibold text-muted-foreground hidden md:table-cell">Teléfono</th>
                                                    <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Coach</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-border">
                                                {rows.map((row, i) => (
                                                    <tr key={i} className={!row.full_name || !row.email ? 'bg-red-500/5' : ''}>
                                                        <td className="px-3 py-2">{row.full_name || <span className="text-red-400">vacío</span>}</td>
                                                        <td className="px-3 py-2 font-mono">{row.email || <span className="text-red-400">vacío</span>}</td>
                                                        <td className="px-3 py-2 hidden md:table-cell text-muted-foreground">{row.phone || '—'}</td>
                                                        <td className="px-3 py-2">
                                                            {row.coach_id
                                                                ? <span className="text-emerald-500">{coaches.find(c => c.id === row.coach_id)?.name ?? row._rawCoach}</span>
                                                                : row._rawCoach
                                                                    ? <span className="text-amber-500">{row._rawCoach} (no reconocido)</span>
                                                                    : <span className="text-muted-foreground">Sin asignar</span>
                                                            }
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </>
                            )}

                            {step === 'results' && (
                                <>
                                    <div className="flex gap-4">
                                        <div className="flex items-center gap-2 text-emerald-500">
                                            <CheckCircle className="w-4 h-4" />
                                            <span className="text-sm font-semibold">{successCount} importados</span>
                                        </div>
                                        {failCount > 0 && (
                                            <div className="flex items-center gap-2 text-red-400">
                                                <XCircle className="w-4 h-4" />
                                                <span className="text-sm font-semibold">{failCount} errores</span>
                                            </div>
                                        )}
                                    </div>
                                    <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
                                        {results.map((r, i) => (
                                            <div key={i} className="flex items-center justify-between px-3 py-2 text-xs">
                                                <span className="font-mono">{r.email}</span>
                                                {r.success
                                                    ? <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                                                    : <span className="text-red-400 shrink-0 max-w-[200px] text-right truncate">{r.error}</span>
                                                }
                                            </div>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border shrink-0">
                            {step === 'results' ? (
                                <button onClick={handleClose} className="px-4 py-2 rounded-lg bg-violet-500 text-white text-sm font-medium hover:bg-violet-600 transition-colors">
                                    Cerrar
                                </button>
                            ) : step === 'preview' ? (
                                <>
                                    <button onClick={handleClose} disabled={pending} className="px-4 py-2 rounded-lg border border-border text-sm hover:bg-muted transition-colors disabled:opacity-50">
                                        Cancelar
                                    </button>
                                    <button
                                        onClick={handleImport}
                                        disabled={!canImport || pending}
                                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-violet-500 text-white text-sm font-medium hover:bg-violet-600 transition-colors disabled:opacity-50"
                                    >
                                        {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                                        Importar {rows.length} alumnos
                                    </button>
                                </>
                            ) : (
                                <button onClick={handleClose} className="px-4 py-2 rounded-lg border border-border text-sm hover:bg-muted transition-colors">
                                    Cancelar
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}
