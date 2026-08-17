'use client'

/**
 * QeNoteButton (N-B, `docs/specs/nutrition-coach-notes`) — el botón 📝 de nota del coach que
 * comparten la franja (`slot.instructions`, ≤2000) y la fila de grupo de porciones
 * (`target.notes`, ≤1000) en el editor web.
 *
 * Forma (SPEC N2): mismo porte que los controles de 44 px de su fila (chevron/⋮/basurero).
 * SIN nota va con el traje neutro apagado del ⋮; CON nota se tiñe con la marca REAL del coach
 * (`useBrandPrimaryHex`) y la tinta del ícono la decide `addActionInk` — el patrón de contraste
 * WCAG de Familia N, nunca a ojo. Ese tinte ES el indicador: la banda con el texto de la nota
 * no se pinta en el editor (el coach ya la ve al abrir el sheet); la banda es del alumno (N3).
 *
 * Abre un `QeBottomSheet` (sheet en móvil, diálogo centrado en desktop — cero popovers nuevos)
 * con textarea + contador de caracteres + «Limpiar». Presentacional puro: el valor CRUDO entra
 * por prop y cada tecla sale por `onChange` — quien lo monta despacha la acción del reducer
 * (`SET_SLOT_INSTRUCTIONS` / `SET_PORTION_NOTES`), así la nota vive en la MISMA gramática
 * draft/undo/publish que cualquier otro campo (N5). El trim ⇒ null es de la proyección, no de
 * esta UI: tipear solo espacios no cuenta como cambio ni publica basura.
 */

import { useState } from 'react'
import { Eraser, NotebookPen } from 'lucide-react'
import {
  ADD_ACTION_DEFAULT_BRAND,
  addActionInk,
  useBrandPrimaryHex,
} from '@/components/nutrition-v2'
import { QeBottomSheet } from './QeBottomSheet'
import { QE_COPY } from './microcopy'

export function QeNoteButton({
  subject,
  value,
  maxLength,
  placeholder,
  disabled = false,
  error,
  onChange,
}: {
  /** Nombre visible del dueño de la nota («Desayuno», «Frutas», «la franja»). */
  subject: string
  /** Texto CRUDO del estado (`null`/'' = sin nota; la normalización vive en la proyección). */
  value: string | null
  /** Tope del contrato del campo (`SLOT_INSTRUCTIONS_MAX` / `PORTION_NOTES_MAX`). */
  maxLength: number
  placeholder: string
  disabled?: boolean
  /** Error de validación del campo (llega ya filtrado por `showErrors`). */
  error?: string
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const brandHex = useBrandPrimaryHex()
  const text = value ?? ''
  // Solo espacios = sin nota (misma vara que la proyección trim ⇒ null): el botón no se tiñe
  // por una nota que al publicar no va a existir.
  const hasNote = text.trim() !== ''
  // Tinta CON nota, patrón Familia N: el fondo es la marca del coach (libre: puede ser amarilla)
  // y el color del ícono lo gana el contraste WCAG. Sin marca (harness/tests) cae al azul EVA —
  // el MISMO fallback de `addActionInk`, así fondo y tinta siempre se calculan del mismo color.
  const ink = addActionInk(brandHex, 'primary')
  const brand = brandHex ?? ADD_ACTION_DEFAULT_BRAND

  return (
    <>
      {/* 44 px fijos (h-11 w-11): el porte del chevron/⋮ de la fila donde vive. */}
      <button
        type="button"
        aria-label={hasNote ? QE_COPY.noteEdit(subject) : QE_COPY.noteAdd(subject)}
        disabled={disabled}
        onClick={() => setOpen(true)}
        data-testid="qe-note-button"
        data-has-note={hasNote ? 'true' : undefined}
        className={
          'h-11 w-11 shrink-0 rounded-control border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 ' +
          (hasNote
            ? // El hover no cambia de color porque el color es del coach: se oscurece un punto
              // con brightness, igual que la variante primary de AddActionButton.
              'border-transparent shadow-sm hover:brightness-95 active:brightness-90'
            : 'border-border-subtle bg-surface-card text-muted hover:bg-surface-sunken hover:text-strong')
        }
        style={hasNote ? { backgroundColor: brand, color: ink.text } : undefined}
      >
        <NotebookPen aria-hidden="true" className="mx-auto h-4 w-4" />
      </button>

      {/* El sheet se portalea (Dialog/Sheet): estar dentro de una fila flex no aporta ítems
          al wrap porque cerrado no renderiza nada. */}
      <QeBottomSheet open={open} onOpenChange={setOpen} title={QE_COPY.noteTitle(subject)}>
        <p className="text-xs leading-5 text-muted">{QE_COPY.noteHint}</p>
        <textarea
          value={text}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          rows={5}
          maxLength={maxLength}
          disabled={disabled}
          aria-label={QE_COPY.noteTitle(subject)}
          aria-invalid={Boolean(error)}
          className="w-full resize-y rounded-control border border-border-subtle bg-surface-app px-3 py-2.5 text-sm leading-6 text-body placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        {/* El maxLength del textarea ya corta el tipeo en el tope; este error solo puede venir
            de un draft hidratado fuera de contrato (defensivo, espejo de la validación local). */}
        {error ? <p className="text-xs text-rose-600 dark:text-rose-300">{error}</p> : null}
        <div className="flex items-center justify-between gap-2">
          {/* «Limpiar» deja el texto en '' (la proyección lo vuelve null al publicar). No cierra
              el sheet: el coach VE el campo vacío y puede arrepentirse retipeando. */}
          <button
            type="button"
            disabled={disabled || text === ''}
            onClick={() => onChange('')}
            className="inline-flex min-h-11 items-center gap-2 rounded-control border border-border-default bg-surface-card px-3 text-sm font-semibold text-strong transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            <Eraser aria-hidden="true" className="h-4 w-4 text-muted" />
            {QE_COPY.noteClear}
          </button>
          <span className="font-mono text-[11px] tabular-nums text-muted">
            {QE_COPY.noteCount(text.length, maxLength)}
          </span>
        </div>
      </QeBottomSheet>
    </>
  )
}
