'use client'

/**
 * Landing v2 "Prism" — proveedor de estado transversal.
 *
 * Centraliza las 3 piezas de estado que atraviesan toda la landing (spec §0/§7):
 *  1. Brand engine — el color de marca (`--brand`/`--brand-rgb`) muta en vivo vía
 *     un único `requestAnimationFrame` que reescribe un `<style>` inyectado en
 *     `<head>` (scopeado a `#landing-v2-root`, NO toca el `--brand` del DS global).
 *  2. Idioma ES/EN — `lang` + `t(key, esDefault)` (diccionario EN en `copy.ts`).
 *  3. Ciclo de precios mensual/trimestral/anual.
 *
 * Además corre el observer de reveal (`data-reveal` → `.is-in`) para las secciones
 * server que no pueden montar su propio efecto.
 *
 * Los componentes con interacción (swatches, toggle idioma/ciclo) consumen
 * `useLandingBrand()`. Las secciones puramente visuales sólo usan `var(--brand)` /
 * `rgb(var(--brand-rgb) / α)` y no importan nada de acá.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type MutableRefObject,
  type CSSProperties,
} from 'react'
import { EN_DICT } from './copy'

// ── Paleta white-label EVA (RGB) — los colores por los que muta la marca ──
// (spec §4; verbatim del JS del diseño, líneas 872-880)
const PALETTE: number[][] = [
  [0, 122, 255], // 0 EVA blue
  [0, 199, 190], // 1 teal
  [22, 163, 74], // 2 green
  [245, 158, 11], // 3 amber
  [255, 59, 31], // 4 energy  ← sólo se fija a mano (excluido del auto-drift)
  [88, 86, 214], // 5 violet
  [0, 229, 255], // 6 cyan
]
// El auto-drift recorre la paleta SIN el índice 4 (energy). `filter` conserva las
// referencias de los sub-arrays → `RING.indexOf(PALETTE[i])` funciona por referencia.
const RING: number[][] = PALETTE.filter((_, i) => i !== 4)

type Lang = 'es' | 'en'
type Cycle = 'm' | 'q' | 'a'

interface LandingBrandContextValue {
  /** Fija el color de marca al swatch `i` (0..5) y detiene el auto-drift. */
  lockBrand: (i: number) => void
  /** Reanuda el auto-drift desde el hue actual (sin salto). */
  resumeAuto: () => void
  /** Índice fijado actualmente (para el borde del swatch activo), o null en auto. */
  lockedIdx: number | null
  /** true = auto-drift activo. */
  auto: boolean
  /** Color vivo `[r,g,b]` (mutable, sin re-render por frame) — lo lee HeroBackdrop. */
  curRef: MutableRefObject<number[]>
  lang: Lang
  setLang: (l: Lang) => void
  /** Traducción: EN desde `copy.ts`, fallback al ES literal que pasa el componente. */
  t: (key: string, esDefault: string) => string
  cycle: Cycle
  setCycle: (c: Cycle) => void
}

const LandingBrandContext = createContext<LandingBrandContextValue | null>(null)

export function useLandingBrand(): LandingBrandContextValue {
  const ctx = useContext(LandingBrandContext)
  if (!ctx) {
    throw new Error('useLandingBrand debe usarse dentro de <LandingBrandProvider>')
  }
  return ctx
}

// SSR-safe: en el server no hay layout effect (evita el warning); en el cliente
// sí, para pintar el color/reveal antes del primer paint (menos flash).
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

const ROOT_STYLE: CSSProperties = {
  // Valores iniciales (SSR / no-JS): EVA blue. El rAF los sobreescribe con `!important`.
  ['--brand' as string]: 'rgb(0 122 255)',
  ['--brand-rgb' as string]: '0 122 255',
  position: 'relative',
  minHeight: '100dvh',
  background: '#08080a',
  color: '#F8F9FA',
  fontFamily: 'var(--font-inter), ui-sans-serif, system-ui, sans-serif',
  // CLAUDE.md: `overflow-x: clip`, nunca `hidden`.
  overflowX: 'clip',
}

