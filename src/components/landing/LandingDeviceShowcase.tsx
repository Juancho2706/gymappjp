'use client'

import { motion } from 'framer-motion'
import { ChevronRight, Lock, Shield } from 'lucide-react'
import { DioramaClientPhone, DioramaDashboard } from '@/components/landing/landing-coach-dioramas'

export function LandingDeviceShowcase() {
    return (
        <div className="relative mx-auto mt-10 w-full max-w-[560px] lg:mt-0 lg:max-w-none">
            <motion.div
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
                className="relative"
            >
                <div className="absolute -inset-3 rounded-[2rem] bg-gradient-to-tr from-primary/15 via-transparent to-sky-400/10 blur-2xl" />
                <div className="relative rounded-2xl border border-zinc-900 bg-zinc-900 p-1 shadow-2xl backdrop-blur-sm dark:border-zinc-100 dark:bg-zinc-100">
                    <div className="flex items-center gap-1.5 rounded-t-[0.85rem] border-b border-zinc-800 bg-zinc-900 px-3 py-2 dark:border-zinc-200 dark:bg-zinc-100">
                        <span className="h-2 w-2 rounded-full bg-red-400/80" />
                        <span className="h-2 w-2 rounded-full bg-amber-400/80" />
                        <span className="h-2 w-2 rounded-full bg-emerald-400/80" />
                        <div className="ml-2 flex min-w-0 flex-1 items-center gap-1.5 rounded-md border border-zinc-700/60 bg-zinc-800/80 px-2 py-1 dark:border-zinc-300/70 dark:bg-zinc-200/80">
                            <Lock className="h-2.5 w-2.5 shrink-0 text-zinc-300 dark:text-zinc-600" aria-hidden />
                            <span className="truncate text-[9px] font-medium text-zinc-200 dark:text-zinc-700">app.eva-app.cl/coach</span>
                            <Shield className="ml-auto h-2.5 w-2.5 shrink-0 text-emerald-400 dark:text-emerald-600" aria-hidden />
                        </div>
                    </div>
                    <div className="flex items-center gap-2 border-b border-zinc-800 bg-zinc-900/95 px-3 py-1.5 dark:border-zinc-200 dark:bg-zinc-100/95">
                        <span className="text-[9px] font-semibold text-zinc-300 dark:text-zinc-600">Coach</span>
                        <ChevronRight className="h-3 w-3 text-zinc-400 dark:text-zinc-500" aria-hidden />
                        <span className="truncate text-[9px] font-bold text-white dark:text-zinc-900">Dashboard</span>
                        <span className="ml-auto rounded bg-primary/20 px-1.5 py-px text-[8px] font-bold text-primary-foreground dark:bg-primary/15 dark:text-primary">Pro</span>
                    </div>
                    <div className="rounded-b-xl bg-background p-2 sm:p-3">
                        <DioramaDashboard />
                    </div>
                </div>

                <motion.div
                    initial={{ opacity: 0, x: -12, y: 12 }}
                    animate={{ opacity: 1, x: 0, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
                    className="absolute -bottom-4 -left-2 z-20 w-[42%] max-w-[200px] sm:-bottom-6 sm:-left-4 lg:-left-8"
                >
                    <DioramaClientPhone />
                </motion.div>
            </motion.div>
        </div>
    )
}
