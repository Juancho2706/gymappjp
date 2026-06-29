'use client'

import { useMemo, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Users, ChevronRight, Trash2, Search, UserPlus } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { unassignNutritionPlan, createEmptyClientNutritionPlan } from '../_actions/nutrition-coach.actions'
import { toast } from 'sonner'
import type { ActivePlanBoardRow } from '../_data/nutrition-coach.queries'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

export type ActivePlanRow = ActivePlanBoardRow

type Props = {
  coachId: string
  activePlans: ActivePlanBoardRow[]
  clientsWithoutPlan: { id: string; full_name: string }[]
}

/**
 * Botón "Asignar" de la lista "Sin plan activo": crea un plan draft vacío (planId real) y abre el
 * editor con el modo Porciones ya activable — sin el doble-guardado previo. Idempotente server-side.
 */
function AssignButton({ coachId, clientId }: { coachId: string; clientId: string }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const onAssign = async () => {
    setPending(true)
    const res = await createEmptyClientNutritionPlan(coachId, clientId)
    if (res.success) {
      // Navega al editor del plan ya persistido (no reseteamos pending: cambiamos de página).
      router.push(`/coach/nutrition-plans/client/${clientId}`)
    } else {
      setPending(false)
      toast.error(res.error || 'No se pudo crear el plan.')
    }
  }
  return (
    <Button
      size="sm"
      variant="secondary"
      className="shrink-0 gap-1 text-[10px] font-black uppercase"
      onClick={onAssign}
      disabled={pending}
    >
      <UserPlus className="w-3 h-3" />
      {pending ? 'Creando…' : 'Asignar'}
    </Button>
  )
}

