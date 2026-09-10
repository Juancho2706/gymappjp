'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AUTOREST_MODAL_COPY, autoRestSublabel } from '@eva/workout-engine'
import { useReducedMotion } from '@/lib/use-reduced-motion'
import { cn } from '@/lib/utils'

/**
 * Modal de PRIMERA VEZ de la preferencia D5 «Pasar solo al descanso» (specs/cuenta-atras-en-pantalla,
 * W5.7 · mockup F artifact 159aa43f). Sale UNA sola vez en la vida del alumno: en el primer ejercicio
 * del primer entreno que ejecuta, después de que la ceremonia de entrada se retiró y sin ningún otro
 * overlay abierto (esas condiciones las resuelve `WorkoutExecutionClient`, no este componente).
 *
 * Mismo chrome que la tuerca (`ExecSettingsSheet`): clases `.exec-v3-settings*` + `.exec-v3-tog`,
 * montado DENTRO de `[data-exec-v3]` sin portal para heredar `--exec-brand`. Un solo botón «Listo».
 * Cerrar sin responder (scrim / Escape) CUENTA como respondido: `onDismiss(null)` ⇒ el orquestador
 * marca «visto» y deja la preferencia apagada, y el modal no vuelve a aparecer.
 *
 * Copys literales de R11b (`AUTOREST_MODAL_COPY`, motor compartido con RN). El toggle arranca APAGADO:
 * es el default del alumno sin historial (D5), y encenderlo es su decisión.
 */
export function AutoRestModalV3({
  open,
  onDismiss,
}: {
  open: boolean
  /**
   * `true`/`false` = respondió con «Listo» (valor del toggle); `null` = cerró sin responder
   * (scrim / Escape). En los tres casos el orquestador marca «visto».
   */
  onDismiss: (enabled: boolean | null) => void
}) {
  const reducedMotion = useReducedMotion()
  const [enabled, setEnabled] = useState(false)
  // «Listo» cierra el modal a través del orquestador (`open` → false); ese cierre NO debe contarse
  // además como «cerró sin responder». El ref distingue los dos caminos por apertura.
  const answeredRef = useRef(false)
  const dialogRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    answeredRef.current = false
    setEnabled(false)
    // Foco al diálogo al abrir (lector de pantalla + Escape) sin robar el scroll.
    dialogRef.current?.focus({ preventScroll: true })
  }, [open])

  const answer = (value: boolean | null) => {
    if (answeredRef.current) return
    answeredRef.current = true
    onDismiss(value)
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') answer(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            type="button"
            aria-label="Cerrar"
            onClick={() => answer(null)}
            className="exec-v3-sheet-scrim"
            initial={reducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reducedMotion ? undefined : { opacity: 0 }}
          />
          <motion.div
            ref={dialogRef}
            tabIndex={-1}
            className="exec-v3-settings exec-v3-autorest"
            role="dialog"
            aria-modal="true"
            aria-labelledby="exec-v3-autorest-title"
            data-testid="autorest-modal"
            initial={reducedMotion ? { opacity: 0 } : { y: '100%' }}
            animate={reducedMotion ? { opacity: 1 } : { y: 0 }}
            exit={reducedMotion ? { opacity: 0 } : { y: '100%' }}
            transition={reducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 38 }}
          >
            <span className="exec-v3-handle" aria-hidden />
            <div className="exec-v3-settings-hd">
              <h2 id="exec-v3-autorest-title" className="exec-v3-settings-t">
                {AUTOREST_MODAL_COPY.title}
              </h2>
            </div>

            <p className="exec-v3-autorest-body">{AUTOREST_MODAL_COPY.body}</p>

            {/* Fila «boxed» del mockup: el mismo par nombre/sublabel + toggle que la tuerca, enmarcado. */}
            <div className="exec-v3-setrow is-first exec-v3-autorest-row">
              <div className="exec-v3-setmain">
                <div className="exec-v3-setname">{AUTOREST_MODAL_COPY.toggle}</div>
                <div className="exec-v3-setsub">{autoRestSublabel(enabled)}</div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={enabled}
                aria-label={AUTOREST_MODAL_COPY.toggle}
                data-testid="autorest-modal-toggle"
                onClick={() => setEnabled((v) => !v)}
                className={cn('exec-v3-tog', enabled && 'is-on')}
              >
                <span className="exec-v3-tog-knob" aria-hidden />
              </button>
            </div>

            <button
              type="button"
              className="exec-v3-juicy exec-v3-autorest-cta"
              data-testid="autorest-modal-cta"
              onClick={() => answer(enabled)}
            >
              {AUTOREST_MODAL_COPY.cta}
            </button>

            <p className="exec-v3-autorest-foot">{AUTOREST_MODAL_COPY.foot}</p>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
