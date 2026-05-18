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
  draft: 'text-muted-foreground',
  published: 'text-emerald-500',
  archived: 'text-amber-500',
}

export function NewsAdminList({ items }: Props) {
  const router = useRouter()
  const [loadingId, setLoadingId] = useState<string | null>(null)

  async function handlePublish(id: string) {
    setLoadingId(id)
    const res = await publishNewsItemAction(id)
    setLoadingId(null)
    if (res.success) {
      toast.success('Novedad publicada')
      router.refresh()
    } else {
      toast.error(res.error)
    }
  }

  async function handleArchive(id: string) {
    setLoadingId(id)
    const res = await archiveNewsItemAction(id)
    setLoadingId(null)
    if (res.success) {
      toast.success('Novedad archivada')
      router.refresh()
    } else {
      toast.error(res.error)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar esta novedad permanentemente?')) return
    setLoadingId(id)
    const res = await deleteNewsItemAction(id)
    setLoadingId(null)
    if (res.success) {
      toast.success('Novedad eliminada')
      router.refresh()
    } else {
      toast.error(res.error)
    }
  }

  async function handleTogglePin(id: string, current: boolean) {
    setLoadingId(id)
    const res = await togglePinNewsItemAction(id, !current)
    setLoadingId(null)
    if (res.success) {
      toast.success(current ? 'Desfijado' : 'Fijado')
      router.refresh()
    } else {
      toast.error(res.error)
    }
  }

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-[--admin-border] bg-[--admin-bg-surface] p-8 text-center">
        <p className="text-sm text-[--admin-text-3]">No hay novedades creadas aún.</p>
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
              ? 'border-primary/20 bg-primary/[0.04]'
              : 'border-[--admin-border] bg-[--admin-bg-surface]'
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1">
                <NewsTypeBadge type={item.type} />
                <span className={cn('text-[10px] font-bold uppercase tracking-wider', STATUS_COLORS[item.status || 'draft'])}>
                  {STATUS_LABELS[item.status || 'draft']}
                </span>
                {item.is_pinned && <Pin className="h-3 w-3 text-primary" />}
              </div>
              <h3 className="text-sm font-bold text-[--admin-text-1] truncate">{item.title}</h3>
              <p className="text-xs text-[--admin-text-3] line-clamp-2 mt-1">{item.content}</p>
              {item.published_at && (
                <p className="text-[10px] text-[--admin-text-3] mt-1">
                  Publicado: {new Date(item.published_at).toLocaleDateString('es-CL')}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-1">
              {item.status === 'draft' && (
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => handlePublish(item.id)}
                  disabled={loadingId === item.id}
                  title="Publicar"
                >
                  <Send className="h-3.5 w-3.5 text-emerald-500" />
                </Button>
              )}
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={() => handleTogglePin(item.id, item.is_pinned ?? false)}
                disabled={loadingId === item.id}
                title={item.is_pinned ? 'Desfijar' : 'Fijar'}
              >
                <Pin className={cn('h-3.5 w-3.5', item.is_pinned ? 'text-primary' : 'text-[--admin-text-3]')} />
              </Button>
              <NewsCreateSheet
                newsItem={item}
                onSuccess={() => router.refresh()}
              />
              {item.status !== 'archived' ? (
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => handleArchive(item.id)}
                  disabled={loadingId === item.id}
                  title="Archivar"
                >
                  <Archive className="h-3.5 w-3.5 text-amber-500" />
                </Button>
              ) : (
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => handlePublish(item.id)}
                  disabled={loadingId === item.id}
                  title="Restaurar"
                >
                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                </Button>
              )}
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={() => handleDelete(item.id)}
                disabled={loadingId === item.id}
                title="Eliminar"
              >
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
