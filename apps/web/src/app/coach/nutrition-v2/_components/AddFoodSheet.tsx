'use client'

import {
  useActionState,
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactElement,
} from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Loader2, Save } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { saveCustomFood } from '@/app/coach/nutrition-plans/_actions/nutrition-coach.actions'
import {
  CUSTOM_FOOD_MACRO_MAX,
  readCustomFoodMacroDraft,
  validateCustomFoodMacros,
} from '@eva/nutrition-v2'
import { toast } from 'sonner'
import {
  EMPTY_FOOD_EQUIVALENCE,
  FoodEquivalenceFields,
  type FoodEquivalenceGroupOption,
  type FoodEquivalenceValue,
} from './FoodEquivalenceFields'

function macroPreviewPct(calories: number, p: number, c: number, f: number) {
  const cals = Number(calories) || 0
  const denom = cals > 0 ? cals : p * 4 + c * 4 + f * 9
  if (denom <= 0) return { p: 0, c: 0, f: 0 }
  return {
    p: Math.round(((p * 4) / denom) * 100),
    c: Math.round(((c * 4) / denom) * 100),
    f: Math.round(((f * 9) / denom) * 100),
  }
}

function readField(formData: FormData, name: string): string {
  const value = formData.get(name)
  return typeof value === 'string' ? value : ''
}

export function AddFoodSheet({
  coachId,
  /**
   * Catálogo de grupos de porciones VISIBLES para el coach (system + propios + team activo).
   * `/coach/foods` lo resolvía server-side en su page; desde T2.3 F5 el único montaje es el tab
   * Alimentos del hub, que lo carga perezoso al abrir el sheet (ver `onOpenChange`). Vacío = el
   * bloque de equivalencia queda sin opciones, nunca roto.
   */
  exchangeGroups = [],
  /**
   * Se avisa en cada apertura. Lo usa el hub V2 para pedir `exchangeGroups` la PRIMERA vez que
   * el coach abre el sheet: cambiar de tab es `history.replaceState`, así que un dato cargado
   * en el server component solo serviría para deep-links, no para el switch en cliente.
   */
  onOpenChange,
  /**
   * Reemplaza al `router.refresh()` cuando quien monta el sheet sabe refrescar su propio
   * listado en cliente. En el hub V2 un refresh del RSC volvería a pedir roster + picker por
   * haber creado un alimento; recibe el NOMBRE guardado para poder apuntar el listado hacia él.
   */
  onCreated,
  /**
   * Disparador propio (tokens del hub). Sin él se usa el botón histórico heredado de
   * `/coach/foods` (fallback: hoy el hub siempre pasa el suyo).
   * Base UI compone por `render`, no por `asChild`: el elemento recibe los props y el ref del
   * trigger, así que tiene que ser un único elemento que los reenvíe (un `<button>` sirve).
   */
  trigger,
}: {
  coachId: string
  exchangeGroups?: FoodEquivalenceGroupOption[]
  onOpenChange?: (open: boolean) => void
  onCreated?: (name: string) => void
  trigger?: ReactElement<Record<string, unknown>>
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState(saveCustomFood.bind(null, coachId), {
    error: undefined,
    success: false,
  })
  // Invariante 6 (kcal/P/C/G): el veredicto del módulo puro, mostrado sin round-trip. No es
  // autorización — el techo sigue siendo `CustomFoodSchema` dentro de `saveCustomFood`.
  const [macroError, setMacroError] = useState<string | null>(null)
  const submittedName = useRef('')
  // `state.success` se queda en `true` entre altas, así que un efecto que dependa del BOOLEANO
  // no vuelve a correr en la segunda creación de la misma sesión (el sheet quedaba abierto y
  // sin toast). La identidad del objeto sí cambia por dispatch: es lo que se observa.
  const handledState = useRef<unknown>(null)

  const handleOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next)
      if (!next) setMacroError(null)
      onOpenChange?.(next)
    },
    [onOpenChange],
  )

  /**
   * Guard de invariante 6 + captura del nombre guardado, en `onSubmit` y NO envolviendo el
   * action. Los dos detalles que obligan a hacerlo así (verificados en react-dom 19.1.0):
   *
   *  - React despacha los `onSubmit` ANTES del plugin que ejecuta el action, y si el submit
   *    quedó cancelado no llama al action;
   *  - ese mismo camino se salta el `requestFormReset` que React encola junto al action, así
   *    que al rebotar la validación el coach conserva lo que ya había escrito (nombre,
   *    categoría, porción). Envolver el action en una función propia habría reseteado el
   *    formulario en cada rebote y además habría dejado ciego a `useFormStatus`.
   */
  const handleSubmit = useCallback((event: FormEvent<HTMLFormElement>) => {
    const form = event.currentTarget
    const formData = new FormData(form)
    const issue = validateCustomFoodMacros(readCustomFoodMacroDraft(formData))
    if (issue) {
      event.preventDefault()
      setMacroError(issue.message)
      form.querySelector<HTMLInputElement>(`[name="${issue.field}"]`)?.focus()
      return
    }
    setMacroError(null)
    submittedName.current = readField(formData, 'name').trim()
  }, [])

  useEffect(() => {
    if (!state.success || handledState.current === state) return
    handledState.current = state
    setOpen(false)
    setMacroError(null)
    toast.success('Alimento creado')
    if (onCreated) onCreated(submittedName.current)
    else router.refresh()
  }, [state, router, onCreated])

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      {trigger ? (
        <SheetTrigger render={trigger} />
      ) : (
        <SheetTrigger
          className={buttonVariants({
            className:
              'gap-2 font-black uppercase tracking-widest text-[10px] h-11 rounded-2xl w-full sm:w-auto',
          })}
        >
          <Plus className="w-4 h-4" />
          Nuevo alimento
        </SheetTrigger>
      )}
      <SheetContent side="bottom" className="max-h-[90vh]">
        <SheetHeader>
          <SheetTitle>Nuevo alimento custom</SheetTitle>
        </SheetHeader>
        <div className="px-6 pb-6 overflow-y-auto">
          <AddFoodFormBody
            formAction={formAction}
            onSubmit={handleSubmit}
            pending={pending}
            error={macroError ?? state.error ?? null}
            exchangeGroups={exchangeGroups}
          />
        </div>
      </SheetContent>
    </Sheet>
  )
}

