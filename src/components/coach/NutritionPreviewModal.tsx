'use client'

import * as React from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Apple, Eye } from 'lucide-react'
import { GlassButton } from '@/components/ui/glass-button'

interface NutritionPreviewModalProps {
    plan: any
    children?: React.ReactNode
}

export function NutritionPreviewModal({ plan, children }: NutritionPreviewModalProps) {
    const [isOpen, setIsOpen] = React.useState(false)

    if (!plan) return <>{children}</>

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
                                <Apple className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
                                <span className="text-foreground">Vista Previa Nutrición</span>
                                <span className="text-sm font-medium text-muted-foreground">{plan.name}</span>
                            </DialogTitle>
                            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                                Contenido de Solo Lectura
                            </p>
                        </div>
                    </div>

                    <div className="p-6 space-y-6">
                        {/* Resumen de Macros */}
                        <div className="grid grid-cols-4 gap-2 md:gap-4">
                            <div className="bg-primary/10 border border-primary/20 rounded-xl p-3 md:p-4 flex flex-col items-center gap-1">
                                <span className="text-[10px] md:text-xs font-black text-primary uppercase tracking-widest">KCAL</span>
                                <span className="text-sm md:text-lg font-black text-foreground">{plan.daily_calories || 0}</span>
                            </div>
                            <div className="bg-white/5 border border-white/10 rounded-xl p-3 md:p-4 flex flex-col items-center gap-1">
                                <span className="text-[10px] md:text-xs font-black text-muted-foreground uppercase tracking-widest">PRO</span>
                                <span className="text-sm md:text-lg font-black text-foreground">{plan.protein_g || 0}g</span>
                            </div>
                            <div className="bg-white/5 border border-white/10 rounded-xl p-3 md:p-4 flex flex-col items-center gap-1">
                                <span className="text-[10px] md:text-xs font-black text-muted-foreground uppercase tracking-widest">CAR</span>
                                <span className="text-sm md:text-lg font-black text-foreground">{plan.carbs_g || 0}g</span>
                            </div>
                            <div className="bg-white/5 border border-white/10 rounded-xl p-3 md:p-4 flex flex-col items-center gap-1">
                                <span className="text-[10px] md:text-xs font-black text-muted-foreground uppercase tracking-widest">FAT</span>
                                <span className="text-sm md:text-lg font-black text-foreground">{plan.fats_g || 0}g</span>
                            </div>
                        </div>

                        {/* Lista de Comidas */}
                        {plan.meals && plan.meals.length > 0 ? (
                            <div className="space-y-4">
                                {plan.meals.map((meal: any, index: number) => (
                                    <div key={index} className="bg-card border rounded-2xl p-4 sm:p-5 shadow-sm">
                                        <h4 className="font-black uppercase tracking-tight text-foreground mb-3">{meal.name || `Comida ${index + 1}`}</h4>
                                        <div className="space-y-2">
                                            {meal.foods && meal.foods.map((food: any, idx: number) => (
                                                <div key={idx} className="flex justify-between items-center bg-background border border-border/50 p-2 sm:p-3 rounded-xl">
                                                    <span className="text-xs sm:text-sm font-medium text-foreground">{food.name}</span>
                                                    <span className="text-xs sm:text-sm font-bold text-muted-foreground">{food.amount} {food.unit}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="py-20 text-center space-y-3 bg-muted/10 rounded-2xl border border-dashed">
                                <Apple className="w-10 h-10 text-muted-foreground/30 mx-auto" />
                                <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Protocolo sin comidas detalladas</p>
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
