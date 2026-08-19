import { describe, expect, it } from 'vitest'

import {
  SPLASH_SWEEP_END_MS,
  SPLASH_SWEEP_FIGURE_FROM_ROTATION,
  SPLASH_SWEEP_FIGURE_FROM_X_RATIO,
  SPLASH_SWEEP_FIGURE_HALF_EXTENT,
  SPLASH_SWEEP_FIGURE_HEIGHT,
  SPLASH_SWEEP_FIGURE_WIDTH,
  SPLASH_SWEEP_SETTLE_SCALE,
  SPLASH_SWEEP_STREAK_COLORS,
  SPLASH_SWEEP_STREAK_GAP_RATIO,
  SPLASH_SWEEP_STREAK_WIDTH_RATIO,
  SPLASH_SWEEP_WINDOWS,
  SPLASH_SWEEP_WORDMARK_FROM_X_RATIO,
  splashSweepEaseInOutSine,
  splashSweepEaseOutExpo,
  splashSweepElapsed,
  splashSweepFigure,
  splashSweepMs,
  splashSweepSeed,
  splashSweepProgress,
  splashSweepStreakOpacity,
  splashSweepStreakX,
  splashSweepWordmark,
} from '../apps/mobile/components/entry/splash-sweep'

/**
 * Contrato de la coreografia «Glide» del splash EVA (rama EVA del loader de arranque).
 *
 * VIVE EN `tests/` Y NO AL LADO DEL MODULO A PROPOSITO: el `include` de `vitest.config.ts`
 * cubre `apps/web`, `tests`, `packages` y `scripts` — NO `apps/mobile`. Mismo motivo por el
 * que `tour-geometry` se testea desde aca.
 *
 * Lo que fija esta suite, y por que importa cada cosa:
 *
 *  1. **La traduccion 2x.** El canvas del dueno esta autorado en segundos y la escena se
 *     reproduce al doble de velocidad. Si alguien "arregla" el sweep tocando un numero
 *     suelto en vez de la tasa, el gesto deja de ser el disenado.
 *  2. **La reanudacion del handoff.** El sweep se pinta en DOS componentes que se relevan
 *     (`SplashGate` → `DashboardSplashOverlay`). Toda la coreografia tiene que ser una
 *     FUNCION PURA del reloj: si `f(t)` dependiera de cuando se monto el componente, el
 *     overlay saltaria. Por eso el test evalua puntos sueltos del tiempo, sin animar nada.
 *  3. **Los extremos.** t=0 tiene que dejar la figura ENTERA fuera de cuadro —incluida la
 *     esquina que sobresale por la inclinacion de -9°, y tambien en pantallas angostas,
 *     donde la razon del canvas no alcanza— y el final tiene que dejarla clavada en el
 *     centro: un clamp mal puesto la deja torcida para siempre.
 *
 * Lo que esta suite NO cubre y hay que mirar en el componente: el sweep solo corre en el
 * camino sesion + marca EVA (`SplashGate` siembra `sweepStartedAt` en el veredicto). En la
 * rama branded y en el cold start anonimo no hay reloj y nada de esto se aplica.
 */

/** Ancho de referencia (iPhone 13/14/15 en pt). Todo lo del canvas es una razon sobre el. */
const W = 390
/** Alto de referencia. */
const H = 844

