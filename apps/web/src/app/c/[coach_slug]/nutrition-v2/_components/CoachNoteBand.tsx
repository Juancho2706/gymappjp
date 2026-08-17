/**
 * Banda de nota del coach en el Hoy del alumno (SPEC nutrition-coach-notes N3):
 * franja (`slot.instructions`) y grupo de porciones (`target.notes`). Estilo nota
 * de marca — fondo primario tenue (~8% ≈ el paso /10 de la casa), borde suave,
 * icono 💬 y texto PLANO (sin markdown; los saltos de línea del textarea se
 * respetan). Sin nota (o solo whitespace) ⇒ cero render (N3: "sin nota, cero
 * ruido") — la regla vive en `coachNoteDisplayText`, compartida con RN.
 *
 * NO es mensajería (N4): es parte del plan publicado, sin acciones ni estado.
 */
import { coachNoteDisplayText } from '@eva/nutrition-v2'

function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ')
}

export function CoachNoteBand({
  note,
  className,
}: {
  note: string | null | undefined
  className?: string
}) {
  const text = coachNoteDisplayText(note)
  if (!text) return null
  return (
    <div
      className={cx(
        'flex items-start gap-1.5 rounded-control border border-primary/15 bg-primary/10 px-2.5 py-1.5',
        className,
      )}
    >
      <span aria-hidden="true" className="text-xs leading-5">
        💬
      </span>
      <p className="min-w-0 flex-1 whitespace-pre-line text-xs leading-5 text-body">
        <span className="sr-only">Nota del coach: </span>
        {text}
      </p>
    </div>
  )
}
