'use client'

import { motion } from 'framer-motion'
import { HelpCircle } from 'lucide-react'
import { Popover, PopoverContent, PopoverDescription, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { springs } from '@/lib/animation-presets'

/**
 * Controles de esfuerzo por serie compartidos por la fila del `LogSetForm` y el paso opcional del
 * teclado numérico custom (`NumericKeypadSheet`). Extraídos a un módulo propio para que ambas
 * superficies rendericen EXACTAMENTE la misma UI (escala segmentada 1-10 + ayuda 1-tap) — DB-5 del
 * CEO: el alumno registra el RPE/RIR sin volver a la "sopa" de inputs, con idéntico lenguaje visual.
 */

/** Ayuda 1-tap para el alumno — texto corto, sin jerga (quick-win E2-7). */
export const RPE_HELP =
    'RPE = qué tan duro se sintió la serie. 1 = muy fácil · 10 = no podías hacer ni una repetición más.'
export const RIR_HELP =
    'RIR = cuántas reps te quedaban en el tanque. Si te quedaba 1, es 1. Así de simple.'

/** Escala de la fila (RPE siempre 1-10). `min` la baja a 0 para RIR en V3 (RIR 0 = al fallo). */
function scaleOpts(min: number): number[] {
    const opts: number[] = []
    for (let n = min; n <= 10; n += 1) opts.push(n)
    return opts
}

/**
 * Botoncito (?) accesible junto a los labels de RPE/RIR: Popover con explicación corta para
 * alumnos (mismo patrón que InfoTooltip de nutrición). El icono es chico pero el hit-area es
 * ≥44px (h-11 w-11) con márgenes negativos para no inflar la fila del label.
 */
export function EffortHelp({ label, text }: { label: string; text: string }) {
    return (
        <Popover>
            <PopoverTrigger
                type="button"
                aria-label={`¿Qué es el ${label}?`}
                className="-my-3 inline-flex h-11 w-11 items-center justify-center rounded-full text-on-dark-muted transition-colors hover:text-on-dark touch-manipulation"
            >
                <HelpCircle className="h-3.5 w-3.5" aria-hidden />
            </PopoverTrigger>
            <PopoverContent className="w-64">
                <PopoverDescription className="text-xs leading-relaxed">{text}</PopoverDescription>
            </PopoverContent>
        </Popover>
    )
}

/**
 * Escala segmentada 1-10 (dots) para registrar esfuerzo por serie (decisión CEO): la usan
 * RPE y RIR con UI idéntica, en la fila y en el teclado. Los botones son `flex-1` para que los
 * 10 segmentos quepan en la fila sin volver a la "sopa" de inputs. `name`/payload los inyecta el
 * submit — esto es sólo la UI de captura (el valor viaja igual que antes).
 */
export function ScaleDots({
    value,
    onChange,
    reducedMotion,
    name,
    compact = false,
    min = 1,
}: {
    value: number | null
    onChange: (v: number) => void
    reducedMotion: boolean | null
    name: string
    compact?: boolean
    /** Tope inferior de la escala. Default 1 (RPE, V2 idéntico); 0 para RIR en V3. */
    min?: number
}) {
    return (
        <div role="radiogroup" aria-label={`${name} (escala ${min} a 10)`} className="flex items-center gap-0.5">
            {scaleOpts(min).map((n) => {
                const filled = value != null && n <= value
                const selected = value === n
                return (
                    <button
                        key={n}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        aria-label={`${name} ${n}`}
                        onClick={() => onChange(n)}
                        className="flex h-11 flex-1 items-center justify-center"
                    >
                        <motion.span
                            className={cn('block rounded-full', filled ? 'bg-[var(--sport-500)]' : 'bg-white/15')}
                            animate={{ scale: selected ? 1.3 : filled ? 1 : 0.7 }}
                            transition={reducedMotion ? { duration: 0 } : springs.snappy}
                            style={{ width: compact ? 8 : 10, height: compact ? 8 : 10 }}
                        />
                    </button>
                )
            })}
            <span
                className={cn(
                    'ml-1 w-5 shrink-0 text-center font-mono font-bold tabular-nums text-[var(--sport-300)]',
                    compact ? 'text-[11px]' : 'text-xs',
                )}
            >
                {value != null ? value : '–'}
            </span>
        </div>
    )
}