describe('traduccion autoral → real (el canvas corre a 2x)', () => {
  it('la escena de 3.5 s autorales dura 1.75 s reales', () => {
    expect(splashSweepMs(3.5)).toBe(1750)
    expect(SPLASH_SWEEP_END_MS).toBe(1750)
  })

  it('cada ventana sale de su tiempo autoral, no de un numero inventado', () => {
    // figura 0.15→1.10 · estelas in 0.2+0.2 / out 0.95+0.55 · firma 0.4→1.35 (x) y +0.55 (o)
    expect(SPLASH_SWEEP_WINDOWS.figure).toEqual({ start: 75, end: 550 })
    expect(SPLASH_SWEEP_WINDOWS.streakIn).toEqual({ start: 100, end: 200 })
    expect(SPLASH_SWEEP_WINDOWS.streakOut).toEqual({ start: 475, end: 750 })
    expect(SPLASH_SWEEP_WINDOWS.wordmarkX).toEqual({ start: 200, end: 675 })
    expect(SPLASH_SWEEP_WINDOWS.wordmarkOpacity).toEqual({ start: 200, end: 475 })
    expect(SPLASH_SWEEP_WINDOWS.settle).toEqual({ start: 550, end: 1750 })
  })
})

describe('curvas', () => {
  it('easeOutExpo coincide con Easing.out(Easing.exp) de Reanimated', () => {
    // 1 - 2^(-10t): la forma cerrada equivalente, que es la que corre en el worklet.
    expect(splashSweepEaseOutExpo(0)).toBe(0)
    expect(splashSweepEaseOutExpo(1)).toBe(1)
    expect(splashSweepEaseOutExpo(0.5)).toBeCloseTo(1 - Math.pow(2, -5), 12)
    // Sale disparada: a un tercio del camino ya recorrio mas del 90%.
    expect(splashSweepEaseOutExpo(1 / 3)).toBeGreaterThan(0.9)
  })

  it('easeInOutSine es simetrica y pasa por 0.5 en la mitad', () => {
    expect(splashSweepEaseInOutSine(0)).toBe(0)
    expect(splashSweepEaseInOutSine(0.5)).toBeCloseTo(0.5, 12)
    expect(splashSweepEaseInOutSine(1)).toBe(1)
    expect(splashSweepEaseInOutSine(0.25) + splashSweepEaseInOutSine(0.75)).toBeCloseTo(1, 12)
  })

  it('el progreso clampa en los dos extremos (nada se pasa de rosca)', () => {
    expect(splashSweepProgress(-500, 0, 100)).toBe(0)
    expect(splashSweepProgress(5000, 0, 100)).toBe(1)
    expect(splashSweepProgress(50, 0, 100)).toBe(0.5)
  })
})

describe('reloj y reanudacion del handoff', () => {
  it('sin semilla el reloj esta en 0 (y el consumidor no pinta sweep: replica estatica)', () => {
    expect(splashSweepElapsed(null, 12_345)).toBe(0)
    expect(splashSweepFigure(0, W).translateX).toBeCloseTo(SPLASH_SWEEP_FIGURE_FROM_X_RATIO * W, 10)
  })

  it('el reloj es tiempo real desde el arranque, acotado al largo de la escena', () => {
    expect(splashSweepElapsed(1_000, 1_300)).toBe(300)
    expect(splashSweepElapsed(1_000, 99_999)).toBe(SPLASH_SWEEP_END_MS)
  })

  it('un reloj que camina hacia atras REINICIA la escena (no la congela)', () => {
    // Honestidad sobre el clamp: `elapsed <= 0 → 0` no "protege" de nada, rebobina TODO al
    // frame 0. Solo puede pasar si el wall clock salta hacia atras entre la semilla del gate
    // y el montaje del overlay (cambio de hora, sincronizacion NTP) — decenas de ms de
    // ventana en un caso patologico. Se acepta: el precio es ver el barrido desde el
    // principio, y la alternativa (un reloj monotonico propio) no cruza el handoff sin
    // arrastrar estado extra.
    expect(splashSweepElapsed(1_000, 900)).toBe(0)
    expect(splashSweepFigure(splashSweepElapsed(1_000, 900), W)).toEqual(splashSweepFigure(0, W))
  })

  it('la coreografia es funcion PURA del reloj: el overlay retoma en el frame exacto', () => {
    // Es la garantia del relevo gate → overlay. El gate suele soltar a los ~120 ms; el
    // overlay recalcula su elapsed y tiene que caer en el MISMO estado, no en otro.
    for (const t of [0, 75, 120, 260, 400, 550, 675, 750, 1200, 1750]) {
      expect(splashSweepFigure(t, W)).toEqual(splashSweepFigure(t, W))
      expect(splashSweepWordmark(t, W)).toEqual(splashSweepWordmark(t, W))
      expect(splashSweepStreakX(t, W, 1)).toBe(splashSweepStreakX(t, W, 1))
    }
    // Y el estado a t=120 (handoff tipico) esta a mitad de camino, no en un extremo:
    const mid = splashSweepFigure(120, W)
    expect(mid.translateX).toBeLessThan(0)
    expect(mid.translateX).toBeGreaterThan(SPLASH_SWEEP_FIGURE_FROM_X_RATIO * W)
  })
})

