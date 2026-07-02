'use client'

import { useState, useTransition } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { Lock, Save } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { InfoTooltip } from '@/components/ui/info-tooltip'
import { toast } from 'sonner'
import type { PrivateNoteRow } from '@/services/nutrition-notes.service'
import { upsertCoachPrivateNote } from './_actions/nutrition-notes.actions'

/**
 * Zona C (coach) · Nota privada de nutrición — feature E.
 * SOLO el coach la ve (tabla `nutrition_private_notes`, RLS coach-scoped); el
 * alumno NUNCA accede a ella. Persiste vía la server action coach-scoped
 * (coach_id sale de la sesión). Hay una nota viva por par coach↔alumno: el
 * textarea edita/actualiza esa nota; debajo se listan las versiones guardadas.
 */

const MAX_LEN = 5000

function fmtDate(iso: string | null): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString('es-CL', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export type CoachPrivateNotesPanelProps = {
  clientId: string
  notes: PrivateNoteRow[]
}

export function CoachPrivateNotesPanel({ clientId, notes }: CoachPrivateNotesPanelProps) {
  const reduceMotion = useReducedMotion()
  const latest = notes[0] ?? null
  const [body, setBody] = useState(latest?.body ?? '')
  const [isPending, startTransition] = useTransition()

  const handleSave = () => {
    const trimmed = body.trim()
    if (!trimmed) {
      toast.error('La nota no puede estar vacía.')
      return
    }
    startTransition(async () => {
      const res = await upsertCoachPrivateNote({ clientId, body: trimmed })
      if (res.ok) {
        toast.success('Nota privada guardada.')
      } else {
        toast.error(res.error)
      }
    })
  }

  const olderNotes = notes.slice(1)

  return (
    <Card className="p-5">
      <div className="mb-1 flex items-center gap-1.5">
        <Lock className="h-3.5 w-3.5 shrink-0 text-[var(--warning-600)]" />
        <h3 className="font-display text-[17px] font-extrabold tracking-[-0.02em] text-strong">
          Nota privada
        </h3>
        <InfoTooltip content="Notas internas tuyas sobre la nutrición de este alumno. El alumno nunca las ve." iconClassName="w-3 h-3" />
      </div>
      <p className="mb-4 inline-flex items-center gap-1 rounded-control bg-[var(--warning-100)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-[var(--warning-700)]">
        Privada — el alumno no la ve
      </p>

      <div className="space-y-3">
        <Textarea
          value={body}
          maxLength={MAX_LEN}
          onChange={(e) => setBody(e.target.value)}
          disabled={isPending}
          placeholder="Observaciones internas: adherencia, ajustes pendientes, contexto del alumno…"
          className="min-h-28"
          aria-label="Nota privada del coach"
        />
        <div className="flex items-center justify-between gap-3">
          <span className="text-[10px] font-bold tabular-nums text-muted-foreground">
            {body.length}/{MAX_LEN}
          </span>
          <Button
            type="button"
            size="sm"
            className="h-11 gap-1.5 px-6 font-black uppercase tracking-widest"
            disabled={isPending || !body.trim()}
            onClick={handleSave}
          >
            <Save className="h-3.5 w-3.5" />
            {isPending ? 'Guardando…' : 'Guardar nota'}
          </Button>
        </div>
        {latest?.updated_at && (
          <p className="text-[10px] font-medium text-muted-foreground">
            Última actualización: {fmtDate(latest.updated_at)}
          </p>
        )}
      </div>

      {olderNotes.length > 0 && (
        <div className="mt-5 border-t border-subtle pt-4">
          <h4 className="mb-2 text-[9px] font-black uppercase tracking-widest text-muted-foreground">
            Notas anteriores
          </h4>
          <ul className="space-y-2">
            <AnimatePresence initial={false}>
              {olderNotes.map((note, idx) => (
                <motion.li
                  key={note.id}
                  initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: reduceMotion ? 0 : 0.2, delay: reduceMotion ? 0 : idx * 0.04 }}
                  className="rounded-control border border-subtle bg-surface-sunken px-3 py-2"
                >
                  <p className="whitespace-pre-wrap text-xs text-muted-foreground">{note.body}</p>
                  <p className="mt-1 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/70">
                    {fmtDate(note.updated_at ?? note.created_at)}
                  </p>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </div>
      )}
    </Card>
  )
}
