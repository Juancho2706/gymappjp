'use client'

import { useEffect, useState, useSyncExternalStore, useTransition } from 'react'
import { Search, ChefHat, Check, Loader2 } from 'lucide-react'
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
import { assignRecipeAction } from '../../_actions/recipes.actions'
import type { RecipeRow } from '@/services/nutrition-recipes.service'
import { toast } from 'sonner'

export type RecipeAssignClient = {
  id: string
  full_name: string
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  recipe: RecipeRow | null
  clients: RecipeAssignClient[]
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

export function AssignRecipeModal({ open, onOpenChange, recipe, clients, onAssigned }: Props) {
  const [selected, setSelected] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [pending, startTransition] = useTransition()
  const isDesktop = useIsDesktopMd()

  useEffect(() => {
    if (!open) {
      setSelected([])
      setSearch('')
    }
  }, [open])

  const filtered = clients.filter((c) => c.full_name.toLowerCase().includes(search.toLowerCase()))

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  const handleAssign = () => {
    if (!recipe || selected.length === 0) return
    startTransition(async () => {
      const res = await assignRecipeAction({ recipeId: recipe.id, clientIds: selected })
      if (!res.success) {
        toast.error(res.error ?? 'No se pudo asignar la receta.')
        return
      }
      toast.success(`Receta compartida con ${selected.length} alumno(s)`)
      onOpenChange(false)
      onAssigned?.()
    })
  }

  const header = (
    <div className="flex items-center gap-2.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[var(--ember-100)] text-[var(--ember-700)]">
        <ChefHat className="h-[18px] w-[18px]" />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-subtle">Compartir receta</p>
        <h2 className="truncate font-display text-[17px] font-extrabold tracking-[-0.01em] text-strong">
          {recipe?.name}
        </h2>
      </div>
    </div>
  )

  const body = (
    <div className="space-y-3">
      <p className="text-xs leading-relaxed text-muted">
        La receta aparece como inspiración en el perfil del alumno. No afecta macros ni adherencia.
      </p>

      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-muted">Alumnos ({selected.length})</span>
        {clients.length > 0 && (
          <button
            type="button"
            className="eva-press text-[12.5px] font-bold text-[var(--ember-600)]"
            onClick={() =>
              setSelected(selected.length === clients.length ? [] : clients.map((c) => c.id))
            }
          >
            {selected.length === clients.length ? 'Deseleccionar todos' : 'Seleccionar todos'}
          </button>
        )}
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--text-subtle)]" />
        <Input
          placeholder="Buscar por nombre…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-10 rounded-control border-default bg-surface-card pl-9 placeholder:text-muted"
        />
      </div>

      <div className="max-h-[300px] space-y-2 overflow-y-auto pr-1">
        {filtered.length === 0 ? (
          <div className="rounded-control border border-dashed border-default p-6 text-center text-sm text-muted">
            No hay alumnos que coincidan
          </div>
        ) : (
          filtered.map((client) => {
            const isSelected = selected.includes(client.id)
            return (
              <button
                key={client.id}
                type="button"
                onClick={() => toggle(client.id)}
                className={cn(
                  'flex w-full items-center gap-[11px] rounded-control border-[1.5px] px-3 py-2.5 text-left transition-colors',
                  isSelected
                    ? 'border-[color:var(--ember-500)] bg-[var(--ember-100)]'
                    : 'border-subtle bg-surface-card hover:border-default'
                )}
              >
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-display text-[11.5px] font-extrabold tracking-[-0.02em]"
                  style={{ background: 'var(--surface-inverse)', color: 'var(--sport-400)' }}
                >
                  {initialsOf(client.full_name)}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-bold text-strong">
                  {client.full_name}
                </span>
                <span
                  className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-2"
                  style={
                    isSelected
                      ? { backgroundColor: 'var(--ember-500)', borderColor: 'var(--ember-500)' }
                      : { borderColor: 'var(--border-default)' }
                  }
                >
                  {isSelected && <Check className="h-3 w-3 text-[var(--text-on-ember)]" strokeWidth={3} />}
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
      variant="primary"
      size="lg"
      className="w-full"
      disabled={pending || selected.length === 0}
      onClick={handleAssign}
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
      {pending ? 'Procesando…' : `Compartir (${selected.length})`}
    </Button>
  )

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="border-subtle bg-surface-card p-6 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="sr-only">Compartir receta</DialogTitle>
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
            <SheetTitle className="sr-only">Compartir receta</SheetTitle>
          </SheetHeader>
          {header}
          <div className="mt-3">{body}</div>
          <div className="mt-4">{cta}</div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
