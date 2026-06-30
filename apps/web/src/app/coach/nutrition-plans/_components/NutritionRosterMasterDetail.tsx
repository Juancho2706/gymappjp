'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Search, Pencil, Trash2, Utensils, ChevronRight, Salad, UserPlus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ProgressRing } from '@/components/ui/progress-ring'
import { toast } from 'sonner'
import {
  unassignNutritionPlan,
  createEmptyClientNutritionPlan,
} from '../_actions/nutrition-coach.actions'
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

type RosterStatus = 'aldia' | 'enriesgo' | 'atrasada'

// Espejo VERBATIM del DS Badge (size="sm", variant="soft"): bg = soft (-100),
// color = softFg (success-600 / warning-700 / danger-600), dot = base (-500).
const STATUS_META: Record<RosterStatus, { label: string; dot: string; pillBg: string; pillFg: string }> = {
  aldia: { label: 'Al día', dot: 'var(--success-500)', pillBg: 'var(--success-100)', pillFg: 'var(--success-600)' },
  enriesgo: { label: 'En riesgo', dot: 'var(--warning-500)', pillBg: 'var(--warning-100)', pillFg: 'var(--warning-700)' },
  atrasada: { label: 'Atrasada', dot: 'var(--danger-500)', pillBg: 'var(--danger-100)', pillFg: 'var(--danger-600)' },
}

const STATUS_RING: Record<RosterStatus, string> = {
  aldia: 'var(--success-500)',
  enriesgo: 'var(--warning-500)',
  atrasada: 'var(--danger-500)',
}

const STATUS_ORDER: Record<RosterStatus, number> = { enriesgo: 0, atrasada: 1, aldia: 2 }

