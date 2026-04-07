'use client'

import * as React from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Activity, Zap, Play, Eye } from 'lucide-react'
import { GlassButton } from '@/components/ui/glass-button'

interface ProgramPreviewModalProps {
    program: any
    children?: React.ReactNode
}

export function ProgramPreviewModal({ program, children }: ProgramPreviewModalProps) {
    const [isOpen, setIsOpen] = React.useState(false)

    if (!program) return <>{children}</>

    return (
        <>
            <div onClick={() => setIsOpen(true)} className="cursor-pointer">
                {children ? children : (
                    <GlassButton size="icon" variant="ghost" className="h-8 w-8 md:h-10 md:w-10 rounded-lg md:rounded-xl border border-primary/10 hover:bg-primary/5">
                        <Eye className="w-4 h-4 md:w-5 md:h-5 text-primary" />
                    </GlassButton>
                )}
            </div>

            <Dialog open={isOpen} onOpenChange={setIsOpen}>
                <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto p-0 border-none bg-background shadow-2xl">
                    <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-xl border-b p-4 sm:p-6 flex items-start justify-between gap-4">
                        <div className="space-y-1">
                            <DialogTitle className="text-xl sm:text-2xl font-black uppercase tracking-tight text-foreground flex flex-wrap items-center gap-2">
                                <Zap className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
                                <span className="text-foreground">Vista Previa</span>
                                <span className="text-sm font-medium text-muted-foreground">{program.name}</span>
                            </DialogTitle>
                            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                                Contenido de Solo Lectura
                            </p>
                        </div>
                    </div>

                    <div className="p-6 space-y-6">
                        {program.workout_plans?.sort((a: any, b: any) => a.day_of_week - b.day_of_week).map((plan: any) => (
                            <div key={plan.id} className="group/day bg-card border rounded-2xl overflow-hidden shadow-sm transition-all hover:shadow-md">
                                <div className="p-4 sm:p-5 bg-muted/20 border-b flex flex-wrap items-center justify-between gap-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-black text-lg border border-primary/20">
                                            {plan.day_of_week}
                                        </div>
                                        <div>
                                            <h4 className="font-black uppercase tracking-tight text-foreground">{plan.title}</h4>
                                            <p className="text-[10px] sm:text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                                                <Activity className="w-3 h-3" />
                                                {plan.workout_blocks?.length || 0} Bloques de Ejercicio
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <div className="p-3 sm:p-5 space-y-3">
                                    {plan.workout_blocks?.sort((a: any, b: any) => a.order_in_plan - b.order_in_plan).map((block: any, idx: number) => (
                                        <div key={block.id} className="flex gap-3 sm:gap-4 p-3 rounded-xl bg-background border border-border/50 hover:border-primary/30 transition-colors group/block">
                                            <div className="w-6 h-6 rounded-md bg-muted flex items-center justify-center text-[10px] font-black text-muted-foreground group-hover/block:bg-primary/10 group-hover/block:text-primary transition-colors shrink-0">
                                                {idx + 1}
                                            </div>
                                            <div className="flex-1 min-w-0 space-y-1 sm:space-y-2">
                                                <div className="flex items-start justify-between gap-2">
                                                    <p className="text-sm font-bold text-foreground truncate">{block.exercises?.name}</p>
                                                    <div className="flex items-center gap-1.5 shrink-0 bg-secondary/50 px-2 py-0.5 rounded text-[10px] font-bold text-muted-foreground">
                                                        <Play className="w-3 h-3" />
                                                        {block.sets} × {block.reps}
                                                    </div>
                                                </div>
                                                {block.notes && (
                                                    <p className="text-[10px] sm:text-xs text-muted-foreground italic line-clamp-2">{block.notes}</p>
                                                )}
                                                {block.rest_time_seconds > 0 && (
                                                    <div className="inline-flex items-center gap-1 text-[9px] sm:text-[10px] font-bold text-primary bg-primary/5 px-2 py-0.5 rounded-full border border-primary/10">
                                                        <Zap className="w-3 h-3" />
                                                        {block.rest_time_seconds}s pausa
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                    {(!plan.workout_blocks || plan.workout_blocks.length === 0) && (
                                        <div className="py-8 text-center bg-muted/10 rounded-xl border border-dashed">
                                            <p className="text-xs font-medium text-muted-foreground">Día de descanso activo / Sin ejercicios</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                        {(!program.workout_plans || program.workout_plans.length === 0) && (
                            <div className="py-20 text-center space-y-3 bg-muted/10 rounded-2xl border border-dashed">
                                <Activity className="w-10 h-10 text-muted-foreground/30 mx-auto" />
                                <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Protocolo Vacío</p>
                            </div>
                        )}
                    </div>
                    
                    <div className="p-4 bg-muted/30 border-t flex justify-end">
                        <Button variant="outline" onClick={() => setIsOpen(false)} className="rounded-xl font-semibold">
                            Cerrar Vista Previa
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    )
}