describe('canal de la figura', () => {
  it('t=0: fuera de cuadro por la izquierda, inclinada, sin settle', () => {
    const f = splashSweepFigure(0, W)
    expect(f.translateX).toBeCloseTo(SPLASH_SWEEP_FIGURE_FROM_X_RATIO * W, 10)
    expect(f.rotation).toBeCloseTo(SPLASH_SWEEP_FIGURE_FROM_ROTATION, 10)
    expect(f.scale).toBe(1)
  })

  it('los primeros 75 ms son HOLD: la escena respira antes de mover nada', () => {
    // Es el unico colchon del blink: la figura estaba centrada (replica estatica) y en el
    // veredicto salta afuera. Estos 75 ms evitan que el salto y el barrido sean el mismo
    // frame, que se leeria como un glitch en vez de como una entrada.
    expect(splashSweepFigure(74, W)).toEqual(splashSweepFigure(0, W))
  })

  it('al cerrar su ventana queda CENTRADA y derecha (nada de figura torcida)', () => {
    const f = splashSweepFigure(SPLASH_SWEEP_WINDOWS.figure.end, W)
    // `toBeCloseTo` y no `toBe`: `-780/1080 * W * 0` da `-0`, que para `Object.is` no es `0`
    // pero para un transform de RN es exactamente lo mismo.
    expect(f.translateX).toBeCloseTo(0, 12)
    expect(f.rotation).toBeCloseTo(0, 12)
  })

  it('el settle respira 1 → 1.02 lineal y recien despues del barrido', () => {
    expect(splashSweepFigure(549, W).scale).toBe(1)
    // Lineal: la mitad del tramo es exactamente la mitad del delta.
    const half = (SPLASH_SWEEP_WINDOWS.settle.start + SPLASH_SWEEP_WINDOWS.settle.end) / 2
    expect(splashSweepFigure(half, W).scale).toBeCloseTo(1 + (SPLASH_SWEEP_SETTLE_SCALE - 1) / 2, 12)
    expect(splashSweepFigure(SPLASH_SWEEP_END_MS, W).scale).toBeCloseTo(SPLASH_SWEEP_SETTLE_SCALE, 12)
  })

  it('escala con el ancho de la pantalla, no con pixeles del canvas', () => {
    // Mientras la razon del canvas alcance para sacar la figura, manda el diseno.
    expect(splashSweepFigure(0, W).translateX).toBeCloseTo(SPLASH_SWEEP_FIGURE_FROM_X_RATIO * W, 10)
    expect(splashSweepFigure(0, 1024).translateX).toBeCloseTo(SPLASH_SWEEP_FIGURE_FROM_X_RATIO * 1024, 10)
  })

  it('a t=0 la figura queda COMPLETAMENTE fuera de cuadro en cualquier ancho', () => {
    // El caso que rompia: en 320 pt, `-780/1080 · 320` = -231.1 y hacen falta -244.7, asi
    // que quedaban ~14 pt de figura (esquina inclinada incluida) clavados en el margen
    // izquierdo durante todo el hold. La razon del canvas asume 1080 de ancho; la figura
    // mide 150 pt FIJOS, asi que cuanto mas angosta la pantalla, menos alcanza.
    for (const width of [320, 360, W, 430, 768, 1024]) {
      const x = splashSweepFigure(0, width).translateX
      // Borde derecho de la caja YA rotada -9°, en coordenadas de pantalla: <= 0 = afuera.
      expect(width / 2 + x + SPLASH_SWEEP_FIGURE_HALF_EXTENT).toBeLessThanOrEqual(0)
      // Y nunca se pasa de largo: el clamp es un piso, no un desplazamiento nuevo.
      expect(x).toBeLessThanOrEqual(SPLASH_SWEEP_FIGURE_FROM_X_RATIO * width)
    }
    // En 320 el que manda es el piso geometrico; en 390 ya manda el canvas.
    expect(splashSweepFigure(0, 320).translateX).toBeLessThan(SPLASH_SWEEP_FIGURE_FROM_X_RATIO * 320)
    expect(SPLASH_SWEEP_FIGURE_HALF_EXTENT).toBeCloseTo(84.65, 1)
  })

  it('la caja rotada mide mas que la figura recta: 75 pt no alcanzan como margen', () => {
    // (w·cos9 + h·sin9)/2 contra w/2. Son ~9.7 pt de esquina que asomarian si el clamp
    // midiera con el ancho pelado.
    expect(SPLASH_SWEEP_FIGURE_HALF_EXTENT).toBeGreaterThan(SPLASH_SWEEP_FIGURE_WIDTH / 2)
    // Y el alto sale del aspecto real del asset (585:526), igual que `evaFigureHeight`.
    expect(SPLASH_SWEEP_FIGURE_WIDTH).toBe(150)
    expect(SPLASH_SWEEP_FIGURE_HEIGHT).toBe(135)
  })
})

