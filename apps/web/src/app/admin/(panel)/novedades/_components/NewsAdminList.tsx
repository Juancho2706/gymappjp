'use client'

import { useState } from 'react'
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
import { Pin, Archive, Trash2, Send, Check } from 'lucide-react'
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

export function NewsAdminList({ items }: Props) {
  const router = useRouter()
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<NewsItem | null>(null)

  async function handlePublish(item: NewsItem, restoring = false) {
    setLoadingId(item.id)
    const res = await publishNewsItemAction(item.id)
    setLoadingId(null)
    if (res.success) {
      toast.success(restoring ? `"${item.title}" restaurada y publicada` : `"${item.title}" publicada`)
      router.refresh()
    } else {
      toast.error(res.error || 'No se pudo publicar la novedad')
    }
  }

  async function handleArchive(item: NewsItem) {
    setLoadingId(item.id)
    const res = await archiveNewsItemAction(item.id)
    setLoadingId(null)
    if (res.success) {
      toast.success(`"${item.title}" archivada`)
      router.refresh()
    } else {
      toast.error(res.error || 'No se pudo archivar la novedad')
    }
  }

  // El confirm() nativo se cambia por AdminConfirmDialog: es la unica accion irreversible de la seccion.
  async function handleDeleteConfirm() {
    const item = pendingDelete
    if (!item) return
    setLoadingId(item.id)
    const res = await deleteNewsItemAction(item.id)
    setLoadingId(null)
    if (res.success) {
      toast.success(`"${item.title}" eliminada`)
      router.refresh()
    } else {
      toast.error(res.error || 'No se pudo eliminar la novedad')
    }
  }

  async function handleTogglePin(item: NewsItem) {
    const current = item.is_pinned ?? false
    setLoadingId(item.id)
    const res = await togglePinNewsItemAction(item.id, !current)
    setLoadingId(null)
    if (res.success) {
      toast.success(current ? `"${item.title}" desfijada` : `"${item.title}" fijada arriba`)
      router.refresh()
    } else {
      toast.error(res.error || 'No se pudo cambiar el pin de la novedad')
    }
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
      {items.map((item) => (
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
                <span className={cn('text-[10px] font-bold uppercase tracking-wider', STATUS_COLORS[item.status || 'draft'])}>
                  {STATUS_LABELS[item.status || 'draft']}
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
              {item.status === 'draft' && (
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => handlePublish(item)}
                  disabled={loadingId === item.id}
                  title="Publicar"
                >
                  <Send className="h-3.5 w-3.5 text-[var(--success-500)]" />
                </Button>
              )}
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={() => handleTogglePin(item)}
                disabled={loadingId === item.id}
                title={item.is_pinned ? 'Desfijar' : 'Fijar'}
              >
                <Pin className={cn('h-3.5 w-3.5', item.is_pinned ? 'text-[var(--sport-500)]' : 'text-muted')} />
              </Button>
              <NewsCreateSheet
                newsItem={item}
                onSuccess={() => router.refresh()}
              />
              {item.status !== 'archived' ? (
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => handleArchive(item)}
                  disabled={loadingId === item.id}
                  title="Archivar"
                >
                  <Archive className="h-3.5 w-3.5 text-[var(--warning-500)]" />
                </Button>
              ) : (
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => handlePublish(item, true)}
                  disabled={loadingId === item.id}
                  title="Restaurar"
                >
                  <Check className="h-3.5 w-3.5 text-[var(--success-500)]" />
                </Button>
              )}
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={() => setPendingDelete(item)}
                disabled={loadingId === item.id}
                title="Eliminar"
              >
                <Trash2 className="h-3.5 w-3.5 text-[var(--danger-500)]" />
              </Button>
            </div>
          </div>
        </div>
      ))}

      <AdminConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(next) => { if (!next) setPendingDelete(null) }}
        title="Eliminar novedad"
        description={`"${pendingDelete?.title ?? ''}" se borra permanentemente. Si prefieres solo sacarla del feed, usa Archivar.`}
        blastRadius={
          pendingDelete?.status === 'published'
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
