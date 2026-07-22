'use client'

import { createContext, useContext, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { Check, CheckCheck, ChevronDown, Dumbbell, SkipForward } from 'lucide-react'
import { cn } from '@/lib/utils'
import { type ExecListMapItem } from './ExecListMapV3'
import { applyExecThemeVars, readExecutorTheme } from './exec-theme'
import { useCelebrations } from './use-celebrations'
import type { ExecMedia } from './exec-media'

/**
 * Ejecutor V3 (E3.1) — presentación del descanso a pantalla completa. Traducción del mockup
 * `concepto-a-v3-core` (pantalla Descanso): micro-celebración "+1 serie", countdown gigante con anillo,
 * −15s / Saltar / +15s, tarjeta SIGUIENTE con mini-media estática, mensaje del coach del bloque
 * siguiente y peek inferior "Plan completo" con filas de estado (done/now/todo, mockup a3a-srow) arrastrable.
 *
 * INTOCABLE: NO corre un timer propio. Es una PRESENTACIÓN del MISMO descanso: el `RestTimer` (fuente
 * única del conteo endTime-based, alarma, beeps, WakeLock, MediaSession y notificaciones) le pasa el
 * estado vivo (`timeLeft`, `total`, `done`, `isActive`) y los controles (`onAdjust`, `onSkip`). Al
 * minimizar, el RestTimer vuelve a su barra compacta sin reiniciar el conteo (misma instancia).
 *
 * Los datos de contexto (SIGUIENTE, mensaje del coach, filas del plan) llegan por
 * `RestInterstitialDataContext`, poblado por el cliente ARRIBA del WorkoutTimerProvider.
 */

/** VM del ejercicio "SIGUIENTE" mostrado en el descanso. */
export interface InterstitialNext {
  name: string
  rxLabel: string | null
  media: ExecMedia
  coachMessage: string | null
}

/**
 * Contexto de CIERRE DE RONDA (E3.5): cuando el descanso de grupo de una superserie viene de cerrar
 * una ronda, el interstitial muestra el banner "Ronda N lista" + dots de ronda + reetiqueta la tarjeta
 * como "Siguiente ronda". Se deriva del engine `superset-rounds` arriba (no lo calcula el interstitial).
 */
export interface InterstitialRound {
  /** Ronda recién cerrada (banner "Ronda N lista" + dots llenos). */
  justClosed: number
  /** Total de rondas del grupo (M). */
  total: number
  /** Etiqueta del miembro de la próxima ronda (ej. "A3"); null ⇒ sin chip. */
  nextTag: string | null
}

export interface RestInterstitialData {
  /** Filas del plan para el peek "Plan completo" (reusa el mapa del ejecutor, SÓLO LECTURA). */
  items: ExecListMapItem[]
  /** Ejercicio que sigue tras el descanso (null ⇒ oculta la tarjeta). */
  next: InterstitialNext | null
  /** Contexto de ronda cuando el descanso viene de cerrar una ronda de superserie (null ⇒ descanso normal). */
  round?: InterstitialRound | null
}

const RestInterstitialDataContext = createContext<RestInterstitialData | null>(null)

export function RestInterstitialDataProvider({
  value,
  children,
}: {
  value: RestInterstitialData
  children: React.ReactNode
}) {
  return (
    <RestInterstitialDataContext.Provider value={value}>{children}</RestInterstitialDataContext.Provider>
  )
}

interface RestInterstitialV3Props {
  /** Segundos restantes (estado vivo del RestTimer). */
  timeLeft: number
  /** Total del descanso (para la fracción del anillo). */
  total: number
  /** true cuando el conteo llegó a 0. */
  done: boolean
  /** true si el conteo corre (para el rótulo). */
  isActive: boolean
  /** Etiqueta "qué sigue" que ya viaja al RestTimer (fallback de la tarjeta SIGUIENTE). */
  nextLabel?: string
  /** Descanso de aproximación (sólo cambia el rótulo). */
  warmup?: boolean
  /** mm:ss ya formateado por el RestTimer. */
  formatTime: (s: number) => string
  /** ±15s (control existente del RestTimer). */
  onAdjust: (delta: number) => void
  /** Saltar = cerrar el descanso (control existente del RestTimer). */
  onSkip: () => void
  /** Minimizar → barra compacta del RestTimer (misma instancia, sin reiniciar). */
  onMinimize: () => void
}

const RING_R = 92
const RING_C = 2 * Math.PI * RING_R
// Confetti CSS de la micro-celebración (8 piezas, colores de zona del mockup + marca; decorativo,
// off en reduced-motion). Los hexes de zona son adornos, no re-tinción de --zone-*.
const CONFETTI = [
  { x: -46, y: -30, c: 'var(--exec-brand)', d: 0 },
  { x: 44, y: -34, c: '#facc15', d: 0.3 },
  { x: -54, y: 10, c: '#38bdf8', d: 0.6 },
  { x: 56, y: 6, c: '#fb923c', d: 0.15 },
  { x: -20, y: -46, c: '#f472b6', d: 0.45 },
  { x: 22, y: -44, c: 'var(--exec-brand)', d: 0.75 },
  { x: -38, y: 34, c: '#facc15', d: 0.55 },
  { x: 40, y: 32, c: '#38bdf8', d: 0.9 },
]

export function RestInterstitialV3({
  timeLeft,
  total,
  done,
  isActive,
  nextLabel,
  warmup = false,
  formatTime,
  onAdjust,
  onSkip,
  onMinimize,
}: RestInterstitialV3Props) {
  const data = useContext(RestInterstitialDataContext)
  const reducedMotion = useReducedMotion()
  const rootRef = useRef<HTMLDivElement>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  // Consolidación de celebraciones (E4.1): el tier/visual (micro "+1 serie" / media "ronda lista") lo
  // resuelve el orquestador único, no una regla local. El confetti es un pulso de apertura (mount-only).
  const { plan } = useCelebrations()
  const [celebrate, setCelebrate] = useState(false)

  useEffect(() => {
    // Acento de marca: el interstitial se portalea FUERA del wrapper [data-exec-v3]; resolvemos el
    // tema subiendo por el DOM hasta [data-executor-theme] y sembramos --exec-brand inline.
    applyExecThemeVars(rootRef.current, readExecutorTheme(rootRef.current))
  }, [])

  useEffect(() => {
    // Visual SIEMPRE (contrato Wave 4): confetti salvo reduced-motion (→ fade, sin partículas). El háptico
    // de la serie ya lo dispara el submit (`buildRest`); aquí sólo decidimos lo visual para no doblar buzz.
    const p = plan(data?.round ? 'ronda_cerrada' : 'serie_cerrada')
    if (p.visual === 'confetti') {
      setCelebrate(true)
      const t = setTimeout(() => setCelebrate(false), 2200)
      return () => clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const frac = Math.max(0, Math.min(1, timeLeft / (total || 1)))
  const dashoffset = RING_C * (1 - frac)

  const next = data?.next ?? (nextLabel ? { name: nextLabel, rxLabel: null, media: { kind: 'none' as const }, coachMessage: null } : null)
  const items = data?.items ?? []
  const doneCount = items.filter((i) => i.complete).length
  // Cierre de ronda (E3.5): sólo cuando el descanso de grupo viene de cerrar una ronda de superserie.
  const round = data?.round ?? null

  const transition = reducedMotion ? { duration: 0 } : { type: 'spring' as const, stiffness: 420, damping: 34 }

  return (
    <AnimatePresence>
      <motion.div
        ref={rootRef}
        data-exec-v3=""
        data-exec-interstitial=""
        initial={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
        animate={reducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1 }}
        exit={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
        transition={reducedMotion ? { duration: 0 } : { duration: 0.22, ease: 'easeOut' }}
        className="exec-v3-rest"
        role="dialog"
        aria-modal="true"
        aria-label="Descanso"
      >
        <button
          type="button"
          onClick={onMinimize}
          className="exec-v3-rest-min"
          aria-label="Minimizar el descanso"
        >
          <ChevronDown className="h-5 w-5" aria-hidden />
        </button>

        <div className="exec-v3-rest-inner">
          {/* Cierre de ronda (E3.5): banner "Ronda N lista" + dots de ronda; si no, la micro-celebración
              "+1 serie" (respeta la pref; confetti off en reduced-motion). */}
          {round ? (
            <div className="exec-v3-rest-top">
              <div className={cn('exec-v3-roundban', !reducedMotion && 'is-pulse')}>
                <span className="exec-v3-dblcheck" aria-hidden>
                  <CheckCheck className="h-4 w-4" strokeWidth={3} />
                </span>
                Ronda {round.justClosed} lista
              </div>
              <div className="exec-v3-rdots" aria-label={`Ronda ${round.justClosed} de ${round.total}`}>
                <span className="exec-v3-rdotlbl" aria-hidden>Ronda</span>
                {Array.from({ length: round.total }).map((_, i) => {
                  const r = i + 1
                  const state = r < round.justClosed ? 'done' : r === round.justClosed ? 'fill' : ''
                  return (
                    <span
                      key={r}
                      aria-hidden
                      className={cn('exec-v3-rd', state === 'done' && 'is-done', state === 'fill' && 'is-fill', state === 'fill' && !reducedMotion && 'is-beat')}
                    />
                  )
                })}
                <span className="exec-v3-count tabular-nums" aria-hidden>{round.justClosed} / {round.total}</span>
              </div>
            </div>
          ) : (
            <div className="exec-v3-rest-top">
              <p className="exec-v3-restcel">{warmup ? 'Aproximación' : 'Serie cerrada'}</p>
              <div className={cn('exec-v3-celly', celebrate && 'is-cel')}>
                {celebrate && !reducedMotion && (
                  <span className="exec-v3-confetti" aria-hidden>
                    {CONFETTI.map((c, i) => (
                      <span
                        key={i}
                        className="exec-v3-conf"
                        style={
                          {
                            '--cx': `${c.x}px`,
                            '--cy': `${c.y}px`,
                            '--cd': `${c.d}s`,
                            background: c.c,
                          } as React.CSSProperties
                        }
                      />
                    ))}
                  </span>
                )}
                <span className="exec-v3-celly-b" aria-hidden>
                  <Check className="h-3 w-3" strokeWidth={3.5} />
                </span>
                +1 serie · vas volando
              </div>
            </div>
          )}

          {/* Countdown gigante + anillo (fracción del RestTimer, NO un timer nuevo). */}
          <div className="exec-v3-ringwrap">
            <svg className="exec-v3-ring-svg" viewBox="0 0 208 208" aria-hidden>
              <circle cx="104" cy="104" r={RING_R} className="exec-v3-ring-track" fill="none" strokeWidth="24" />
              <circle
                cx="104"
                cy="104"
                r={RING_R}
                className="exec-v3-ring-fill"
                fill="none"
                strokeWidth="24"
                strokeLinecap="round"
                strokeDasharray={RING_C}
                strokeDashoffset={dashoffset}
                style={{ transition: reducedMotion ? 'none' : 'stroke-dashoffset 0.5s linear' }}
              />
            </svg>
            <div className="exec-v3-ringtxt">
              <div className={cn('exec-v3-bignum tabular-nums', done && 'is-done')}>
                {done ? '¡Listo!' : formatTime(timeLeft)}
              </div>
              <div className="exec-v3-restlbl" aria-live="polite">
                {done ? '¡A entrenar!' : round ? 'Descanso de grupo' : isActive ? (warmup ? 'Aproximación' : 'Descanso') : 'En pausa'}
              </div>
            </div>
          </div>

          {/* Descanso de grupo (E3.5): sólo aparece al cerrar la ronda completa. */}
          {round && <div className="exec-v3-grouptag">Solo al cerrar la ronda completa</div>}

          {/* −15s / Saltar / +15s — controles existentes del RestTimer (targets ≥44px). */}
          <div className="exec-v3-restbtns">
            <button
              type="button"
              onClick={() => onAdjust(-15)}
              className="exec-v3-rb tabular-nums"
              aria-label="Restar 15 segundos"
            >
              −15s
            </button>
            <button type="button" onClick={onSkip} className="exec-v3-rb is-skip" aria-label="Saltar el descanso">
              <SkipForward className="h-4 w-4" aria-hidden /> Saltar
            </button>
            <button
              type="button"
              onClick={() => onAdjust(15)}
              className="exec-v3-rb tabular-nums"
              aria-label="Sumar 15 segundos"
            >
              +15s
            </button>
          </div>

          {/* Tarjeta SIGUIENTE con mini-media estática + mensaje del coach del bloque siguiente. */}
          {next && (
            <div className="exec-v3-next">
              <div className="exec-v3-nextrow">
                <div className="exec-v3-nextmini">
                  {next.media.kind === 'image' && (
                    <Image src={next.media.src} alt="" fill unoptimized className="object-contain" />
                  )}
                  {next.media.kind === 'video' && (
                    <video src={next.media.src} muted loop playsInline autoPlay className="h-full w-full object-contain" />
                  )}
                  {(next.media.kind === 'none' || next.media.kind === 'youtube') && (
                    <span className="exec-v3-nextmini-empty" aria-hidden>
                      <Dumbbell className="h-5 w-5" />
                    </span>
                  )}
                </div>
                <div className="exec-v3-nextinfo">
                  <div className="exec-v3-nextk">{round ? 'Siguiente ronda' : 'Siguiente'}</div>
                  <div className="exec-v3-nextt">{next.name}</div>
                  {next.rxLabel && <div className="exec-v3-nextd tabular-nums">{next.rxLabel}</div>}
                </div>
                {round?.nextTag && <span className="exec-v3-nexttag">{round.nextTag}</span>}
              </div>
              {next.coachMessage && (
                <p className="exec-v3-nextcoach">
                  <span className="exec-v3-nextcoach-q" aria-hidden>“</span>
                  {next.coachMessage}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Peek inferior "Plan completo" — arrastrable/expandible, NO cierra el descanso. */}
        {items.length > 0 && (
          <>
            {sheetOpen && (
              <motion.button
                type="button"
                aria-label="Cerrar plan completo"
                onClick={() => setSheetOpen(false)}
                className="exec-v3-rest-scrim"
                initial={reducedMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={reducedMotion ? undefined : { opacity: 0 }}
              />
            )}
            <motion.div
              className={cn('exec-v3-restsheet', sheetOpen && 'is-open')}
              drag={reducedMotion ? false : 'y'}
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={0.12}
              onDragEnd={(_, info) => {
                if (info.offset.y < -40) setSheetOpen(true)
                else if (info.offset.y > 40) setSheetOpen(false)
              }}
              animate={{ y: 0 }}
              transition={transition}
            >
              <button
                type="button"
                className="exec-v3-restsheet-grab"
                onClick={() => setSheetOpen((o) => !o)}
                aria-expanded={sheetOpen}
                aria-label={sheetOpen ? 'Contraer plan completo' : 'Expandir plan completo'}
              >
                <span className="exec-v3-handle" aria-hidden />
                <span className="exec-v3-restsheet-hd">
                  <span className="exec-v3-restsheet-t">Plan completo</span>
                  <span className="exec-v3-restsheet-c tabular-nums">
                    {doneCount} / {items.length}
                  </span>
                </span>
              </button>
              {/* Filas "estado de un vistazo" (mockup a3a-srow): SIEMPRE renderizadas para que el peek
                  colapsado asome 1-2 filas reales del plan (el resto se recorta con desvanecido). SÓLO
                  LECTURA (QA2-C): una fila por ejercicio individual — los miembros de superserie llevan
                  su letra bajo el encabezado "Superserie X". Sin navegación: es un índice para ver. */}
              <div className="exec-v3-restsheet-body">
                {items.map((item) => {
                  const state = item.complete ? 'done' : item.isCurrent ? 'now' : 'todo'
                  return (
                    <div key={item.key}>
                      {item.groupTitle && (
                        <p className="exec-v3-sgroup">{item.groupTitle}</p>
                      )}
                      <div
                        className={cn('exec-v3-srow', item.isCurrent && 'is-now')}
                        aria-current={item.isCurrent ? 'true' : undefined}
                      >
                        <span className={cn('exec-v3-sstate', state)} aria-hidden>
                          {state === 'done' && <Check className="h-3 w-3" strokeWidth={3.5} />}
                          {state === 'now' && <span className="exec-v3-sstate-dot" />}
                        </span>
                        {item.letter && (
                          <span className="exec-v3-sletter" aria-hidden>
                            {item.letter}
                          </span>
                        )}
                        <span className="exec-v3-snm">{item.title}</span>
                        <span className={cn('exec-v3-ssub tabular-nums', state)}>
                          {state === 'done'
                            ? `✓ ${item.doneSets}/${item.totalSets}`
                            : state === 'now'
                              ? 'ahora'
                              : item.doneSets > 0
                                ? `${item.doneSets}/${item.totalSets}`
                                : 'pendiente'}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </motion.div>
          </>
        )}
      </motion.div>
    </AnimatePresence>
  )
}
