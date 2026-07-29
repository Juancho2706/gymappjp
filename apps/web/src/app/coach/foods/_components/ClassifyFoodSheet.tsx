'use client'

/**
 * "Clasificar en porciones" — camino de EDICIÓN de la clasificación (P-B): agrega (o quita)
 * la equivalencia de un alimento PROPIO que ya existe en el catálogo, sin volver a crearlo.
 *
 * Reusa el buscador server-side del catálogo (`searchCoachFoodLibrary` con `mine: true`, la
 * misma action del `FoodBrowser`) para elegir el alimento, y el mismo bloque de campos del
 * alta (`FoodEquivalenceFields`) para los valores. La escritura va por
 * `setFoodExchangeEquivalenceAction`: sesión propia + `coach_id = auth.uid()` en el UPDATE +
 * grupo visible. La UI nunca autoriza.
 */

import { useCallback, useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Save, Scale, Search } from 'lucide-react'
import { toast } from 'sonner'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { searchCoachFoodLibrary } from '@/app/coach/nutrition-plans/_actions/food-library.actions'
import { PORTIONS_COPY } from '@/lib/nutrition-portions-copy'
import { setFoodExchangeEquivalenceAction } from '../_actions/food-equivalence.actions'
import {
  EMPTY_FOOD_EQUIVALENCE,
  FoodEquivalenceFields,
  type FoodEquivalenceGroupOption,
  type FoodEquivalenceValue,
} from './FoodEquivalenceFields'

const COPY = PORTIONS_COPY.foodEquivalence

type OwnFood = { id: string; name: string }

export function ClassifyFoodSheet({
  coachId,
  exchangeGroups,
}: {
  coachId: string
  exchangeGroups: FoodEquivalenceGroupOption[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [foods, setFoods] = useState<OwnFood[]>([])
  const [selected, setSelected] = useState<OwnFood | null>(null)
  const [value, setValue] = useState<FoodEquivalenceValue>(EMPTY_FOOD_EQUIVALENCE)
  const [error, setError] = useState<string | null>(null)
  const [loading, startLoading] = useTransition()
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300)
    return () => clearTimeout(t)
  }, [search])

  const load = useCallback(
    (query: string) => {
      startLoading(async () => {
        const { foods: rows } = await searchCoachFoodLibrary(coachId, {
          search: query || undefined,
          mine: true,
          page: 0,
          pageSize: 40,
        })
        setFoods((rows ?? []).map((f) => ({ id: f.id as string, name: f.name as string })))
      })
    },
    [coachId]
  )

  useEffect(() => {
    if (!open) return
    load(debounced)
  }, [open, debounced, load])

  function reset() {
    setSearch('')
    setDebounced('')
    setSelected(null)
    setValue(EMPTY_FOOD_EQUIVALENCE)
    setError(null)
  }

  async function handleSave() {
    if (!selected) return
    setError(null)
    const grams = value.grams.trim() === '' ? null : Number(value.grams.replace(',', '.'))
    if (value.groupId !== '' && (grams == null || !Number.isFinite(grams) || grams <= 0)) {
      setError(COPY.gramsRequired)
      return
    }
    if (value.groupId === '' && (grams != null || value.label.trim() !== '')) {
      setError(COPY.groupRequired)
      return
    }
    setSaving(true)
    const res = await setFoodExchangeEquivalenceAction({
      foodId: selected.id,
      exchangeGroupId: value.groupId === '' ? null : value.groupId,
      exchangePortionGrams: value.groupId === '' ? null : grams,
      exchangePortionLabel: value.groupId === '' ? null : value.label,
    })
    setSaving(false)
    if (!res.success) {
      setError(res.error)
      return
    }
    toast.success(COPY.saved)
    setOpen(false)
    reset()
    router.refresh()
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) reset()
      }}
    >
      <SheetTrigger
        className={buttonVariants({
          variant: 'outline',
          className:
            'gap-2 font-black uppercase tracking-widest text-[10px] h-11 rounded-2xl w-full sm:w-auto',
        })}
      >
        <Scale className="w-4 h-4" />
        Clasificar en porciones
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[90vh]">
        <SheetHeader>
          <SheetTitle>{COPY.sectionTitle}</SheetTitle>
        </SheetHeader>
        <div className="px-6 pb-6 overflow-y-auto space-y-4">
          <p className="text-xs text-muted-foreground leading-relaxed">{COPY.sectionHint}</p>

          {selected ? (
            <div className="flex items-center justify-between gap-2 rounded-xl border border-border/60 px-3 py-2">
              <span className="text-sm font-semibold truncate">{selected.name}</span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="text-[10px] font-black uppercase tracking-widest shrink-0"
                onClick={() => setSelected(null)}
              >
                Cambiar
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar entre mis alimentos…"
                  aria-label="Buscar entre mis alimentos"
                  className="pl-10 h-11 rounded-xl"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {loading && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
                )}
              </div>
              <ul className="max-h-56 overflow-y-auto rounded-xl border border-border/60 divide-y divide-border/50">
                {foods.map((food) => (
                  <li key={food.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(food)}
                      className="w-full text-left px-3 py-2.5 min-h-11 text-sm hover:bg-muted/40 focus-visible:outline-none focus-visible:bg-muted/40"
                    >
                      {food.name}
                    </button>
                  </li>
                ))}
                {foods.length === 0 && !loading ? (
                  <li className="px-3 py-6 text-center text-xs text-muted-foreground">
                    Todavía no tienes alimentos propios con ese nombre.
                  </li>
                ) : null}
              </ul>
            </div>
          )}

          {selected ? (
            <>
              <FoodEquivalenceFields
                value={value}
                onChange={setValue}
                groups={exchangeGroups}
                disabled={saving}
                emitFormFields={false}
                defaultExpanded
              />
              <Button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving}
                className="w-full h-12 font-black uppercase tracking-widest"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                {saving ? 'Guardando…' : 'Guardar'}
              </Button>
            </>
          ) : null}

          {error ? <p className="text-xs text-[var(--cta-danger)] font-bold text-center">{error}</p> : null}
        </div>
      </SheetContent>
    </Sheet>
  )
}
