'use client'

import { motion, useInView } from 'framer-motion'
import { useRef } from 'react'
import { AlertTriangle } from 'lucide-react'
import { springs } from '@/lib/animation-presets'

interface MacroBarProps {
    label: string
    consumed: number
    target: number
    unit: 'g' | 'kcal'
    colorClass: string
    delayIndex: number
}

export function MacroBar({ label, consumed, target, unit, colorClass, delayIndex }: MacroBarProps) {
    const ref = useRef(null)
    const inView = useInView(ref, { once: true, margin: '-10%' })
    const pct = target > 0 ? Math.min(100, (consumed / target) * 100) : 0
    const over = target > 0 && consumed > target

    return (
        <div ref={ref} className="space-y-1">
            <div className="flex justify-between text-[11px] font-semibold text-muted">
                <span>{label}</span>
                <span className="tabular-nums text-body">
                    {Math.round(consumed)}/{Math.round(target)}
                    {unit}
                    {over ? <AlertTriangle className="ml-1 inline h-3 w-3 text-[var(--danger-500)]" /> : null}
                </span>
            </div>
            <div className="h-2 overflow-hidden rounded-pill bg-[var(--track)]">
                <motion.div
                    className={`h-full rounded-pill ${over ? 'bg-[var(--danger-500)]' : colorClass}`}
                    initial={{ width: '0%' }}
                    animate={inView ? { width: `${pct}%` } : { width: '0%' }}
                    transition={{ ...springs.lazy, delay: delayIndex * 0.08 }}
                />
            </div>
        </div>
    )
}
