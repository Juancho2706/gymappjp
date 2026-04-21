'use client'

import { motion } from 'framer-motion'
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
                    <div className="flex items-center gap-1.5 border-b border-border/60 bg-muted/30 px-3 py-2 rounded-t-[0.85rem]">
                        <span className="h-2 w-2 rounded-full bg-red-400/70" />
                        <span className="h-2 w-2 rounded-full bg-amber-400/70" />
                        <span className="h-2 w-2 rounded-full bg-emerald-400/70" />
                        <span className="ml-2 h-2 max-w-[6rem] flex-1 rounded-full bg-muted-foreground/15" />
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
