'use client'

import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'

/**
 * Aviso de plan desactivado — SPEC `docs/specs/plan-vivo-y-guardado` (R1.1, R1.2).
 *
 * Al asignar una rutina nueva, la anterior del alumno queda `is_active = false` y desaparece de su
 * app; el coach, en cambio, la seguía abriendo y editando en el builder sin ningún aviso (incidente
 * 07-09-2026: una tarde entera de trabajo sobre un plan muerto). Este banner es fijo y **no
 * descartable** a propósito: la información no es un tip, es el estado de lo que se está editando.
 *
 * El coach PUEDE seguir editando y guardando (decisión del owner D2-A: sirve para reciclar planes
 * viejos). Lo único que cambia es que sabe dónde está parado.
 */

export interface InactiveProgramNotice {
    title: string
    body: string
    /** `null` cuando el alumno no tiene ninguna rutina activa a la que mandarlo. */
    cta: string | null
}

/**
 * Copy del aviso, o `null` cuando no hay nada que avisar (programa activo, plantilla, o programa
 * nuevo sin estado todavía). Puro a propósito: es la regla que cubren los tests.
 */
export function inactiveProgramNotice({
    programIsActive,
    clientName,
    activeProgramName,
}: {
    programIsActive?: boolean | null
    clientName?: string | null
    activeProgramName?: string | null
}): InactiveProgramNotice | null {
    // Solo el `false` explícito avisa: `null`/`undefined` es «no sé» (plantilla o programa nuevo).
    if (programIsActive !== false) return null

    const name = (clientName ?? '').trim()
    // El nombre abre frase en el título y va en medio en el cuerpo: sin nombre, dos formas.
    const nameStart = name || 'Tu alumno'
    const nameMid = name || 'tu alumno'
    const activeName = (activeProgramName ?? '').trim()

    return {
        title: `${nameStart} ya no ve esta rutina.`,
        body: activeName
            ? `Quedó guardada como historial cuando le asignaste «${activeName}». Lo que edites acá no le va a llegar.`
            : `Quedó guardada como historial y ${nameMid} no tiene ninguna rutina activa.`,
        cta: activeName ? `Ir a la rutina que ${nameMid} está usando` : null,
    }
}

export function InactiveProgramBanner({
    programIsActive,
    clientId,
    clientName,
    activeProgram,
}: {
    programIsActive?: boolean | null
    clientId?: string | null
    clientName?: string | null
    activeProgram?: { id: string; name: string } | null
}) {
    const notice = inactiveProgramNotice({
        programIsActive,
        clientName,
        activeProgramName: activeProgram?.name ?? null,
    })
    if (!notice) return null

    // El link solo existe si hay a dónde ir: rutina activa + alumno en la ruta.
    const href = notice.cta && activeProgram && clientId
        ? `/coach/builder/${clientId}?programId=${activeProgram.id}`
        : null

    return (
        <div
            role="status"
            className="flex flex-col gap-2 border-b border-[var(--danger-500)]/20 bg-[var(--danger-500)]/10 px-4 py-2.5 sm:flex-row sm:items-center sm:gap-3"
        >
            <AlertTriangle className="hidden h-4 w-4 shrink-0 text-[var(--danger-600)] sm:block" />
            <p className="flex-1 text-xs font-medium text-[var(--danger-600)]">
                <strong>{notice.title}</strong> {notice.body}
            </p>
            {href && (
                <Link
                    href={href}
                    className="eva-press shrink-0 rounded-pill border border-[var(--danger-500)]/40 px-3 py-1 text-xs font-bold text-[var(--danger-600)] transition-colors hover:bg-[var(--danger-500)]/15"
                >
                    {notice.cta}
                </Link>
            )}
        </div>
    )
}
