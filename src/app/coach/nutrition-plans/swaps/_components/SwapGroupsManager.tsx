'use client'

import { useState, useTransition, useCallback } from 'react'
import { Plus, Trash2, X, Save, Edit2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { upsertFoodSwapGroup, deleteFoodSwapGroup } from '../../_actions/food-swaps.actions'

interface FoodMini {
  id: string
  name: string
  calories: number
  protein_g: number
  carbs_g: number
  fats_g: number
}

interface SwapGroup {
  id: string
  name: string
  food_ids: string[]
}

interface Props {
  coachId: string
  initialGroups: SwapGroup[]
  allFoods: FoodMini[]
}

export function SwapGroupsManager({ coachId, initialGroups, allFoods }: Props) {
  const [groups, setGroups] = useState<SwapGroup[]>(initialGroups)
  const [isPending, startTransition] = useTransition()
  const [editingId, setEditingId] = useState<string | 'new' | null>(null)
  const [draftName, setDraftName] = useState('')
  const [draftFoodIds, setDraftFoodIds] = useState<string[]>([])
  const [foodSearch, setFoodSearch] = useState('')

  const foodMap = new Map(allFoods.map((f) => [f.id, f]))

  const openNew = () => {
    setEditingId('new')
    setDraftName('')
    setDraftFoodIds([])
    setFoodSearch('')
  }

  const openEdit = (g: SwapGroup) => {
    setEditingId(g.id)
    setDraftName(g.name)
    setDraftFoodIds(g.food_ids)
    setFoodSearch('')
  }

  const cancelEdit = () => {
    setEditingId(null)
    setDraftName('')
    setDraftFoodIds([])
    setFoodSearch('')
  }

  const toggleFood = useCallback((id: string) => {
    setDraftFoodIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }, [])

  const handleSave = () => {
    if (!draftName.trim()) { toast.error('El grupo necesita un nombre'); return }
    if (draftFoodIds.length < 2) { toast.error('Agrega al menos 2 alimentos'); return }
    startTransition(async () => {
      const res = await upsertFoodSwapGroup({
        id: editingId === 'new' ? undefined : editingId ?? undefined,
        coachId,
        name: draftName.trim(),
        foodIds: draftFoodIds,
      })
      if (!res.success) { toast.error(res.error ?? 'Error al guardar'); return }
      toast.success(editingId === 'new' ? 'Grupo creado' : 'Grupo actualizado')
      const saved: SwapGroup = { id: res.id!, name: draftName.trim(), food_ids: draftFoodIds }
      setGroups((prev) =>
        editingId === 'new'
          ? [...prev, saved]
          : prev.map((g) => (g.id === editingId ? saved : g))
      )
      cancelEdit()
    })
  }

  const handleDelete = (groupId: string, groupName: string) => {
    startTransition(async () => {
      const { success } = await deleteFoodSwapGroup(coachId, groupId)
      if (!success) { toast.error('Error al eliminar'); return }
      toast.success(`"${groupName}" eliminado`)
      setGroups((prev) => prev.filter((g) => g.id !== groupId))
    })
  }

  const filteredFoods = allFoods.filter((f) =>
    foodSearch.trim() === '' ? true : f.name.toLowerCase().includes(foodSearch.toLowerCase())
  )

  return (
    <div className="space-y-4">
      {/* Explanation */}
      <div className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3 text-sm text-muted-foreground leading-relaxed">
        Define grupos de alimentos equivalentes (ej. «Proteínas magras» con pollo, pavo y atún).
        Tus alumnos podrán ver las alternativas disponibles para cada alimento en su plan.
      </div>

      {/* Group list */}
      {groups.length === 0 && editingId === null && (
        <div className="rounded-2xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
          Sin grupos aún. Crea el primero.
        </div>
      )}

      {groups.map((g) => (
        <div
          key={g.id}
          className="rounded-2xl border border-border bg-card"
        >
          {editingId === g.id ? (
            <GroupForm
              draftName={draftName}
              setDraftName={setDraftName}
              draftFoodIds={draftFoodIds}
              toggleFood={toggleFood}
              foodSearch={foodSearch}
              setFoodSearch={setFoodSearch}
              filteredFoods={filteredFoods}
              foodMap={foodMap}
              onSave={handleSave}
              onCancel={cancelEdit}
              isPending={isPending}
            />
          ) : (
            <div className="px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <p className="font-bold text-sm">{g.name}</p>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => openEdit(g)}
                    disabled={isPending}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(g.id, g.name)}
                    disabled={isPending}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-1 mt-2">
                {g.food_ids.map((fid) => {
                  const f = foodMap.get(fid)
                  return f ? (
                    <span key={fid} className="rounded-lg bg-muted/60 px-2 py-0.5 text-[11px] font-medium text-foreground">
                      {f.name}
                    </span>
                  ) : null
                })}
                {g.food_ids.filter((id) => !foodMap.has(id)).length > 0 && (
                  <span className="text-[10px] text-muted-foreground/50 self-center">
                    +{g.food_ids.filter((id) => !foodMap.has(id)).length} no cargados
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      ))}

      {/* New group form */}
      {editingId === 'new' && (
        <div className="rounded-2xl border border-border bg-card">
          <GroupForm
            draftName={draftName}
            setDraftName={setDraftName}
            draftFoodIds={draftFoodIds}
            toggleFood={toggleFood}
            foodSearch={foodSearch}
            setFoodSearch={setFoodSearch}
            filteredFoods={filteredFoods}
            foodMap={foodMap}
            onSave={handleSave}
            onCancel={cancelEdit}
            isPending={isPending}
          />
        </div>
      )}

      {editingId === null && (
        <button
          type="button"
          onClick={openNew}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border py-3 text-sm font-bold text-muted-foreground hover:bg-muted/30 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Nuevo grupo de intercambio
        </button>
      )}
    </div>
  )
}

function GroupForm({
  draftName,
  setDraftName,
  draftFoodIds,
  toggleFood,
  foodSearch,
  setFoodSearch,
  filteredFoods,
  foodMap,
  onSave,
  onCancel,
  isPending,
}: {
  draftName: string
  setDraftName: (v: string) => void
  draftFoodIds: string[]
  toggleFood: (id: string) => void
  foodSearch: string
  setFoodSearch: (v: string) => void
  filteredFoods: FoodMini[]
  foodMap: Map<string, FoodMini>
  onSave: () => void
  onCancel: () => void
  isPending: boolean
}) {
  return (
    <div className="p-4 space-y-3">
      <input
        autoFocus
        type="text"
        placeholder="Nombre del grupo (ej. Proteínas magras)"
        value={draftName}
        onChange={(e) => setDraftName(e.target.value)}
        className="w-full h-10 rounded-xl border border-border bg-background px-3 text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-[color:var(--theme-primary,#007AFF)]/50"
      />

      {/* Selected foods */}
      {draftFoodIds.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {draftFoodIds.map((fid) => {
            const f = foodMap.get(fid)
            return f ? (
              <button
                key={fid}
                type="button"
                onClick={() => toggleFood(fid)}
                className="flex items-center gap-1 rounded-lg bg-[color:var(--theme-primary,#007AFF)]/15 px-2 py-0.5 text-[11px] font-bold text-[color:var(--theme-primary,#007AFF)] hover:bg-red-500/15 hover:text-red-500 transition-colors"
              >
                {f.name}
                <X className="h-3 w-3" />
              </button>
            ) : null
          })}
        </div>
      )}

      {/* Food search */}
      <input
        type="text"
        placeholder="Buscar alimento…"
        value={foodSearch}
        onChange={(e) => setFoodSearch(e.target.value)}
        className="w-full h-9 rounded-xl border border-border bg-muted/30 px-3 text-sm focus:outline-none"
      />

      <div className="max-h-48 overflow-y-auto space-y-1 rounded-xl border border-border/50 p-1.5">
        {filteredFoods.slice(0, 50).map((f) => {
          const selected = draftFoodIds.includes(f.id)
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => toggleFood(f.id)}
              className={cn(
                'flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors',
                selected
                  ? 'bg-[color:var(--theme-primary,#007AFF)]/10 text-[color:var(--theme-primary,#007AFF)]'
                  : 'hover:bg-muted/50 text-foreground'
              )}
            >
              <span className={cn('font-medium', selected && 'font-bold')}>{f.name}</span>
              <span className="text-[10px] text-muted-foreground shrink-0">{f.calories} kcal</span>
            </button>
          )
        })}
        {filteredFoods.length === 0 && (
          <p className="py-3 text-center text-xs text-muted-foreground">Sin resultados</p>
        )}
      </div>

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={isPending}
          className="flex-1 h-9 rounded-xl border border-border text-sm font-semibold text-muted-foreground hover:bg-muted/50 transition-colors"
        >
          <X className="h-3.5 w-3.5 inline mr-1" />
          Cancelar
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={isPending}
          className="flex-1 h-9 rounded-xl bg-[color:var(--theme-primary,#007AFF)] text-sm font-bold text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          <Save className="h-3.5 w-3.5 inline mr-1" />
          Guardar
        </button>
      </div>
    </div>
  )
}
