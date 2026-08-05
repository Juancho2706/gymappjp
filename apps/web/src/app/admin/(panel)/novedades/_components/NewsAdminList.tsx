'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  publishNewsItemAction,
  archiveNewsItemAction,
  deleteNewsItemAction,
  togglePinNewsItemAction,
} from '../_actions/novedades-actions'
import { NewsTypeBadge } from './NewsTypeBadge'
import { NewsCreateSheet } from './NewsCreateSheet'
import { AdminConfirmDialog } from '../../_components/AdminConfirmDialog'
import { toast } from 'sonner'
import { Pin, Archive, Trash2, Send, Check, Pencil, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type NewsItem = {
  id: string
  title: string
  type: string
  content: string
  image_url: string | null
  cta_url: string | null
  cta_label: string | null
  is_pinned: boolean | null
  status: string | null
  published_at: string | null
  created_at: string | null
}

interface Props {
  items: NewsItem[]
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Borrador',
  published: 'Publicado',
  archived: 'Archivado',
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'text-muted',
  published: 'text-[var(--success-500)]',
  archived: 'text-[var(--warning-500)]',
}

type StatusFilter = 'all' | 'draft' | 'published' | 'archived'
type TypeFilter = 'all' | 'feature' | 'improvement' | 'fix' | 'announcement'

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'draft', label: 'Borradores' },
  { value: 'published', label: 'Publicadas' },
  { value: 'archived', label: 'Archivadas' },
]

const TYPE_FILTERS: { value: TypeFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'feature', label: 'Feature' },
  { value: 'improvement', label: 'Mejora' },
  { value: 'fix', label: 'Fix' },
  { value: 'announcement', label: 'Anuncio' },
]

/** El status llega nullable de la DB; una novedad sin status es un borrador. */
const statusOf = (item: NewsItem) => item.status ?? 'draft'

type RowAction = 'publish' | 'restore' | 'archive' | 'pin' | 'delete'

function FilterPill({
  label,
  count,
  active,
  onClick,
}: {
  label: string
  count: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-pill border px-3 py-1 text-[11px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)]',
        active
          ? 'border-[var(--sport-500)]/40 bg-[var(--sport-500)]/10 text-[var(--sport-500)]'
          : 'border-subtle bg-surface-sunken text-muted hover:text-body'
      )}
      aria-pressed={active}
    >
      {label}
      <span className="ml-1.5 tabular-nums opacity-70">{count}</span>
    </button>
  )
}

