import { useEffect, useMemo, useRef, useState } from 'react'
import { Modal, Pressable, Text, TextInput, View, type TextStyle } from 'react-native'
import { AnimatePresence, MotiView } from 'moti'
import { Check, ChevronRight, CloudOff, HelpCircle, Loader2, StickyNote } from 'lucide-react-native'
import {
  formatWeightEsCl,
  typedKeypadFields,
  type OptimisticLogPayload,
  type ReconciledSessionLog,
  type TypedKeypadMode,
  // Mapeo PURO valores->payload (subido al engine en E0.3): compartido con el `KeypadHost`.
  buildStrengthPayload,
  buildTypedPayload,
  int,
} from '@eva/workout-engine'
import { FONT, TYPE, textStyle } from '../../../lib/typography'
import { haptics } from '../../../lib/haptics'
import { fmtTypedLoggedLine } from './workout-ui'
// RPE_HELP/RIR_HELP se importan (fuente única mobile) en vez de re-declararlos: evita el drift que la
// Ola 0 flagueó (#1). Son mirror literal —con tildes— de la web (`EffortScale.tsx:17-20`).
import { TypedKeypad, EffortScale, KEYPAD_EYEBROW_STYLE, RPE_HELP, RIR_HELP } from './TypedKeypad'
import { useEvaMotion } from '../../../lib/motion'

const SPORT_400 = '#5C9DFF'
const WARNING_500 = '#F5A524' // --color-warning-500 (serie sin sincronizar)
const ON_DARK_MUTED = '#939DAB'

// Badge numérico de serie: la web lo pinta `font-black tabular-nums` (fuente UI en peso 900, NO mono) —
// chip `text-[11px]` (`LogSetForm.tsx:539`) y fila activa `text-[13px]` (`:620-626`). Mapea a Archivo 900
// (displayBlack, el único peso 900 cargado) con cifras tabulares. Antes salía en TYPE.mono (JetBrains 400),
// tres pesos por debajo y en la familia equivocada.
const BADGE_CHIP_STYLE: TextStyle = { ...textStyle('3xs', FONT.displayBlack), fontVariant: ['tabular-nums'] }
const BADGE_ACTIVE_STYLE: TextStyle = { ...textStyle('xs', FONT.displayBlack), fontVariant: ['tabular-nums'] }

// Métricas del chip recap: la FORMA (tamaño+familia) viene de un solo origen (typography.ts:11-14: TYPE=forma,
// className=color). Antes se pasaba `style={TYPE.mono}` (16px JetBrains 400, TYPE_SCALE.md) JUNTO a un
// className `text-[13px]`/`text-[11px]`; bajo NativeWind v4 el `style` inline gana → las cifras salían a 16px
// (no los 13/11 del web) y en peso 400 (Regular), no el font-bold/font-semibold del web. Ahora cada estilo fija
// size+familia y el className sólo aporta color.
//   • Marca peso×reps — web `font-mono text-[13px] font-bold tabular-nums` (LogSetForm.tsx:542) → mono 700, 13px.
//   • RPE/RIR — web `font-mono text-[11px] font-semibold` (LogSetForm.tsx:548,551) → mono 600 (semibold), 11px.
//     La cara JetBrainsMono_600SemiBold SÍ está cargada (`app/_layout.tsx:33,212`) y ya la usa `OBJECTIVE_STYLE`
//     (`TypedKeypad.tsx:102`); el peso 500 previo caía uno por debajo del `font-semibold` del web.
//   • Línea tipada (cardio/movilidad/roller) — chip propio de RN; conserva la familia mono previa a 13px.
const CHIP_MARK_STYLE: TextStyle = { ...textStyle('xs', FONT.monoBold), fontVariant: ['tabular-nums'] }
const CHIP_EFFORT_STYLE: TextStyle = textStyle('3xs', FONT.monoSemibold)
const CHIP_TYPED_STYLE: TextStyle = { ...textStyle('xs', FONT.mono), fontVariant: ['tabular-nums'] }

/**
 * Fila de error de sync (mensaje rojo + Editar + Reintentar) — mirror web A.4.e (`LogSetForm.tsx:738-748`
 * strength · `:1098-1108` tipada, que muestran `state.error` + 'Reintentar'). Compartida por el chip
 * strength y la fila TIPADA logueada para que ambas variantes ofrezcan el MISMO affordance de
 * corrección/reintento (antes la tipada con `onRpeUpdate` retornaba temprano y nunca lo mostraba).
 * `onEdit` abre la fila editable (keypad sembrado, adaptación RN del `setEditing(true)` web);
 * `onRetry` re-dispara el commit del mismo payload para el error transitorio de red.
 */
function SyncErrorRow({
  setNumber,
  message,
  onEdit,
  onRetry,
}: {
  setNumber: number
  message: string
  onEdit: () => void
  onRetry?: () => void
}) {
  return (
    <View className="flex-row items-center gap-2 px-1">
      <Text style={TYPE.caption} className="flex-1 text-danger-500" numberOfLines={2}>
        {message}
      </Text>
      <Pressable
        testID={`edit-set-${setNumber}`}
        onPress={onEdit}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`Editar la serie ${setNumber} para corregir el valor`}
        className="rounded-control border border-danger-500/30 px-2 py-1 active:bg-danger-500/10"
      >
        <Text
          style={{ fontFamily: FONT.uiBold, fontSize: 10, letterSpacing: 0.4, textTransform: 'uppercase' }}
          className="text-danger-500"
        >
          Editar
        </Text>
      </Pressable>
      <Pressable
        testID={`retry-set-${setNumber}`}
        onPress={onRetry}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`Reintentar guardar la serie ${setNumber}`}
        className="rounded-control border border-danger-500/30 px-2 py-1 active:bg-danger-500/10"
      >
        <Text
          style={{ fontFamily: FONT.uiBold, fontSize: 10, letterSpacing: 0.4, textTransform: 'uppercase' }}
          className="text-danger-500"
        >
          Reintentar
        </Text>
      </Pressable>
    </View>
  )
}

/**
 * Fila de una serie (mobile). Espeja el chip recap de `LogSetForm` de web: la serie logueada muestra
 * su marca (`{peso} × {reps}` en mono, "×" atenuada) + RPE/RIR, y la activa es un tap que abre el
 * TypedKeypad. El prompt "Toca para registrar" va en Hanken (sans), NO en mono — el mono se reserva a
 * las métricas (paridad web: la frase es cuerpo, los números son datos).
 *
 * `typedMode` (cardio/movilidad/roller) muta la línea de valores a las columnas `actual_*`/`reps_done`
 * (E2-10). Ausente ⇒ strength (peso × reps · RPE/RIR).
 */
