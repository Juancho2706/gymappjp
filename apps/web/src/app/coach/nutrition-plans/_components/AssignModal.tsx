'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import { Search, ClipboardList, Check, AlertTriangle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
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
  /** IDs de clientes que ya tienen esta plantilla como plan activo */
  assigned_client_ids?: string[]
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  template: AssignModalTemplate | null
  coachId: string
  clients: AssignModalClient[]
  onAssigned?: () => void
}

function subscribeMd(cb: () => void) {
  const mq = window.matchMedia('(min-width: 768px)')
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}

/** matchMedia md-up (mismo patrón que WorkoutProgramsClient): desktop → Dialog, móvil → bottom-sheet. */
function useIsDesktopMd() {
  return useSyncExternalStore(
    subscribeMd,
    () => window.matchMedia('(min-width: 768px)').matches,
    () => true,
  )
}

function initialsOf(name?: string | null): string {
  return (
    (name ?? '')
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase() || '?'
  )
}

export function AssignModal({ open, onOpenChange, template, coachId, clients, onAssigned }: Props) {
  const [selectedClients, setSelectedClients] = useState<string[]>([])
  const [isAssigning, setIsAssigning] = useState(false)
  const [clientSearchTerm, setClientSearchTerm] = useState('')
  const isDesktop = useIsDesktopMd()

  useEffect(() => {
    if (!open) {
      setSelectedClients([])
      setClientSearchTerm('')
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
    return client && client.active_plan && !(template?.assigned_client_ids?.includes(clientId) ?? false)
  })

  const header = (
    <div className="flex items-center gap-2.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[var(--sport-100)] text-[var(--sport-600)]">
        <ClipboardList className="h-[18px] w-[18px]" />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-subtle">Asignar plantilla</p>
        <h2 className="truncate font-display text-[17px] font-extrabold tracking-[-0.01em] text-strong">
          {template?.name}
        </h2>
      </div>
    </div>
  )

  const body = (
    <div className="space-y-3">
      {someClientHasActivePlan && (
        <div
          className="flex items-start gap-2 rounded-[10px] px-3 py-2.5 text-xs"
          style={{ backgroundColor: 'var(--warning-100)', color: 'var(--warning-700)' }}
        >
          <AlertTriangle className="mt-0.5 h-[15px] w-[15px] shrink-0" />
          <span>Algunos alumnos ya tienen un plan activo. Será reemplazado por esta plantilla.</span>
        </div>
      )}

      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-muted">Alumnos ({selectedClients.length})</span>
        {clients.length > 0 && (
          <button
            type="button"
            className="eva-press text-[12.5px] font-bold text-[var(--sport-600)]"
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
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--text-subtle)]" />
        <Input
          placeholder="Buscar por nombre…"
          value={clientSearchTerm}
          onChange={(e) => setClientSearchTerm(e.target.value)}
          className="h-10 rounded-control border-default bg-surface-card pl-9 placeholder:text-muted"
        />
      </div>

      <div className="max-h-[300px] space-y-2 overflow-y-auto pr-1">
        {filteredClients.length === 0 ? (
          <div className="rounded-control border border-dashed border-default p-6 text-center text-sm text-muted">
            No hay alumnos que coincidan
          </div>
        ) : (
          filteredClients.map((client) => {
            const isSelected = selectedClients.includes(client.id)
            const alreadyHasThisTemplate = template?.assigned_client_ids?.includes(client.id) ?? false
            return (
              <button
                key={client.id}
                type="button"
                onClick={() => toggleClientSelection(client.id)}
                className={cn(
                  'flex w-full items-center gap-[11px] rounded-control border-[1.5px] px-3 py-2.5 text-left transition-colors',
                  isSelected
                    ? 'border-[color:var(--sport-500)] bg-[var(--sport-100)]'
                    : 'border-subtle bg-surface-card hover:border-default'
                )}
              >
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-display text-[11.5px] font-extrabold tracking-[-0.02em]"
                  style={{ background: 'var(--surface-inverse)', color: 'var(--sport-400)' }}
                >
                  {initialsOf(client.full_name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-strong">{client.full_name}</span>
                  <span
                    className="block truncate text-[11.5px]"
                    style={{
                      color: alreadyHasThisTemplate
                        ? 'var(--sport-600)'
                        : client.active_plan
                          ? 'var(--warning-700)'
                          : 'var(--text-subtle)',
                    }}
                  >
                    {alreadyHasThisTemplate
                      ? 'Ya tiene esta plantilla · reasignar actualiza'
                      : client.active_plan
                        ? `Plan activo: ${client.active_plan.name} · se reemplaza`
                        : 'Sin plan activo'}
                  </span>
                </span>
                <span
                  className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-2"
                  style={
                    isSelected
                      ? { backgroundColor: 'var(--sport-500)', borderColor: 'var(--sport-500)' }
                      : { borderColor: 'var(--border-default)' }
                  }
                >
                  {isSelected && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                </span>
              </button>
            )
          })
        )}
      </div>
    </div>
  )

  const cta = (
    <Button
      variant="sport"
      size="lg"
      className="w-full"
      disabled={isAssigning || selectedClients.length === 0}
      onClick={handleAssignTemplate}
    >
      {isAssigning ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
      {isAssigning ? 'Procesando…' : `Asignar (${selectedClients.length})`}
    </Button>
  )

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="border-subtle bg-surface-card p-6 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="sr-only">Asignar plantilla</DialogTitle>
          </DialogHeader>
          {header}
          <div className="mt-1">{body}</div>
          <div className="mt-2">{cta}</div>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="max-h-[min(88dvh,88svh)] gap-0 rounded-t-sheet border-subtle bg-surface-card p-0 text-body"
      >
        <div className="flex max-h-[min(88dvh,88svh)] flex-col overflow-y-auto overscroll-contain px-[max(1.25rem,env(safe-area-inset-left))] pb-[max(1.5rem,env(safe-area-inset-bottom))] pr-[max(1.25rem,env(safe-area-inset-right))] pt-3">
          <div className="mx-auto mb-3 h-1 w-9 shrink-0 rounded-full bg-[var(--border-strong)]" aria-hidden="true" />
          <SheetHeader className="border-0 bg-transparent p-0">
            <SheetTitle className="sr-only">Asignar plantilla</SheetTitle>
          </SheetHeader>
          {header}
          <div className="mt-3">{body}</div>
          <div className="mt-4">{cta}</div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
