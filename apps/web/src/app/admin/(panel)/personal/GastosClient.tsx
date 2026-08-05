'use client'

import { useActionState, useMemo, useState, useRef } from 'react'
import { PlusCircle, Trash2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { AdminConfirmDialog } from '../_components/AdminConfirmDialog'
import { addGastoAction, deleteGastoAction } from './_actions/gasto-actions'
import type { Gasto } from './_data/gastos.queries'

// Todo el modulo habla es-CL: antes las fechas salian en es-AR y los montos en es-CL.
const LOCALE = 'es-CL'

const fmt = (n: number) =>
    n.toLocaleString(LOCALE, { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 })

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(LOCALE)

const monthFormatter = new Intl.DateTimeFormat(LOCALE, { month: 'long', year: 'numeric' })

function monthLabel(d: Date) {
    // es-CL devuelve "agosto de 2026"; en un separador de tabla se lee mejor "Agosto 2026".
    const raw = monthFormatter.format(d).replace(' de ', ' ')
    return raw.charAt(0).toUpperCase() + raw.slice(1)
}

type MonthGroup = { key: string; label: string; gastos: Gasto[]; subtotal: number }

/** Los gastos ya vienen ordenados por fecha desc, asi que basta recorrerlos una vez. */
function groupByMonth(gastos: Gasto[]): MonthGroup[] {
    const groups: MonthGroup[] = []
    for (const g of gastos) {
        const d = new Date(g.created_at)
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        let current = groups[groups.length - 1]
        if (!current || current.key !== key) {
            current = { key, label: monthLabel(d), gastos: [], subtotal: 0 }
            groups.push(current)
        }
        current.gastos.push(g)
        current.subtotal += g.subtotal
    }
    return groups
}

function AddGastoForm() {
    const formRef = useRef<HTMLFormElement>(null)
    const [, action, pending] = useActionState(
        async (prev: unknown, fd: FormData) => {
            const res = await addGastoAction(prev, fd)
            if (res?.success) {
                formRef.current?.reset()
                toast.success('Gasto agregado')
            } else if (res?.error) {
                toast.error(res.error)
            }
            return res
        },
        null,
    )

    const inputClass =
        'rounded border border-subtle bg-surface-sunken px-3 py-2 text-sm text-strong placeholder:text-muted focus:border-[var(--sport-500)] focus:outline-none'

    return (
        <form ref={formRef} action={action} className="rounded-lg border border-subtle bg-surface-card p-4">
            <h3 className="mb-3 text-xs font-medium uppercase tracking-widest text-muted">
                Nuevo gasto
            </h3>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <div className="flex flex-col gap-1">
                    <label className="text-[11px] text-muted">Nombre</label>
                    <input
                        name="nombre"
                        required
                        placeholder="Ej: Hosting"
                        className={inputClass}
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
                        className={inputClass}
                    />
                </div>

                <div className="flex flex-col gap-1">
                    <label className="text-[11px] text-muted">Costo unitario ($)</label>
                    <input
                        name="costo"
                        type="number"
                        min="0.01"
                        step="any"
                        required
                        placeholder="0.00"
                        className={inputClass}
                    />
                </div>

                <div className="flex flex-col gap-1">
                    <label className="text-[11px] text-muted">Quién pagó</label>
                    <input
                        name="pagador"
                        required
                        placeholder="Ej: Juan"
                        className={inputClass}
                    />
                </div>

                <div className="flex flex-col gap-1">
                    <label className="text-[11px] text-muted">Fecha (opcional)</label>
                    <input
                        name="fecha"
                        type="date"
                        className={inputClass}
                    />
                    <span className="text-[10px] text-muted">Vacío = hoy</span>
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
            </div>
        </form>
    )
}

function DeleteButton({ gasto }: { gasto: Gasto }) {
    const [open, setOpen] = useState(false)
    const [pending, setPending] = useState(false)

    // deleteGastoAction TIRA en error (no devuelve {error}) — de ahi el try/catch.
    async function handleConfirm() {
        setPending(true)
        try {
            await deleteGastoAction(gasto.id)
            toast.success('Gasto eliminado')
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'No se pudo eliminar el gasto')
        } finally {
            setPending(false)
        }
    }

    return (
        <>
            <button
                onClick={() => setOpen(true)}
                disabled={pending}
                className="rounded p-1 text-muted hover:text-[var(--danger-500)] hover:bg-[var(--danger-500)]/10 disabled:opacity-40 transition-colors"
                title="Eliminar"
            >
                {pending
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Trash2 className="h-3.5 w-3.5" />
                }
            </button>

            <AdminConfirmDialog
                open={open}
                onOpenChange={setOpen}
                title="Eliminar gasto"
                description={`"${gasto.nombre}" (${gasto.cantidad} × ${fmt(gasto.costo)} = ${fmt(gasto.subtotal)}, pagó ${gasto.pagador}) sale del registro. No se puede deshacer.`}
                severity="danger"
                confirmLabel="Eliminar"
                onConfirm={handleConfirm}
            />
        </>
    )
}