describe('canal de la firma', () => {
  it('entra por la DERECHA (lado opuesto a la figura) y termina centrada', () => {
    expect(splashSweepWordmark(0, W).translateX).toBeCloseTo(SPLASH_SWEEP_WORDMARK_FROM_X_RATIO * W, 10)
    expect(splashSweepWordmark(0, W).translateX).toBeGreaterThan(0)
    expect(splashSweepWordmark(SPLASH_SWEEP_WINDOWS.wordmarkX.end, W).translateX).toBeCloseTo(0, 12)
  })

  it('arranca invisible y esta al 100% antes de terminar de deslizar', () => {
    expect(splashSweepWordmark(199, W).opacity).toBe(0)
    expect(splashSweepWordmark(SPLASH_SWEEP_WINDOWS.wordmarkOpacity.end, W).opacity).toBe(1)
    // El fade cierra antes que el deslizamiento: la firma se asienta ya visible.
    expect(SPLASH_SWEEP_WINDOWS.wordmarkOpacity.end).toBeLessThan(SPLASH_SWEEP_WINDOWS.wordmarkX.end)
  })
})

describe('estelas de velocidad', () => {
  it('nacen apagadas, encienden, y se apagan del todo antes del settle', () => {
    expect(splashSweepStreakOpacity(0)).toBe(0)
    expect(splashSweepStreakOpacity(200)).toBeCloseTo(1, 12)
    expect(splashSweepStreakOpacity(SPLASH_SWEEP_WINDOWS.streakOut.end)).toBe(0)
    // Nunca reviven: pasado el fade-out la pantalla queda limpia hasta el final.
    expect(splashSweepStreakOpacity(1200)).toBe(0)
    expect(splashSweepStreakOpacity(SPLASH_SWEEP_END_MS)).toBe(0)
  })

  it('van DETRAS de la figura y se abren en abanico', () => {
    const t = 300
    const figure = splashSweepFigure(t, W).translateX
    const xs = [0, 1, 2].map((i) => splashSweepStreakX(t, W, i))
    // Cada una queda a la izquierda de la figura (es su cola, no su cabeza)...
    for (const x of xs) expect(x).toBeLessThan(figure)
    // ...y cada indice se retrasa un poco mas que el anterior.
    expect(xs[0]).toBeGreaterThan(xs[1])
    expect(xs[1]).toBeGreaterThan(xs[2])
  })

  it('son 3 y la del medio es la azul EVA; las de los costados, cian', () => {
    expect(SPLASH_SWEEP_STREAK_COLORS).toHaveLength(3)
    expect(SPLASH_SWEEP_STREAK_COLORS[1][1]).toBe('rgba(0,122,255,0.75)')
    expect(SPLASH_SWEEP_STREAK_COLORS[0][1]).toBe('rgba(0,229,255,0.55)')
    expect(SPLASH_SWEEP_STREAK_COLORS[2][1]).toBe('rgba(0,229,255,0.55)')
  })

  it('el extremo transparente conserva el RGB: `transparent` mancharia de negro', () => {
    // rgba(0,0,0,0) interpolado contra un color vivo deja una franja sucia en Android.
    for (const [from, to] of SPLASH_SWEEP_STREAK_COLORS) {
      expect(from).toBe(to.replace(/[\d.]+\)$/, '0)'))
    }
  })
})