export function SetRow({
  setNumber,
  log,
  isActive,
  typedMode,
  onPress,
  onRpeUpdate,
  settle = false,
  pr = false,
  prColor = WARNING_500,
  prIntense = false,
  syncError = null,
  onRetry,
  showEffort = true,
}: {
  setNumber: number
  log?: ReconciledSessionLog
  isActive: boolean
  typedMode?: TypedKeypadMode | null
  onPress: () => void
  /**
   * Mostrar las pills de esfuerzo RPE/RIR de la serie logueada (E3.7 — tuerca V3). Default true =
   * comportamiento previo. En false (V3 con "Mostrar RPE/RIR" apagado) el chip omite RPE/RIR.
   */
  showEffort?: boolean
  /**
   * La serie se acaba de cerrar en ESTA sesión (señal one-shot del padre, mirror web `settleRef`,
   * `LogSetForm.tsx:510`): el check de guardado entra con un settle elástico. Las series ya cargadas
   * al abrir la rutina llegan con `settle=false` ⇒ sin animación fantasma (paridad web `:256`).
   */
  settle?: boolean
  /**
   * La serie recién cerrada igualó/superó el récord (isPR del commit, mirror web `prRef`,
   * `LogSetForm.tsx:511`): pulso dorado sobre el chip. Sólo con `settle` real (no en logs cargados).
   */
  pr?: boolean
  /**
   * Color del pulso de PR. Default `WARNING_500` (ámbar, comportamiento V2 previo sin token). El
   * ejecutor V3 (E4.2) pasa su token PROPIO de PR `exec.pr` (#f5c451) para que el récord se vea dorado.
   */
  prColor?: string
  /**
   * Pulso de PR INTENSO del ejecutor V3 (E4.2): borde dorado que late ~1,5s (3 pulsos, sin loop) en vez
   * del destello único de 320ms de V2. Default false = destello corto (paridad web). reduced-motion ⇒ un
   * solo latido suave.
   */
  prIntense?: boolean
  /**
   * Registro de RPE POST-log en series tipadas (cardio/movilidad/roller) — mirror de
   * `TypedLogSetRow` web (`LogSetForm.tsx:1112-1136`): al loguear una serie tipada se despliega la
   * MISMA escala de dots RPE; cambiarla re-submitea el log completo preservando los ejes `actual_*`
   * (crítico anti-bug hold). Opcional: sin este callback la serie tipada queda como chip simple
   * (comportamiento previo, sin regresión). No aplica a fuerza (RPE/RIR se capturan en la fila activa).
   */
  onRpeUpdate?: (payload: OptimisticLogPayload) => void
  /**
   * Mensaje de error de sync de ESTA serie (mirror web `SetSyncStatus='error'` + `state.error`,
   * `LogSetForm.tsx:136-137,348-363`): un guardado fallido CON conexión pinta el chip en rojo y ofrece
   * Reintentar. `null` ⇒ sin error. Offline no lo usa (queda `_pending` ámbar + auto-reintento).
   */
  syncError?: string | null
  /** Re-dispara el commit de la serie fallida (mirror web botón 'Reintentar' → requestSubmit, `:738-749`). */
  onRetry?: () => void
}) {
  const logged = !!log
  const pending = log?._pending === true
  const [rpeHelpOpen, setRpeHelpOpen] = useState(false)
  const motion = useEvaMotion()

  // Paridad web B.3: una serie TIPADA logueada muestra la escala RPE debajo de su marca; cambiarla
  // reconstruye el payload desde el log (preservando `actual_*`) y re-submitea vía `onRpeUpdate`.
  if (logged && typedMode && onRpeUpdate && log) {
    const rpePayload = (v: number): OptimisticLogPayload => ({
      blockId: log.block_id,
      setNumber,
      weightKg: log.weight_kg ?? null,
      repsDone: log.reps_done ?? null,
      rpe: v,
      rir: log.rir ?? null,
      note: log.note ?? null,
      actualDurationSec: log.actual_duration_sec ?? null,
      actualDistanceM: log.actual_distance_m ?? null,
      actualHoldSec: log.actual_hold_sec ?? null,
      actualAvgHr: log.actual_avg_hr ?? null,
    })
    return (
      <View
        testID={`set-row-${setNumber}`}
        className={`gap-2 rounded-control border px-3 py-2 ${
          syncError
            ? // Fallo de guardado real (con conexión) ⇒ contenedor ROJO, igual que el chip strength
              // (`:198-201`) y señal del error de sync que la web pinta con `state.error` (`:1098-1108`).
              'border-danger-500/40 bg-danger-500/[0.06]'
            : 'border-sport-500/25 bg-sport-500/[0.06]'
        }`}
      >
        <Pressable
          onPress={onPress}
          className="flex-row items-center gap-2 active:opacity-90"
          accessibilityRole="button"
          accessibilityLabel={
            pending
              ? `Serie ${setNumber} sin sincronizar — toca para editar`
              : `Serie ${setNumber} registrada — toca para editar`
          }
        >
          <View className="h-7 w-7 items-center justify-center rounded-full bg-sport-500/20">
            <Check size={15} color={SPORT_400} strokeWidth={2.6} />
          </View>
          <View className="min-w-0 flex-1">
            {/* Eyebrow con KEYPAD_EYEBROW_STYLE (11px / 0.04em) — mismo rol que el resto de la card (Kg/Reps,
                Esfuerzo·RPE). Aquí el badge es un check, no el número, así que "Serie N" se conserva como
                única señal del número (a diferencia del chip strength, donde el badge ya lo da). */}
            <Text style={KEYPAD_EYEBROW_STYLE} className="text-on-dark-muted">
              Serie {setNumber}
            </Text>
            {/* Mark siempre text-on-dark (paridad web LogSetForm.tsx:542: la marca nunca se recolorea;
                el ámbar de pending vive en el contenedor/badge/estado, no en el valor). */}
            <Text style={CHIP_TYPED_STYLE} className="text-on-dark" numberOfLines={1}>
              {fmtTypedLoggedLine(log, typedMode)}
            </Text>
          </View>
          {pending && (
            <View className="flex-row items-center gap-1">
              <CloudOff size={14} color={WARNING_500} />
              <Text
                style={{ fontFamily: FONT.uiBold, fontSize: 10, letterSpacing: 0.6, textTransform: 'uppercase' }}
                className="text-warning-500"
              >
                Sin sincronizar
              </Text>
            </View>
          )}
        </Pressable>

        {/* RPE post-registro con la MISMA escala segmentada (mirror `LogSetForm.tsx:1121-1135`). La web lo
            EXPANDE con AnimatePresence height 0→auto + opacity en 0.25s al pasar la serie a logueada
            (`LogSetForm.tsx:1112-1119`). Como este bloque monta junto con la fila logueada, aquí el equivalente
            RN es la entrada opacity/translateY (mismo idioma que los disclosures de la card,
            `SingleExerciseCard.tsx:453-461`), 250ms, instantánea con reduce-motion. */}
        <MotiView
          from={motion.reduced ? { opacity: 1, translateY: 0 } : { opacity: 0, translateY: -4 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: 'timing', duration: motion.reduced ? 0 : 250 }}
        >
          <View className="mb-1 flex-row items-center gap-1">
            <Text style={KEYPAD_EYEBROW_STYLE} className="text-on-dark-muted">
              Esfuerzo · RPE
            </Text>
            <EffortLabel label="RPE" open={rpeHelpOpen} onToggle={() => setRpeHelpOpen((o) => !o)} />
          </View>
          {rpeHelpOpen && (
            <Text style={textStyle('3xs', FONT.uiMedium)} className="mb-1.5 text-on-dark-muted">
              {RPE_HELP}
            </Text>
          )}
          <EffortScale kind="rpe" value={log.rpe ?? null} onSelect={(v) => onRpeUpdate(rpePayload(v))} compact />
        </MotiView>

        {/* Estado de error de sync — MISMO affordance que la fila strength (`:334-346`), antes inalcanzable
            aquí por el early-return. Mirror web `LogSetForm.tsx:1098-1108`: mensaje rojo + Reintentar dentro
            de la fila logueada tipada, junto a la escala RPE. `onEdit` = reabrir el keypad sembrado (onPress). */}
        {syncError && (
          <SyncErrorRow setNumber={setNumber} message={syncError} onEdit={onPress} onRetry={onRetry} />
        )}
      </View>
    )
  }

  const chip = (
    <Pressable
      testID={`set-row-${setNumber}`}
      onPress={onPress}
      className={`relative flex-row items-center gap-2 overflow-hidden rounded-control border px-3 py-2 active:opacity-90 ${
        logged
          ? syncError
            ? // Fallo de guardado real (con conexión) ⇒ contenedor ROJO (mirror web estado 'error':
              // reabre la fila y muestra `state.error` + Reintentar, `LogSetForm.tsx:348-363,738-749`).
              'border-danger-500/40 bg-danger-500/[0.06]'
            : pending
              ? // Serie sin sincronizar ⇒ contenedor ÁMBAR (mirror web amber-500/30·/[0.06],
                // `LogSetForm.tsx:520-521`); antes sólo el texto/badge se teñía, el chip seguía sport.
                'border-warning-500/30 bg-warning-500/[0.06]'
              : // Serie guardada ⇒ borde sport al 25% (mirror web SAVED `border-[var(--sport-500)]/25`,
                // `LogSetForm.tsx:522`); antes /30, un escalón por encima del web (el bg /[0.06] sí coincidía).
                'border-sport-500/25 bg-sport-500/[0.06]'
          : isActive
            ? 'border-sport-500/50 bg-white/[0.04]'
            : 'border-inverse/50 bg-white/[0.02]'
      }`}
      accessibilityRole="button"
      accessibilityLabel={
        logged
          ? pending
            ? `Serie ${setNumber} sin sincronizar — toca para editar`
            : `Serie ${setNumber} registrada — toca para editar`
          : `Registrar serie ${setNumber}`
      }
    >
      {/* Pulso dorado de PR (mirror web `prGlow`, `LogSetForm.tsx:534-536`): ring que entra a 0.8 y se
          apaga en 0.32s (320ms) cuando el commit devolvió isPR. La web usa `times:[0,0.4,1]` (pico al 40%);
          Moti `timing` no acepta `times`, así que el pico queda al 50% pero la DURACIÓN sí iguala los
          0.32s del web (antes 110ms, ~3× más rápido y contradiciendo este comentario). Sin token amber ⇒ warning-500. */}
      {pr ? (
        <MotiView
          pointerEvents="none"
          from={{ opacity: 0 }}
          // V3 (prIntense): borde dorado que late ~1,5s (3 pulsos, sin loop); reduced-motion ⇒ un latido.
          // V2 (default): destello único de 320ms (paridad web `prGlow`). Color desde `prColor` (token PR
          // dorado en V3, ámbar warning-500 en V2) vía style, no className (el hex es dinámico).
          animate={{ opacity: prIntense ? (motion.reduced ? [0, 1, 0] : [0, 1, 0.2, 1, 0.2, 1, 0]) : [0, 0.8, 0] }}
          transition={{ type: 'timing', duration: prIntense ? (motion.reduced ? 800 : 1500) : 320 }}
          className="absolute inset-0 rounded-control border-2"
          style={{ borderColor: prColor }}
        />
      ) : null}
      <View
        className={`h-6 w-6 items-center justify-center rounded-full ${
          logged ? 'bg-sport-500/20' : 'bg-white/[0.06]'
        }`}
      >
        {/* Badge = NÚMERO de serie, también en las logueadas (mirror web `LogSetForm.tsx:539-541`): chip
            `h-6 w-6 text-[11px] font-black tabular-nums`. El check de guardado va a la derecha, no en el
            badge. Antes: h-7 w-7 (28px vs 24px web) + TYPE.mono a 12px (JetBrains 400, no el font-black web). */}
        <Text style={BADGE_CHIP_STYLE} className={logged ? 'text-sport-300' : 'text-on-dark-muted'}>
          {setNumber}
        </Text>
      </View>
      {/* Fila ÚNICA horizontal [badge][marca W×R · RPE · RIR · nota][check] — mirror del chip recap web
          (`LogSetForm.tsx:539-570`), que NO repite "Serie N" (el badge ya da el número). Antes se apilaba
          un eyebrow "Serie {n}" SOBRE la marca, duplicando el número y partiendo la fila en dos líneas. */}
      <View className="min-w-0 flex-1">
        {!logged ? (
          <Text style={TYPE.caption} className="text-[13px] text-on-dark-muted" numberOfLines={1}>
            Toca para registrar
          </Text>
        ) : typedMode ? (
          // Mark siempre text-on-dark (paridad web LogSetForm.tsx:542): el valor nunca se recolorea; el
          // ámbar de pending vive en el contenedor/badge/estado a la derecha, no en la cifra.
          <Text style={CHIP_TYPED_STYLE} className="text-on-dark" numberOfLines={1}>
            {fmtTypedLoggedLine(log, typedMode)}
          </Text>
        ) : (
          <View className="flex-row flex-wrap items-center gap-x-2">
            {/* Marca peso×reps: forma desde CHIP_MARK_STYLE (mono 700, 13px, tabular — web
                `font-mono text-[13px] font-bold tabular-nums`, LogSetForm.tsx:542). SIEMPRE text-on-dark:
                el web nunca tiñe el valor de ámbar en pending (el borde/badge/estado ya lo señalan). */}
            <Text style={CHIP_MARK_STYLE} className="text-on-dark">
              {log?.weight_kg ?? '–'}
              <Text className="text-on-dark-muted"> × </Text>
              {log?.reps_done ?? '–'}
            </Text>
            {/* RPE/RIR: mono 500 (semibold web) a 11px vía CHIP_EFFORT_STYLE (web
                `font-mono text-[11px] font-semibold`, LogSetForm.tsx:548,551). La tuerca V3 (E3.7)
                puede ocultarlas con `showEffort={false}`. */}
            {showEffort && log?.rpe != null && (
              <Text style={CHIP_EFFORT_STYLE} className="text-on-dark-muted">RPE {log.rpe}</Text>
            )}
            {showEffort && log?.rir != null && (
              <Text style={CHIP_EFFORT_STYLE} className="text-on-dark-muted">RIR {log.rir}</Text>
            )}
            {/* Ícono nota (paridad web A.3, `LogSetForm.tsx:553-555`): señala que la serie lleva nota
                para el coach. Sin token `amber` en el theme mobile ⇒ warning-500 (mismo ámbar del pending). */}
            {log?.note?.trim() ? (
              <StickyNote size={14} color={WARNING_500} accessibilityLabel="Serie con nota" />
            ) : null}
          </View>
        )}
      </View>
      {!logged ? (
        <ChevronRight size={18} color={SPORT_400} />
      ) : syncError ? (
        // Estado de error: el mensaje + Reintentar viven en su fila dedicada DEBAJO del chip (mirror web
        // A.4.e, `LogSetForm.tsx:738-749`). Aquí no pintamos check verde ni "Sin sincronizar" ámbar para
        // no contradecir el estado de error; el borde rojo del contenedor ya señala el fallo.
        null
      ) : pending ? (
        <View className="flex-row items-center gap-1">
          <CloudOff size={14} color={WARNING_500} />
          <Text
            style={{ fontFamily: FONT.uiBold, fontSize: 10, letterSpacing: 0.6, textTransform: 'uppercase' }}
            className="text-warning-500"
          >
            Sin sincronizar
          </Text>
        </View>
      ) : (
        /* Check de guardado a la derecha, con entrada elástica al cerrar (mirror web `LogSetForm.tsx:561-570`,
           springs.elastic = stiffness 500 · damping 25). `settle=false` (logs cargados) ⇒ sin animación. */
        <MotiView
          from={settle ? { scale: 0, rotate: '-25deg' } : { scale: 1, rotate: '0deg' }}
          animate={{ scale: 1, rotate: '0deg' }}
          transition={settle ? { type: 'spring', stiffness: 500, damping: 25 } : { type: 'timing', duration: 0 }}
        >
          <Check size={16} color={SPORT_400} strokeWidth={2.6} />
        </MotiView>
      )}
    </Pressable>
  )

  // Estado de error (mirror web A.4.e, `LogSetForm.tsx:738-749`): fila dedicada con el mensaje en rojo.
  // Sólo cuando hay error real (con conexión); offline usa el camino `_pending` ámbar. El chip se conserva
  // intacto arriba (sin regresión de la marca/valores).
  //
  // Paridad clave: al reconciliar `state.error` la web hace `setSyncStatus('error')` Y `setEditing(true)`
  // (`LogSetForm.tsx:348-363`) → `collapsed=false` re-renderiza la FILA de captura EDITABLE (inputs +
  // RPE/RIR) con el mensaje + 'Reintentar' al pie: el alumno queda directamente en un formulario para
  // CORREGIR el valor. Antes RN sólo ofrecía 'Reintentar' con el MISMO payload (re-falla si el error fue de
  // validación). Ahora, además, el chip-error abre la fila editable sembrada:
  //   • El chip rojo (arriba) YA es un `onPress={onOpenSet}` (línea 195) → abre el KeypadHost sembrado con
  //     TODOS los valores del log (`openSet` construye `editValues`, ExecutorV2 strength+typed) para corregir.
  //   • Se añade un botón 'Editar' explícito (mirror del `setEditing(true)` web) por si el tap del chip no es
  //     obvio, y se conserva 'Reintentar' (onRetry) para el error transitorio de red (mismo payload sirve).
  // Adaptación RN idiomática: la fila editable vive en el Modal del keypad (no inline), así que en vez de
  // FORZAR la apertura del modal ante un error de sync en segundo plano (intrusivo si el alumno ya pasó a
  // otra serie) se ofrece la affordance editable — preserva "el alumno puede corregir el valor".
  if (logged && syncError) {
    return (
      <View className="gap-1.5">
        {chip}
        <SyncErrorRow setNumber={setNumber} message={syncError} onEdit={onPress} onRetry={onRetry} />
      </View>
    )
  }
  return chip
}

