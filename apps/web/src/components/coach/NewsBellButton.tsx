'use client'

import React, { useCallback, useState } from 'react'
import Image from 'next/image'
import { Bell, Bug, Megaphone, Pin, Sparkles, Wrench, type LucideIcon } from 'lucide-react'
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

// Icono tonal redondo por tipo (.dt-notif-ico del kit: círculo 34px --tone-100/--tone-600).
const TYPE_META: Record<string, { icon: LucideIcon; bg: string; fg: string }> = {
  feature: { icon: Sparkles, bg: 'var(--sport-100)', fg: 'var(--sport-600)' },
  improvement: { icon: Wrench, bg: 'var(--success-100)', fg: 'var(--success-700)' },
  fix: { icon: Bug, bg: 'var(--ember-100)', fg: 'var(--ember-700)' },
  announcement: { icon: Megaphone, bg: 'var(--surface-sunken)', fg: 'var(--ink-700)' },
}
const TYPE_META_FALLBACK = TYPE_META.announcement

const TYPE_LABEL: Record<string, string> = {
  feature: 'Nueva función',
  improvement: 'Mejora',
  fix: 'Corrección',
  announcement: 'Anuncio',
}

// ─── Lightweight markdown renderer (no deps) ─────────────────────────────────

function inlineMd(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/)
  if (parts.length === 1) return text
  return parts.map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={i} className="font-bold text-strong">{part.slice(2, -2)}</strong>
      : part
  )
}

