'use client'

/**
 * Ejecutor V3 — «Omitir hoy» + «Cambiar» en TODOS los tipos de bloque (mockup 3 aprobado, paridad con
 * la ola RN del mismo mockup).
 *
 * Qué resuelve: hasta hoy, un bloque que el alumno no podía hacer (sin espacio, máquina ocupada,
 * molestia) no tenía salida digna — «Cambiar» sólo existía en fuerza y con 0 series, y omitir no
 * existía en ningún lado. Pasar de largo con el swipe dejaba el paso pendiente PARA SIEMPRE: el
 * auto-avance no corría, «Finalizar» nunca se armaba y el día jamás cerraba al 100 %.
 *
 * Contrato (idéntico al de RN):
 *  - Los dos chips viven en la cabecera del paso ACTIVO, junto al chip de tipo · músculo.
 *  - «Omitir hoy» abre un sheet con MOTIVO OPCIONAL (sin espacio · máquina ocupada · molestia · otro):
 *    se puede omitir sin dar motivo.
 *  - El registro es UNA fila de `workout_logs` con `metadata.skipped` (la escribe el orquestador por su
 *    pipeline de siempre: cola offline → `logSetAction`), y el paso pasa a `SkippedStepV3`: badge
 *    «Omitido», sin captura, resuelto para el auto-avance y para el cierre del día.
 *
 * Dark-only y white-label: todo el color sale de `--exec-brand` vía las clases `exec-v3-*` de
 * globals.css (jamás un hex de marca acá). Se monta DENTRO del wrapper `[data-exec-v3]`, sin portal,
 * igual que `SubstituteSheetV3` / `ExecSettingsSheet`.
 */

import { AnimatePresence, motion } from 'framer-motion'
import { CircleSlash, Info, Repeat, SkipForward } from 'lucide-react'
import { SKIP_REASONS, type SkipReason } from '@eva/workout-engine'
import { useReducedMotion } from '@/lib/use-reduced-motion'
import { cn } from '@/lib/utils'

/**
 * Etiquetas es-CL del catálogo de motivos. El CATÁLOGO (los `value` que viajan a
 * `workout_logs.metadata.skip_reason`) sale de `@eva/workout-engine` — fuente única compartida con RN
 * (`v3/exercise-actions.tsx` tiene el mismo record); acá sólo vive la copy de esta plataforma. Orden
 * de pantalla = el de `SKIP_REASONS`, que es el del mockup.
 */
export const SKIP_REASON_LABEL: Record<SkipReason, string> = {
    no_space: 'Sin espacio',
    machine_busy: 'Máquina ocupada',
    discomfort: 'Molestia',
    other: 'Otro',
}

/** Etiqueta legible del motivo persistido; `null` (omitido sin motivo) o valor desconocido ⇒ null. */
export function skipReasonLabel(reason: string | null | undefined): string | null {
    if (!reason) return null
    return (SKIP_REASONS as readonly string[]).includes(reason) ? SKIP_REASON_LABEL[reason as SkipReason] : null
}

/**
 * Fila de acciones del paso activo: «Cambiar» (sustitución de máquina ocupada) + «Omitir hoy». Cada
 * chip se pinta sólo si el orquestador pasó su handler — así el mismo componente sirve para los cuatro
 * tipos de bloque sin condicionales duplicados en cada pantalla.
 */
export function BlockActionsV3({
    onOpenSubstitute,
    onSkip,
    className,
}: {
    /** Abre el sheet de sustitución. Ausente ⇒ el bloque ya tiene series registradas (no se cambia). */
    onOpenSubstitute?: () => void
    /** Abre el sheet de omisión. Ausente ⇒ el bloque ya está completo (nada que omitir). */
    onSkip?: () => void
    className?: string
}) {
    if (!onOpenSubstitute && !onSkip) return null
    return (
        <div className={cn('flex flex-wrap gap-2', className)}>
            {onOpenSubstitute && (
                <button
                    type="button"
                    onClick={onOpenSubstitute}
                    className="exec-v3-chip is-plain min-h-[40px]"
                    aria-label="Cambiar ejercicio (máquina ocupada)"
                >
                    <Repeat className="h-[13px] w-[13px]" aria-hidden /> Cambiar
                </button>
            )}
            {onSkip && (
                <button
                    type="button"
                    onClick={onSkip}
                    className="exec-v3-chip is-plain min-h-[40px]"
                    aria-label="Omitir este ejercicio hoy"
                >
                    <SkipForward className="h-[13px] w-[13px]" aria-hidden /> Omitir hoy
                </button>
            )}
        </div>
    )
}

/**
 * Sheet de omisión: motivo OPCIONAL. Cada motivo confirma en UN tap (no hay segundo paso: omitir es
 * una salida de emergencia, no una decisión con revisión) y «Omitir sin motivo» cierra el caso cuando
 * el alumno no quiere explicar nada. Hereda posición/animación de `.exec-v3-settings`.
 */