export function ActivePlansBoard({ coachId, activePlans, clientsWithoutPlan }: Props) {
  const [isProcessing, setIsProcessing] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<'name' | 'plan' | 'updated'>('name')
  const [unassignTarget, setUnassignTarget] = useState<{ clientId: string; planId: string } | null>(
    null
  )

  const runUnassign = async () => {
    if (!unassignTarget) return
    const { clientId, planId } = unassignTarget
    setUnassignTarget(null)
    setIsProcessing(clientId)
    try {
      const result = await unassignNutritionPlan(coachId, clientId, planId)
      if (result.error) toast.error(result.error)
      else toast.success('Plan desasignado')
    } finally {
      setIsProcessing(null)
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = activePlans.filter((row) => {
      if (!q) return true
      const name = row.clients?.full_name?.toLowerCase() ?? ''
      const plan = row.name.toLowerCase()
      return name.includes(q) || plan.includes(q)
    })
    list = [...list].sort((a, b) => {
      if (sort === 'plan') return a.name.localeCompare(b.name)
      if (sort === 'updated')
        return (b.updated_at ?? '').localeCompare(a.updated_at ?? '')
      return (a.clients?.full_name ?? '').localeCompare(b.clients?.full_name ?? '')
    })
    return list
  }, [activePlans, query, sort])

  const synced = filtered.filter((p) => !p.is_custom)
  const custom = filtered.filter((p) => p.is_custom)

  const PlanCard = ({ row }: { row: ActivePlanBoardRow }) => {
    const client = row.clients
    const label = client?.full_name ?? 'Alumno'
    const isCustom = row.is_custom
    const accent = isCustom ? 'var(--ember-500)' : 'var(--sport-500)'
    const accentSoft = isCustom ? 'var(--ember-100)' : 'var(--sport-100)'
    const accentFg = isCustom ? 'var(--ember-600)' : 'var(--sport-600)'
    return (
      <Card className="group border-[var(--border-subtle)] bg-surface-card backdrop-blur-sm hover:border-[color:var(--border-strong)] transition-all">
        <div className="p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center font-bold shrink-0"
                  style={{ backgroundColor: accentSoft, color: accentFg }}
                >
                  {label.charAt(0)}
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-sm leading-tight truncate text-[var(--text-strong)]">{label}</h3>
                  <p className="text-xs text-[var(--text-muted)] truncate">{row.name}</p>
                </div>
              </div>
            </div>
            <Badge tone={isCustom ? 'ember' : 'sport'} variant="soft" size="sm" className="shrink-0">
              {isCustom ? 'CUSTOM' : 'SYNCED'}
            </Badge>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-subtle)]">Últimos 7 días</p>
              <p className="text-[10px] text-[var(--text-muted)] tabular-nums">
                Hoy:{' '}
                <span className="font-bold text-[var(--text-strong)]">{row.todayCaloriesConsumed}</span>
                {row.dailyTargetCalories != null && row.dailyTargetCalories > 0 ? (
                  <>
                    {' '}
                    / {Math.round(row.dailyTargetCalories)} kcal
                  </>
                ) : (
                  ' kcal'
                )}
              </p>
            </div>
            <div className="h-8 flex items-end gap-1 w-full" title="Adherencia diaria (% de comidas marcadas)">
              {row.sparkline7d.map((v, i) => (
                <div
                  key={i}
                  className="flex-1 min-w-0 rounded-sm"
                  style={{
                    height: `${Math.max(6, Math.round((Math.min(v, 100) / 100) * 100))}%`,
                    backgroundColor: accent,
                    opacity: 0.4 + Math.min(v, 100) / 200,
                  }}
                />
              ))}
            </div>
            <p className="text-[10px] text-[var(--text-subtle)]">
              Más detalle: <span className="text-[var(--text-body)]">perfil del alumno</span>
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link href={`/coach/nutrition-plans/client/${row.client_id}`} className="flex-1 min-w-[120px]">
              <Button variant="secondary" className="w-full justify-between h-9 text-xs">
                Gestionar plan
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </Link>
            <Button
              variant="destructive"
              size="icon"
              className="h-9 w-9 shrink-0"
              onClick={() => setUnassignTarget({ clientId: row.client_id, planId: row.id })}
              disabled={isProcessing === row.client_id}
              title="Quitar plan"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </Card>
    )
  }

  const Column = ({
    title,
    subtitle,
    tone,
    rows,
  }: {
    title: string
    subtitle: string
    tone: 'sport' | 'ember'
    rows: ActivePlanBoardRow[]
  }) => (
    <div className="space-y-3 min-w-0">
      <div className="px-1 space-y-0.5">
        <div className="flex items-center gap-2">
          <h3
            className="text-xs font-extrabold uppercase tracking-wide"
            style={{ color: tone === 'ember' ? 'var(--ember-600)' : 'var(--sport-600)' }}
          >
            {title}
          </h3>
          <span className="text-[11px] font-bold text-[var(--text-subtle)] tabular-nums">{rows.length}</span>
        </div>
        <p className="text-[11px] text-[var(--text-subtle)]">{subtitle}</p>
      </div>
      {rows.length === 0 ? (
        <div className="rounded-card border border-dashed border-[var(--border-default)] p-8 text-center text-sm text-[var(--text-subtle)]">
          Sin planes en esta columna
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <PlanCard key={row.id} row={row} />
          ))}
        </div>
      )}
    </div>
  )

  return (
    <div className="space-y-8">
      <AlertDialog open={unassignTarget !== null} onOpenChange={(o) => !o && setUnassignTarget(null)}>
        <AlertDialogContent className="rounded-2xl border-border bg-card text-foreground">
          <AlertDialogHeader>
            <AlertDialogTitle>Quitar plan de nutrición</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Quitar el plan activo de este alumno? Podrás asignar otro después desde Plantillas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel className="rounded-xl">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void runUnassign()}
            >
              Quitar plan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por alumno o plan…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9 h-10 rounded-xl"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {(['name', 'plan', 'updated'] as const).map((key) => (
            <Button
              key={key}
              type="button"
              variant={sort === key ? 'default' : 'outline'}
              size="sm"
              className="text-[10px] font-black uppercase tracking-widest h-8"
              onClick={() => setSort(key)}
            >
              {key === 'name' ? 'Alumno' : key === 'plan' ? 'Plan' : 'Actualizado'}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Column
          title="Sincronizados"
          subtitle="Siguen una plantilla — los cambios se propagan."
          tone="sport"
          rows={synced}
        />
        <Column
          title="Personalizados"
          subtitle="Editados a mano — no sincronizan con la plantilla."
          tone="ember"
          rows={custom}
        />
      </div>

      {clientsWithoutPlan.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-black uppercase tracking-tight flex items-center gap-2 text-[var(--text-strong)]">
            <Users className="w-4 h-4 text-[var(--text-muted)]" />
            Sin plan activo ({clientsWithoutPlan.length})
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {clientsWithoutPlan.map((c) => (
              <Card key={c.id} className="p-4 border-[var(--border-subtle)] bg-surface-card flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold text-sm truncate text-[var(--text-strong)]">{c.full_name}</p>
                  <p className="text-[10px] text-[var(--text-subtle)] uppercase tracking-widest">Asigna desde Plantillas</p>
                </div>
                <AssignButton coachId={coachId} clientId={c.id} />
              </Card>
            ))}
          </div>
        </div>
      )}

      {activePlans.length === 0 && clientsWithoutPlan.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 bg-surface-sunken rounded-card border border-dashed border-[var(--border-default)]">
          <Users className="w-12 h-12 text-[var(--text-subtle)] mb-4" />
          <p className="text-[var(--text-muted)] font-medium">No hay alumnos en tu cartera</p>
        </div>
      )}
    </div>
  )
}