// ─── ActiveSetRow ─────────────────────────────────────────────────────────────

// Valor de las cajas KG/Reps de la fila activa: la web declara `font-semibold font-mono` para esos inputs
// (mono 600, `LogSetForm.tsx:576-579`). Antes salía en `FONT.monoBold` (JetBrainsMono 700), un peso por
// encima del semibold del web. La cara 600 ya está cargada y en uso (OBJECTIVE_STYLE, `TypedKeypad.tsx`).
const BOX_VALUE_STYLE = textStyle('2xl', FONT.monoSemibold, { ls: 'tight' })
// Variante COMPACTA del valor de caja (filas NO protagonistas): la web baja el input a `text-base` (16px)
// para las series aún-no-activas (`LogSetForm.tsx:578` `isActive ? 'h-14 text-2xl' : 'h-11 text-base'`).
// Mismo peso/familia (mono 600); sólo cambia el tamaño. 'md' = 16px del DS (typography.ts) = text-base.
const BOX_VALUE_COMPACT_STYLE = textStyle('md', FONT.monoSemibold, { ls: 'tight' })

type FieldMode = 'weight' | 'reps' | 'decimal' | 'integer'
interface RowField {
  key: string
  label: string
  unit: string
  mode: FieldMode
}

/** Caja de input visible (label arriba + borde + valor/placeholder). Tap abre el TypedKeypad.
 *  `compact` = fila NO protagonista (serie aún no activa): caja más baja (h-11) y valor a 16px, mirror del
 *  `isActive ? 'h-14 text-2xl' : 'h-11 text-base'` de la web (`LogSetForm.tsx:578`). */