export function LandingBrandProvider({
  children,
  fontClassName,
}: {
  children: ReactNode
  /** className con la CSS var `--font-geist-mono` (next/font, aplicada en page.tsx). */
  fontClassName?: string
}) {
  const rootRef = useRef<HTMLDivElement | null>(null)

  // Estado que dispara re-render (sólo cambia por interacción del usuario).
  const [auto, setAuto] = useState(true)
  const [lockedIdx, setLockedIdx] = useState<number | null>(null)
  const [lang, setLangState] = useState<Lang>('es')
  const [cycle, setCycle] = useState<Cycle>('m')

  // Refs vivos que lee el rAF (evita closures obsoletas).
  const curRef = useRef<number[]>([...PALETTE[0]])
  const targetRef = useRef<number[]>([...PALETTE[0]])
  const posRef = useRef(0)
  const autoRef = useRef(true)
  const lockedIdxRef = useRef<number | null>(null)
  const reduceRef = useRef(false)

  // Interpola el color a lo largo del RING para la posición flotante `x`.
  const ringColor = useCallback((x: number): number[] => {
    const n = RING.length
    const i = ((Math.floor(x) % n) + n) % n
    const j = (i + 1) % n
    const f = x - Math.floor(x)
    const a = RING[i]
    const b = RING[j]
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]
  }, [])

  const lockBrand = useCallback((i: number) => {
    if (i < 0 || i > 5) return
    autoRef.current = false
    lockedIdxRef.current = i
    targetRef.current = [...PALETTE[i]]
    setAuto(false)
    setLockedIdx(i)
  }, [])

  const resumeAuto = useCallback(() => {
    if (!autoRef.current && lockedIdxRef.current != null) {
      // Continuar el ring desde el hue actual para evitar un salto.
      const ri = RING.indexOf(PALETTE[lockedIdxRef.current])
      if (ri >= 0) posRef.current = ri
    }
    autoRef.current = true
    lockedIdxRef.current = null
    setAuto(true)
    setLockedIdx(null)
  }, [])

  const setLang = useCallback((l: Lang) => setLangState(l), [])

  const t = useCallback(
    (key: string, esDefault: string): string => {
      if (lang === 'en') {
        const v = EN_DICT[key]
        return v !== undefined ? v : esDefault
      }
      return esDefault
    },
    [lang],
  )

  // ── Brand morph engine: un único rAF que escribe la CSS var cada frame ──
  useIsoLayoutEffect(() => {
    reduceRef.current = !!(
      window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    )

    const styleEl = document.createElement('style')
    styleEl.id = 'landing-v2-brand-style'
    document.head.appendChild(styleEl)

    let raf = 0
    let last = performance.now()
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now

      if (autoRef.current && !reduceRef.current) {
        posRef.current += dt * 0.085 // deriva lenta por la paleta
        targetRef.current = ringColor(posRef.current)
      }
      // Easear el color actual hacia el target (suave incluso al fijar un color).
      const k = autoRef.current ? 0.16 : 0.1
      const cur = curRef.current
      const tgt = targetRef.current
      for (let c = 0; c < 3; c++) cur[c] += (tgt[c] - cur[c]) * k

      const r = Math.round(cur[0])
      const g = Math.round(cur[1])
      const b = Math.round(cur[2])
      styleEl.textContent =
        '#landing-v2-root{--brand:rgb(' +
        r +
        ' ' +
        g +
        ' ' +
        b +
        ') !important;--brand-rgb:' +
        r +
        ' ' +
        g +
        ' ' +
        b +
        ' !important;}'
      document.documentElement.style.setProperty('--sel-rgb', r + ' ' + g + ' ' + b)

      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(raf)
      styleEl.remove()
    }
  }, [ringColor])

  // ── Reveal observer: agrega `.anim-on` al root + `.is-in` a cada [data-reveal] ──
  useIsoLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return
    const reduce =
      window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    // Sin `.anim-on` todo es visible por default (no-JS / reduced-motion friendly).
    if (reduce || !('IntersectionObserver' in window)) return

    root.classList.add('anim-on')
    const els = Array.from(root.querySelectorAll<HTMLElement>('[data-reveal]'))
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('is-in')
            io.unobserve(e.target)
          }
        })
      },
      { threshold: 0.16, rootMargin: '0px 0px -10% 0px' },
    )
    els.forEach((el) => io.observe(el))
    // Red de seguridad: si algo nunca dispara (tab en background), revelarlo.
    const safety = window.setTimeout(() => {
      els.forEach((el) => el.classList.add('is-in'))
    }, 3200)

    return () => {
      io.disconnect()
      window.clearTimeout(safety)
    }
  }, [])

  const value = useMemo<LandingBrandContextValue>(
    () => ({
      lockBrand,
      resumeAuto,
      lockedIdx,
      auto,
      curRef,
      lang,
      setLang,
      t,
      cycle,
      setCycle,
    }),
    [lockBrand, resumeAuto, lockedIdx, auto, lang, setLang, t, cycle],
  )

  return (
    <LandingBrandContext.Provider value={value}>
      <div id="landing-v2-root" ref={rootRef} className={fontClassName} style={ROOT_STYLE}>
        {children}
      </div>
    </LandingBrandContext.Provider>
  )
}
