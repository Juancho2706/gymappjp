'use client'

/**
 * Sección "Porciones" de `/coach/foods` — gestión de las listas de equivalencia FUERA del plan
 * de un alumno concreto (F2, specs/nutrition-exchange-lists §Superficies).
 *
 * Hasta F1 la única entrada a esta gestión estaba enterrada en el builder de un alumno: un coach
 * sin alumnos no podía llegar nunca, y quien tenía alumnos tenía que abrir uno cualquiera para
 * tocar un catálogo que es suyo, no del alumno.
 *
 * Lo que muestra por fila es lo que verá el alumno: la lista llega ya resuelta por precedencia
 * (coach > org > catálogo), sin las lápidas. Si acá apareciera la fila global que el coach ya
 * pisó, estaría editando a ciegas.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, Pencil, Plus, RotateCcw, Scale, Search, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import {
  EXCHANGE_GROUP_PALETTE,
  exchangeGroupKcalFromMacros,
  suggestFreeExchangeGroupCode,
} from '@eva/schemas/nutrition-exchanges'
import { formatPortionSentence } from '@eva/nutrition-v2'
import { PORTIONS_COPY } from '@/lib/nutrition-portions-copy'
import {
  duplicateExchangeGroupAction,
  excludeExchangeListEntryAction,
  loadExchangeListGroupsAction,
  loadExchangeListAction,
  restoreExchangeListEntryAction,
} from '../_actions/exchange-lists.actions'
import { ExchangeListEntrySheet, type ExchangeListEntryDraft } from './ExchangeListEntrySheet'

const COPY = PORTIONS_COPY.exchangeList
const GROUP_COPY = PORTIONS_COPY.groupEditor

type Group = {
  id: string
  code: string
  name: string
  color: string | null
  isSystem: boolean
  refCalories: number
  refProteinG: number
  refCarbsG: number
  refFatsG: number
}

type Row = {
  id: string
  foodId: string
  foodName: string
  foodBrand: string | null
  portionGrams: number | null
  portionLabel: string | null
  isOwn: boolean
}

function GroupDot({ color, code }: { color: string | null; code: string }) {
  return (
    <span
      aria-hidden
      className="inline-flex items-center justify-center w-7 h-7 rounded-full text-[10px] font-black text-white shrink-0"
      style={{ backgroundColor: color ?? 'var(--muted-foreground)' }}
    >
      {code}
    </span>
  )
}

export function ExchangePortionsSection() {
  const [groups, setGroups] = useState<Group[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [loadingGroups, setLoadingGroups] = useState(true)
  const [loadingRows, setLoadingRows] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [entrySheet, setEntrySheet] = useState<{ open: boolean; editing: ExchangeListEntryDraft | null }>({
    open: false,
    editing: null,
  })
  const [duplicating, setDuplicating] = useState(false)

  const selected = useMemo(() => groups.find((group) => group.id === selectedId) ?? null, [groups, selectedId])

  const loadGroups = useCallback(async () => {
    setLoadingGroups(true)
    const result = await loadExchangeListGroupsAction()
    setLoadingGroups(false)
    if (!result.success) {
      setError(result.error)
      return
    }
    setError(null)
    setGroups(result.groups as unknown as Group[])
    setCounts(result.counts)
    setSelectedId((current) => current ?? result.groups[0]?.id ?? null)
  }, [])

  useEffect(() => {
    void loadGroups()
  }, [loadGroups])

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 300)
    return () => clearTimeout(timer)
  }, [search])

  const loadRows = useCallback(
    async (groupId: string, term: string) => {
      setLoadingRows(true)
      const result = await loadExchangeListAction({ groupId, search: term || null, limit: 120 })
      setLoadingRows(false)
      if (!result.success) {
        setError(result.error)
        setRows([])
        return
      }
      setError(null)
      setRows(result.rows as unknown as Row[])
    },
    []
  )

  useEffect(() => {
    if (!selectedId) return
    void loadRows(selectedId, debounced)
  }, [selectedId, debounced, loadRows])

  const refresh = useCallback(() => {
    void loadGroups()
    if (selectedId) void loadRows(selectedId, debounced)
  }, [loadGroups, loadRows, selectedId, debounced])

  async function handleExclude(row: Row) {
    if (!selectedId) return
    const result = await excludeExchangeListEntryAction({ exchangeGroupId: selectedId, foodId: row.foodId })
    if (!result.success) {
      toast.error(result.error || COPY.removeFailed)
      return
    }
    toast.success(COPY.excluded)
    refresh()
  }

  async function handleRestore(row: Row) {
    if (!selectedId) return
    const result = await restoreExchangeListEntryAction({ exchangeGroupId: selectedId, foodId: row.foodId })
    if (!result.success) {
      toast.error(result.error || COPY.removeFailed)
      return
    }
    toast.success(COPY.restored)
    refresh()
  }

  return (
    <section className="space-y-4" aria-labelledby="porciones-heading">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
        <div className="min-w-0">
          <h2
            id="porciones-heading"
            className="text-lg font-black uppercase tracking-tight flex items-center gap-2"
          >
            <Scale className="w-5 h-5 text-primary shrink-0" />
            {COPY.manageEntry}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">{COPY.manageEntryHint}</p>
        </div>
      </div>

      {loadingGroups ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          {PORTIONS_COPY.builder.pickerLoading}
        </div>
      ) : (
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {groups.map((group) => {
            const isActive = group.id === selectedId
            const count = counts[group.id] ?? 0
            return (
              <button
                key={group.id}
                type="button"
                onClick={() => setSelectedId(group.id)}
                aria-pressed={isActive}
                className={`flex items-center gap-2 shrink-0 rounded-2xl border px-3 py-2 min-h-11 transition-colors ${
                  isActive ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted/40'
                }`}
              >
                <GroupDot color={group.color} code={group.code} />
                <span className="text-left">
                  <span className="block text-xs font-bold truncate max-w-[10rem]">{group.name}</span>
                  <span
                    className={`block text-[10px] font-black uppercase tracking-widest ${
                      count === 0 ? 'text-[var(--cta-danger)]' : 'text-muted-foreground'
                    }`}
                  >
                    {count === 0
                      ? PORTIONS_COPY.builder.groupFoodsEmpty
                      : PORTIONS_COPY.builder.groupFoodCount(count)}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      )}

      {selected ? (
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder={COPY.searchPlaceholder}
                aria-label={COPY.searchAria}
                className="pl-10 h-11 rounded-xl"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              {loadingRows ? (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
              ) : null}
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                className="flex-1 sm:flex-none gap-2 h-11 rounded-2xl font-black uppercase tracking-widest text-[10px]"
                onClick={() => setEntrySheet({ open: true, editing: null })}
              >
                <Plus className="w-4 h-4" />
                {COPY.addFood}
              </Button>
              {selected.isSystem ? (
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 sm:flex-none gap-2 h-11 rounded-2xl font-black uppercase tracking-widest text-[10px]"
                  onClick={() => setDuplicating(true)}
                  aria-label={GROUP_COPY.duplicateAria(selected.name)}
                >
                  {GROUP_COPY.duplicate}
                </Button>
              ) : null}
            </div>
          </div>

          {selected.isSystem ? (
            <p className="text-[10px] text-muted-foreground leading-relaxed">{GROUP_COPY.duplicateHint}</p>
          ) : null}

          <ul className="rounded-2xl border border-border/60 divide-y divide-border/50 overflow-hidden">
            {rows.map((row) => (
              <li key={row.id} className="flex items-center gap-2 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate">
                    {row.foodName}
                    {row.foodBrand ? <span className="text-muted-foreground"> · {row.foodBrand}</span> : null}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {formatPortionSentence({
                      foodName: row.foodName,
                      portionGrams: row.portionGrams,
                      portionLabel: row.portionLabel,
                    })}
                  </p>
                </div>
                <span
                  className={`shrink-0 text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-full ${
                    row.isOwn ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {row.isOwn ? COPY.badgeOwn : COPY.badgeCatalog}
                </span>
                <button
                  type="button"
                  className="shrink-0 p-2 rounded-xl hover:bg-muted/60"
                  aria-label={`Editar ${row.foodName}`}
                  onClick={() =>
                    setEntrySheet({
                      open: true,
                      editing: {
                        foodId: row.foodId,
                        foodName: row.foodName,
                        portionGrams: row.portionGrams,
                        portionLabel: row.portionLabel,
                      },
                    })
                  }
                >
                  <Pencil className="w-4 h-4 text-muted-foreground" />
                </button>
                {row.isOwn ? (
                  <button
                    type="button"
                    className="shrink-0 p-2 rounded-xl hover:bg-muted/60"
                    aria-label={COPY.restoreAria(row.foodName)}
                    title={COPY.restore}
                    onClick={() => void handleRestore(row)}
                  >
                    <RotateCcw className="w-4 h-4 text-muted-foreground" />
                  </button>
                ) : (
                  <button
                    type="button"
                    className="shrink-0 p-2 rounded-xl hover:bg-muted/60"
                    aria-label={COPY.excludeAria(row.foodName)}
                    title={COPY.exclude}
                    onClick={() => void handleExclude(row)}
                  >
                    <X className="w-4 h-4 text-muted-foreground" />
                  </button>
                )}
              </li>
            ))}
            {rows.length === 0 && !loadingRows ? (
              <li className="px-3 py-8 text-center text-xs text-muted-foreground">
                {debounced ? COPY.emptySearch : COPY.empty}
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}

      {error ? <p className="text-xs text-[var(--cta-danger)] font-bold">{error}</p> : null}

      <ExchangeListEntrySheet
        open={entrySheet.open}
        onOpenChange={(open) => setEntrySheet((current) => ({ ...current, open }))}
        groupId={selectedId}
        groupName={selected?.name ?? ''}
        editing={entrySheet.editing}
        onSaved={refresh}
      />

      {selected ? (
        <DuplicateGroupSheet
          open={duplicating}
          onOpenChange={setDuplicating}
          source={selected}
          takenCodes={groups.map((group) => group.code)}
          onDuplicated={(groupId) => {
            setSelectedId(groupId)
            refresh()
          }}
        />
      ) : null}
    </section>
  )
}

/** Acepta coma decimal es-CL ("1,5"); vacío = 0. `null` = entrada inválida. */
function parseNumberEs(raw: string): number | null {
  const trimmed = raw.trim()
  if (trimmed === '') return 0
  const parsed = Number(trimmed.replace(',', '.'))
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

/**
 * "Duplicar y ajustar" con COPIA DE LA LISTA. F1 duplicaba solo los macros y el grupo nuevo
 * nacía vacío: el alumno abría el sheet de equivalencias sin un solo ejemplo. Acá la lista viaja
 * reescalada por regla de tres, así que ajustar "15 g de carbos" a "20 g" recalcula los 715
 * alimentos de Cereales en dos toques.
 */
function DuplicateGroupSheet({
  open,
  onOpenChange,
  source,
  takenCodes,
  onDuplicated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  source: Group
  takenCodes: string[]
  onDuplicated: (groupId: string) => void
}) {
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [protein, setProtein] = useState('')
  const [carbs, setCarbs] = useState('')
  const [fats, setFats] = useState('')
  const [kcal, setKcal] = useState('')
  const [kcalTouched, setKcalTouched] = useState(false)
  const [color, setColor] = useState<string | null>(null)
  const [copyList, setCopyList] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setName(GROUP_COPY.duplicateSuffix(source.name).slice(0, 40))
    setCode(suggestFreeExchangeGroupCode(source.code, takenCodes))
    setProtein(String(source.refProteinG).replace('.', ','))
    setCarbs(String(source.refCarbsG).replace('.', ','))
    setFats(String(source.refFatsG).replace('.', ','))
    setKcal(String(source.refCalories))
    setKcalTouched(false)
    setColor(source.color ?? EXCHANGE_GROUP_PALETTE[0])
    setCopyList(true)
    setError(null)
    // takenCodes cambia de identidad en cada render del padre; el efecto solo debe correr al abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, source])

  // kcal se autocalculan con 4/4/9 mientras el coach no las edite a mano (sigue editable).
  useEffect(() => {
    if (kcalTouched) return
    const p = parseNumberEs(protein)
    const c = parseNumberEs(carbs)
    const f = parseNumberEs(fats)
    if (p == null || c == null || f == null) return
    setKcal(String(exchangeGroupKcalFromMacros({ refProteinG: p, refCarbsG: c, refFatsG: f })))
  }, [protein, carbs, fats, kcalTouched])

  async function handleSave() {
    const p = parseNumberEs(protein)
    const c = parseNumberEs(carbs)
    const f = parseNumberEs(fats)
    const k = parseNumberEs(kcal)
    if (p == null || c == null || f == null || k == null) {
      setError(GROUP_COPY.macrosRequired)
      return
    }
    if (name.trim().length === 0) {
      setError(GROUP_COPY.nameRequired)
      return
    }
    setSaving(true)
    const result = await duplicateExchangeGroupAction({
      sourceGroupId: source.id,
      name: name.trim(),
      code: code.trim().toUpperCase(),
      refCalories: k,
      refProteinG: p,
      refCarbsG: c,
      refFatsG: f,
      color,
      copyList,
    })
    setSaving(false)
    if (!result.success) {
      setError(result.error)
      return
    }
    if (result.copyError) {
      toast.error(COPY.copyFailed)
    } else if (copyList) {
      toast.success(
        result.copied === result.attempted
          ? COPY.copied(result.copied)
          : COPY.copyPartial(result.copied, result.attempted)
      )
    } else {
      toast.success(COPY.saved)
    }
    onOpenChange(false)
    onDuplicated(result.group.id)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92vh]">
        <SheetHeader>
          <SheetTitle>{GROUP_COPY.duplicateTitle}</SheetTitle>
        </SheetHeader>
        <div className="px-6 pb-8 overflow-y-auto space-y-3">
          <p className="text-xs text-muted-foreground leading-relaxed">{GROUP_COPY.duplicateHint}</p>

          <label className="block space-y-1.5">
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              {GROUP_COPY.nameLabel}
            </span>
            <Input
              className="h-11 rounded-xl"
              value={name}
              maxLength={40}
              onChange={(event) => setName(event.target.value)}
              placeholder={GROUP_COPY.namePlaceholder}
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              {GROUP_COPY.codeLabel}
            </span>
            <Input
              className="h-11 rounded-xl uppercase"
              value={code}
              maxLength={3}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
            />
            <span className="block text-[10px] text-muted-foreground">{GROUP_COPY.codeHint}</span>
          </label>

          <fieldset className="space-y-2">
            <legend className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              {GROUP_COPY.macrosLabel}
            </legend>
            <div className="grid grid-cols-3 gap-2">
              <label className="space-y-1">
                <span className="block text-[10px] text-muted-foreground">{GROUP_COPY.proteinLabel}</span>
                <Input
                  inputMode="decimal"
                  className="h-11 rounded-xl"
                  value={protein}
                  onChange={(event) => setProtein(event.target.value)}
                />
              </label>
              <label className="space-y-1">
                <span className="block text-[10px] text-muted-foreground">{GROUP_COPY.carbsLabel}</span>
                <Input
                  inputMode="decimal"
                  className="h-11 rounded-xl"
                  value={carbs}
                  onChange={(event) => setCarbs(event.target.value)}
                />
              </label>
              <label className="space-y-1">
                <span className="block text-[10px] text-muted-foreground">{GROUP_COPY.fatsLabel}</span>
                <Input
                  inputMode="decimal"
                  className="h-11 rounded-xl"
                  value={fats}
                  onChange={(event) => setFats(event.target.value)}
                />
              </label>
            </div>
            <label className="block space-y-1">
              <span className="block text-[10px] text-muted-foreground">{GROUP_COPY.kcalLabel}</span>
              <Input
                inputMode="decimal"
                className="h-11 rounded-xl"
                value={kcal}
                onChange={(event) => {
                  setKcalTouched(true)
                  setKcal(event.target.value)
                }}
              />
              <span className="block text-[10px] text-muted-foreground">{GROUP_COPY.kcalHint}</span>
            </label>
          </fieldset>

          <fieldset className="space-y-1.5">
            <legend className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              {GROUP_COPY.colorLabel}
            </legend>
            <div className="flex flex-wrap gap-2">
              {EXCHANGE_GROUP_PALETTE.map((swatch, index) => (
                <button
                  key={swatch}
                  type="button"
                  aria-label={GROUP_COPY.colorOption(index + 1)}
                  aria-pressed={color === swatch}
                  onClick={() => setColor(swatch)}
                  className={`w-9 h-9 rounded-full border-2 ${
                    color === swatch ? 'border-foreground' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: swatch }}
                />
              ))}
            </div>
          </fieldset>

          <label className="flex items-start gap-2 rounded-xl border border-border/60 px-3 py-2.5">
            <input
              type="checkbox"
              checked={copyList}
              onChange={(event) => setCopyList(event.target.checked)}
              className="mt-0.5 w-4 h-4 shrink-0"
            />
            <span className="min-w-0">
              <span className="block text-sm font-semibold">{COPY.copyListLabel}</span>
              <span className="block text-[10px] text-muted-foreground">{COPY.copyListHint}</span>
            </span>
          </label>

          <p className="text-[10px] text-muted-foreground leading-relaxed">{GROUP_COPY.referentialNotice}</p>

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1 h-12 font-black uppercase tracking-widest"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              {GROUP_COPY.cancel}
            </Button>
            <Button
              type="button"
              className="flex-1 h-12 font-black uppercase tracking-widest"
              onClick={() => void handleSave()}
              disabled={saving}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {saving ? GROUP_COPY.saving : GROUP_COPY.save}
            </Button>
          </div>

          {error ? <p className="text-xs text-[var(--cta-danger)] font-bold text-center">{error}</p> : null}
        </div>
      </SheetContent>
    </Sheet>
  )
}
