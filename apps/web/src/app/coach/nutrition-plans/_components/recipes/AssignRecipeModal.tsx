'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { Search, Users, Check, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
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

export function AssignRecipeModal({ open, onOpenChange, recipe, clients, onAssigned }: Props) {
  const [selected, setSelected] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [pending, startTransition] = useTransition()
  const containerRef = useRef<HTMLDivElement>(null)
  const [themeColor, setThemeColor] = useState('')

  useEffect(() => {
    if (!open) {
      setSelected([])
      setSearch('')
    }
  }, [open])

  useEffect(() => {
    if (containerRef.current) {
      const color = getComputedStyle(containerRef.current).getPropertyValue('--theme-primary')
      if (color) setThemeColor(color.trim())
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
              Compartir receta
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            <div
              className="p-4 rounded-xl border"
              style={{
                backgroundColor: 'color-mix(in srgb, var(--theme-primary) 5%, transparent)',
                borderColor: 'color-mix(in srgb, var(--theme-primary) 10%, transparent)',
              }}
            >
              <p
                className="text-xs font-bold uppercase tracking-widest mb-1"
                style={{ color: 'var(--theme-primary)' }}
              >
                Receta seleccionada
              </p>
              <p className="text-base font-black text-slate-900 dark:text-white">{recipe?.name}</p>
            </div>

            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Ideas de recetas — inspiración para tus alumnos. No afectan macros ni adherencia.
            </p>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Alumnos ({selected.length})
                </Label>
                {clients.length > 0 && (
                  <button
                    type="button"
                    className="text-[10px] font-bold hover:underline"
                    style={{ color: 'var(--theme-primary)' }}
                    onClick={() =>
                      setSelected(selected.length === clients.length ? [] : clients.map((c) => c.id))
                    }
                  >
                    {selected.length === clients.length ? 'Deseleccionar todos' : 'Seleccionar todos'}
                  </button>
                )}
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nombre…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 h-10 bg-slate-50 dark:bg-black/20 border-slate-200 dark:border-white/10"
                />
              </div>

              <div className="max-h-[300px] overflow-y-auto space-y-1.5 pr-2 custom-scrollbar">
                {filtered.length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground border rounded-xl border-dashed">
                    No hay alumnos que coincidan
                  </div>
                ) : (
                  filtered.map((client) => {
                    const isSelected = selected.includes(client.id)
                    return (
                      <div
                        key={client.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => toggle(client.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            toggle(client.id)
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
                        <p className="font-bold text-sm truncate text-slate-900 dark:text-white min-w-0 flex-1">
                          {client.full_name}
                        </p>
                      </div>
                    )
                  })
                )}
              </div>
            </div>

            <Button
              className="h-12 w-full gap-2 border-none font-black uppercase tracking-widest text-white shadow-lg transition-all hover:opacity-90"
              disabled={pending || selected.length === 0}
              onClick={handleAssign}
              style={{ backgroundColor: 'var(--theme-primary)' }}
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              {pending ? 'Procesando…' : `Compartir${selected.length > 0 ? ` (${selected.length})` : ''}`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
