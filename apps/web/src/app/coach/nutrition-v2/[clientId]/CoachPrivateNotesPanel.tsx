'use client'

import { useId, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, Loader2, Lock, Save } from 'lucide-react'
import { NutritionCard } from '@/components/nutrition-v2'
import { cn } from '@/lib/utils'
import { saveCoachPrivateNoteAction } from '@/app/coach/nutrition-v2/_actions/coach-private-note.actions'
import type { CoachPrivateNotesLoad } from '@/app/coach/nutrition-v2/_data/coach-private-notes.data'

/**
 * "Nota privada" del coach en la ficha V2 — REPUESTA (decision owner 2026-07-29 punto 4).
 * Al morir el tab de nutricion V1 de la ficha del alumno esta nota quedo inalcanzable: el
 * componente sobrevivio huerfano y su query murio. Vive de nuevo aca, en el arbol V2, con su
 * propio camino de datos (`_data/coach-private-notes.data`) y su propia action gateada
 * (`_actions/coach-private-note.actions`).
 *
 * Tabla `nutrition_private_notes`, RLS coach-scoped: el alumno NO tiene policy de lectura, asi
 * que no ve la nota ni sabe que existe. Hay UNA nota viva por par coach↔alumno — el textarea
 * edita esa fila; las versiones anteriores (de otro coach del equipo, o de antes del upsert
 * unico) se listan read-only debajo.
 *
 * Card colapsable: la nota es una herramienta secundaria del coach, asi que por defecto ocupa
 * una fila y el encabezado adelanta el estado (fecha + primera linea) sin abrir.
 *
 * Guardado bloqueado si la LECTURA fallo (`load.ok === false`): guardar hace UPDATE sobre la
 * fila vigente, asi que escribir sobre un textarea sembrado en blanco por un error de red
 * borraria la nota real. Misma leccion que NUT-008.
 */

const MAX_LEN = 5000

function firstLine(body: string): string {
  const line = body.trim().split('\n', 1)[0] ?? ''
  return line.length > 120 ? line.slice(0, 119) + '…' : line
}

export function CoachPrivateNotesPanel({
  clientId,
  load,
}: {
  clientId: string
  load: CoachPrivateNotesLoad
}) {
  const router = useRouter()
  const panelId = useId()
  const notes = load.ok ? load.notes : []
  const latest = notes[0] ?? null
  const olderNotes = notes.slice(1)

  const [open, setOpen] = useState(false)
  const [body, setBody] = useState(latest?.body ?? '')
  const [error, setError] = useState<string | null>(null)
  const [justSaved, setJustSaved] = useState(false)
  const [isPending, startTransition] = useTransition()

  const trimmed = body.trim()
  const dirty = trimmed !== (latest?.body.trim() ?? '')
  const canSave = load.ok && !isPending && trimmed.length > 0 && dirty

  function handleSave() {
    if (!canSave) return
    setError(null)
    startTransition(async () => {
      const res = await saveCoachPrivateNoteAction({ clientId, body: trimmed })
      if (!res.ok) {
        setError(res.error)
        return
      }
      setJustSaved(true)
      // La ficha vuelve a leer la nota (y su fecha) desde el servidor. El textarea conserva lo
      // tecleado a proposito: `useState` no se re-siembra, asi que un refresh no puede pisar
      // lo que el coach tiene en pantalla.
      router.refresh()
    })
  }

  const summary = !load.ok
    ? 'No pudimos leerla. Recarga la ficha.'
    : latest == null
      ? 'Sin nota todavía'
      : latest.updatedAtLabel
        ? 'Actualizada el ' + latest.updatedAtLabel + ' · ' + firstLine(latest.body)
        : firstLine(latest.body)

  return (
    <NutritionCard>
      <h2>
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex min-h-11 w-full items-center gap-3 rounded-control text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--warning-100)]">
            <Lock aria-hidden="true" className="h-4 w-4 text-[var(--warning-700)]" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-display text-base font-semibold text-strong">Nota privada</span>
              <span className="rounded-pill bg-[var(--warning-100)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-[var(--warning-700)]">
                Solo tú la ves
              </span>
            </span>
            <span className="mt-0.5 block truncate text-xs text-muted">{summary}</span>
          </span>
          <ChevronDown
            aria-hidden="true"
            className={cn(
              'h-4 w-4 shrink-0 text-muted transition-transform',
              open && 'rotate-180',
            )}
          />
        </button>
      </h2>

      {open ? (
        <div className="mt-4" id={panelId}>
          {!load.ok ? (
            <p
              role="alert"
              className="rounded-control border border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300"
            >
              No pudimos leer la nota privada de este alumno. Recarga la ficha antes de escribir:
              guardar ahora reemplazaría la nota que ya tienes guardada.
            </p>
          ) : (
            <>
              <label
                className="block text-xs font-semibold text-muted"
                htmlFor={panelId + '-body'}
              >
                El alumno nunca la ve. Adherencia, ajustes pendientes, contexto del alumno.
              </label>
              <textarea
                id={panelId + '-body'}
                value={body}
                onChange={(event) => {
                  setBody(event.target.value)
                  setJustSaved(false)
                }}
                placeholder="Observaciones internas: adherencia, ajustes pendientes, contexto del alumno…"
                rows={5}
                maxLength={MAX_LEN}
                disabled={isPending}
                className="mt-1.5 w-full resize-y rounded-control border border-border-subtle bg-surface-app px-3 py-2.5 text-sm leading-6 text-body placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
              />

              {error ? (
                <p
                  role="alert"
                  className="mt-2 rounded-control border border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300"
                >
                  {error}
                </p>
              ) : null}

              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-muted">
                  <span className="tabular-nums">
                    {body.length}/{MAX_LEN}
                  </span>
                  {justSaved && !dirty ? (
                    <span className="ml-2 font-semibold text-emerald-700 dark:text-emerald-300">
                      Guardada
                    </span>
                  ) : null}
                  {latest?.updatedAtLabel && !justSaved ? (
                    <span className="ml-2">Última actualización: {latest.updatedAtLabel}</span>
                  ) : null}
                </p>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!canSave}
                  className="inline-flex min-h-11 items-center gap-2 rounded-control bg-primary/100 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isPending ? (
                    <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save aria-hidden="true" className="h-4 w-4" />
                  )}
                  {isPending ? 'Guardando…' : 'Guardar nota'}
                </button>
              </div>

              {olderNotes.length > 0 ? (
                <div className="mt-4 border-t border-border-subtle pt-3">
                  <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted">
                    Notas anteriores
                  </h3>
                  <ul className="mt-2 space-y-2">
                    {olderNotes.map((note) => (
                      <li
                        className="rounded-control border border-border-subtle bg-surface-sunken px-3 py-2"
                        key={note.id}
                      >
                        <p className="whitespace-pre-wrap text-xs leading-5 text-muted">
                          {note.body}
                        </p>
                        {note.updatedAtLabel ? (
                          <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-muted">
                            {note.updatedAtLabel}
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </NutritionCard>
  )
}
