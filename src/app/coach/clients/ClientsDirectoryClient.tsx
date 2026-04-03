'use client'

import { useState, useMemo } from 'react'
import { Search, Filter, TrendingUp, Users } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { GlassButton } from '@/components/ui/glass-button'
import { GlassCard } from '@/components/ui/glass-card'
import { ClientCard } from '@/components/coach/ClientCard'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuCheckboxItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface ClientsDirectoryClientProps {
    clients: any[]
    coach: any
    appUrl: string
}

export function ClientsDirectoryClient({ clients, coach, appUrl }: ClientsDirectoryClientProps) {
    const [search, setSearch] = useState('')
    const [filters, setFilters] = useState({
        active: true,
        paused: true,
        pending: true,
        criticalAdherence: false,
    })

    const filteredClients = useMemo(() => {
        return clients.filter(client => {
            const matchesSearch = 
                client.full_name.toLowerCase().includes(search.toLowerCase()) ||
                client.email.toLowerCase().includes(search.toLowerCase())
            
            const isActive = client.is_active !== false
            const isPaused = client.is_active === false
            const isPending = client.force_password_change

            if (!filters.active && isActive && !isPending) return false
            if (!filters.paused && isPaused) return false
            if (!filters.pending && isPending) return false
            
            return matchesSearch
        })
    }, [clients, search, filters])

    return (
        <div className="space-y-12">
            {/* List Controls */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 relative z-20">
                <div className="relative w-full md:w-96">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input 
                        placeholder="Buscar unidad por nombre o email..." 
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-11 h-12 bg-white/50 dark:bg-white/[0.03] border-border/50 dark:border-white/10 rounded-2xl backdrop-blur-md focus:ring-primary/20 transition-all font-medium"
                    />
                </div>
                
                <div className="flex items-center gap-3 w-full md:w-auto">
                    <DropdownMenu>
                        <DropdownMenuTrigger className="flex-1 md:flex-none border-primary/10">
                            <Filter className="w-4 h-4 mr-2" />
                            <span className="font-bold uppercase tracking-widest text-[10px]">Filtros</span>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56 bg-white/80 dark:bg-zinc-950 backdrop-blur-xl border-border/50 dark:border-white/10 rounded-2xl p-2 shadow-2xl">
                            <DropdownMenuLabel className="text-[10px] font-black uppercase tracking-widest p-2 opacity-50">Estado</DropdownMenuLabel>
                            <DropdownMenuCheckboxItem 
                                checked={filters.active} 
                                onCheckedChange={(v: boolean) => setFilters(f => ({ ...f, active: v }))}
                                className="rounded-lg text-xs font-bold uppercase tracking-wider"
                            >
                                Activos
                            </DropdownMenuCheckboxItem>
                            <DropdownMenuCheckboxItem 
                                checked={filters.pending} 
                                onCheckedChange={(v: boolean) => setFilters(f => ({ ...f, pending: v }))}
                                className="rounded-lg text-xs font-bold uppercase tracking-wider"
                            >
                                Pendientes Sync
                            </DropdownMenuCheckboxItem>
                            <DropdownMenuCheckboxItem 
                                checked={filters.paused} 
                                onCheckedChange={(v: boolean) => setFilters(f => ({ ...f, paused: v }))}
                                className="rounded-lg text-xs font-bold uppercase tracking-wider"
                            >
                                Pausados
                            </DropdownMenuCheckboxItem>
                            <DropdownMenuSeparator className="bg-border/50 dark:bg-white/5" />
                            <DropdownMenuLabel className="text-[10px] font-black uppercase tracking-widest p-2 opacity-50">Alertas</DropdownMenuLabel>
                            <DropdownMenuCheckboxItem 
                                checked={filters.criticalAdherence} 
                                onCheckedChange={(v: boolean) => setFilters(f => ({ ...f, criticalAdherence: v }))}
                                className="rounded-lg text-xs font-bold uppercase tracking-wider text-rose-500 focus:text-rose-500"
                            >
                                Adherencia Baja (70%)
                            </DropdownMenuCheckboxItem>
                        </DropdownMenuContent>
                    </DropdownMenu>

                    <GlassButton className="flex-1 md:flex-none h-12 px-6 border border-primary/10">
                        <TrendingUp className="w-4 h-4 mr-2" />
                        <span className="font-bold uppercase tracking-widest text-[10px]">Ordenar</span>
                    </GlassButton>
                </div>
            </div>

            {/* Main Directory */}
            {filteredClients.length === 0 ? (
                <GlassCard className="flex flex-col items-center justify-center py-32 text-center">
                    <div className="w-20 h-20 rounded-3xl bg-white/5 border border-white/10 flex items-center justify-center mb-6 shadow-2xl">
                        <Users className="w-10 h-10 text-muted-foreground opacity-20" />
                    </div>
                    <h3 className="text-xl font-black text-foreground uppercase tracking-tighter mb-2 font-display">
                        Sin resultados
                    </h3>
                    <p className="text-muted-foreground text-sm max-w-xs font-medium leading-relaxed">
                        No se han encontrado alumnos que coincidan con los filtros aplicados.
                    </p>
                </GlassCard>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-6 md:gap-8 relative z-10">
                    {filteredClients.map((client) => {
                        let subscriptionDaysRemaining = null
                        if (client.subscription_start_date) {
                            const start = new Date(client.subscription_start_date)
                            const end = new Date(start)
                            end.setMonth(end.getMonth() + 1)
                            const diff = Math.ceil((end.getTime() - new Date().getTime()) / (1000 * 3600 * 24))
                            subscriptionDaysRemaining = diff
                        }

                        const loginUrl = coach && appUrl ? `${appUrl}/c/${coach.slug}/login` : ''
                        const whatsappLink = client.phone 
                            ? `https://wa.me/${client.phone.replace(/\D/g, '')}?text=${encodeURIComponent(`Hola ${client.full_name}, aquí tienes tu link de acceso a la app: ${loginUrl}`)}`
                            : '#'
                        
                        const activeProgram = client.workout_programs?.find((p: any) => p.is_active);
                        
                        return (
                            <ClientCard 
                                key={client.id}
                                client={client}
                                loginUrl={loginUrl}
                                whatsappLink={whatsappLink}
                                subscriptionDaysRemaining={subscriptionDaysRemaining}
                                remainingDays={15} // Mock
                                activeProgramName={activeProgram?.name || null}
                            />
                        )
                    })}
                </div>
            )}
        </div>
    )
}