describe('semilla del veredicto (splashSweepSeed — misma regla en la rama temprana y la tardia)', () => {
  it('la semilla previa GANA: re-sembrar relanzaria la escena a mitad de vuelo', () => {
    expect(splashSweepSeed(1_000, false, 1_400)).toBe(1_000)
    // Gana incluso si la espera se hizo lenta despues de sembrar: la escena ya corre.
    expect(splashSweepSeed(1_000, true, 1_400)).toBe(1_000)
  })

  it('un gate que ya se hizo lento NO siembra: pre-Glide integro, sin relanzamiento', () => {
    // La firma lleva rato en pantalla con su fade por umbral (QA en device 19-08:
    // «nativo → loader viejo → sweep → loader viejo»). `null` viaja hasta el overlay.
    expect(splashSweepSeed(null, true, 1_400)).toBeNull()
  })

  it('veredicto TEMPRANO que igual se hizo lento (AsyncStorage frio, refresh de token): tampoco siembra', () => {
    // La revision adversarial cazo que blindar solo el veredicto tardio dejaba el caso
    // mayoritario (sin branding guardado) relanzando la escena sobre la firma visible.
    // La regla es una sola: espera lenta ⇒ nunca sweep, sin importar la rama.
    expect(splashSweepSeed(null, true, 900)).toBeNull()
  })

  it('veredicto rapido sin semilla previa: siembra en `now`', () => {
    expect(splashSweepSeed(null, false, 1_400)).toBe(1_400)
  })
})

describe('razones del canvas: cada longitud mide contra la dimension correcta', () => {
  it('lo horizontal va sobre 1080 y lo vertical sobre 1920', () => {
    // El error clasico de portar un canvas es escalar TODO por el ancho. La separacion
    // vertical de las estelas esta autorada sobre el alto (96/1920) y ahi se queda.
    expect(SPLASH_SWEEP_FIGURE_FROM_X_RATIO).toBeCloseTo(-780 / 1080, 12)
    expect(SPLASH_SWEEP_WORDMARK_FROM_X_RATIO).toBeCloseTo(560 / 1080, 12)
    expect(SPLASH_SWEEP_STREAK_WIDTH_RATIO).toBeCloseTo(620 / 1080, 12)
    expect(SPLASH_SWEEP_STREAK_GAP_RATIO).toBeCloseTo(96 / 1920, 12)
    // En un telefono de referencia: estelas de ~224 pt separadas ~42 pt. Ni hilos ni vigas.
    expect(SPLASH_SWEEP_STREAK_WIDTH_RATIO * W).toBeCloseTo(223.9, 1)
    expect(SPLASH_SWEEP_STREAK_GAP_RATIO * H).toBeCloseTo(42.2, 1)
  })
})