// Adherencia 7d → estado (espejo del rail del diseño: en riesgo 50-69 · al día ≥70).
function statusFromAdherence(adh: number, hasPlan: boolean): RosterStatus {
  if (!hasPlan) return 'atrasada'
  if (adh >= 70) return 'aldia'
  if (adh >= 50) return 'enriesgo'
  return 'atrasada'
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

// Espejo VERBATIM de macroCalorieSplit (TemplateLibrary): reparto calórico P/C/G.
function macroCalorieSplit(calories: number, p: number, c: number, f: number) {
  const fromMacros = p * 4 + c * 4 + f * 9
  const denom = calories > 0 ? calories : fromMacros
  if (denom <= 0) return { pPct: 33, cPct: 34, fPct: 33 }
  const pPct = Math.round(((p * 4) / denom) * 100)
  const cPct = Math.round(((c * 4) / denom) * 100)
  const fPct = Math.max(0, 100 - pPct - cPct)
  return { pPct, cPct, fPct }
}

type RailItem = {
  clientId: string
  name: string
  status: RosterStatus
  adherence: number
  planName: string | null
  row: ActivePlanBoardRow | null
}

type Props = {
  coachId: string
  activePlans: ActivePlanBoardRow[]
  clientsWithoutPlan: { id: string; full_name: string }[]
}

export function NutritionRosterMasterDetail({ coachId, activePlans, clientsWithoutPlan }: Props) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [unassignTarget, setUnassignTarget] = useState<{ clientId: string; planId: string } | null>(null)
  const [isProcessing, setIsProcessing] = useState<string | null>(null)

  const items = useMemo<RailItem[]>(() => {
    const withPlan: RailItem[] = activePlans.map((row) => {
      const adherence = row.sparkline7d.length
        ? Math.round(row.sparkline7d.reduce((a, b) => a + b, 0) / row.sparkline7d.length)
        : 0
      return {
        clientId: row.client_id,
        name: row.clients?.full_name ?? 'Alumno',
        status: statusFromAdherence(adherence, true),
        adherence,
        planName: row.name,
        row,
      }
    })
    const noPlan: RailItem[] = clientsWithoutPlan.map((c) => ({
      clientId: c.id,
      name: c.full_name,
      status: 'atrasada' as const,
      adherence: 0,
      planName: null,
      row: null,
    }))
    return [...withPlan, ...noPlan]
  }, [activePlans, clientsWithoutPlan])

  const list = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items
      .filter((it) => {
        if (!q) return true
        return it.name.toLowerCase().includes(q) || (it.planName?.toLowerCase().includes(q) ?? false)
      })
      .slice()
      .sort((a, b) => {
        const so = STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
        if (so !== 0) return so
        if (a.adherence !== b.adherence) return a.adherence - b.adherence
        return a.name.localeCompare(b.name)
      })
  }, [items, search])

  // Auto-seleccionar el primero (mayor prioridad) — solo en desktop real (monta hidden md:flex).
  useEffect(() => {
    if (typeof window !== 'undefined' && !window.matchMedia('(min-width: 768px)').matches) return
    if (!selectedId && list.length > 0) setSelectedId(list[0].clientId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.length])

  const selected = useMemo(() => items.find((it) => it.clientId === selectedId) ?? null, [items, selectedId])

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

  return (
    <div className="flex h-[calc(100dvh-15rem)] min-h-[560px] overflow-hidden rounded-card border border-subtle bg-surface-card">
      {/* ── Rail izquierdo (dt-md-list) ─────────────────────────────── */}
      <aside className="flex w-[260px] shrink-0 flex-col border-r border-subtle bg-surface-card min-[1000px]:w-[340px]">
        <div className="shrink-0 border-b border-subtle px-4 pb-3 pt-4">
          <div className="mb-3 flex items-center gap-2">
            <span className="font-display text-[16px] font-extrabold tracking-[-0.02em] text-strong min-[860px]:text-[18px]">
              Alumnos
            </span>
            <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-[12px] font-bold text-subtle">
              {items.length}
            </span>
          </div>
          <div className="relative flex items-center">
            <Search className="pointer-events-none absolute left-2.5 h-[15px] w-[15px] text-subtle" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar alumno…"
              className="h-9 w-full rounded-control border border-subtle bg-surface-sunken pl-8 pr-2.5 text-[13.5px] text-strong outline-none focus:border-sport-500 focus:bg-surface-card"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {list.length === 0 ? (
            <div className="px-5 py-5 text-center text-[13px] text-muted">Sin resultados</div>
          ) : (
            list.map((it) => {
              const meta = STATUS_META[it.status]
              const active = it.clientId === selectedId
              return (
                <button
                  key={it.clientId}
                  type="button"
                  onClick={() => setSelectedId(it.clientId)}
                  className={cn(
                    'relative mb-0.5 flex w-full items-center gap-[11px] rounded-control p-2.5 text-left transition-colors',
                    active
                      ? "bg-sport-100 before:absolute before:left-0 before:top-2 before:bottom-2 before:w-[3px] before:rounded-r-[3px] before:bg-sport-500 before:content-['']"
                      : 'hover:bg-surface-sunken'
                  )}
                >
                  <span
                    className="relative flex h-8 w-8 shrink-0 rounded-full"
                    style={{ padding: 2, background: STATUS_RING[it.status] }}
                  >
                    <span
                      className="flex h-full w-full items-center justify-center rounded-full font-display text-[11.5px] font-extrabold tracking-[-0.02em]"
                      style={{
                        background: 'var(--surface-inverse)',
                        color: 'var(--sport-400)',
                        border: '2px solid var(--surface-card)',
                      }}
                    >
                      {initialsOf(it.name)}
                    </span>
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-px">
                    <span className="truncate text-[14px] font-bold text-strong">{it.name}</span>
                    <span className="hidden truncate text-[11.5px] text-subtle min-[860px]:block">
                      {it.planName ?? 'Sin plan'}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-[3px]">
                    <span
                      className="inline-flex h-5 items-center gap-1 rounded-pill border border-transparent px-2 text-[11px] font-bold tracking-[0.01em]"
                      style={{ background: meta.pillBg, color: meta.pillFg }}
                    >
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta.dot }} />
                      {meta.label}
                    </span>
                    <span
                      className={cn(
                        'eva-mono text-[12px] font-bold',
                        it.adherence < 60 ? 'text-[var(--danger-600)]' : 'text-muted'
                      )}
                    >
                      {it.adherence}%
                    </span>
                  </span>
                </button>
              )
            })
          )}
        </div>
      </aside>

      {/* ── Panel derecho (dt-md-detail): ficha de nutrición del seleccionado ── */}
      <section key={selectedId || 'empty'} className="relative min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[var(--dt-read-mid)] p-5 lg:p-6">
          {!selected ? (
            <DetailEmpty />
          ) : selected.row ? (
            <PlanDetail
              item={selected}
              onUnassign={() => setUnassignTarget({ clientId: selected.clientId, planId: selected.row!.id })}
              unassigning={isProcessing === selected.clientId}
            />
          ) : (
            <NoPlanDetail coachId={coachId} clientId={selected.clientId} name={selected.name} router={router} />
          )}
        </div>
      </section>

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
    </div>
  )
}