function AddFoodFormBody({
  formAction,
  onSubmit,
  pending,
  error,
  exchangeGroups,
}: {
  formAction: (payload: FormData) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  pending: boolean
  error: string | null
  exchangeGroups: FoodEquivalenceGroupOption[]
}) {
  const [unit, setUnit] = useState<'g' | 'un'>('g')
  const [equivalence, setEquivalence] = useState<FoodEquivalenceValue>(EMPTY_FOOD_EQUIVALENCE)
  const [calories, setCalories] = useState('')
  const [protein, setProtein] = useState('')
  const [carbs, setCarbs] = useState('')
  const [fats, setFats] = useState('')
  const c = Number(calories) || 0
  const p = Number(protein) || 0
  const cb = Number(carbs) || 0
  const f = Number(fats) || 0
  const pct = macroPreviewPct(c, p, cb, f)

  return (
    <form action={formAction} onSubmit={onSubmit} className="space-y-4 pt-2">
      <div className="space-y-2">
        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Nombre</Label>
        <Input name="name" required placeholder="Ej: Huevo cocido" className="h-11 rounded-xl" />
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed rounded-xl border border-border/50 bg-muted/20 px-3 py-2">
        Las calorías y macros de abajo son <span className="font-semibold text-foreground">por cada 100 gramos</span> (como en una tabla nutricional). En el plan del alumno el coach puede poner cantidad en{' '}
        <span className="font-semibold text-foreground">gramos</span> (ej. 200) o en <span className="font-semibold text-foreground">unidades</span> (ej. 1 huevo): para unidades, indica cuántos gramos pesa una unidad.
      </p>
      {/*
        Los cuatro son obligatorios (regla owner 2026-08-05): `required` + `min`/`max` con los
        MISMOS topes que `CustomFoodSchema`, y `validateCustomFoodMacros` cerrando lo que el
        navegador no ve (los cuatro en 0).
      */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Kcal (100g)</Label>
          <Input
            name="calories"
            type="number"
            step="0.1"
            min={0}
            max={CUSTOM_FOOD_MACRO_MAX.calories}
            required
            className="h-11 rounded-xl"
            value={calories}
            onChange={(e) => setCalories(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Proteína (g)</Label>
          <Input
            name="protein"
            type="number"
            step="0.1"
            min={0}
            max={CUSTOM_FOOD_MACRO_MAX.protein}
            required
            className="h-11 rounded-xl"
            value={protein}
            onChange={(e) => setProtein(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Carbos (g)</Label>
          <Input
            name="carbs"
            type="number"
            step="0.1"
            min={0}
            max={CUSTOM_FOOD_MACRO_MAX.carbs}
            required
            className="h-11 rounded-xl"
            value={carbs}
            onChange={(e) => setCarbs(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Grasas (g)</Label>
          <Input
            name="fats"
            type="number"
            step="0.1"
            min={0}
            max={CUSTOM_FOOD_MACRO_MAX.fats}
            required
            className="h-11 rounded-xl"
            value={fats}
            onChange={(e) => setFats(e.target.value)}
          />
        </div>
      </div>
      {(c > 0 || p > 0 || cb > 0 || f > 0) && (
        <div className="rounded-xl border border-border/60 p-3 space-y-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">% calorías aprox.</p>
          <div className="flex h-2 rounded-full overflow-hidden bg-surface-sunken">
            <div className="h-full bg-[var(--ember-500)]" style={{ width: `${pct.p}%` }} />
            <div className="h-full bg-[var(--sport-600)]" style={{ width: `${pct.c}%` }} />
            <div className="h-full bg-[var(--aqua-500)]" style={{ width: `${pct.f}%` }} />
          </div>
          <p className="text-xs text-muted-foreground">
            P {pct.p}% · C {pct.c}% · G {pct.f}%
          </p>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Categoría</Label>
          <Input name="category" placeholder="Opcional" className="h-11 rounded-xl" />
        </div>
        <div className="space-y-2">
          <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Unidad de medición</Label>
          <Select value={unit} onValueChange={(v) => setUnit(v as 'g' | 'un')}>
            <SelectTrigger className="h-11 rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="g">g — gramos (pesable: pollo, arroz)</SelectItem>
              <SelectItem value="un">un — unidades (contable: huevo, manzana)</SelectItem>
            </SelectContent>
          </Select>
          <input type="hidden" name="unit" value={unit} />
        </div>
        <div className="space-y-2 col-span-2">
          <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
            {unit === 'un' ? 'Gramos que pesa 1 unidad' : 'Porción de referencia (g)'}
          </Label>
          <Input
            name="serving_size"
            type="number"
            min={1}
            step="1"
            defaultValue={unit === 'un' ? 60 : 100}
            key={unit}
            className="h-11 rounded-xl"
          />
          <p className="text-[11px] text-muted-foreground">
            {unit === 'un'
              ? 'Indica cuántos gramos pesa 1 unidad (ej: huevo ≈ 60, manzana ≈ 150). Se usa para calcular macros proporcionales.'
              : 'Los macros de arriba son por 100g. Puedes dejarlo en 100.'}
          </p>
        </div>
        {unit === 'g' && (
          <div className="space-y-2 col-span-2 rounded-xl border border-border/50 bg-muted/20 p-3">
            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              Medida casera (opcional)
            </Label>
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <Input
                name="household_label"
                placeholder="Ej: taza, cucharada, palma"
                maxLength={30}
                className="h-11 rounded-xl"
                aria-label="Nombre de la medida casera"
              />
              <Input
                name="household_grams"
                type="number"
                min={1}
                step="1"
                placeholder="g"
                className="h-11 w-24 rounded-xl"
                aria-label="Gramos que pesa la medida casera"
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              El alumno verá ej. <span className="font-semibold text-foreground">120 g (1 taza)</span>. Es solo una referencia aproximada; no cambia los macros.
            </p>
          </div>
        )}
      </div>
      <FoodEquivalenceFields value={equivalence} onChange={setEquivalence} groups={exchangeGroups} />
      <Button type="submit" disabled={pending} className="w-full h-12 font-black uppercase tracking-widest">
        {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
        {pending ? 'Guardando…' : 'Guardar'}
      </Button>
      {error && (
        <p role="alert" className="text-xs text-[var(--cta-danger)] font-bold text-center">
          {error}
        </p>
      )}
    </form>
  )
}
