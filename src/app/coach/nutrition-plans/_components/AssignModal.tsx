'use client'

import { useEffect, useRef, useState } from 'react'
import { Search, Users, Check, AlertTriangle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { assignTemplateToClients } from '../_actions/nutrition-coach.actions'
import { toast } from 'sonner'

export type AssignModalClient = {
  id: string
  full_name: string
  active_plan?: { id: string; name: string }
}

export type AssignModalTemplate = {
  id: string
  name: string
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  template: AssignModalTemplate | null
  coachId: string
  clients: AssignModalClient[]
  onAssigned?: () => void
}

export function AssignModal({ open, onOpenChange, template, coachId, clients, onAssigned }: Props) {
  const [selectedClients, setSelectedClients] = useState<string[]>([])
  const [isAssigning, setIsAssigning] = useState(false)
  const [clientSearchTerm, setClientSearchTerm] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const [themeColor, setThemeColor] = useState('')

  useEffect(() => {
    if (!open) {
      setSelectedClients([])
      setClientSearchTerm('')
    }
  }, [open])

  useEffect(() => {
    if (containerRef.current) {
      const color = getComputedStyle(containerRef.current).getPropertyValue('--theme-primary')
      if (color) setThemeColor(color.trim())
    }
  }, [open])

  const filteredClients = clients.filter((c) =>
    c.full_name.toLowerCase().includes(clientSearchTerm.toLowerCase())
  )

  const toggleClientSelection = (clientId: string) => {
    setSelectedClients((prev) =>
      prev.includes(clientId) ? prev.filter((id) => id !== clientId) : [...prev, clientId]
    )
  }

  const handleAssignTemplate = async () => {
    if (!template || selectedClients.length === 0) return
    setIsAssigning(true)
    try {
      const result = await assignTemplateToClients(template.id, coachId, selectedClients)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success(`Plantilla asignada correctamente a ${selectedClients.length} alumno(s)`)
        onOpenChange(false)
        onAssigned?.()
      }
    } finally {
      setIsAssigning(false)
    }
  }

  const someClientHasActivePlan = selectedClients.some((clientId) => {
    const client = clients.find((c) => c.id === clientId)
    return client && client.active_plan
  })

  return (
    <div ref={containerRef}>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="sm:max-w-md bg-white dark:bg-zinc-950 border-slate-200 dark:border-white/10 p-6"
          style={{ '--theme-primary': themeColor || 'inherit' } as React.CSSProperties}
        >
          <DialogHeader className="mb-2">
            <DialogTitle className="text-xl font-black uppercase tracking-tight flex items-center gap-2">
              <Users className="w-5 h-5" style={{ color: 'var(--theme-primary)' }} />
              Asignar protocolo
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            <div
              className="p-4 rounded-xl border bg-primary/5 border-primary/10"
              style={{
                backgroundColor: 'color-mix(in srgb, var(--theme-primary) 5%, transparent)',
                borderColor: 'color-mix(in srgb, var(--theme-primary) 10%, transparent)',
              }}
            >
              <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--theme-primary)' }}>
                Plantilla seleccionada
              </p>
              <p className="text-base font-black text-slate-900 dark:text-white">{template?.name}</p>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Alumnos ({selectedClients.length})
                </Label>
                {clients.length > 0 && (
                  <button
                    type="button"
                    className="text-[10px] font-bold hover:underline"
                    style={{ color: 'var(--theme-primary)' }}
                    onClick={() => {
                      if (selectedClients.length === clients.length) {
                        setSelectedClients([])
                      } else {
                        setSelectedClients(clients.map((c) => c.id))
                      }
                    }}
                  >
                    {selectedClients.length === clients.length ? 'Deseleccionar todos' : 'Seleccionar todos'}
                  </button>
                )}
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nombre…"
                  value={clientSearchTerm}
                  onChange={(e) => setClientSearchTerm(e.target.value)}
                  className="pl-9 h-10 bg-slate-50 dark:bg-black/20 border-slate-200 dark:border-white/10"
                />
              </div>

              <div className="max-h-[300px] overflow-y-auto space-y-1.5 pr-2 custom-scrollbar">
                {filteredClients.length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground border rounded-xl border-dashed">
                    No hay alumnos que coincidan
                  </div>
                ) : (
                  filteredClients.map((client) => {
                    const isSelected = selectedClients.includes(client.id)
                    return (
                      <div
                        key={client.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => toggleClientSelection(client.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            toggleClientSelection(client.id)
                          }
                        }}
                        className={cn(
                          'flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all',
                          isSelected
                            ? 'border-transparent'
                            : 'bg-white dark:bg-zinc-900 border-slate-100 dark:border-white/5 hover:border-slate-300 dark:hover:border-slate-700'
                        )}
                        style={
                          isSelected
                            ? {
                                backgroundColor: 'color-mix(in srgb, var(--theme-primary) 5%, transparent)',
                                borderColor: 'color-mix(in srgb, var(--theme-primary) 20%, transparent)',
                              }
                            : {}
                        }
                      >
                        <div
                          className={cn(
                            'w-5 h-5 rounded-md border flex items-center justify-center transition-colors shrink-0',
                            isSelected
                              ? 'border-transparent'
                              : 'border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-zinc-800'
                          )}
                          style={
                            isSelected
                              ? { backgroundColor: 'var(--theme-primary)', borderColor: 'var(--theme-primary)' }
                              : {}
                          }
                        >
                          {isSelected && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-sm truncate text-slate-900 dark:text-white">{client.full_name}</p>
                          {client.active_plan && (
                            <p className="text-[10px] text-amber-600 dark:text-amber-500 font-medium">
                              Plan activo: {client.active_plan.name} (se reemplazará)
                            </p>
                          )}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>

              {someClientHasActivePlan && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex gap-3 text-amber-700 dark:text-amber-500 animate-in fade-in">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <p className="text-xs font-medium">
                    Algunos alumnos ya tienen un plan activo. Será <span className="font-bold">reemplazado</span> por esta
                    plantilla.
                  </p>
                </div>
              )}
            </div>

            <Button
              className="h-12 w-full gap-2 border-none font-black uppercase tracking-widest text-white shadow-lg transition-all hover:opacity-90"
              disabled={isAssigning || selectedClients.length === 0}
              onClick={handleAssignTemplate}
              style={{ backgroundColor: 'var(--theme-primary)' }}
            >
              {isAssigning ?
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              : null}
              {isAssigning
                ? 'Procesando…'
                : `Asignar${selectedClients.length > 0 ? ` (${selectedClients.length})` : ''}`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