export function SkipBlockSheetV3({
    open,
    exerciseName,
    onOpenChange,
    onConfirm,
}: {
    open: boolean
    /** Ejercicio del bloque (contexto del header / aria). */
    exerciseName: string
    onOpenChange: (open: boolean) => void
    /** Confirma la omisión con el motivo elegido (`null` = sin motivo). */
    onConfirm: (reason: SkipReason | null) => void
}) {
    const reducedMotion = useReducedMotion()
    return (
        <AnimatePresence>
            {open && (
                <>
                    <motion.button
                        type="button"
                        aria-label="Cerrar omitir ejercicio"
                        onClick={() => onOpenChange(false)}
                        className="exec-v3-sheet-scrim"
                        initial={reducedMotion ? false : { opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={reducedMotion ? undefined : { opacity: 0 }}
                    />
                    <motion.div
                        className="exec-v3-settings"
                        role="dialog"
                        aria-modal="true"
                        aria-label={`Omitir ${exerciseName} hoy`}
                        initial={reducedMotion ? { opacity: 0 } : { y: '100%' }}
                        animate={reducedMotion ? { opacity: 1 } : { y: 0 }}
                        exit={reducedMotion ? { opacity: 0 } : { y: '100%' }}
                        transition={reducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 38 }}
                    >
                        <span className="exec-v3-handle" aria-hidden />
                        <h2 className="font-display text-[19px] font-black leading-tight text-on-dark">
                            Omitir hoy
                        </h2>
                        <p className="mt-1 text-[13px] font-semibold text-[#9a9aa6]">
                            <span className="text-[#cfcfd8]">{exerciseName}</span> queda resuelto por hoy. ¿Por qué lo
                            omites? (opcional)
                        </p>

                        <div className="mt-4 grid grid-cols-2 gap-2">
                            {SKIP_REASONS.map((r) => (
                                <button
                                    key={r}
                                    type="button"
                                    onClick={() => onConfirm(r)}
                                    className="min-h-[52px] rounded-[14px] border border-[#2f2f3a] bg-[#1c1c24] px-3 text-sm font-bold text-[#f4f4f6] transition-colors hover:bg-[#26262f] active:scale-[0.98]"
                                >
                                    {SKIP_REASON_LABEL[r]}
                                </button>
                            ))}
                        </div>

                        <button
                            type="button"
                            onClick={() => onConfirm(null)}
                            className="mt-3 min-h-[48px] w-full rounded-[14px] border border-transparent px-3 text-sm font-bold text-[#9a9aa6] transition-colors hover:bg-white/[0.06] hover:text-on-dark"
                        >
                            Omitir sin motivo
                        </button>

                        <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-[11px] font-semibold text-[#7f7f8c]">
                            <Info className="h-3.5 w-3.5 shrink-0" aria-hidden />
                            Tu coach lo verá en el registro
                        </p>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    )
}

/**
 * Cuerpo del paso ya OMITIDO: reemplaza la captura entera (no hay nada que registrar) por el estado
 * resuelto — badge «Omitido», nombre del ejercicio y motivo si lo hubo. No ofrece deshacer: el
 * ejecutor no tiene camino de DELETE de logs (la corrección real es registrar las series después).
 */
export function SkippedStepV3({
    exerciseName,
    typeLabel,
    reason,
}: {
    exerciseName: string
    /** Etiqueta del tipo efectivo del bloque ("Movilidad", "Fuerza"…) para el chip de contexto. */
    typeLabel: string
    /** Motivo persistido (`null` = omitido sin motivo). */
    reason: string | null
}) {
    const label = skipReasonLabel(reason)
    return (
        <div className="exec-v3-step space-y-3">
            <div className="text-center">
                <h2 className="exec-v3-exname">{exerciseName}</h2>
                <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                    <span className="exec-v3-chip is-plain">{typeLabel}</span>
                    <span className="exec-v3-chip is-plain">
                        <CircleSlash className="h-[13px] w-[13px]" aria-hidden /> Omitido
                    </span>
                </div>
            </div>

            <div className="rounded-[18px] border-2 border-[#2a2a34] bg-[#1a1a22] px-5 py-7 text-center">
                <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-white/[0.06] text-[#8f8f9c]">
                    <CircleSlash className="h-7 w-7" aria-hidden />
                </span>
                <p className="text-[15px] font-black text-on-dark">Omitido hoy</p>
                <p className="mt-1 text-[13px] font-semibold text-[#9a9aa6]">
                    {label ? `Motivo: ${label}` : 'Sin motivo indicado'}
                </p>
                <p className="mt-3 text-[12px] font-semibold text-[#7f7f8c]">
                    Este ejercicio ya no bloquea el cierre de tu día.
                </p>
            </div>
        </div>
    )
}
