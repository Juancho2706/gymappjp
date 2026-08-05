'use client'

import { useActionState, useTransition, useRef } from 'react'
import { PlusCircle, Trash2, Loader2 } from 'lucide-react'
import { addGastoAction, deleteGastoAction } from './_actions/gasto-actions'
import type { Gasto } from './_data/gastos.queries'

const fmt = (n: number) =>
    n.toLocaleString('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 })

function AddGastoForm() {
    const formRef = useRef<HTMLFormElement>(null)
    const [state, action, pending] = useActionState(
        async (prev: unknown, fd: FormData) => {
            const res = await addGastoAction(prev, fd)
            if (res?.success) formRef.current?.reset()
            return res
        },
        null,
    )

    return (
        <form ref={formRef} action={action} className="rounded-lg border border-subtle bg-surface-card p-4">
            <h3 className="mb-3 text-xs font-medium uppercase tracking-widest text-muted">
                Nuevo gasto
            </h3>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="flex flex-col gap-1">
                    <label className="text-[11px] text-muted">Nombre</label>
                    <input
                        name="nombre"
                        required
                        placeholder="Ej: Hosting"
                        className="rounded border border-subtle bg-surface-sunken px-3 py-2 text-sm text-strong placeholder:text-muted focus:border-[var(--sport-500)] focus:outline-none"
                    />
                </div>

                <div className="flex flex-col gap-1">
                    <label className="text-[11px] text-muted">Cantidad</label>
                    <input
                        name="cantidad"
                        type="number"
                        min="0.01"
                        step="any"
                        required
                        defaultValue="1"
                        className="rounded border border-subtle bg-surface-sunken px-3 py-2 text-sm text-strong placeholder:text-muted focus:border-[var(--sport-500)] focus:outline-none"
                    />
                </div>

                <div className="flex flex-col gap-1">
                    <label className="text-[11px] text-muted">Costo ($)</label>
                    <input
                        name="costo"
                        type="number"
                        min="0.01"
                        step="any"
                        required
                        placeholder="0.00"
                        className="rounded border border-subtle bg-surface-sunken px-3 py-2 text-sm text-strong placeholder:text-muted focus:border-[var(--sport-500)] focus:outline-none"
                    />
                </div>

                <div className="flex flex-col gap-1">
                    <label className="text-[11px] text-muted">Quién pagó</label>
                    <input
                        name="pagador"
                        required
                        placeholder="Ej: Juan"
                        className="rounded border border-subtle bg-surface-sunken px-3 py-2 text-sm text-strong placeholder:text-muted focus:border-[var(--sport-500)] focus:outline-none"
                    />
                </div>
            </div>

            <div className="mt-3 flex items-center gap-3">
                <button
                    type="submit"
                    disabled={pending}
                    className="flex items-center gap-2 rounded bg-[var(--cta-fill)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                    {pending
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <PlusCircle className="h-3.5 w-3.5" />
                    }
                    Agregar
                </button>
                {state && 'error' in state && (
                    <p className="text-xs text-[var(--danger-500)]">{state.error}</p>
                )}
            </div>
        </form>
    )
}

function DeleteButton({ id }: { id: string }) {
    const [pending, startTransition] = useTransition()

    return (
        <button
            onClick={() => startTransition(() => deleteGastoAction(id))}
            disabled={pending}
            className="rounded p-1 text-muted hover:text-[var(--danger-500)] hover:bg-[var(--danger-500)]/10 disabled:opacity-40 transition-colors"
            title="Eliminar"
        >
            {pending
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <Trash2 className="h-3.5 w-3.5" />
            }
        </button>
    )
}

export function GastosClient({ gastos }: { gastos: Gasto[] }) {
    const totalCosto = gastos.reduce((acc, g) => acc + g.costo, 0)
    const totalItems = gastos.length

    const porPagador = gastos.reduce<Record<string, number>>((acc, g) => {
        const key = g.pagador
        acc[key] = (acc[key] ?? 0) + g.costo
        return acc
    }, {})

    return (
        <div className="space-y-6">
            <AddGastoForm />

            {/* Resumen */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                <div className="rounded-lg border border-subtle bg-surface-card px-4 py-3">
                    <p className="mb-1 text-[11px] font-medium uppercase tracking-widest text-muted">Total gastos</p>
                    <p className="font-mono text-2xl font-bold tabular-nums text-strong">{totalItems}</p>
                </div>
                <div className="rounded-lg border border-subtle bg-surface-card px-4 py-3 col-span-1 sm:col-span-2">
                    <p className="mb-1 text-[11px] font-medium uppercase tracking-widest text-muted">Total acumulado</p>
                    <p className="font-mono text-2xl font-bold tabular-nums text-strong">{fmt(totalCosto)}</p>
                </div>
                {Object.entries(porPagador).map(([pagador, total]) => (
                    <div key={pagador} className="rounded-lg border border-subtle bg-surface-card px-4 py-3">
                        <p className="mb-1 text-[11px] font-medium uppercase tracking-widest text-muted">{pagador}</p>
                        <p className="font-mono text-lg font-bold tabular-nums text-strong">{fmt(total)}</p>
                    </div>
                ))}
            </div>

            {/* Tabla */}
            <div className="rounded-lg border border-subtle bg-surface-card overflow-hidden">
                <div className="border-b border-subtle px-4 py-3">
                    <h3 className="text-xs font-medium uppercase tracking-widest text-muted">Registro de gastos</h3>
                </div>

                {gastos.length === 0 ? (
                    <div className="px-4 py-10 text-center text-sm text-muted">
                        Sin gastos registrados. Agrega el primero arriba.
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-subtle">
                                    <th className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-widest text-muted">Nombre</th>
                                    <th className="px-4 py-2.5 text-right text-[11px] font-medium uppercase tracking-widest text-muted">Cantidad</th>
                                    <th className="px-4 py-2.5 text-right text-[11px] font-medium uppercase tracking-widest text-muted">Costo</th>
                                    <th className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-widest text-muted">Pagó</th>
                                    <th className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-widest text-muted">Fecha</th>
                                    <th className="px-4 py-2.5 w-10" />
                                </tr>
                            </thead>
                            <tbody>
                                {gastos.map((g, i) => (
                                    <tr
                                        key={g.id}
                                        className={`border-b border-subtle last:border-0 ${i % 2 === 0 ? '' : 'bg-surface-sunken/30'}`}
                                    >
                                        <td className="px-4 py-2.5 text-strong">{g.nombre}</td>
                                        <td className="px-4 py-2.5 text-right font-mono tabular-nums text-body">{g.cantidad}</td>
                                        <td className="px-4 py-2.5 text-right font-mono tabular-nums text-strong">{fmt(g.costo)}</td>
                                        <td className="px-4 py-2.5 text-body">{g.pagador}</td>
                                        <td className="px-4 py-2.5 text-muted whitespace-nowrap">
                                            {new Date(g.created_at).toLocaleDateString('es-AR')}
                                        </td>
                                        <td className="px-4 py-2.5 text-right">
                                            <DeleteButton id={g.id} />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    )
}
