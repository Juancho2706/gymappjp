'use client'

import { useActionState, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Loader2, Save } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useFormStatus } from 'react-dom'
import { saveCustomFood } from '@/app/coach/nutrition-plans/_actions/nutrition-coach.actions'
import { toast } from 'sonner'

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

export function AddFoodSheet({ coachId }: { coachId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [state, formAction] = useActionState(saveCustomFood.bind(null, coachId), { error: undefined, success: false })

  useEffect(() => {
    if (state.success) {
      setOpen(false)
      toast.success('Alimento creado')
      router.refresh()
    }
  }, [state.success, router])

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        className={buttonVariants({
          className:
            'gap-2 font-black uppercase tracking-widest text-[10px] h-11 rounded-2xl w-full sm:w-auto',
        })}
      >
        <Plus className="w-4 h-4" />
        Nuevo alimento
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[90vh]">
        <SheetHeader>
          <SheetTitle>Nuevo alimento custom</SheetTitle>
        </SheetHeader>
        <div className="px-6 pb-6 overflow-y-auto">
          <AddFoodFormBody formAction={formAction} state={state} />
        </div>
      </SheetContent>
    </Sheet>
  )
}

function AddFoodFormBody({
  formAction,
  state,
}: {
  formAction: (payload: FormData) => void
  state: { error?: string; success?: boolean }
}) {
  const [unit, setUnit] = useState<'g' | 'un'>('g')
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
    <form action={formAction} className="space-y-4 pt-2">
      <div className="space-y-2">
        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Nombre</Label>
        <Input name="name" required placeholder="Ej: Huevo cocido" className="h-11 rounded-xl" />
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed rounded-xl border border-border/50 bg-muted/20 px-3 py-2">
        Las calorías y macros de abajo son <span className="font-semibold text-foreground">por cada 100 gramos</span> (como en una tabla nutricional). En el plan del alumno el coach puede poner cantidad en{' '}
        <span className="font-semibold text-foreground">gramos</span> (ej. 200) o en <span className="font-semibold text-foreground">unidades</span> (ej. 1 huevo): para unidades, indica cuántos gramos pesa una unidad.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Kcal (100g)</Label>
          <Input
            name="calories"
            type="number"
            step="0.1"
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
          <div className="flex h-2 rounded-full overflow-hidden bg-muted">
            <div className="h-full bg-blue-500/90" style={{ width: `${pct.p}%` }} />
            <div className="h-full bg-emerald-500/90" style={{ width: `${pct.c}%` }} />
            <div className="h-full bg-purple-500/90" style={{ width: `${pct.f}%` }} />
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
          <Select value={unit} onValueChange={(v: 'g' | 'un') => setUnit(v)}>
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
      </div>
      <SubmitRow />
      {state.error && <p className="text-xs text-rose-500 font-bold text-center">{state.error}</p>}
    </form>
  )
}

function SubmitRow() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending} className="w-full h-12 font-black uppercase tracking-widest">
      {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
      {pending ? 'Guardando…' : 'Guardar'}
    </Button>
  )
}
