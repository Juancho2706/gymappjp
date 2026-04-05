'use client'

import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Users, ChevronRight, Calculator } from 'lucide-react'
import Link from 'next/link'

interface Props {
    clients: any[]
}

export function NutritionActivePlans({ clients }: Props) {
    if (!clients || clients.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-20 bg-muted/30 rounded-3xl border-2 border-dashed border-border/50">
                <Users className="w-12 h-12 text-muted-foreground/30 mb-4" />
                <p className="text-muted-foreground font-medium">No hay alumnos con planes activos</p>
            </div>
        )
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {clients.map((client) => (
                <Card key={client.id} className="group relative overflow-hidden border-border/50 bg-card/50 backdrop-blur-sm hover:border-primary/50 transition-all duration-300">
                    <div className="p-6">
                        <div className="flex items-start justify-between mb-4">
                            <div className="space-y-1">
                                <h3 className="font-bold text-lg leading-none tracking-tight">{client.full_name}</h3>
                                <div className="flex items-center gap-2">
                                    <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border-none text-[10px] font-black uppercase">
                                        Activo
                                    </Badge>
                                </div>
                            </div>
                            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                                {client.full_name.charAt(0)}
                            </div>
                        </div>

                        {client.active_plan ? (
                            <div className="space-y-4">
                                <div className="p-3 rounded-xl bg-muted/50 border border-border/50">
                                    <p className="text-[10px] font-black uppercase text-muted-foreground mb-1">Plan Actual</p>
                                    <p className="font-bold text-sm truncate">{client.active_plan.name}</p>
                                </div>
                                
                                <Link href={`/coach/nutrition-builder/${client.id}?planId=${client.active_plan.id}`}>
                                    <Button variant="outline" className="w-full justify-between group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                                        Gestionar Plan
                                        <ChevronRight className="w-4 h-4" />
                                    </Button>
                                </Link>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="p-3 rounded-xl bg-muted/50 border border-border/50">
                                    <p className="text-xs text-muted-foreground italic">Sin plan asignado</p>
                                </div>
                                <Link href={`/coach/nutrition-builder/${client.id}`}>
                                    <Button className="w-full gap-2">
                                        <Calculator className="w-4 h-4" />
                                        Crear Plan
                                    </Button>
                                </Link>
                            </div>
                        )}
                    </div>
                </Card>
            ))}
        </div>
    )
}
