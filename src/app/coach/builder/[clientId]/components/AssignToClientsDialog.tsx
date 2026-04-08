'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, Users, Check } from 'lucide-react'
import { getCoachClientsAction, assignProgramToClientsAction } from '../actions'
import { toast } from 'sonner'

interface Client {
    id: string
    full_name: string | null
    avatar_url: string | null
}

interface AssignToClientsDialogProps {
    open: boolean
    onClose: () => void
    programId: string
    programName: string
}

export function AssignToClientsDialog({ open, onClose, programId, programName }: AssignToClientsDialogProps) {
    const [clients, setClients] = useState<Client[]>([])
    const [loading, setLoading] = useState(false)
    const [selected, setSelected] = useState<string[]>([])
    const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0])
    const [flexibleStart, setFlexibleStart] = useState(true)
    const [assigning, setAssigning] = useState(false)
    const [search, setSearch] = useState('')

    useEffect(() => {
        if (!open) return
        setLoading(true)
        setSelected([])
        getCoachClientsAction().then(result => {
            setClients(result.data || [])
            setLoading(false)
        })
    }, [open])

    const filtered = search
        ? clients.filter(c => c.full_name?.toLowerCase().includes(search.toLowerCase()))
        : clients

    function toggleClient(id: string) {
        setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
    }

    async function handleAssign() {
        if (selected.length === 0) return
        setAssigning(true)
        const result = await assignProgramToClientsAction(
            programId,
            selected,
            flexibleStart ? undefined : startDate
        )
        if (result.error) {
            toast.error(result.error)
        } else {
            toast.success(`Programa asignado a ${selected.length} cliente${selected.length !== 1 ? 's' : ''}`)
            setSelected([])
            onClose()
        }
        setAssigning(false)
    }

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-md bg-background/95 backdrop-blur-2xl border border-border shadow-2xl">
                <DialogHeader>
                    <DialogTitle className="text-sm font-display uppercase tracking-[0.2em] text-foreground">
                        Asignar a Clientes
                    </DialogTitle>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        {programName}
                    </p>
                </DialogHeader>

                <div className="mt-2 space-y-4">
                    {/* Búsqueda */}
                    <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Buscar cliente..."
                        className="w-full h-10 px-4 text-sm rounded-xl bg-muted border border-border text-foreground focus:border-primary focus:outline-none transition-all placeholder:text-muted-foreground"
                    />

                    {/* Lista de clientes */}
                    <div className="max-h-[40vh] overflow-y-auto space-y-1.5 pr-1">
                        {loading ? (
                            <div className="flex justify-center py-8">
                                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                            </div>
                        ) : filtered.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground">
                                <Users className="w-8 h-8 mx-auto mb-2 opacity-20" />
                                <p className="text-xs font-bold uppercase tracking-widest opacity-40">Sin clientes</p>
                            </div>
                        ) : (
                            filtered.map(client => {
                                const isSelected = selected.includes(client.id)
                                return (
                                    <button
                                        key={client.id}
                                        onClick={() => toggleClient(client.id)}
                                        className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${
                                            isSelected
                                                ? 'border-primary/50 bg-primary/10 text-primary'
                                                : 'border-border bg-muted/20 hover:bg-muted/50 text-foreground'
                                        }`}
                                    >
                                        {/* Avatar */}
                                        <div className="w-8 h-8 rounded-full bg-muted border border-border flex items-center justify-center overflow-hidden shrink-0">
                                            {client.avatar_url ? (
                                                <img src={client.avatar_url} alt="" className="w-full h-full object-cover" />
                                            ) : (
                                                <span className="text-xs font-bold text-muted-foreground">
                                                    {client.full_name?.charAt(0) || '?'}
                                                </span>
                                            )}
                                        </div>
                                        <span className="flex-1 text-xs font-bold uppercase tracking-widest truncate">
                                            {client.full_name || 'Sin nombre'}
                                        </span>
                                        {isSelected && <Check className="w-4 h-4 shrink-0" />}
                                    </button>
                                )
                            })
                        )}
                    </div>

                    {/* Fecha de inicio */}
                    <div className="space-y-2 border-t border-border pt-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={flexibleStart}
                                onChange={e => setFlexibleStart(e.target.checked)}
                                className="rounded border-border accent-primary h-4 w-4"
                            />
                            <span className="text-xs font-medium text-muted-foreground">
                                Inicio flexible (el cliente decide)
                            </span>
                        </label>
                        {!flexibleStart && (
                            <Input
                                type="date"
                                value={startDate}
                                onChange={e => setStartDate(e.target.value)}
                                className="h-10 bg-background border-border text-foreground font-bold text-sm"
                            />
                        )}
                    </div>

                    {/* Acción */}
                    <Button
                        onClick={handleAssign}
                        disabled={selected.length === 0 || assigning}
                        className="w-full h-11 text-xs font-bold uppercase tracking-[0.2em]"
                        style={{ backgroundColor: 'var(--theme-primary, #007AFF)' }}
                    >
                        {assigning ? (
                            <><Loader2 className="w-4 h-4 animate-spin mr-2" />Asignando...</>
                        ) : selected.length === 0 ? (
                            'Selecciona clientes'
                        ) : (
                            `Asignar a ${selected.length} cliente${selected.length !== 1 ? 's' : ''}`
                        )}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}
