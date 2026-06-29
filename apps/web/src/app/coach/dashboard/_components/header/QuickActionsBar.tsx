'use client'

import Link from 'next/link'
import { useState } from 'react'
import { UserPlus, Layers, Utensils, Receipt } from 'lucide-react'
import { CreateClientModal } from '../../../clients/CreateClientModal'
import { QuickAddPaymentModal } from '../payments/QuickAddPaymentModal'
import type { ClientListItem } from '../../_data/types'

interface Props {
    clients: ClientListItem[]
}

/** EVA DS pill — surface-card fill, subtle hairline, sport accent + lift on hover. */
const quickActionClassName =
    'inline-flex items-center gap-2 rounded-pill border border-border-subtle bg-surface-card px-4 py-2 text-sm font-bold text-[var(--text-body)] shadow-[var(--shadow-sm)] [transition:transform_var(--dur-fast)_var(--ease-out),border-color_var(--dur-fast)_var(--ease-out),box-shadow_var(--dur-fast)_var(--ease-out)] hover:-translate-y-px hover:border-[var(--border-default)] hover:shadow-[var(--shadow-md)]'

export function QuickActionsBar({ clients }: Props) {
    const [createOpen, setCreateOpen] = useState(false)
    const [payOpen, setPayOpen] = useState(false)

    return (
        <>
            <div className="flex flex-wrap items-center gap-2">
                <button
                    type="button"
                    onClick={() => setCreateOpen(true)}
                    aria-label="Registrar alumno"
                    className={quickActionClassName}
                >
                    <UserPlus className="h-4 w-4 shrink-0 text-sport-500" />
                    <span className="hidden sm:inline">+ Alumno</span>
                    <span className="sm:hidden">+</span>
                </button>

                <Link
                    href="/coach/workout-programs"
                    aria-label="Crear programa"
                    className={quickActionClassName}
                >
                    <Layers className="h-4 w-4 shrink-0 text-sport-500" />
                    <span className="hidden sm:inline">+ Programa</span>
                    <span className="sm:hidden">+</span>
                </Link>

                <Link
                    href="/coach/nutrition-plans/new"
                    aria-label="Crear plan de nutricion"
                    className={quickActionClassName}
                >
                    <Utensils className="h-4 w-4 shrink-0 text-sport-500" />
                    <span className="hidden sm:inline">+ Nutricion</span>
                    <span className="sm:hidden">+</span>
                </Link>

                <button
                    type="button"
                    onClick={() => setPayOpen(true)}
                    aria-label="Registrar pago"
                    className={quickActionClassName}
                >
                    <Receipt className="h-4 w-4 shrink-0 text-sport-500" />
                    <span className="hidden sm:inline">+ Pago</span>
                    <span className="sm:hidden">+</span>
                </button>
            </div>

            <CreateClientModal open={createOpen} onClose={() => setCreateOpen(false)} />
            <QuickAddPaymentModal open={payOpen} onOpenChange={setPayOpen} clients={clients} />
        </>
    )
}
