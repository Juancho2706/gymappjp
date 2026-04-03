'use client'

import { motion } from 'framer-motion'
import { 
    Activity, 
    Users, 
    Calendar, 
    TrendingUp, 
    CheckCircle2, 
    ChevronRight,
    Dumbbell,
    Apple
} from 'lucide-react'

export function DashboardMockup() {
    return (
        <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 1.5, ease: [0.22, 1, 0.36, 1] }}
            className="relative w-full max-w-[1000px] mx-auto mt-16 md:mt-24 group"
        >
            {/* Main Outer Container with Glow */}
            <div className="absolute -inset-1 bg-gradient-to-r from-primary/20 to-cyan-400/20 rounded-[2.5rem] blur-2xl group-hover:from-primary/30 group-hover:to-cyan-400/30 transition-all duration-700 opacity-50" />
            
            <div className="relative bg-card border border-border/50 rounded-[2rem] overflow-hidden shadow-2xl shadow-black/10 dark:shadow-black/50">
                {/* Window Controls */}
                <div className="flex items-center gap-1.5 px-6 py-4 border-b border-border/50 bg-muted/50 dark:bg-black/20">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500/50 border border-red-500/60 dark:bg-red-500/20 dark:border-red-500/40" />
                    <div className="w-2.5 h-2.5 rounded-full bg-blue-500/50 border border-blue-500/60 dark:bg-blue-500/20 dark:border-blue-500/40" />
                    <div className="w-2.5 h-2.5 rounded-full bg-cyan-500/50 border border-cyan-500/60 dark:bg-cyan-500/20 dark:border-cyan-500/40" />
                    <div className="ml-4 h-4 w-32 bg-foreground/10 dark:bg-white/5 rounded-full" />
                </div>

                <div className="flex flex-col md:flex-row h-full min-h-[500px] bg-background/80 dark:bg-black/40 backdrop-blur-3xl">
                    {/* Sidebar Mock */}
                    <div className="hidden md:flex flex-col w-56 border-r border-border/50 p-6 space-y-6 bg-muted/30 dark:bg-black/10">
                        <div className="space-y-3">
                            <div className="h-2 w-12 bg-foreground/20 dark:bg-white/10 rounded" />
                            <div className="space-y-2">
                                {[1, 2, 3, 4, 5].map((i) => (
                                    <div key={i} className={`flex items-center gap-3 p-2 rounded-lg ${i === 1 ? 'bg-primary/10 text-primary' : 'text-muted-foreground'}`}>
                                        <div className="w-4 h-4 rounded-sm bg-current opacity-30 dark:opacity-20" />
                                        <div className="h-2 w-16 bg-current opacity-30 dark:opacity-20" />
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Content Mock */}
                    <div className="flex-1 p-6 md:p-8 space-y-8 bg-zinc-50/50 dark:bg-zinc-900/50">
                        {/* Header Stats */}
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                            {[
                                { label: 'Alumnos Activos', val: '124', icon: Users, color: 'text-primary' },
                                { label: 'Check-ins Hoy', val: '18', icon: CheckCircle2, color: 'text-cyan-500 dark:text-cyan-400' },
                                { label: 'Ingresos Mes', val: '+24%', icon: TrendingUp, color: 'text-cyan-500 dark:text-cyan-400' },
                                { label: 'Programas', val: '42', icon: Activity, color: 'text-blue-500 dark:text-blue-400' },
                            ].map((s, i) => (
                                <div key={i} className="bg-white/50 dark:bg-white/[0.05] backdrop-blur-2xl border border-border/50 dark:border-white/10 rounded-2xl p-4 shadow-sm dark:shadow-lg shadow-black/5 dark:shadow-black/20">
                                    <div className="flex items-center justify-between mb-2">
                                        <s.icon className={`w-4 h-4 ${s.color}`} />
                                        <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Métrica</div>
                                    </div>
                                    <div className="text-xl font-bold text-foreground">{s.val}</div>
                                    <div className="text-[10px] text-muted-foreground mt-1">{s.label}</div>
                                </div>
                            ))}
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                            {/* Workout Builder Mock */}
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
                                        <Dumbbell className="w-4 h-4 text-primary" />
                                        Editor de Rutinas
                                    </h4>
                                    <div className="h-6 w-20 bg-primary/10 border border-primary/20 rounded-full flex items-center justify-center text-[10px] text-primary font-bold">NUEVO</div>
                                </div>
                                <div className="space-y-3">
                                    {[1, 2, 3].map((i) => (
                                        <div key={i} className="group/item flex items-center gap-4 bg-white/50 dark:bg-white/[0.05] backdrop-blur-2xl border border-border/50 dark:border-white/10 p-3 rounded-xl hover:bg-white/80 dark:hover:bg-white/[0.08] transition-colors shadow-sm shadow-black/5 dark:shadow-black/10">
                                            <div className="w-10 h-10 rounded-lg bg-black/5 dark:bg-black/40 flex items-center justify-center">
                                                <div className="w-6 h-6 bg-zinc-300 dark:bg-zinc-700 rounded-sm animate-pulse" />
                                            </div>
                                            <div className="flex-1">
                                                <div className="h-2 w-24 bg-zinc-300 dark:bg-zinc-700 rounded mb-2" />
                                                <div className="h-1.5 w-16 bg-zinc-200 dark:bg-zinc-800 rounded" />
                                            </div>
                                            <div className="flex gap-2">
                                                <div className="w-6 h-6 rounded bg-zinc-100 dark:bg-zinc-800 border border-border/50 dark:border-white/5" />
                                                <div className="w-6 h-6 rounded bg-zinc-100 dark:bg-zinc-800 border border-border/50 dark:border-white/5" />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Nutrition & Progress Mock */}
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
                                        <Apple className="w-4 h-4 text-cyan-500 dark:text-cyan-400" />
                                        Planes Nutricionales
                                    </h4>
                                </div>
                                <div className="bg-white/50 dark:bg-white/[0.05] backdrop-blur-2xl border border-border/50 dark:border-white/10 p-5 rounded-2xl shadow-sm dark:shadow-lg shadow-black/5 dark:shadow-black/20">
                                    <div className="flex items-center justify-between mb-6">
                                        <div className="space-y-1.5">
                                            <div className="h-3 w-32 bg-zinc-300 dark:bg-zinc-700 rounded" />
                                            <div className="h-2 w-20 bg-zinc-200 dark:bg-zinc-800 rounded" />
                                        </div>
                                        <div className="w-12 h-12 rounded-full border-4 border-cyan-500/20 border-t-cyan-500 flex items-center justify-center text-[10px] font-bold text-foreground">75%</div>
                                    </div>
                                    <div className="grid grid-cols-3 gap-3">
                                        {[1, 2, 3].map((i) => (
                                            <div key={i} className="h-1 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                                                <div className={`h-full bg-cyan-500/50 w-[${30 * i}%]`} />
                                            </div>
                                        ))}
                                    </div>
                                    <div className="mt-8 flex justify-center">
                                        <div className="h-32 w-full bg-gradient-to-t from-primary/5 to-transparent rounded-t-lg relative">
                                            <div className="absolute inset-x-0 bottom-0 h-[1px] bg-primary/20" />
                                            <div className="absolute inset-x-0 bottom-0 flex items-end justify-between px-2 pb-2 h-full">
                                                {[30, 45, 35, 60, 55, 70, 65].map((h, i) => (
                                                    <motion.div 
                                                        key={i} 
                                                        initial={{ height: 0 }}
                                                        animate={{ height: `${h}%` }}
                                                        transition={{ delay: 1 + (i * 0.2), duration: 1.5 }}
                                                        className="w-full mx-0.5 bg-primary/40 rounded-t-sm" 
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Floating Elements for depth */}
            <motion.div 
                animate={{ y: [0, -10, 0] }}
                transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
                className="absolute -top-12 -right-8 hidden lg:block bg-background/80 dark:bg-white/[0.05] border border-border/50 dark:border-white/10 p-4 rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.1)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.4)] backdrop-blur-2xl"
            >
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                        <TrendingUp className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                        <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Rendimiento</div>
                        <div className="text-sm font-bold text-foreground">+12.5% hoy</div>
                    </div>
                </div>
            </motion.div>

            <motion.div 
                animate={{ y: [0, 10, 0] }}
                transition={{ duration: 7, repeat: Infinity, ease: "easeInOut", delay: 1 }}
                className="absolute -bottom-10 -left-12 hidden lg:block bg-background/80 dark:bg-white/[0.05] border border-border/50 dark:border-white/10 p-5 rounded-3xl shadow-[0_8px_32px_rgba(0,0,0,0.1)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.4)] backdrop-blur-2xl"
            >
                <div className="flex items-center gap-4">
                    <div className="relative w-10 h-10">
                        <div className="absolute inset-0 bg-cyan-500/20 rounded-full animate-ping" />
                        <div className="relative w-10 h-10 rounded-full bg-cyan-500/20 flex items-center justify-center">
                            <CheckCircle2 className="w-5 h-5 text-cyan-500" />
                        </div>
                    </div>
                    <div>
                        <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Check-in</div>
                        <div className="text-sm font-bold text-foreground">Juan Pérez completó hoy</div>
                    </div>
                </div>
            </motion.div>
        </motion.div>
    )
}
