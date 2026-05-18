'use client'

import { useCallback, useState } from 'react'
import Image from 'next/image'
import { Bell, Newspaper, Pin } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useNewsFeed } from './NewsFeedProvider'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

const TYPE_ICON: Record<string, string> = {
  feature: '🟢',
  improvement: '🔧',
  fix: '🐛',
  announcement: '📢',
}

const TYPE_LABEL: Record<string, string> = {
  feature: 'Nueva función',
  improvement: 'Mejora',
  fix: 'Corrección',
  announcement: 'Anuncio',
}

function relativeDate(dateStr: string | null): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return 'Hoy'
  if (diffDays === 1) return 'Ayer'
  if (diffDays < 7) return `Hace ${diffDays} días`
  if (diffDays < 30) return `Hace ${Math.floor(diffDays / 7)} semanas`
  return d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
}

function NewsFeedList({ onNavigate }: { onNavigate?: () => void }) {
  const { items } = useNewsFeed()

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <Newspaper className="h-10 w-10 text-muted-foreground/40 mb-3" />
        <p className="text-sm text-muted-foreground">No hay novedades por ahora.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {items.map((item) => (
        <div
          key={item.id}
          className={cn(
            'relative rounded-xl border p-4 transition-colors',
            item.is_pinned
              ? 'border-primary/20 bg-primary/[0.04]'
              : 'border-border bg-card'
          )}
        >
          {item.is_pinned && (
            <div className="absolute top-2 right-2 text-primary">
              <Pin className="h-3.5 w-3.5" />
            </div>
          )}
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-xs">{TYPE_ICON[item.type] || '•'}</span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {TYPE_LABEL[item.type] || item.type}
            </span>
            <span className="text-[10px] text-muted-foreground ml-auto">
              {relativeDate(item.published_at)}
            </span>
          </div>
          <h3 className="text-sm font-bold text-foreground leading-snug mb-1">
            {item.title}
          </h3>
          <p className="text-xs text-muted-foreground whitespace-pre-line leading-relaxed">
            {item.content}
          </p>
          {item.image_url && (
            <Image
              src={item.image_url}
              alt={item.title}
              width={800}
              height={400}
              className="mt-2 rounded-lg w-full h-auto object-cover max-h-40"
              sizes="(max-width: 768px) 100vw, 400px"
            />
          )}
          {item.cta_url && (
            <a
              href={item.cta_url}
              onClick={onNavigate}
              className="mt-2 inline-flex items-center text-xs font-semibold text-primary hover:underline"
            >
              {item.cta_label || 'Ver más'} →
            </a>
          )}
        </div>
      ))}
    </div>
  )
}

function BellIconWithBadge({ unreadCount }: { unreadCount: number }) {
  const badgeContent = unreadCount > 9 ? '9+' : unreadCount > 0 ? String(unreadCount) : null
  return (
    <>
      <Bell className="h-5 w-5" />
      {badgeContent && (
        <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-white">
          {badgeContent}
        </span>
      )}
    </>
  )
}

export function NewsBellButton() {
  const { unreadCount, markAllAsRead } = useNewsFeed()
  const [isMobileOpen, setIsMobileOpen] = useState(false)
  const [isDesktopOpen, setIsDesktopOpen] = useState(false)

  const handleMobileOpen = useCallback(
    async (open: boolean) => {
      setIsMobileOpen(open)
      if (open) {
        await markAllAsRead()
      }
    },
    [markAllAsRead]
  )

  const handleDesktopOpen = useCallback(
    async (open: boolean) => {
      setIsDesktopOpen(open)
      if (open) {
        await markAllAsRead()
      }
    },
    [markAllAsRead]
  )

  return (
    <>
      {/* Mobile: Sheet */}
      <div className="md:hidden flex items-center">
        <Sheet open={isMobileOpen} onOpenChange={handleMobileOpen}>
          <button
            type="button"
            onClick={() => handleMobileOpen(true)}
            className="relative flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Novedades"
          >
            <BellIconWithBadge unreadCount={unreadCount} />
          </button>
          <SheetContent side="bottom" className="max-h-[80dvh] rounded-t-2xl">
            <SheetHeader className="pb-4">
              <SheetTitle>Novedades</SheetTitle>
            </SheetHeader>
            <div className="overflow-y-auto pb-safe">
              <NewsFeedList onNavigate={() => setIsMobileOpen(false)} />
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Desktop: Popover */}
      <div className="hidden md:block">
        <Popover open={isDesktopOpen} onOpenChange={handleDesktopOpen}>
          <PopoverTrigger
            className="relative text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Novedades"
          >
            <BellIconWithBadge unreadCount={unreadCount} />
          </PopoverTrigger>
          <PopoverContent
            align="end"
            side="bottom"
            sideOffset={8}
            className="w-80 max-h-[70vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold">Novedades</h3>
            </div>
            <NewsFeedList onNavigate={() => setIsDesktopOpen(false)} />
          </PopoverContent>
        </Popover>
      </div>
    </>
  )
}
