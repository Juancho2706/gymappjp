'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { importClientsAction } from '../_actions/import.actions'
import type { MappedRow } from './ImportWizard'

interface Props {
    rows: MappedRow[]
    filename: string
    maxClients: number
    activeCount: number
    onBack: () => void
}

export function Step4Confirm({ rows, filename, maxClients, activeCount, onBack }: Props) {
    const [consent, setConsent] = useState(false)
    const [isPending, startTransition] = useTransition()
    const [result, setResult] = useState<Awaited<ReturnType<typeof importClientsAction>> | null>(null)
    const router = useRouter()

    const wouldExceedLimit = activeCount + rows.length > maxClients
    const canImport = consent && !wouldExceedLimit && !isPending

    const handleImport = () => {
        if (!canImport) return
        startTransition(async () => {
            const res = await importClientsAction(rows, filename, true)
            setResult(res)
        })
    }

    if (result?.success) {
        const { summary, rowErrors } = result
        return (
            <div className="space-y-6">
                <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-6 text-center space-y-1">
                    <p className="text-2xl font-extrabold text-emerald-700">
                        ✅ {summary?.succeeded} alumnos importados
                    </p>
                    {(summary?.failed ?? 0) > 0 && (
                        <p className="text-sm text-muted-foreground">{summary?.failed} fallaron · {summary?.skipped} omitidos</p>
                    )}
                </div>

                {rowErrors && rowErrors.length > 0 && (
                    <div className="rounded-xl border border-border overflow-hidden">
                        <p className="px-4 py-2 text-sm font-semibold bg-muted/50 border-b border-border">
                            Filas con error ({rowErrors.length})
                        </p>
                        <ul className="divide-y divide-border text-sm max-h-48 overflow-y-auto">
                            {rowErrors.map((e, idx) => (
                                <li key={idx} className="px-4 py-2 flex items-start gap-2">
                                    <span className="text-destructive font-mono text-xs">#{e.row}</span>
                                    <span className="text-muted-foreground">{e.full_name} ({e.email})</span>
                                    <span className="ml-auto text-xs text-destructive">{e.error}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                <button
                    onClick={() => router.push('/coach/clients')}
                    className="flex h-11 w-full items-center justify-center rounded-xl bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                    Ir a mi cartera →
                </button>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Summary card */}
            <div className="rounded-2xl border border-border bg-card p-6 space-y-3">
                <div className="flex items-center gap-3">
                    <span className="text-3xl">📥</span>
                    <div>
                        <p className="text-lg font-extrabold">{rows.length} alumnos serán creados</p>
                        <p className="text-sm text-muted-foreground">
                            {activeCount} actuales + {rows.length} nuevos = {activeCount + rows.length} / {maxClients} del plan
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <span>✉️</span>
                    <span>{rows.length} emails de bienvenida se enviarán</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <span>⏱️</span>
                    <span>Tiempo estimado: ~{Math.ceil(rows.length / 10) * 2} segundos</span>
                </div>
            </div>

            {wouldExceedLimit && (
                <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                    Tu plan permite {maxClients} alumnos y tenés {activeCount}. No podés importar {rows.length} alumnos más.
                    <a href="/coach/subscription?upgrade=true" className="ml-1 font-semibold underline">
                        Actualizá tu plan →
                    </a>
                </div>
            )}

            {/* Legal consent */}
            <label className={`flex items-start gap-3 rounded-xl border p-4 cursor-pointer transition-colors ${
                consent ? 'border-primary bg-primary/5' : 'border-border'
            }`}>
                <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded accent-primary"
                />
                <span className="text-sm text-muted-foreground leading-relaxed">
                    Confirmo que tengo el consentimiento expreso de las personas listadas para procesar sus datos personales conforme a la{' '}
                    <strong className="text-foreground">Ley 19.628</strong> sobre Protección de la Vida Privada (Chile), modificada por la{' '}
                    <strong className="text-foreground">Ley 21.719</strong>.
                </span>
            </label>

            {result?.error && (
                <p className="text-sm text-destructive rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3">
                    {result.error}
                </p>
            )}

            <div className="flex items-center justify-between pt-2">
                <button
                    onClick={onBack}
                    disabled={isPending}
                    className="rounded-xl border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
                >
                    ← Volver
                </button>
                <button
                    onClick={handleImport}
                    disabled={!canImport}
                    className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors"
                >
                    {isPending ? 'Importando...' : `Importar ${rows.length} alumnos`}
                </button>
            </div>

            <p className="text-center text-xs text-muted-foreground">
                <a href="/privacy" className="underline" target="_blank">Política de privacidad y DPA</a>
            </p>
        </div>
    )
}