export function NewsAdminList({ items }: Props) {
  const router = useRouter()
  // Antes un solo `loadingId` apagaba la fila entera sin decir QUE se estaba ejecutando.
  // Ahora el boton que corre muestra su propio spinner y el resto de la fila queda bloqueado.
  const [busy, setBusy] = useState<{ id: string; action: RowAction } | null>(null)
  const [pendingDelete, setPendingDelete] = useState<NewsItem | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')

  // Un unico sheet para las N filas. `editingItem` NO se limpia al cerrar: si lo hicieramos,
  // el titulo y los campos se vaciarian a mitad de la animacion de salida del sheet.
  const [editingItem, setEditingItem] = useState<NewsItem | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  const rowBusy = (id: string) => busy?.id === id
  const running = (id: string, action: RowAction) => busy?.id === id && busy.action === action

  const { filtered, statusCounts, typeCounts } = useMemo(() => {
    const matchesStatus = (i: NewsItem) => statusFilter === 'all' || statusOf(i) === statusFilter
    const matchesType = (i: NewsItem) => typeFilter === 'all' || i.type === typeFilter

    // Cada eje cuenta sobre lo que el OTRO filtro deja pasar: los numeros de las pills
    // reflejan lo que realmente veria el admin al hacer clic.
    const byType = items.filter(matchesType)
    const byStatus = items.filter(matchesStatus)

    return {
      filtered: items.filter((i) => matchesStatus(i) && matchesType(i)),
      statusCounts: Object.fromEntries(
        STATUS_FILTERS.map((f) => [
          f.value,
          f.value === 'all' ? byType.length : byType.filter((i) => statusOf(i) === f.value).length,
        ])
      ) as Record<StatusFilter, number>,
      typeCounts: Object.fromEntries(
        TYPE_FILTERS.map((f) => [
          f.value,
          f.value === 'all' ? byStatus.length : byStatus.filter((i) => i.type === f.value).length,
        ])
      ) as Record<TypeFilter, number>,
    }
  }, [items, statusFilter, typeFilter])

  async function run(item: NewsItem, action: RowAction, fn: () => Promise<{ success: boolean; error?: string }>, okMessage: string, fallbackError: string) {
    setBusy({ id: item.id, action })
    try {
      const res = await fn()
      if (res.success) {
        toast.success(okMessage)
        router.refresh()
      } else {
        toast.error(res.error || fallbackError)
      }
    } finally {
      setBusy(null)
    }
  }

  function handlePublish(item: NewsItem, restoring = false) {
    return run(
      item,
      restoring ? 'restore' : 'publish',
      () => publishNewsItemAction(item.id),
      restoring ? `"${item.title}" restaurada y publicada` : `"${item.title}" publicada`,
      'No se pudo publicar la novedad'
    )
  }

  function handleArchive(item: NewsItem) {
    return run(
      item,
      'archive',
      () => archiveNewsItemAction(item.id),
      `"${item.title}" archivada`,
      'No se pudo archivar la novedad'
    )
  }

  // El confirm() nativo se cambia por AdminConfirmDialog: es la unica accion irreversible de la seccion.
  async function handleDeleteConfirm() {
    const item = pendingDelete
    if (!item) return
    await run(
      item,
      'delete',
      () => deleteNewsItemAction(item.id),
      `"${item.title}" eliminada`,
      'No se pudo eliminar la novedad'
    )
  }

  function handleTogglePin(item: NewsItem) {
    const current = item.is_pinned ?? false
    return run(
      item,
      'pin',
      () => togglePinNewsItemAction(item.id, !current),
      current ? `"${item.title}" desfijada` : `"${item.title}" fijada arriba`,
      'No se pudo cambiar el pin de la novedad'
    )
  }

  function openEdit(item: NewsItem) {
    setEditingItem(item)
    setSheetOpen(true)
  }

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-subtle bg-surface-card p-8 text-center">
        <p className="text-sm text-muted">No hay novedades creadas aún.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Filtros en memoria: la lista completa ya viaja desde el server, no hay round-trip. */}
      <div className="flex flex-col gap-2 rounded-xl border border-subtle bg-surface-card p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[10px] font-bold uppercase tracking-wider text-muted">Estado</span>
          {STATUS_FILTERS.map((f) => (
            <FilterPill
              key={f.value}
              label={f.label}
              count={statusCounts[f.value]}
              active={statusFilter === f.value}
              onClick={() => setStatusFilter(f.value)}
            />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[10px] font-bold uppercase tracking-wider text-muted">Tipo</span>
          {TYPE_FILTERS.map((f) => (
            <FilterPill
              key={f.value}
              label={f.label}
              count={typeCounts[f.value]}
              active={typeFilter === f.value}
              onClick={() => setTypeFilter(f.value)}
            />
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-subtle bg-surface-card p-8 text-center">
          <p className="text-sm text-muted">Ninguna novedad coincide con estos filtros.</p>
          <button
            type="button"
            onClick={() => {
              setStatusFilter('all')
              setTypeFilter('all')
            }}
            className="mt-3 rounded-pill border border-subtle bg-surface-sunken px-3 py-1 text-[11px] font-bold text-body transition-colors hover:text-strong focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)]"
          >
            Limpiar filtros
          </button>
        </div>
      ) : (
        filtered.map((item) => (
          <div
            key={item.id}
            className={cn(
              'rounded-xl border p-4 transition-colors',
              item.is_pinned
                ? 'border-[var(--sport-500)]/20 bg-[var(--sport-500)]/[0.04]'
                : 'border-subtle bg-surface-card'
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <NewsTypeBadge type={item.type} />
                  <span className={cn('text-[10px] font-bold uppercase tracking-wider', STATUS_COLORS[statusOf(item)])}>
                    {STATUS_LABELS[statusOf(item)]}
                  </span>
                  {item.is_pinned && <Pin className="h-3 w-3 text-[var(--sport-500)]" />}
                </div>
                <h3 className="text-sm font-bold text-strong truncate">{item.title}</h3>
                <p className="text-xs text-muted line-clamp-2 mt-1">{item.content}</p>
                {item.published_at && (
                  <p className="text-[10px] text-muted mt-1">
                    Publicado: {new Date(item.published_at).toLocaleDateString('es-CL')}
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-1">
                {statusOf(item) === 'draft' && (
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => handlePublish(item)}
                    disabled={rowBusy(item.id)}
                    title="Publicar"
                  >
                    {running(item.id, 'publish') ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--success-500)]" />
                    ) : (
                      <Send className="h-3.5 w-3.5 text-[var(--success-500)]" />
                    )}
                  </Button>
                )}
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => handleTogglePin(item)}
                  disabled={rowBusy(item.id)}
                  title={item.is_pinned ? 'Desfijar' : 'Fijar'}
                >
                  {running(item.id, 'pin') ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--sport-500)]" />
                  ) : (
                    <Pin className={cn('h-3.5 w-3.5', item.is_pinned ? 'text-[var(--sport-500)]' : 'text-muted')} />
                  )}
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => openEdit(item)}
                  disabled={rowBusy(item.id)}
                  title="Editar"
                >
                  <Pencil className="h-3.5 w-3.5 text-muted" />
                </Button>
                {statusOf(item) !== 'archived' ? (
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => handleArchive(item)}
                    disabled={rowBusy(item.id)}
                    title="Archivar"
                  >
                    {running(item.id, 'archive') ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--warning-500)]" />
                    ) : (
                      <Archive className="h-3.5 w-3.5 text-[var(--warning-500)]" />
                    )}
                  </Button>
                ) : (
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => handlePublish(item, true)}
                    disabled={rowBusy(item.id)}
                    title="Restaurar"
                  >
                    {running(item.id, 'restore') ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--success-500)]" />
                    ) : (
                      <Check className="h-3.5 w-3.5 text-[var(--success-500)]" />
                    )}
                  </Button>
                )}
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => setPendingDelete(item)}
                  disabled={rowBusy(item.id)}
                  title="Eliminar"
                >
                  {running(item.id, 'delete') ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--danger-500)]" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5 text-[var(--danger-500)]" />
                  )}
                </Button>
              </div>
            </div>
          </div>
        ))
      )}

      <NewsCreateSheet
        newsItem={editingItem}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onSuccess={() => router.refresh()}
      />

      <AdminConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(next) => { if (!next) setPendingDelete(null) }}
        title="Eliminar novedad"
        description={`"${pendingDelete?.title ?? ''}" se borra permanentemente. Si prefieres solo sacarla del feed, usa Archivar.`}
        blastRadius={
          pendingDelete && statusOf(pendingDelete) === 'published'
            ? 'Esta publicada: desaparece del feed de todos los coaches al instante. No se puede deshacer.'
            : 'No se puede deshacer.'
        }
        severity="danger"
        confirmLabel="Eliminar"
        onConfirm={handleDeleteConfirm}
      />
    </div>
  )
}
