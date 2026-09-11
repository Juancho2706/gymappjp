import { useCallback, useEffect, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { Check, Pause, Play, RotateCcw } from 'lucide-react-native'
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake'
import type { HoldContext, HoldSide, HoldSource, OptimisticLogPayload } from '@eva/workout-engine'
import type { SessionHold } from '../../../../lib/workout-session'
import { FONT } from '../../../../lib/typography'
import { hexToRgba } from '../../../../lib/theme'
import { JuicyButton } from './JuicyButton'
import { ProgressRing } from './ProgressRing'
import { formatClock, sideLabel } from './typed-screen-model'
import { useHoldModule, type HoldCommitInfo, type HoldModuleKind, type HoldModuleStatus } from './use-hold-module'
import type { ExecTheme } from './exec-theme'

/**
 * Módulo de HOLD del ejecutor V3 (specs/cuenta-atras-en-pantalla, W3.9) — la PRESENTACIÓN del reloj
 * de movilidad y de fuerza por tiempo: anillo + número + pastilla de lado + «luego: …» + CTAs.
 *
 * Todo el estado y toda la decisión viven en `useHoldModule` (W3.2) y en el motor; este componente
 * NUNCA guarda ni arranca descansos: sus únicas salidas son `onCommit(payload, source, info)` (el
 * auto-envío de V2, con el payload ya armado por el motor) y `onSeed(values, nonce)` (la siembra de la
 * fila por `typedSeedPatch`). La pantalla que lo monta decide qué hacer con la preferencia D5 (ON ⇒
 * el orquestador arranca el descanso; OFF ⇒ `RestOfferV3`).
 *
 * Tres tamaños (V1: el video nunca se colapsa, el reloj va DEBAJO y más chico donde hace falta):
 *  · `ss`      — 80 px, miembro activo de una superserie (bajo la media de 150 px);
 *  · `solo130` — 130 px, fuerza por tiempo (convive con los tiles KG / SEG);
 *  · `solo214` — 214 px, movilidad sola (el anillo de siempre, ahora con guardado a 0).
 *
 * Predicado de montaje (R29): lo evalúa la PANTALLA — el módulo se monta solo si hay reloj que montar
 * (`duration_sec > 0` en movilidad o `isStrengthTimeBlock` en fuerza). Acá `prescribedSec` es > 0.
 */
export type HoldModuleSize = 'ss' | 'solo130' | 'solo214'

/**
 * CA-96 (decisión de W3): mientras el reloj CORRE la pantalla no se apaga, con un tag PROPIO — no toca
 * la preferencia «Pantalla siempre encendida» del alumno ni el tag del ejecutor. Sin esto, con esa
 * preferencia en OFF la pantalla dormiría a mitad de un hold de 30–600 s, el JS se congelaría y la
 * rama R6 (objetivo guardado, lado 2 parado) dejaría de ser la excepción para ser el camino normal.
 */
const KEEP_AWAKE_TAG = 'hold-module'

const SIZES: Record<HoldModuleSize, { ring: number; stroke: number; num: number; pill: number; cta: number; ctaFont: number; gap: number }> = {
  ss: { ring: 80, stroke: 9, num: 22, pill: 13, cta: 44, ctaFont: 15, gap: 8 },
  solo130: { ring: 130, stroke: 14, num: 36, pill: 15, cta: 52, ctaFont: 16, gap: 10 },
  solo214: { ring: 214, stroke: 23, num: 60, pill: 19, cta: 52, ctaFont: 16, gap: 10 },
}

export interface HoldModuleV3Props {
  kind: HoldModuleKind
  size: HoldModuleSize
  blockId: string
  setNumber: number
  /** `duration_sec` prescrito (> 0, garantizado por el predicado R29 de la pantalla). */
  prescribedSec: number
  sideMode: string | null
  context: HoldContext
  closesRound: boolean
  /** `${blockId}:${setNumber}:${round}` — al cambiar, el módulo vuelve a `idle`. */
  resetKey: string
  /** Descanso de grupo corriendo ⇒ la cuenta se suspende (sin decisión del motor). */
  suspended?: boolean
  exec: ExecTheme
  /** Acento del anillo y del CTA: aqua (recovery) en movilidad, marca del coach en fuerza por tiempo. */
  accent: string
  /** Tinta sobre el acento (texto del juicy). */
  accentText: string
  reducedMotion?: boolean
  /** «luego: …» — el siguiente miembro de la ronda (superserie). El lado siguiente lo pone el módulo. */
  nextLabel?: string | null
  /** Lo tipeado hoy en la fila del alumno (base de la mezcla de captura). */
  getCaptureValues: () => Record<string, string>
  /** Siembra de la fila por `typedSeedPatch` con nonce, NUNCA por `seedValues`. */
  onSeed: (values: Record<string, string>, nonce: number) => void
  /** Auto-envío (V2): el payload ya viene armado por el motor. */
  onCommit: (payload: OptimisticLogPayload, source: HoldSource, info: HoldCommitInfo) => void
  onSideChange?: (side: HoldSide, autoStarted: boolean) => void
  /** Persiste el reloj ARMADO en el snapshot de la sesión (ítem 12 · R6), o lo borra con `null`. */
  saveHold?: (hold: SessionHold | null) => void
  /** Reloj rescatado del snapshot tras un cierre duro de la app (ya filtrado por día). */
  restoredHold?: SessionHold | null
  /** La pantalla lo usa para ocultar (display: 'none', R26) la fila de captura mientras corre. */
  onStatusChange?: (status: HoldModuleStatus) => void
  testIDPrefix?: string
}

export function HoldModuleV3({
  kind,
  size,
  blockId,
  setNumber,
  prescribedSec,
  sideMode,
  context,
  closesRound,
  resetKey,
  suspended = false,
  exec,
  accent,
  accentText,
  reducedMotion = false,
  nextLabel = null,
  getCaptureValues,
  onSeed,
  onCommit,
  onSideChange,
  saveHold,
  restoredHold = null,
  onStatusChange,
  testIDPrefix = 'hold',
}: HoldModuleV3Props) {
  const dims = SIZES[size]
  const s = exec.surface
  // Segundos que quedaron guardados por el reloj (chip «Guardado · N s» del estado `done`).
  const [savedSec, setSavedSec] = useState<number | null>(null)
  const handleCommit = useCallback(
    (payload: OptimisticLogPayload, source: HoldSource, info: HoldCommitInfo) => {
      setSavedSec(payload.actualHoldSec ?? null)
      onCommit(payload, source, info)
    },
    [onCommit],
  )
  const api = useHoldModule({
    kind,
    blockId,
    setNumber,
    prescribedSec,
    sideMode,
    context,
    closesRound,
    resetKey,
    suspended,
    getCaptureValues,
    onSeed,
    onCommit: handleCommit,
    onSideChange,
    saveHold,
    restoredHold,
  })
  useEffect(() => {
    setSavedSec(null)
  }, [resetKey])
  useEffect(() => {
    onStatusChange?.(api.status)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.status])
  useEffect(() => {
    if (api.status !== 'running') return
    activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {})
    return () => {
      deactivateKeepAwake(KEEP_AWAKE_TAG)
    }
  }, [api.status])

  const perSide = api.sides.length > 1
  const isLeft = api.side === 'left'
  const done = api.status === 'done'
  const running = api.status === 'running'
  const idle = api.status === 'idle'
  // Lado derecho ARMADO tras un vencimiento fuera de la app (R6/R27): el CTA lo dice explícito.
  const primedRight = idle && api.side === 'right' && api.expiredWhileAway
  const startLabel = kind === 'strength_time' ? 'Iniciar serie' : primedRight ? 'Iniciar lado derecho' : 'Iniciar hold'
  const doneLabel = perSide && isLeft ? 'Listo este lado' : 'Listo'
  const fill = done ? 1 : api.remaining / (api.total || 1)
  const secondaryStyle = {
    width: '100%' as const,
    height: dims.cta,
    borderRadius: 15,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 9,
    borderWidth: 2,
    borderColor: s.borderStrong,
    backgroundColor: s.surfaceRaised,
  }
  const secondaryText = { fontFamily: FONT.uiExtra, fontSize: dims.ctaFont, letterSpacing: 0.3, color: '#e8e8ee' }
  const juicyExec = { ...exec, accent, accentText }

  return (
    <View testID={`${testIDPrefix}-module`} style={{ width: '100%', alignItems: 'center', gap: dims.gap }}>
      {/* Pastilla de lado (per_side): «Lado izquierdo / derecho». Se retira al guardar. */}
      {perSide && !done ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: size === 'ss' ? 7 : 10,
            borderRadius: 999,
            borderWidth: 2,
            paddingHorizontal: size === 'ss' ? 12 : 20,
            paddingVertical: size === 'ss' ? 5 : 10,
            backgroundColor: hexToRgba(accent, 0.15),
            borderColor: hexToRgba(accent, 0.36),
          }}
        >
          <View style={{ width: size === 'ss' ? 9 : 14, height: size === 'ss' ? 9 : 14, borderRadius: 7, backgroundColor: accent }} />
          <Text style={{ fontFamily: FONT.displayBlack, fontSize: dims.pill, letterSpacing: -0.2, color: hexToRgba(accent, 0.95) }}>
            {sideLabel(api.side)}
          </Text>
        </View>
      ) : null}

      {/* Anillo + número. En `ss` no hay botón de re-medir al costado (no cabe); el alumno pausa y toca «Listo». */}
      <View style={{ width: '100%', alignItems: 'center', justifyContent: 'center' }}>
        <ProgressRing size={dims.ring} strokeWidth={dims.stroke} fill={fill} color={accent} trackColor="#262c31" reducedMotion={reducedMotion}>
          <View style={{ alignItems: 'center', justifyContent: 'center' }}>
            {done ? (
              <>
                <Check size={size === 'ss' ? 18 : 26} color={accent} strokeWidth={3} />
                <Text style={{ fontFamily: FONT.displayBlack, fontSize: size === 'ss' ? 13 : 20, letterSpacing: -0.3, color: '#eef4f6' }}>
                  ¡Listo!
                </Text>
              </>
            ) : (
              <Text
                testID={`${testIDPrefix}-clock`}
                style={{ fontFamily: FONT.displayBlack, fontSize: dims.num, letterSpacing: size === 'ss' ? -0.6 : -2, lineHeight: dims.num + 2, color: '#eef4f6', fontVariant: ['tabular-nums'] }}
              >
                {formatClock(api.remaining)}
              </Text>
            )}
          </View>
        </ProgressRing>
        {size !== 'ss' && api.started && !done ? (
          <Pressable
            testID={`${testIDPrefix}-remeasure`}
            onPress={api.remeasure}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Volver a medir desde el objetivo"
            style={{ position: 'absolute', right: 4, top: 0, bottom: 0, justifyContent: 'center' }}
          >
            <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#2f2f3a', backgroundColor: '#1c1c24' }}>
              <RotateCcw size={16} color="#b7b7c2" />
            </View>
          </Pressable>
        ) : null}
      </View>

      {/* Guardado · N s (done) · luego: lado / miembro siguiente (en curso). */}
      {done ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, borderWidth: 1.5, paddingHorizontal: 11, paddingVertical: 5, backgroundColor: hexToRgba(accent, 0.12), borderColor: hexToRgba(accent, 0.3) }}>
          <Text style={{ fontFamily: FONT.uiBold, fontSize: 12, color: hexToRgba(accent, 0.95), fontVariant: ['tabular-nums'] }}>
            Guardado{savedSec != null ? ` · ${savedSec} s` : ''}
          </Text>
        </View>
      ) : perSide && isLeft ? (
        <Text style={{ fontFamily: FONT.uiBold, fontSize: 12, color: '#6f7c82' }}>
          luego: <Text style={{ color: '#9fb2b9' }}>{sideLabel('right')}</Text>
        </Text>
      ) : nextLabel ? (
        <Text style={{ fontFamily: FONT.uiBold, fontSize: 12, color: '#6f7c82' }} numberOfLines={1}>
          luego: <Text style={{ color: '#9fb2b9' }}>{nextLabel}</Text>
        </Text>
      ) : null}

      {/* CTAs APILADOS (nunca dos w-full en fila). Sólo UNO es juicy a la vez: sin arrancar manda
          «Iniciar …»; corriendo manda «Listo» y el control (Pausar/Reanudar) pasa a secundario. */}
      {!done ? (
        <View style={{ width: '100%', gap: size === 'ss' ? 6 : 8 }}>
          {idle ? (
            <>
              <JuicyButton
                testID={`${testIDPrefix}-start`}
                label={startLabel}
                icon={<Play size={18} color={accentText} fill={accentText} />}
                onPress={api.start}
                exec={juicyExec}
                height={dims.cta}
                fontSize={dims.ctaFont}
                reducedMotion={reducedMotion}
                accessibilityLabel={startLabel}
              />
              {/* CA-90: «Listo» desde idle conserva el comportamiento de hoy — siembra el objetivo en la
                  fila y NO envía (el alumno confirma con su botón). Sólo en movilidad: en fuerza por
                  tiempo el camino manual es tipear SEG en el tile. */}
              {kind === 'mobility' && size !== 'ss' ? (
                <Pressable
                  testID={`${testIDPrefix}-seed-objective`}
                  onPress={api.seedObjective}
                  style={secondaryStyle}
                  accessibilityRole="button"
                  accessibilityLabel={perSide && isLeft ? 'Terminé este lado sin reloj, pasar al otro' : 'Terminé el hold sin reloj'}
                >
                  <Text style={secondaryText}>{doneLabel}</Text>
                </Pressable>
              ) : null}
            </>
          ) : (
            <>
              <Pressable
                testID={`${testIDPrefix}-toggle`}
                onPress={running ? api.pause : api.resume}
                style={secondaryStyle}
                accessibilityRole="button"
                accessibilityLabel={running ? 'Pausar el hold' : 'Reanudar el hold'}
              >
                {running ? <Pause size={17} color="#e8e8ee" fill="#e8e8ee" /> : <Play size={17} color="#e8e8ee" fill="#e8e8ee" />}
                <Text style={secondaryText}>{running ? 'Pausar' : 'Reanudar'}</Text>
              </Pressable>
              <JuicyButton
                testID={`${testIDPrefix}-done`}
                label={doneLabel}
                onPress={api.doneEarly}
                exec={juicyExec}
                height={size === 'ss' ? dims.cta : 58}
                fontSize={dims.ctaFont}
                reducedMotion={reducedMotion}
                accessibilityLabel={perSide && isLeft ? 'Terminé este lado, pasar al otro' : 'Terminé el hold'}
              />
            </>
          )}
        </View>
      ) : null}
    </View>
  )
}
