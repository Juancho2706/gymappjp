'use client'

import { useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Flame } from 'lucide-react'

/**
 * Racha ribbon — protagonista de retención (Dash_StreakRibbon del diseño eva-app).
 * Reemplaza el chip pequeño del header por el ribbon prominente: llama de fondo pulsante,
 * número grande con count-up, copy hacia el próximo hito y barra de progreso.
 *
 * Mapeo de data real: `streak` = `get_client_current_streak` (RPC). El diseño usa un
 * `studentStreakBest` (récord) que no existe en la data real → degradamos a "próximo hito"
 * (7/14/30/60/100/180/365) por encima de la racha actual, para mantener la barra + el copy
 * motivacional sin inventar un récord falso.
 */
const MILESTONES = [7, 14, 30, 60, 100, 180, 365]

function nextMilestone(n: number) {
    for (const m of MILESTONES) if (m > n) return m
    return Math.ceil((n + 1) / 365) * 365
}

export function StreakRibbon({ streak }: { streak: number }) {
    const reduce = useReducedMotion()
    const [shown, setShown] = useState(reduce ? streak : 0)

    useEffect(() => {
        if (reduce) {
            setShown(streak)
            return
        }
        let raf = 0
        let t0 = 0
        const dur = 1000
        const ease = (t: number) => 1 - Math.pow(1 - t, 3)
        const tick = (ts: number) => {
            if (!t0) t0 = ts
            const p = Math.min(1, (ts - t0) / dur)
            setShown(Math.round(streak * ease(p)))
            if (p < 1) raf = requestAnimationFrame(tick)
        }
        raf = requestAnimationFrame(tick)
        return () => cancelAnimationFrame(raf)
    }, [streak, reduce])

    if (streak <= 0) {
        return (
            <div className="flex items-center gap-3 rounded-card border border-ember-200 bg-ember-100 px-4 py-3.5">
                <span className="relative flex h-11 w-11 shrink-0 items-center justify-center">
                    <span className="absolute inset-0 rounded-full bg-ember-500/15" />
                    <Flame className="relative h-6 w-6 text-ember-700" />
                </span>
                <div className="min-w-0">
                    <p className="font-display text-[15px] font-black text-strong">Empieza tu racha hoy</p>
                    <p className="text-xs font-semibold text-ember-700/90">Entrena hoy y enciende la primera llama</p>
                </div>
            </div>
        )
    }

    const goal = nextMilestone(streak)
    const toGoal = Math.max(0, goal - streak)
    const pct = Math.min(100, Math.round((streak / goal) * 100))

    return (
        <div className="relative overflow-hidden rounded-card border border-ember-200 bg-[linear-gradient(118deg,var(--ember-100),color-mix(in_srgb,var(--ember-100)_45%,var(--surface-card)))] px-4 py-3.5">
            <div className="flex items-center gap-3">
                <span className="relative flex h-[46px] w-[46px] shrink-0 items-center justify-center">
                    <motion.span
                        aria-hidden
                        className="absolute inset-0 rounded-full bg-ember-500/[0.18]"
                        animate={reduce ? undefined : { scale: [1, 1.12, 1], opacity: [0.18, 0.28, 0.18] }}
                        transition={reduce ? undefined : { duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
                    />
                    <Flame className="relative h-[26px] w-[26px] text-ember-700" />
                </span>
                <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-1.5">
                        <span className="font-display text-[30px] font-black leading-none tabular-nums text-strong">{shown}</span>
                        <span className="whitespace-nowrap text-sm font-extrabold text-ember-700">días de racha</span>
                    </div>
                    <div className="mt-1 truncate text-xs font-semibold text-ember-700/90">
                        {toGoal === 0
                            ? '¡Alcanzaste el hito! Seguí así.'
                            : `Te ${toGoal === 1 ? 'falta' : 'faltan'} ${toGoal} para los ${goal} días`}
                    </div>
                </div>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-pill bg-ember-500/[0.18]">
                <motion.div
                    className="h-full rounded-pill bg-[linear-gradient(90deg,var(--ember-500),var(--ember-400))]"
                    initial={{ width: 0 }}
                    animate={{ width: `${reduce ? pct : pct}%` }}
                    transition={reduce ? { duration: 0 } : { duration: 1, ease: [0.16, 1, 0.3, 1] }}
                />
            </div>
        </div>
    )
}