export function GastosClient({ gastos }: { gastos: Gasto[] }) {
    const { totalGastado, porPagador, groups } = useMemo(() => ({
        // Los KPI suman subtotales (cantidad × costo), no el costo unitario.
        totalGastado: gastos.reduce((acc, g) => acc + g.subtotal, 0),
        porPagador: gastos.reduce<Record<string, number>>((acc, g) => {
            acc[g.pagador] = (acc[g.pagador] ?? 0) + g.subtotal
            return acc
        }, {}),
        groups: groupByMonth(gastos),
    }), [gastos])

    const totalItems = gastos.length

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
                    <p className="font-mono text-2xl font-bold tabular-nums text-strong">{fmt(totalGastado)}</p>
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
                                    <th className="px-4 py-2.5 text-right text-[11px] font-medium uppercase tracking-widest text-muted">Subtotal</th>
                                    <th className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-widest text-muted">Pagó</th>
                                    <th className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-widest text-muted">Fecha</th>
                                    <th className="px-4 py-2.5 w-10" />
                                </tr>
                            </thead>
                            {groups.map((group) => (
                                <tbody key={group.key}>
                                    {/* Separador de mes con su subtotal: el registro se lee por periodo. */}
                                    <tr className="border-b border-subtle bg-surface-sunken/60">
                                        <td colSpan={3} className="px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-body">
                                            {group.label}
                                        </td>
                                        <td className="px-4 py-2 text-right font-mono text-xs font-bold tabular-nums text-[var(--sport-500)]">
                                            {fmt(group.subtotal)}
                                        </td>
                                        <td colSpan={3} className="px-4 py-2 text-[10px] text-muted">
                                            {group.gastos.length} {group.gastos.length === 1 ? 'gasto' : 'gastos'}
                                        </td>
                                    </tr>
                                    {group.gastos.map((g, i) => (
                                        <tr
                                            key={g.id}
                                            className={`border-b border-subtle last:border-0 ${i % 2 === 0 ? '' : 'bg-surface-sunken/30'}`}
                                        >
                                            <td className="px-4 py-2.5 text-strong">{g.nombre}</td>
                                            <td className="px-4 py-2.5 text-right font-mono tabular-nums text-body">{g.cantidad}</td>
                                            <td className="px-4 py-2.5 text-right font-mono tabular-nums text-body">{fmt(g.costo)}</td>
                                            <td className="px-4 py-2.5 text-right font-mono font-bold tabular-nums text-strong">{fmt(g.subtotal)}</td>
                                            <td className="px-4 py-2.5 text-body">{g.pagador}</td>
                                            <td className="px-4 py-2.5 text-muted whitespace-nowrap">
                                                {fmtDate(g.created_at)}
                                            </td>
                                            <td className="px-4 py-2.5 text-right">
                                                <DeleteButton gasto={g} />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            ))}
                        </table>
                    </div>
                )}
            </div>
        </div>
    )
}