function FieldBox({
  label,
  value,
  active,
  onPress,
  onLongPress,
  testID,
  compact = false,
}: {
  label: string
  value: string
  active: boolean
  onPress: () => void
  /**
   * Mantener presionado (~400ms) sobre la caja — captura por RUEDA del ejecutor V3 (E2.5). Aditivo y
   * opcional: solo V3 lo pasa; sin la prop el Pressable no registra long-press y la fila se comporta
   * IGUAL que en V2 (el `delayLongPress` queda inerte sin handler). El tap corto abre el teclado como
   * siempre.
   */
  onLongPress?: () => void
  testID: string
  compact?: boolean
}) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={onLongPress ? 400 : undefined}
      className="flex-1"
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value || 'sin valor'}, toca para editar`}
      accessibilityHint={onLongPress ? 'Manten presionado para abrir la rueda de valores' : undefined}
    >
      {/* Label de la caja (Kg/Reps/campos tipados) con KEYPAD_EYEBROW_STYLE (11px / 0.04em) — mirror del
          `text-[9.5px] ... tracking-[0.08em]` web (`LogSetForm.tsx:632/654`). `TYPE.eyebrow` (12px / 0.12em)
          sobra +26% de tamaño y desalinea con el mismo label a 11px del keypad (KeypadHost/EffortField). */}
      <Text style={KEYPAD_EYEBROW_STYLE} className="mb-1 text-on-dark-muted">
        {label}
      </Text>
      <View
        className={`${compact ? 'h-11' : 'h-14'} items-center justify-center rounded-control border bg-white/[0.06] ${
          active ? 'border-sport-500' : 'border-inverse'
        }`}
      >
        <Text style={compact ? BOX_VALUE_COMPACT_STYLE : BOX_VALUE_STYLE} className={value ? 'text-on-dark' : 'text-on-dark-muted/40'}>
          {value || '-'}
        </Text>
      </View>
    </Pressable>
  )
}

/**
 * Botoncito (?) que despliega una ayuda corta inline junto al label de esfuerzo (mirror de `EffortHelp`
 * web `EffortScale.tsx:29-44`). El ícono es chico (14px) pero el hit-area es ≥44px vía `hitSlop` — la web
 * exige ≥44px con `h-11 w-11` y márgenes negativos para no inflar la fila (Ola 0 · discrepancia #6, el
 * puerto previo daba ~30px con `hitSlop={8}`). `label` da la etiqueta específica "¿Qué es el RPE/RIR?".
 */
function EffortLabel({ label, open, onToggle }: { label: 'RPE' | 'RIR'; open: boolean; onToggle: () => void }) {
  return (
    <Pressable
      onPress={onToggle}
      hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
      accessibilityRole="button"
      accessibilityLabel={`¿Qué es el ${label}?`}
      accessibilityState={{ expanded: open }}
    >
      <HelpCircle size={14} color={ON_DARK_MUTED} />
    </Pressable>
  )
}

/**
 * Fila de REGISTRO expandida de la serie activa (mobile) — reconstrucción visual 1:1 de la fila
 * activa del `LogSetForm` web (QA Ronda 5): cajas KG/REPS grandes con label arriba y borde
 * (placeholder "-"), el simbolo × entre ambas, ESFUERZO · RPE y REPS EN RESERVA · RIR con sus dots
 * inline (`EffortScale`, mirror de `ScaleDots`) y readout a la derecha, y el boton circulo-check para
 * confirmar la serie. Para bloques TIPADOS (cardio/movilidad/roller) muestra sus campos como la web.
 *
 * El TypedKeypad sigue siendo el MECANISMO de entrada numerica (tap en una caja lo abre); la FILA es
 * lo que debe verse igual a la web. El commit no cambia: arma el `OptimisticLogPayload` con los mismos
 * builders puros que el keypad y lo entrega al padre (`onCommit` → `logSet` intacto).
 */
export function ActiveSetRow({
  blockId,
  setNumber,
  typedMode,
  sideMode = null,
  suggestedWeight,
  seedValues,
  autofill,
  header,
  isActive = true,
  isEditing = false,
  onDraftChange,
  onCommit,
  onLongPressValue,
  allowZeroRir = false,
  showEffort = true,
}: {
  blockId: string
  setNumber: number
  typedMode: TypedKeypadMode | null
  /**
   * Modo de lado del bloque (E3.2 · executor-v3). Solo relevante en movilidad `per_side`: hace que la
   * fila declare DOS campos de hold (`hold_left_sec`/`hold_right_sec`) vía `typedKeypadFields(mode,
   * sideMode)` y arme el payload con `buildTypedPayload(..., sideMode)` → `metadata {left,right}` + suma
   * en `actual_hold_sec`. ADITIVO: sin la prop (default null) el comportamiento es byte-idéntico al
   * previo (un solo campo). El engine ya soporta ambos ejes; acá solo se CONSUME.
   */
  sideMode?: string | null
  /** Peso sugerido (sobrecarga) — pre-llena la caja KG en strength. */
  suggestedWeight: number | null
  /**
   * Serie PROTAGONISTA (primera sin registrar del bloque/ronda). Espeja el `isActive` de la web
   * (`LogSetForm.tsx:170`): SOLO controla la JERARQUÍA visual — la fila activa va grande (cajas h-14,
   * badge sport, botón etiquetado "Listo", nota disponible) y las series futuras van COMPACTAS (cajas
   * h-11, badge muted, botón circular check, sin nota), igual que la web pinta TODA serie sin registrar
   * como formulario inline expandido (protagonista + recesivas) en vez de un chip "Toca para registrar".
   * Default true = comportamiento previo (una sola fila activa). No cambia el motor de logging.
   */
  isActive?: boolean
  /**
   * Se está EDITANDO una serie ya cerrada (no una nueva): el botón dice 'Guardar' en vez de 'Listo'
   * (mirror web `label={isLogged ? 'Guardar' : 'Listo'}`, `LogSetForm.tsx:696`). Default false = serie
   * nueva. En el flujo mobile la edición vive en el `KeypadHost` (que ya distingue 'Guardar'/'Listo'
   * vía `target.isEdit`, `KeypadHost.tsx:200-201`); este prop deja la fila activa correcta si algún día
   * representa una edición, en vez de hardcodear 'Listo'.
   */
  isEditing?: boolean
  /**
   * Header de objetivo repetido DENTRO del teclado (DB-5: "SIEMPRE visible"; mirror web
   * `NumericKeypadSheet.tsx:204-228`). El scrim atenúa el objetivo/"Última vez" de la card mientras el
   * alumno tipea, así que el teclado lo repite igual que la ruta de EDICIÓN (`KeypadHost`). Opcional:
   * sin él, el teclado simplemente no muestra header (sin regresión).
   */
  header?: {
    exerciseName?: string
    objectiveLine?: string
    last?: { weightKg: number | null; reps: number | null } | null
  } | null
  /** Draft restaurado de ESTA serie (resiliencia E2-03); pre-llena las cajas al reabrir. */
  seedValues?: Record<string, string> | null
  /** Autollenado "= usar ultima vez" (nonce dispara la re-siembra de KG/REPS). */
  autofill?: { weight: number | null; reps: number | null; nonce: number } | null
  onDraftChange: (values: Record<string, string>, fieldIndex: number) => void
  onCommit: (payload: OptimisticLogPayload) => void
  /**
   * Mantener presionado (~400ms) sobre una caja de valor (kg/reps de FUERZA) — abre la rueda dual del
   * ejecutor V3 (E2.5). ADITIVO: solo V3 lo pasa; el tap corto sigue abriendo el teclado. `key` indica
   * la caja tocada (hoy la rueda es doble kg|reps, pero se propaga por si el caller la enfoca). Sin la
   * prop la fila es byte-identica a V2 (las cajas no registran long-press). No aplica a tipadas.
   */
  onLongPressValue?: (key: 'weight' | 'reps') => void
  /**
   * Habilita el 0 en la escala de RIR (0-10, "al fallo") — decision CEO 8 del ejecutor V3. ADITIVO: solo
   * V3 lo pasa (true); sin la prop el RIR arranca en 1 (V2 intacto). RPE queda SIEMPRE 1-10.
   */
  allowZeroRir?: boolean
  /**
   * Mostrar la escala de esfuerzo RPE/RIR (E3.7 — tuerca V3). Default true = comportamiento previo. En
   * false (V3 con "Mostrar RPE/RIR" apagado) la fila activa omite la captura de esfuerzo. No aplica a
   * tipadas (cardio/movilidad), que no tienen RPE/RIR inline.
   */
  showEffort?: boolean
}) {
  const fields: RowField[] = useMemo(() => {
    if (typedMode) {
      return typedKeypadFields(typedMode, sideMode).map((f) => ({
        key: f.key,
        label: f.label,
        unit: f.unit,
        mode: f.allowDecimal ? ('decimal' as const) : ('integer' as const),
      }))
    }
    return [
      { key: 'weight', label: 'Kg', unit: 'kg', mode: 'weight' },
      { key: 'reps', label: 'Reps', unit: 'reps', mode: 'reps' },
    ]
  }, [typedMode, sideMode])

  const motion = useEvaMotion()

  const [values, setValues] = useState<Record<string, string>>(() => {
    if (seedValues) return { ...seedValues }
    if (!typedMode && suggestedWeight != null) return { weight: formatWeightEsCl(suggestedWeight) }
    return {}
  })
  const valuesRef = useRef(values)
  valuesRef.current = values
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [helpKey, setHelpKey] = useState<'rpe' | 'rir' | null>(null)
  // Nota rápida por serie (strength) — desplegable como en web (A.4.d). El texto vive en `values.note`
  // (mismo carril que rpe/rir → viaja al draft y al `buildStrengthPayload`).
  const [noteOpen, setNoteOpen] = useState(false)
  const noteTrimmed = (values.note ?? '').trim()

  // Escritura única: sincroniza ref + estado + reporta el draft (resiliencia). idx = campo tocado.
  const patch = (p: Record<string, string>, idx = 0) => {
    const next = { ...valuesRef.current, ...p }
    valuesRef.current = next
    setValues(next)
    onDraftChange(next, idx)
  }

  // Autollenado "= usar": re-siembra KG/REPS cuando cambia el nonce (no en cada render).
  const lastAutofill = useRef<number | null>(null)
  useEffect(() => {
    if (!autofill || autofill.nonce === lastAutofill.current) return
    lastAutofill.current = autofill.nonce
    patch({
      weight: autofill.weight != null ? formatWeightEsCl(autofill.weight) : valuesRef.current.weight ?? '',
      reps: autofill.reps != null ? String(autofill.reps) : valuesRef.current.reps ?? '',
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autofill?.nonce])

  const idxOf = (key: string) => Math.max(0, fields.findIndex((f) => f.key === key))
  const openField = (key: string) => {
    haptics.tap()
    setOpenKey(key)
  }
  const goNext = () => {
    const i = fields.findIndex((f) => f.key === openKey)
    if (i >= 0 && i + 1 < fields.length) setOpenKey(fields[i + 1].key)
    else setOpenKey(null)
  }

  const commit = () => {
    const payload = typedMode
      ? buildTypedPayload(typedMode, valuesRef.current, blockId, setNumber, sideMode)
      : buildStrengthPayload(valuesRef.current, blockId, setNumber)
    onCommit(payload)
  }

  // Guarda de doble-tap + affordance de "guardando" del submit (mirror web SubmitSetButton, `LogSetForm.tsx:1150-1154`:
  // `disabled:opacity-70` + Loader2 spin mientras `useFormStatus().pending`). El commit RN es optimista y la fila
  // suele desmontarse al cerrar, pero sin guarda un doble-tap encolaría la serie dos veces; `committing` bloquea el
  // botón y muestra el spinner durante la breve ventana de commit (auto-liberada por si la fila sigue montada al editar).
  const [committing, setCommitting] = useState(false)
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (commitTimer.current) clearTimeout(commitTimer.current) }, [])
  // withHaptic=false cuando el disparo viene del keypad: TypedKeypad ya ejecuta haptics.setDone()
  // en su propio botón "Listo" y duplicarla aquí produce doble vibración en un solo tap.
  const handleConfirm = (withHaptic = true) => {
    if (committing) return
    setCommitting(true)
    if (withHaptic) haptics.setDone()
    commit()
    commitTimer.current = setTimeout(() => setCommitting(false), 1200)
  }

  const currentField = openKey ? fields.find((f) => f.key === openKey) ?? null : null

  return (
    <View
      testID={`active-set-row-${setNumber}`}
      // Contenedor: protagonista = borde/fondo sport; recesiva (serie futura) = borde inverse + fondo
      // tenue, mirror web `isActive ? 'border-sport-500/50 bg-sport-500/[0.06]' : 'border-inverse bg-white/[0.02]'`
      // (`LogSetForm.tsx:596-597`).
      className={`gap-3 rounded-control border p-3 ${
        isActive ? 'border-sport-500/50 bg-sport-500/[0.06]' : 'border-inverse bg-white/[0.02]'
      }`}
    >
      {/* Cajas KG × REPS (strength) o campos tipados — label arriba + borde, tap abre el keypad */}
      <View className="flex-row items-end gap-2.5">
        <View className={`${isActive ? 'h-14' : 'h-11'} w-7 items-center justify-center`}>
          {/* Badge: protagonista = h-7 sport-500/20 + 13px sport-300; recesiva = h-6 white/[0.06] + 11px
              muted (mirror web `LogSetForm.tsx:620-626`, `isActive ? h-7 w-7 text-[13px] ... : h-6 w-6 text-[11px] ...`). */}
          <View className={`items-center justify-center rounded-full ${isActive ? 'h-7 w-7 bg-sport-500/20' : 'h-6 w-6 bg-white/[0.06]'}`}>
            <Text style={isActive ? BADGE_ACTIVE_STYLE : BADGE_CHIP_STYLE} className={isActive ? 'text-sport-300' : 'text-on-dark-muted'}>
              {setNumber}
            </Text>
          </View>
        </View>
        {typedMode ? (
          fields.map((f) => (
            <FieldBox
              key={f.key}
              label={f.label}
              value={values[f.key] ?? ''}
              active={openKey === f.key}
              onPress={() => openField(f.key)}
              testID={`set-field-${setNumber}-${f.key}`}
              compact={!isActive}
            />
          ))
        ) : (
          <>
            <FieldBox
              label="Kg"
              value={values.weight ?? ''}
              active={openKey === 'weight'}
              onPress={() => openField('weight')}
              onLongPress={onLongPressValue ? () => onLongPressValue('weight') : undefined}
              testID={`set-field-${setNumber}-weight`}
              compact={!isActive}
            />
            {/* Padding/tamaño del × por jerarquía = mirror del span '×' web `isActive ? 'pb-3 text-xl' :
                'pb-2 text-base'` (`LogSetForm.tsx:652`): protagonista pb-3 + xl (alinea con cajas h-14),
                recesiva pb-2 + base (alinea con cajas h-11). */}
            <View className={isActive ? 'pb-3' : 'pb-2'}>
              <Text style={textStyle(isActive ? 'xl' : 'md', FONT.ui)} className="text-on-dark-muted">
                ×
              </Text>
            </View>
            <FieldBox
              label="Reps"
              value={values.reps ?? ''}
              active={openKey === 'reps'}
              onPress={() => openField('reps')}
              onLongPress={onLongPressValue ? () => onLongPressValue('reps') : undefined}
              testID={`set-field-${setNumber}-reps`}
              compact={!isActive}
            />
          </>
        )}
      </View>

      {/* Esfuerzo RPE + RIR con dots inline (strength) — mirror de ScaleDots web. La tuerca V3 (E3.7)
          puede ocultarlo con `showEffort={false}`. */}
      {!typedMode && showEffort && (
        <View className="gap-2.5">
          <View>
            <View className="mb-1 flex-row items-center gap-1">
              {/* Eyebrow del esfuerzo con KEYPAD_EYEBROW_STYLE (11px / 0.04em) — mirror del label web
                  `text-[9.5px] ... tracking-[0.08em]` (`NumericKeypadSheet.tsx:248`). `TYPE.eyebrow`
                  (12px / 0.12em) salta +26% de tamaño y era inconsistente con el mismo label en `KeypadHost`. */}
              <Text style={KEYPAD_EYEBROW_STYLE} className="text-on-dark-muted">
                Esfuerzo · RPE
              </Text>
              <EffortLabel label="RPE" open={helpKey === 'rpe'} onToggle={() => setHelpKey((k) => (k === 'rpe' ? null : 'rpe'))} />
            </View>
            {helpKey === 'rpe' && (
              <Text style={textStyle('3xs', FONT.uiMedium)} className="mb-1.5 text-on-dark-muted">
                {RPE_HELP}
              </Text>
            )}
            <EffortScale kind="rpe" value={int(values.rpe)} onSelect={(v) => patch({ rpe: String(v) })} compact={!isActive} />
          </View>
          <View>
            <View className="mb-1 flex-row items-center gap-1">
              <Text style={KEYPAD_EYEBROW_STYLE} className="text-on-dark-muted">
                Reps en reserva · RIR
              </Text>
              <EffortLabel label="RIR" open={helpKey === 'rir'} onToggle={() => setHelpKey((k) => (k === 'rir' ? null : 'rir'))} />
            </View>
            {helpKey === 'rir' && (
              <Text style={textStyle('3xs', FONT.uiMedium)} className="mb-1.5 text-on-dark-muted">
                {RIR_HELP}
              </Text>
            )}
            <EffortScale kind="rir" value={int(values.rir)} onSelect={(v) => patch({ rir: String(v) })} compact={!isActive} allowZero={allowZeroRir} />
          </View>
        </View>
      )}

      {/* Botón de confirmar — mirror web `SubmitSetButton` (`LogSetForm.tsx:695-697,1143-1169`). Va DEBAJO de
          las escalas RPE/RIR y ENCIMA de la nota, replicando el orden vertical del web (submit `:695-697`
          ANTES de la nota `:699-736`); antes la nota iba primero. Dos variantes según el modo, igual que web:
          • FUERZA activa protagonista → botón ETIQUETADO (h-12 min-w-[104px], Check + 'Listo'/'Guardar',
            `:696,1146-1157`). 'Guardar' al editar una serie cerrada, 'Listo' cuando es nueva.
          • TIPADAS (cardio/movilidad/roller) → botón CIRCULAR sin label (`:1095-1097` usa `<SubmitSetButton>`
            sin `label` ⇒ el círculo w-11/w-8 rounded-full de `:1158-1168`); la web reserva el círculo para las
            filas no protagonistas. Commit intacto en ambos. */}
      <View className="flex-row justify-end">
        {/* Botón circular (sin label) para TIPADAS y para las series de fuerza NO protagonistas (recesivas):
            mirror web `SubmitSetButton` sin `label` (`LogSetForm.tsx:696` pasa label sólo cuando isActive;
            las tipadas y las filas compactas caen al círculo `:1158-1168`). El botón etiquetado "Listo"/
            "Guardar" queda SÓLO para la fila de fuerza activa protagonista. */}
        {typedMode || !isActive ? (
          <Pressable
            testID={`confirm-set-${setNumber}`}
            onPress={() => handleConfirm()}
            disabled={committing}
            className={`h-11 w-11 items-center justify-center rounded-full border-2 border-white/25 active:opacity-90 ${
              committing ? 'opacity-70' : ''
            }`}
            accessibilityRole="button"
            accessibilityState={{ disabled: committing, busy: committing }}
            accessibilityLabel={committing ? 'Guardando set...' : `Guardar la serie ${setNumber}`}
          >
            {committing ? (
              motion.reduced ? (
                <Loader2 size={16} color={ON_DARK_MUTED} strokeWidth={2.6} />
              ) : (
                <MotiView
                  from={{ rotate: '0deg' }}
                  animate={{ rotate: '360deg' }}
                  transition={{ type: 'timing', duration: 800, loop: true, repeatReverse: false }}
                >
                  <Loader2 size={16} color={ON_DARK_MUTED} strokeWidth={2.6} />
                </MotiView>
              )
            ) : (
              // Check atenuado mientras la fila activa aún no está guardada (mirror web círculo no-logueado
              // `opacity-40`, `LogSetForm.tsx:1166`): affordance tenue que se resuelve al confirmar.
              <Check size={20} color={ON_DARK_MUTED} strokeWidth={2.6} style={{ opacity: 0.4 }} />
            )}
          </Pressable>
        ) : (
          <Pressable
            testID={`confirm-set-${setNumber}`}
            onPress={() => handleConfirm()}
            disabled={committing}
            className={`h-12 min-w-[104px] flex-row items-center justify-center gap-2 rounded-control bg-sport-500 px-4 active:opacity-90 ${
              committing ? 'opacity-70' : ''
            }`}
            accessibilityRole="button"
            accessibilityState={{ disabled: committing, busy: committing }}
            accessibilityLabel={
              committing ? 'Guardando set...' : `${isEditing ? 'Guardar' : 'Listo'}, confirmar serie ${setNumber}`
            }
          >
            {committing ? (
              // Spinner durante el commit (mirror web `<Loader2 animate-spin>`). Sin reduce-motion gira en loop;
              // con reduce-motion queda estático (paridad con el resto de animaciones de la card).
              motion.reduced ? (
                <Loader2 size={20} color="#FFFFFF" strokeWidth={2.6} />
              ) : (
                <MotiView
                  from={{ rotate: '0deg' }}
                  animate={{ rotate: '360deg' }}
                  transition={{ type: 'timing', duration: 800, loop: true, repeatReverse: false }}
                >
                  <Loader2 size={20} color="#FFFFFF" strokeWidth={2.6} />
                </MotiView>
              )
            ) : (
              <>
                <Check size={20} color="#FFFFFF" strokeWidth={2.6} />
                {/* Label a 16px (`textStyle('md')`): el botón etiquetado web NO fija text-size, así que el
                    label hereda el tamaño base del documento (~16px) con `font-bold` (`LogSetForm.tsx:1148-1154`).
                    Antes `textStyle('sm')` = 14px, ~2px por debajo del base heredado. El peso (bold) ya coincidía. */}
                <Text style={textStyle('md', FONT.uiBold)} className="text-white">
                  {isEditing ? 'Guardar' : 'Listo'}
                </Text>
              </>
            )}
          </Pressable>
        )}
      </View>

      {/* Nota rápida por serie (strength) — mirror web A.4.d (`LogSetForm.tsx:699-736`): toggle + input
          desplegable, máx 300 chars, viaja al coach vía `values.note` → `buildStrengthPayload`. Va DESPUÉS
          del botón, como en web (`:699` tras `:695`). SÓLO en la fila protagonista/edición: la web gatea
          con `showNoteControls = isActive || editing` (`:366`), así las series futuras compactas no la muestran. */}
      {!typedMode && (isActive || isEditing) && (
        <View>
          <Pressable
            testID={`note-toggle-${setNumber}`}
            onPress={() => setNoteOpen((o) => !o)}
            accessibilityRole="button"
            accessibilityState={{ expanded: noteOpen }}
            accessibilityLabel={noteTrimmed ? 'Editar la nota de la serie' : 'Agregar una nota a la serie'}
            className="min-h-[36px] flex-row items-center gap-1.5 self-start rounded-control px-2 active:opacity-70"
          >
            <StickyNote size={14} color={noteTrimmed ? WARNING_500 : ON_DARK_MUTED} />
            {/* Toggle de nota a 11px (`textStyle('3xs', FONT.uiSemibold)`): la web es `text-[11px] font-semibold`
                (`LogSetForm.tsx:707,711-712`). Antes `TYPE.caption` fijaba fontSize=13 inline y —por la convención
                NativeWind v4 documentada arriba (el style inline gana)— sobrescribía el `text-[11px]` del className,
                saliendo a ~13px (+18%). Mismo patrón que `KeypadHost.tsx:311-312`, que ya usa textStyle('3xs'). */}
            <Text
              style={textStyle('3xs', FONT.uiSemibold)}
              className={noteTrimmed ? 'text-warning-500' : 'text-on-dark-muted'}
            >
              {noteTrimmed ? 'Nota añadida' : 'Agregar nota'}
            </Text>
          </Pressable>
          {/* El input se despliega animado (mirror web AnimatePresence height 0→auto + opacity 0.2s,
              `LogSetForm.tsx:714-734`). Idioma RN opacity/translateY (igual que los disclosures de la card,
              `SingleExerciseCard.tsx:453-461`); instantáneo con reduce-motion. */}
          <AnimatePresence>
            {noteOpen && (
              <MotiView
                from={motion.reduced ? { opacity: 1, translateY: 0 } : { opacity: 0, translateY: -4 }}
                animate={{ opacity: 1, translateY: 0 }}
                exit={motion.reduced ? { opacity: 0, translateY: 0 } : { opacity: 0, translateY: -4 }}
                transition={{ type: 'timing', duration: motion.reduced ? 0 : 200 }}
              >
                <TextInput
                  testID={`note-input-${setNumber}`}
                  value={values.note ?? ''}
                  onChangeText={(t) => patch({ note: t })}
                  maxLength={300}
                  placeholder="Ej: sentí molestia en el hombro"
                  placeholderTextColor={ON_DARK_MUTED}
                  accessibilityLabel="Nota de la serie para tu coach"
                  style={textStyle('xs', FONT.ui)}
                  className="mt-1.5 rounded-control border border-inverse/10 bg-white/[0.06] px-3 py-2 text-on-dark"
                />
              </MotiView>
            )}
          </AnimatePresence>
        </View>
      )}

      {/* Teclado numerico: mecanismo de entrada de la caja tocada (tap abre / Siguiente / Listo) */}
      {openKey && currentField && (
        <Modal transparent visible animationType="none" onRequestClose={() => setOpenKey(null)}>
          <View className="flex-1">
            {/* Scrim: tap-fuera cierra (no guarda). `bg-black/25` con fade 0→1 en 150ms — mirror EXACTO
                del scrim web (`NumericKeypadSheet.tsx:169-178`). Antes: `rgba(0,0,0,0.5)` hardcodeado (2× más
                oscuro, viola "usa tokens") y sin fade. Reduce-motion ⇒ sin fade (mirror web `:174-177`),
                igual que `KeypadHost.tsx:211-218`. */}
            <MotiView
              from={{ opacity: motion.reduced ? 1 : 0 }}
              animate={{ opacity: 1 }}
              transition={{ type: 'timing', duration: motion.reduced ? 0 : 150 }}
              className="flex-1"
            >
              <Pressable
                className="flex-1 bg-black/25"
                onPress={() => setOpenKey(null)}
                accessibilityRole="button"
                accessibilityLabel="Cerrar teclado"
              />
            </MotiView>
            <TypedKeypad
              mode={currentField.mode}
              unit={currentField.unit}
              value={values[openKey] ?? ''}
              onChange={(v) => patch({ [openKey]: v }, idxOf(openKey))}
              onNext={goNext}
              // "Listo" del keypad pasa por handleConfirm (misma guarda `committing` que el botón
              // etiquetado, `:585-591`): un doble-tap antes de que el Modal desmonte encolaba la serie DOS
              // veces al llamar commit() directo. handleConfirm ignora el 2º tap y añade haptic/spinner.
              onDone={() => {
                setOpenKey(null)
                handleConfirm(false)
              }}
              // Botón X del panel (mirror web `NumericKeypadSheet.tsx:193-200`, que SIEMPRE muestra la X):
              // cierra SIN guardar, igual que el scrim tap-fuera. Añade la affordance explícita de cierre.
              onClose={() => setOpenKey(null)}
              // Pestañas de campo (mirror `role="tablist"` web `NumericKeypadSheet.tsx:287-308`): dejan
              // SALTAR peso↔reps sin cerrar+reabrir. Las cajas de la fila SON las pestañas; tocar una
              // re-abre el keypad en ese campo.
              tabs={
                fields.length > 1
                  ? {
                      fields: fields.map((f) => ({ key: f.key, label: f.label })),
                      activeKey: openKey,
                      onSwitch: (key) => {
                        haptics.tap()
                        setOpenKey(key)
                      },
                    }
                  : undefined
              }
              // Header de objetivo (DB-5): el scrim atenúa el objetivo de la card, el teclado lo repite.
              header={header ?? undefined}
            />
          </View>
        </Modal>
      )}
    </View>
  )
}
