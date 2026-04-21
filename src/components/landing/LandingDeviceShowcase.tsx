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
                <div className="relative rounded-2xl border border-border bg-card/80 p-1 shadow-2xl backdrop-blur-sm dark:bg-card/50">
                    <div className="flex items-center gap-1.5 rounded-t-[0.85rem] border-b border-border/60 bg-muted/30 px-3 py-2">
                        <span className="h-2 w-2 rounded-full bg-red-400/70" />
                        <span className="h-2 w-2 rounded-full bg-amber-400/70" />
                        <span className="h-2 w-2 rounded-full bg-emerald-400/70" />
                        <div className="ml-2 flex min-w-0 flex-1 items-center gap-1.5 rounded-md border border-border/50 bg-background/60 px-2 py-1">
                            <Lock className="h-2.5 w-2.5 shrink-0 text-muted-foreground" aria-hidden />
                            <span className="truncate text-[9px] font-medium text-muted-foreground">app.eva-app.cl/coach</span>
                            <Shield className="ml-auto h-2.5 w-2.5 shrink-0 text-emerald-600/80" aria-hidden />
                        </div>
                    </div>
                    <div className="flex items-center gap-2 border-b border-border/40 bg-muted/20 px-3 py-1.5">
                        <span className="text-[9px] font-semibold text-muted-foreground">Coach</span>
                        <ChevronRight className="h-3 w-3 text-muted-foreground/70" aria-hidden />
                        <span className="truncate text-[9px] font-bold text-foreground">Dashboard</span>
                        <span className="ml-auto rounded bg-primary/10 px-1.5 py-px text-[8px] font-bold text-primary">Pro</span>
                    </div>
                    <div className="rounded-b-xl bg-background/50 p-2 sm:p-3 dark:bg-zinc-950/50">
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
