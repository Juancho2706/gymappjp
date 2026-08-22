'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowUpRight, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { personaNoun, type Persona } from '@eva/schemas'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { deleteDemoStudentAction } from '../_actions/demo-student.actions'
import { ViveTuAppButton } from './ViveTuAppButton'
import type { DemoStudentSnapshot } from '../_data/dashboard.queries'

/**
 * Alumno de ejemplo del coach (SPEC coach-onboarding-v2 §4).
 *
 * Tres competidores independientes (Everfit, Trainerize, Nutrium) llegaron a la misma conclusión:
 * el usuario nuevo no debe ver un producto vacío. El demo trae contenido del MUNDO de su persona y
 * NO ocupa cupo (`clients.is_demo`, excluido del conteo desde W1) — con Free = 1 alumno, si lo
 * ocupara, el onboarding sería un muro.
 *
 * Los mini-KPIs son datos REALES del demo. Cuando todavía no hay (el seed de W3 no corrió o el
 * contenido se genera al abrir), se dice «se carga al abrir» en vez de pintar un cero mentiroso.
 */

const OPEN_LABEL: Record<Persona, string> = {
    strength: 'Abrir su rutina',
    nutrition: 'Abrir su pauta',
    rehab: 'Abrir su screening',
    endurance: 'Abrir sus zonas',
    other: 'Abrir su ficha',
}

function initialsOf(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean)
    if (parts.length === 0) return '?'
    return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase()
}

export function DemoStudentCard({
    demo,
    persona,
    openHref,
    onViveTuAppOpened,
}: {
    demo: DemoStudentSnapshot
    persona: Persona
    /** Destino del paso 3 ya resuelto (`resolveHref`). `null` = el paso no navega en esta rama. */
    openHref: string | null
    onViveTuAppOpened: () => void
}) {
    const router = useRouter()
    const [confirmOpen, setConfirmOpen] = useState(false)
    const [deleting, startDelete] = useTransition()
    const noun = personaNoun(persona)
    const firstName = demo.fullName.split(' ')[0]

    function removeDemo() {
        startDelete(async () => {
            const result = await deleteDemoStudentAction()
            if (!result.ok) {
                toast.error(result.error)
                return
            }
            setConfirmOpen(false)
            toast.success('Borramos el alumno de ejemplo.')
            router.refresh()
        })
    }

    return (
        <section
            aria-label={`${noun} de ejemplo`}
            className="rounded-card border border-subtle bg-surface-card p-4"
        >
            <div className="flex items-start gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[var(--sport-100)] text-[14px] font-black text-[var(--sport-700)]">
                    {initialsOf(demo.fullName)}
                </span>
                <div className="min-w-0 flex-1">
                    <h3 className="truncate text-[14.5px] font-extrabold text-[var(--text-strong)]">
                        {demo.fullName}
                    </h3>
                    <p className="mt-1 text-[11.5px] font-semibold text-[var(--text-muted)]">
                        <span className="rounded-pill bg-surface-sunken px-2 py-0.5">
                            {noun.charAt(0).toUpperCase() + noun.slice(1)} de ejemplo · no ocupa tu cupo
                        </span>
                    </p>
                </div>
            </div>

            <dl className="mt-3.5 grid grid-cols-3 gap-2">
                {demo.kpis.map((kpi) => (
                    <div key={kpi.label} className="rounded-control bg-surface-sunken px-2.5 py-2">
                        <dt className="truncate text-[10.5px] font-bold uppercase tracking-[0.04em] text-[var(--text-muted)]">
                            {kpi.label}
                        </dt>
                        <dd
                            className={
                                kpi.value
                                    ? 'truncate text-[14px] font-extrabold text-[var(--text-strong)]'
                                    : 'truncate text-[11.5px] font-semibold text-[var(--text-muted)]'
                            }
                        >
                            {kpi.value ?? 'se carga al abrir'}
                        </dd>
                    </div>
                ))}
            </dl>

            <div className="mt-3.5 flex flex-wrap items-center gap-2">
                {openHref && (
                    <Link
                        href={openHref}
                        className="inline-flex h-11 touch-manipulation items-center gap-1.5 rounded-control bg-sport-500 px-3.5 text-[13px] font-bold text-[var(--text-on-sport)] transition-colors hover:bg-sport-600"
                    >
                        {OPEN_LABEL[persona]}
                        <ArrowUpRight className="size-4" />
                    </Link>
                )}
                <ViveTuAppButton label={`Ver como ${firstName}`} onOpened={onViveTuAppOpened} />
                <button
                    type="button"
                    onClick={() => setConfirmOpen(true)}
                    className="inline-flex h-11 touch-manipulation items-center gap-1.5 rounded-control px-2.5 text-[12.5px] font-bold text-[var(--text-muted)] transition-colors hover:bg-surface-sunken"
                >
                    <Trash2 className="size-4" />
                    Borrar ejemplo
                </button>
            </div>

            {/* «Ver como …» abre una hoja con QR: el celular no tiene la sesión del panel y la app
                del alumno es móvil. El aviso de «abrir aquí» vive dentro de la hoja. */}
            <p className="mt-2 text-[11.5px] text-[var(--text-muted)]">
                Escanéalo con tu celular y entra como {firstName}: es tu app, con tu marca.
            </p>

            <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Borrar el {noun} de ejemplo</AlertDialogTitle>
                        <AlertDialogDescription>
                            Se borra {demo.fullName} con todo su contenido de ejemplo. Tus {noun}s reales no se
                            tocan.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="gap-3">
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={(e) => {
                                e.preventDefault()
                                removeDemo()
                            }}
                            disabled={deleting}
                        >
                            {deleting ? 'Borrando…' : 'Borrar ejemplo'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </section>
    )
}
