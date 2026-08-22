'use client'

import { useState, useTransition } from 'react'
import { AlertTriangle, Sparkles, Trash2 } from 'lucide-react'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { deleteDemoStudentAction } from '../../_actions/demo.actions'

/**
 * Cabecera de la ficha cuando el alumno es el de EJEMPLO del onboarding v2
 * (SPEC coach-onboarding-v2 §4, TASKS F3.7).
 *
 * Dice qué es (no cuenta cupo, no recibe correos) y ofrece la única acción propia del demo:
 * borrarlo de un toque. La autorización vive en `deleteDemoStudentAction`: acá solo se confirma.
 */
export function DemoStudentBanner({ label, name }: { label: string; name: string }) {
    const [error, setError] = useState<string | null>(null)
    const [isPending, startTransition] = useTransition()

    const handleDelete = () => {
        setError(null)
        startTransition(async () => {
            // El camino feliz redirige al directorio desde el servidor: si esto RESUELVE con un
            // valor, es porque falló.
            const result = await deleteDemoStudentAction()
            setError(result.error)
        })
    }

    return (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-card border border-subtle bg-surface-sunken px-3.5 py-3 print:hidden">
            <span className="inline-flex items-center gap-1.5 rounded-pill bg-[var(--info-100)] px-2.5 py-1 text-[12px] font-bold text-[var(--info-700)]">
                <Sparkles className="size-3.5" aria-hidden />
                {label}
            </span>
            <p className="min-w-0 flex-1 text-[12.5px] leading-snug text-muted">
                {name} no ocupa cupo de tu plan, no recibe correos y no cuenta en tus métricas.
                Está para que pruebes todo antes de invitar a alguien real.
            </p>
            <AlertDialog>
                <AlertDialogTrigger>
                    <span className="eva-press inline-flex min-h-11 items-center gap-1.5 rounded-control border-[1.5px] border-default bg-surface-card px-3.5 text-[13px] font-bold text-strong transition-colors hover:bg-surface-card/80">
                        <Trash2 className="size-4" aria-hidden />
                        Borrar ejemplo
                    </span>
                </AlertDialogTrigger>
                <AlertDialogContent className="rounded-card border border-subtle bg-surface-card text-body">
                    <AlertDialogHeader>
                        <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-control bg-[var(--danger-100)] text-[var(--danger-600)]">
                            <AlertTriangle className="h-[22px] w-[22px]" />
                        </div>
                        <AlertDialogTitle className="font-display font-extrabold normal-case tracking-[-0.01em] text-strong">
                            Borrar a {name}
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-muted">
                            Se borra el alumno de ejemplo y todo lo que vino con él: su plan, su
                            historial y sus registros. Tus alumnos reales no se tocan.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    {error ? (
                        <p role="alert" className="px-1 text-sm text-[var(--danger-600)]">
                            {error}
                        </p>
                    ) : null}
                    <AlertDialogFooter className="gap-3">
                        <AlertDialogCancel className="rounded-control">Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDelete}
                            disabled={isPending}
                            className="rounded-control bg-[var(--danger-500)] text-white hover:bg-[var(--danger-600)] disabled:opacity-60"
                        >
                            {isPending ? 'Borrando…' : 'Borrar ejemplo'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