// ── Detalle: plan activo del alumno (espejo de NutritionPlanCoach) ───────────
function PlanDetail({
  item,
  onUnassign,
  unassigning,
}: {
  item: RailItem
  onUnassign: () => void
  unassigning: boolean
}) {
  const row = item.row!
  const kcal = row.dailyTargetCalories ?? 0
  const p = row.targetProtein ?? 0
  const c = row.targetCarbs ?? 0
  const f = row.targetFats ?? 0
  const split = macroCalorieSplit(kcal, p, c, f)
  const editHref = `/coach/nutrition-plans/client/${item.clientId}`

  const macros: { name: string; value: number; pct: number; color: string }[] = [
    { name: 'Proteína', value: p, pct: split.pPct, color: 'var(--ember-500)' },
    { name: 'Carbohidratos', value: c, pct: split.cPct, color: 'var(--sport-600)' },
    { name: 'Grasas', value: f, pct: split.fPct, color: 'var(--aqua-500)' },
  ]

  return (
    <div className="space-y-4">
      {/* Header — subtitle (alumno) + título Nutrición + editar */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-subtle truncate">{item.name}</p>
          <h2 className="font-display text-[26px] font-extrabold leading-tight tracking-[-0.02em] text-strong">
            Nutrición
          </h2>
        </div>
        <Link
          href={editHref}
          title="Editar plan"
          aria-label="Editar plan"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-[var(--surface-inverse)] text-[var(--text-on-dark)] transition-[filter] hover:brightness-110"
        >
          <Pencil className="h-[18px] w-[18px]" />
        </Link>
      </div>

      {/* Hero inverse — anillo adherencia + objetivo diario (verbatim NutritionPlanCoach) */}
      <div
        className="flex items-center gap-[18px] rounded-card p-5"
        style={{ background: 'var(--surface-inverse)' }}
      >
        <ProgressRing
          value={item.adherence}
          size={78}
          color="var(--ember-500)"
          track="rgba(255,255,255,0.12)"
          label={
            <div className="text-center">
              <div className="font-display text-[20px] font-black leading-none" style={{ color: 'var(--text-on-dark)' }}>
                {item.adherence}%
              </div>
              <div className="text-[9px] font-bold" style={{ color: 'var(--text-on-dark-muted)' }}>
                ADHERENCIA
              </div>
            </div>
          }
        />
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: 'var(--ember-400)' }}>
            Objetivo diario
          </div>
          <div className="font-display text-[30px] font-black leading-tight tabular-nums" style={{ color: 'var(--text-on-dark)' }}>
            {kcal > 0 ? kcal.toLocaleString('es-CL') : '—'}{' '}
            <span className="text-[14px] font-semibold" style={{ color: 'var(--text-on-dark-muted)' }}>kcal</span>
          </div>
          <div className="text-[13px]" style={{ color: 'var(--text-on-dark-muted)' }}>
            {row.is_custom ? 'Personalizado' : 'Sincronizado'} · {item.planName}
          </div>
        </div>
      </div>

      {/* Macros objetivo */}
      <div className="rounded-card border border-subtle bg-surface-card p-4">
        <h3 className="mb-3.5 font-display text-[15px] font-extrabold tracking-[-0.01em] text-strong">Macros objetivo</h3>
        <div className="flex flex-col gap-3.5">
          {macros.map((m) => (
            <div key={m.name} className="space-y-1.5">
              <div className="flex items-center justify-between text-[13px]">
                <span className="font-semibold text-body">{m.name}</span>
                <span className="eva-mono font-bold text-strong tabular-nums">
                  {m.value}
                  <span className="ml-0.5 text-[11px] font-semibold text-muted">g</span>
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-pill bg-surface-sunken">
                <div className="h-full rounded-pill" style={{ width: `${Math.max(4, m.pct)}%`, background: m.color }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Adherencia 7 días + kcal de hoy */}
      <div className="rounded-card border border-subtle bg-surface-card p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-[10px] font-black uppercase tracking-widest text-subtle">Últimos 7 días</h3>
          <p className="text-[11px] text-muted tabular-nums">
            Hoy: <span className="font-bold text-strong">{row.todayCaloriesConsumed}</span>
            {kcal > 0 ? <> / {Math.round(kcal)} kcal</> : ' kcal'}
          </p>
        </div>
        <div className="flex h-9 w-full items-end gap-1" title="Adherencia diaria (% de comidas marcadas)">
          {row.sparkline7d.map((v, i) => (
            <div
              key={i}
              className="min-w-0 flex-1 rounded-sm"
              style={{
                height: `${Math.max(6, Math.round((Math.min(v, 100) / 100) * 100))}%`,
                background: 'var(--ember-500)',
                opacity: 0.4 + Math.min(v, 100) / 200,
              }}
            />
          ))}
        </div>
      </div>

      {/* CTA */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Link
          href={editHref}
          className="eva-press inline-flex h-11 flex-1 min-w-[160px] items-center justify-center gap-2 rounded-control text-[14px] font-bold text-[var(--text-on-sport)] transition-[filter] hover:brightness-105"
          style={{ background: 'var(--cta-fill)' }}
        >
          <Utensils className="h-4 w-4" />
          Gestionar plan
          <ChevronRight className="h-4 w-4" />
        </Link>
        <button
          type="button"
          onClick={onUnassign}
          disabled={unassigning}
          title="Quitar plan"
          aria-label="Quitar plan"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control border border-default text-[var(--danger-600)] transition-colors hover:bg-[var(--danger-100)] disabled:opacity-50"
        >
          <Trash2 className="h-[18px] w-[18px]" />
        </button>
      </div>
    </div>
  )
}

// ── Detalle: alumno sin plan activo ──────────────────────────────────────────
function NoPlanDetail({
  coachId,
  clientId,
  name,
  router,
}: {
  coachId: string
  clientId: string
  name: string
  router: ReturnType<typeof useRouter>
}) {
  const [pending, setPending] = useState(false)
  const onAssign = async () => {
    setPending(true)
    const res = await createEmptyClientNutritionPlan(coachId, clientId)
    if (res.success) {
      router.push(`/coach/nutrition-plans/client/${clientId}`)
    } else {
      setPending(false)
      toast.error(res.error || 'No se pudo crear el plan.')
    }
  }
  return (
    <div className="space-y-4">
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-subtle truncate">{name}</p>
        <h2 className="font-display text-[26px] font-extrabold leading-tight tracking-[-0.02em] text-strong">
          Nutrición
        </h2>
      </div>
      <div className="flex flex-col items-center justify-center gap-3 rounded-card border border-dashed border-default bg-surface-sunken px-6 py-14 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-card bg-[var(--ember-100)] text-[var(--ember-600)]">
          <Salad className="h-7 w-7" />
        </div>
        <div className="font-display text-[16px] font-extrabold text-strong">Sin plan de nutrición</div>
        <p className="max-w-sm text-[13px] text-muted">
          {name.split(' ')[0]} todavía no tiene un plan activo. Creá uno desde cero o asignale una plantilla.
        </p>
        <button
          type="button"
          onClick={onAssign}
          disabled={pending}
          className="eva-press mt-1 inline-flex h-10 items-center justify-center gap-1.5 rounded-control px-4 text-[13px] font-bold text-[var(--text-on-sport)] transition-[filter] hover:brightness-105 disabled:opacity-60"
          style={{ background: 'var(--cta-fill)' }}
        >
          <UserPlus className="h-4 w-4" />
          {pending ? 'Creando…' : 'Crear plan'}
        </button>
      </div>
    </div>
  )
}

function DetailEmpty() {
  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center gap-3 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-card border border-subtle bg-surface-sunken">
        <Salad className="h-7 w-7 text-muted opacity-50" />
      </div>
      <div className="font-display text-lg font-black tracking-tight text-strong">Selecciona un alumno</div>
      <p className="max-w-sm text-sm text-muted">
        Elegí un alumno para ver y ajustar su plan de nutrición, adherencia e intercambios.
      </p>
    </div>
  )
}