function MarkdownContent({ text }: { text: string }) {
  const lines = text.split('\n')
  const nodes: React.ReactNode[] = []
  let bullets: string[] = []
  let k = 0

  const flushBullets = () => {
    if (!bullets.length) return
    nodes.push(
      <ul key={k++} className="my-1 ml-4 space-y-0.5 list-disc">
        {bullets.map((b, i) => (
          <li key={i} className="text-[12px] leading-[1.35] text-muted">{inlineMd(b)}</li>
        ))}
      </ul>
    )
    bullets = []
  }

  for (const line of lines) {
    if (line.startsWith('- ')) {
      bullets.push(line.slice(2))
    } else {
      flushBullets()
      if (line.startsWith('## ')) {
        nodes.push(<h2 key={k++} className="mt-3 mb-1 text-[13px] font-bold text-strong">{inlineMd(line.slice(3))}</h2>)
      } else if (line.startsWith('### ')) {
        nodes.push(<h3 key={k++} className="mt-2 mb-0.5 text-[10.5px] font-extrabold uppercase tracking-[0.06em] text-subtle">{inlineMd(line.slice(4))}</h3>)
      } else if (line === '---') {
        nodes.push(<hr key={k++} className="my-3 border-subtle" />)
      } else if (line.trim() === '') {
        nodes.push(<div key={k++} className="h-1" />)
      } else {
        nodes.push(<p key={k++} className="text-[12px] leading-[1.35] text-muted">{inlineMd(line)}</p>)
      }
    }
  }
  flushBullets()

  return <div className="space-y-0.5">{nodes}</div>
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
      <div className="flex flex-col items-center gap-2 p-10 text-center text-[13px] text-subtle">
        <Bell size={28} />
        <span>No hay novedades por ahora.</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      {items.map((item) => {
        const meta = TYPE_META[item.type] ?? TYPE_META_FALLBACK
        const TypeIcon = meta.icon
        return (
          <div
            key={item.id}
            className={cn(
              'relative flex items-start gap-[11px] rounded-[var(--radius-md)] py-2.5 pl-3.5 pr-3 transition-colors hover:bg-[var(--surface-sunken)]',
              item.is_pinned && 'bg-[color-mix(in_srgb,var(--sport-100)_40%,transparent)]'
            )}
          >
            {/* rail sport del ítem fijado (espejo del rail unread del kit) */}
            {item.is_pinned && (
              <span
                aria-hidden="true"
                className="absolute bottom-3 left-0.5 top-3 w-[3px] rounded-full bg-[var(--sport-500)]"
              />
            )}
            <span
              className="flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center rounded-full"
              style={{ background: meta.bg, color: meta.fg }}
            >
              <TypeIcon size={16} />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <div className="flex items-center gap-1.5">
                <span className="text-[10.5px] font-extrabold uppercase tracking-[0.06em] text-subtle">
                  {TYPE_LABEL[item.type] || item.type}
                </span>
                {item.is_pinned && <Pin className="h-3 w-3 text-sport-600" />}
              </div>
              <h3 className="text-[13px] font-bold leading-[1.35] text-strong">
                {item.title}
              </h3>
              <MarkdownContent text={item.content} />
              {item.image_url && (
                <Image
                  src={item.image_url}
                  alt={item.title}
                  width={800}
                  height={400}
                  className="mt-1.5 h-auto max-h-40 w-full rounded-[var(--radius-md)] object-cover"
                  sizes="(max-width: 768px) 100vw, 400px"
                />
              )}
              {item.cta_url && (
                <a
                  href={item.cta_url}
                  onClick={onNavigate}
                  className="mt-1 inline-flex items-center text-[12.5px] font-bold text-sport-600 hover:underline"
                >
                  {item.cta_label || 'Ver más'} →
                </a>
              )}
            </div>
            <span className="mt-px flex-shrink-0 whitespace-nowrap text-[11px] text-subtle">
              {relativeDate(item.published_at)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function BellIconWithBadge({ unreadCount }: { unreadCount: number }) {
  const badgeContent = unreadCount > 9 ? '9+' : unreadCount > 0 ? String(unreadCount) : null
  return (
    <>
      <Bell className="h-5 w-5" />
      {badgeContent && (
        <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-ember-500 px-1 text-[10px] font-extrabold text-white shadow-[0_0_0_2px_var(--surface-card)]">
          {badgeContent}
        </span>
      )}
    </>
  )
}

export function NewsBellButton({
  mobileTriggerClassName,
}: {
  /** Estilo extra del botón trigger MÓVIL (p.ej. el header del dashboard lo quiere como tile
      cuadrado con borde, igual que los otros iconos). Se fusiona con `cn` (twMerge → override). */
  mobileTriggerClassName?: string
} = {}) {
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
            className={cn(
              'relative flex items-center justify-center text-muted transition-colors hover:text-strong',
              mobileTriggerClassName
            )}
            aria-label="Novedades"
          >
            <BellIconWithBadge unreadCount={unreadCount} />
          </button>
          <SheetContent side="bottom" className="max-h-[80dvh] rounded-t-2xl">
            <SheetHeader className="pb-4">
              <SheetTitle className="font-display text-[17px] font-extrabold text-strong">Novedades</SheetTitle>
            </SheetHeader>
            {/* min-h-0 + flex-1: sin esto el contenedor flex no acota su alto y el feed no
                scrollea (gotcha del repo). pb-safe deja aire sobre el home-indicator. */}
            <div className="min-h-0 flex-1 overflow-y-auto pb-safe">
              <NewsFeedList onNavigate={() => setIsMobileOpen(false)} />
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Desktop: Popover. `md:flex md:items-center` (no `md:block`): un wrapper block crea
          una caja de línea con baseline y el glifo del trigger inline-flex queda ~2px más
          arriba que el avatar de al lado en el topbar. Como flex, el trigger se centra 1:1. */}
      <div className="hidden md:flex md:items-center">
        <Popover open={isDesktopOpen} onOpenChange={handleDesktopOpen}>
          <PopoverTrigger
            className="relative inline-flex items-center justify-center text-muted transition-colors hover:text-strong"
            aria-label="Novedades"
          >
            <BellIconWithBadge unreadCount={unreadCount} />
          </PopoverTrigger>
          <PopoverContent
            align="end"
            side="bottom"
            sideOffset={8}
            className="flex max-h-[520px] w-[400px] max-w-[calc(100vw-32px)] flex-col gap-0 overflow-hidden rounded-[var(--radius-lg)] border border-subtle bg-surface-card p-0 shadow-[var(--shadow-xl)] ring-0"
          >
            {/* .dt-notif-hd */}
            <div className="flex flex-shrink-0 items-center justify-between border-b border-subtle px-4 py-[13px] font-display text-[15px] font-extrabold text-strong">
              <span>Novedades</span>
            </div>
            {/* .dt-notif-list */}
            <div className="min-h-0 flex-1 overflow-y-auto p-1">
              <NewsFeedList onNavigate={() => setIsDesktopOpen(false)} />
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </>
  )
}
