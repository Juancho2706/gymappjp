'use client'

import { useOptimistic, useRef, useState, useTransition, type FormEvent } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Send } from 'lucide-react'
import { cn } from '@/lib/utils'

/** A single note in the bidirectional nutrition feedback thread. */
export interface NotesThreadComment {
  id: string
  author_role: 'client' | 'coach'
  body: string
  created_at: string
}

export interface NotesThreadProps {
  comments: NotesThreadComment[]
  /** Persists a new note. The compose box clears + the optimistic bubble settles on resolve. */
  onSubmit: (body: string) => Promise<void>
  /** Whose surface this is — drives "own" bubble alignment and the role label. */
  currentRole: 'client' | 'coach'
  /** Shown when the thread is empty (before any note exists). */
  emptyHint?: string
  className?: string
}

const ROLE_LABEL: Record<'client' | 'coach', string> = {
  client: 'Alumno',
  coach: 'Coach',
}

/** Short, locale-stable time — tabular so timestamps align in the column. */
function formatTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('es-CL', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Stable-ish id for optimistic bubbles before the server assigns the real one. */
function tempId(): string {
  return `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Bidirectional nutrition feedback thread. Presentational + optimistic only:
 * the parent passes its own server action via `onSubmit` (alumno and coach each
 * wire a different action). Coach vs client bubbles are distinguished by
 * alignment AND color AND an explicit role label — never color alone.
 */
export function NotesThread({
  comments,
  onSubmit,
  currentRole,
  emptyHint,
  className,
}: NotesThreadProps) {
  const reduce = useReducedMotion()
  const [isPending, startTransition] = useTransition()
  const [draft, setDraft] = useState('')
  const listRef = useRef<HTMLDivElement>(null)

  const [optimistic, addOptimistic] = useOptimistic(
    comments,
    (state: NotesThreadComment[], next: NotesThreadComment) => [...state, next]
  )

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const body = draft.trim()
    if (!body || isPending) return
    setDraft('')
    startTransition(async () => {
      addOptimistic({
        id: tempId(),
        author_role: currentRole,
        body,
        created_at: new Date().toISOString(),
      })
      await onSubmit(body)
    })
  }

  const isEmpty = optimistic.length === 0

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div
        ref={listRef}
        className="flex flex-col gap-2"
        role="log"
        aria-label="Conversación de retroalimentación"
        aria-live="polite"
      >
        {isEmpty ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {emptyHint ?? 'Sin notas todavía.'}
          </p>
        ) : (
          <AnimatePresence initial={false}>
            {optimistic.map((c) => {
              const isOwn = c.author_role === currentRole
              const isCoach = c.author_role === 'coach'
              return (
                <motion.div
                  key={c.id}
                  layout={!reduce}
                  initial={reduce ? false : { opacity: 0, y: 8, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
                  transition={
                    reduce
                      ? { duration: 0 }
                      : { type: 'spring', stiffness: 400, damping: 30 }
                  }
                  className={cn('flex flex-col gap-1', isOwn ? 'items-end' : 'items-start')}
                >
                  <div
                    className={cn(
                      'flex items-center gap-1.5 px-1 text-[11px] font-semibold',
                      isCoach ? 'text-[var(--color-macro-protein)]' : 'text-muted-foreground'
                    )}
                  >
                    <span>{ROLE_LABEL[c.author_role]}</span>
                    <time dateTime={c.created_at} className="font-normal tabular-nums opacity-70">
                      {formatTime(c.created_at)}
                    </time>
                  </div>
                  <div
                    className={cn(
                      'max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm',
                      isCoach
                        ? 'rounded-tl-sm bg-[var(--color-macro-protein)]/12 text-foreground'
                        : 'rounded-tr-sm bg-muted text-foreground',
                      isOwn ? 'rounded-tr-sm' : 'rounded-tl-sm'
                    )}
                  >
                    {c.body}
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>
        )}
      </div>

      <form onSubmit={handleSubmit} className="flex items-end gap-2">
        <label className="sr-only" htmlFor="notes-thread-compose">
          Escribir una nota
        </label>
        <textarea
          id="notes-thread-compose"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              e.currentTarget.form?.requestSubmit()
            }
          }}
          rows={2}
          placeholder="Escribe una nota…"
          className="min-h-[44px] flex-1 resize-none rounded-2xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <button
          type="submit"
          disabled={!draft.trim() || isPending}
          aria-label="Enviar nota"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition-opacity disabled:opacity-40"
        >
          <Send className="h-4 w-4" aria-hidden />
        </button>
      </form>
    </div>
  )
}
