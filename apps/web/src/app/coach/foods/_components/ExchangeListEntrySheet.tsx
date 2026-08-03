'use client'

/**
 * Sheet "¿Qué cuenta como 1 porción?" — el corazón de F2.
 *
 * Tres decisiones de UX que cambian el resultado, todas del SPEC:
 *  1. Busca en TODO el catálogo visible, no solo en los alimentos propios. Hasta F1 el coach
 *     solo podía clasificar lo que él mismo había creado, que es justo lo que hacía inútil la
 *     función para quien trabaja con el catálogo global.
 *  2. SUGIERE los gramos desde los macros del alimento y los de referencia del grupo. La
 *     sugerencia se muestra como tal y con un botón para aplicarla: el número del coach manda.
 *  3. Muestra la frase EXACTA que leerá el alumno antes de guardar. La mitad de los errores de
 *     porciones son de redacción, no de gramos.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, Loader2, Save, Search } from 'lucide-react'
import { toast } from 'sonner'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatPortionSentence } from '@eva/nutrition-v2'
import { PORTIONS_COPY } from '@/lib/nutrition-portions-copy'
import {
  saveExchangeListEntryAction,
  searchExchangeListCandidatesAction,
} from '../_actions/exchange-lists.actions'

const COPY = PORTIONS_COPY.exchangeList

type Candidate = {
  id: string
  name: string
  brand: string | null
  suggestedGrams: number | null
  alreadyInList: boolean
  isGlobal: boolean
}

export type ExchangeListEntryDraft = {
  foodId: string
  foodName: string
  portionGrams: number | null
  portionLabel: string | null
}

export function ExchangeListEntrySheet({
  open,
  onOpenChange,
  groupId,
  groupName,
  /** Presente ⇒ el sheet abre en modo edición sobre una fila ya existente (sin buscador). */
  editing,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  groupId: string | null
  groupName: string
  editing?: ExchangeListEntryDraft | null
  onSaved: () => void
}) {
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<{ id: string; name: string; suggested: number | null } | null>(null)
  const [grams, setGrams] = useState('')
  const [label, setLabel] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Abrir en modo edición precarga la fila y salta el buscador: el coach ya eligió el alimento.
  useEffect(() => {
    if (!open) return
    if (editing) {
      setSelected({ id: editing.foodId, name: editing.foodName, suggested: null })
      setGrams(editing.portionGrams != null ? String(editing.portionGrams) : '')
      setLabel(editing.portionLabel ?? '')
    } else {
      setSelected(null)
      setGrams('')
      setLabel('')
    }
    setSearch('')
    setDebounced('')
    setError(null)
  }, [open, editing])

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 300)
    return () => clearTimeout(timer)
  }, [search])

  const loadCandidates = useCallback(
    async (term: string) => {
      if (!groupId) return
      setLoading(true)
      const result = await searchExchangeListCandidatesAction({ groupId, search: term || null, limit: 40 })
      setLoading(false)
      if (!result.success) {
        setError(result.error)
        setCandidates([])
        return
      }
      setError(null)
      setCandidates(result.candidates)
    },
    [groupId]
  )

  useEffect(() => {
    if (!open || editing || !groupId) return
    void loadCandidates(debounced)
  }, [open, editing, groupId, debounced, loadCandidates])

  const parsedGrams = useMemo(() => {
    const raw = grams.trim().replace(',', '.')
    if (raw === '') return null
    const value = Number(raw)
    return Number.isFinite(value) && value > 0 ? value : null
  }, [grams])

  const preview = selected
    ? formatPortionSentence({
        foodName: selected.name,
        portionGrams: parsedGrams,
        portionLabel: label,
      })
    : null

  async function handleSave() {
    if (!groupId || !selected) return
    if (parsedGrams == null) {
      setError(PORTIONS_COPY.foodEquivalence.gramsRequired)
      return
    }
    setSaving(true)
    const result = await saveExchangeListEntryAction({
      exchangeGroupId: groupId,
      foodId: selected.id,
      portionGrams: parsedGrams,
      portionLabel: label.trim() || null,
    })
    setSaving(false)
    if (!result.success) {
      setError(result.error)
      return
    }
    toast.success(COPY.saved)
    onOpenChange(false)
    onSaved()
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92vh]">
        <SheetHeader>
          <SheetTitle>{COPY.sectionTitle}</SheetTitle>
        </SheetHeader>
        <div className="px-6 pb-8 overflow-y-auto space-y-4">
          <p className="text-xs text-muted-foreground leading-relaxed">
            {groupName ? `${COPY.sectionHint} · ${groupName}` : COPY.sectionHint}
          </p>

          {selected ? (
            <div className="flex items-center justify-between gap-2 rounded-xl border border-border/60 px-3 py-2">
              <span className="text-sm font-semibold truncate">{selected.name}</span>
              {editing ? null : (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-[10px] font-black uppercase tracking-widest shrink-0"
                  onClick={() => setSelected(null)}
                >
                  Cambiar
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder={COPY.searchPlaceholder}
                  aria-label={COPY.searchAria}
                  className="pl-10 h-11 rounded-xl"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
                {loading ? (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
                ) : null}
              </div>
              <ul className="max-h-64 overflow-y-auto rounded-xl border border-border/60 divide-y divide-border/50">
                {candidates.map((candidate) => (
                  <li key={candidate.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelected({ id: candidate.id, name: candidate.name, suggested: candidate.suggestedGrams })
                        setGrams(candidate.suggestedGrams != null ? String(candidate.suggestedGrams) : '')
                        setError(null)
                      }}
                      className="w-full text-left px-3 py-2.5 min-h-11 hover:bg-muted/40 focus-visible:outline-none focus-visible:bg-muted/40"
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-sm truncate">
                          {candidate.name}
                          {candidate.brand ? (
                            <span className="text-muted-foreground"> · {candidate.brand}</span>
                          ) : null}
                        </span>
                        {candidate.alreadyInList ? (
                          <Check className="w-4 h-4 text-[var(--cta-success,var(--primary))] shrink-0" />
                        ) : null}
                      </span>
                      {candidate.suggestedGrams != null ? (
                        <span className="block text-[10px] font-bold uppercase tracking-widest text-muted-foreground mt-0.5">
                          {COPY.suggested(String(candidate.suggestedGrams))}
                        </span>
                      ) : null}
                    </button>
                  </li>
                ))}
                {candidates.length === 0 && !loading ? (
                  <li className="px-3 py-6 text-center text-xs text-muted-foreground">{COPY.emptySearch}</li>
                ) : null}
              </ul>
            </div>
          )}

          {selected ? (
            <div className="space-y-3">
              <label className="block space-y-1.5">
                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  {COPY.gramsLabel}
                </span>
                <Input
                  inputMode="decimal"
                  className="h-11 rounded-xl"
                  value={grams}
                  onChange={(event) => setGrams(event.target.value)}
                  placeholder={PORTIONS_COPY.foodEquivalence.gramsPlaceholder}
                />
              </label>

              {selected.suggested != null && String(selected.suggested) !== grams.trim() ? (
                <button
                  type="button"
                  onClick={() => setGrams(String(selected.suggested))}
                  className="text-[10px] font-black uppercase tracking-widest text-primary hover:underline"
                >
                  {COPY.suggestedApply} · {selected.suggested} g
                </button>
              ) : null}
              {selected.suggested == null && !editing ? (
                <p className="text-[10px] text-muted-foreground">{COPY.suggestedNone}</p>
              ) : null}

              <label className="block space-y-1.5">
                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  {COPY.labelLabel}
                </span>
                <Input
                  className="h-11 rounded-xl"
                  value={label}
                  maxLength={40}
                  onChange={(event) => setLabel(event.target.value)}
                  placeholder={COPY.labelPlaceholder}
                />
              </label>

              {preview ? (
                <div className="rounded-xl border border-border/60 bg-muted/30 px-3 py-2.5">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    {COPY.previewTitle}
                  </p>
                  <p className="text-sm font-semibold mt-1 break-words">{preview}</p>
                </div>
              ) : null}

              <Button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving}
                className="w-full h-12 font-black uppercase tracking-widest"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                {saving ? COPY.saving : COPY.save}
              </Button>
            </div>
          ) : null}

          {error ? <p className="text-xs text-[var(--cta-danger)] font-bold text-center">{error}</p> : null}
        </div>
      </SheetContent>
    </Sheet>
  )
}
