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

/** Misma píldora de antes; en claro solo un borde y sombra un poco más marcados para separar del fondo. */
const quickActionClassName =
    'inline-flex items-center gap-2 rounded-full border border-black/[0.11] bg-card/95 px-4 py-2 text-sm font-medium shadow-sm shadow-black/[0.06] backdrop-blur-md transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:bg-card hover:shadow dark:border-border/60 dark:bg-background/60 dark:shadow-none dark:hover:bg-background/80'

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
                    <UserPlus className="h-4 w-4 shrink-0 text-primary" />
                    <span className="hidden sm:inline">+ Alumno</span>
                    <span className="sm:hidden">+</span>
                </button>

                <Link
                    href="/coach/workout-programs"
                    aria-label="Crear programa"
                    className={quickActionClassName}
                >
                    <Layers className="h-4 w-4 shrink-0 text-primary" />
                    <span className="hidden sm:inline">+ Programa</span>
                    <span className="sm:hidden">+</span>
                </Link>

                <Link
                    href="/coach/nutrition-plans/new"
                    aria-label="Crear plan de nutricion"
                    className={quickActionClassName}
                >
                    <Utensils className="h-4 w-4 shrink-0 text-primary" />
                    <span className="hidden sm:inline">+ Nutricion</span>
                    <span className="sm:hidden">+</span>
                </Link>

                <button
                    type="button"
                    onClick={() => setPayOpen(true)}
                    aria-label="Registrar pago"
                    className={quickActionClassName}
                >
                    <Receipt className="h-4 w-4 shrink-0 text-primary" />
                    <span className="hidden sm:inline">+ Pago</span>
                    <span className="sm:hidden">+</span>
                </button>
            </div>

            <CreateClientModal open={createOpen} onClose={() => setCreateOpen(false)} />
            <QuickAddPaymentModal open={payOpen} onOpenChange={setPayOpen} clients={clients} />
        </>
    )
}
