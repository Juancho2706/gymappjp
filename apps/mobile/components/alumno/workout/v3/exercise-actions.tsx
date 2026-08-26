import { useEffect, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { ArrowRightLeft, Check, SkipForward, Undo2 } from 'lucide-react-native'
import { SKIP_REASONS, type SkipReason } from '@eva/workout-engine'
import { FONT } from '../../../../lib/typography'
import { hexToRgba } from '../../../../lib/theme'
import { Sheet } from '../../../Sheet'
import { JuicyButton } from './JuicyButton'
import type { ExecTheme } from './exec-theme'

/**
 * Acciones "de escape" del ejercicio activo (mockups 3 · ejecutor RN 2026-08-25) — **CAMBIAR** y
 * **OMITIR**, compartidas por las CUATRO pantallas de ejercicio (fuerza, movilidad, cardio, roller)
 * para que la fila de chips se vea y se comporte igual en todas (antes "Cambiar" vivía sólo en
 * `ExerciseScreenV3`, duplicarlo tres veces habría garantizado drift).
 *
 * · **Cambiar** abre `SubstituteSheetV3` (sustitución de HOY, mismo músculo). Disponible mientras el
 *   bloque no esté resuelto — ya no exige "cero series registradas" ni ser un bloque de fuerza.
 * · **Omitir** abre `SkipBlockSheetV3`: motivo OPCIONAL y, al confirmar, el bloque queda RESUELTO
 *   (badge "Omitido", el auto-avance salta al siguiente y el día puede cerrar). La persistencia la
 *   hace `ExecutorV3` por el pipeline `logSet` — acá vive sólo la piel.
 *
 * Dark-only como todo el ejecutor: superficies fijas de `exec.surface`, sólo el acento es de marca.
 */

/**
 * Ámbar semántico de "omitido" — token FIJO (mismo literal que el badge "Máquina ocupada" del
 * `SubstituteSheetV3`), NO se re-tiñe por white-label: una omisión debe leerse igual para todos los
 * alumnos, igual criterio que el oro del PR (`EXEC_PR_GOLD`).
 */
export const EXEC_SKIP_AMBER = '#f5b04a'

/** Etiquetas es-CL del catálogo de motivos (`SKIP_REASONS` del motor). */
export const SKIP_REASON_LABEL: Record<SkipReason, string> = {
  no_space: 'Sin espacio',
  machine_busy: 'Máquina ocupada',
  discomfort: 'Molestia',
  other: 'Otro',
}

/** Texto del badge "Omitido" (+ motivo si el alumno declaró uno). */
export function skipBadgeLabel(reason: string | null | undefined): string {
  if (!reason) return 'Omitido'
  const known = (SKIP_REASONS as readonly string[]).includes(reason)
  return known ? `Omitido · ${SKIP_REASON_LABEL[reason as SkipReason]}` : 'Omitido'
}

/**
 * Fila de chips del ejercicio: estado de sustitución/omisión + las acciones disponibles. Devuelve
 * `null` cuando no hay nada que mostrar, así el caller puede montarla sin condicionales.
 */
export function ExerciseActionChips({
  exec,
  exerciseName,
  substituted,
  canSubstitute,
  onOpenSubstitute,
  onUndoSubstitution,
  skipped,
  skipReason,
  canSkip,
  onOpenSkip,
}: {
  exec: ExecTheme
  exerciseName: string
  /** ¿El bloque ya corre con un sustituto de hoy? */
  substituted: boolean
  /** ¿Se puede (re)abrir la sustitución? (bloque no resuelto). */
  canSubstitute: boolean
  /** Sin handler no se ofrece "Cambiar" (superficies que no montan el sheet de sustitución). */
  onOpenSubstitute?: () => void
  onUndoSubstitution?: () => void
  /** ¿El bloque quedó declarado OMITIDO? */
  skipped: boolean
  skipReason?: string | null
  /** ¿Se puede omitir? (bloque no resuelto y no omitido). */
  canSkip: boolean
  /** Sin handler no se ofrece "Omitir" (superficies que no montan el sheet de omisión). */
  onOpenSkip?: () => void
}) {
  const s = exec.surface
  const showSkip = canSkip && !!onOpenSkip
  const showSubstitute = canSubstitute && !!onOpenSubstitute
  if (!substituted && !skipped && !showSubstitute && !showSkip) return null
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
      {skipped ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 5,
            borderRadius: 999,
            borderWidth: 1.5,
            paddingHorizontal: 9,
            paddingVertical: 4,
            backgroundColor: hexToRgba(EXEC_SKIP_AMBER, 0.14),
            borderColor: hexToRgba(EXEC_SKIP_AMBER, 0.4),
          }}
          accessibilityRole="text"
          accessibilityLabel={`${exerciseName} omitido${skipReason ? `. Motivo: ${skipBadgeLabel(skipReason).replace('Omitido · ', '')}` : ''}`}
        >
          <SkipForward size={11} color={EXEC_SKIP_AMBER} />
          <Text style={{ fontFamily: FONT.uiBold, fontSize: 11, color: EXEC_SKIP_AMBER }} numberOfLines={1}>
            {skipBadgeLabel(skipReason)}
          </Text>
        </View>
      ) : null}

      {substituted ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 5,
              borderRadius: 999,
              borderWidth: 1.5,
              paddingHorizontal: 9,
              paddingVertical: 4,
              backgroundColor: hexToRgba(exec.celebration, 0.14),
              borderColor: hexToRgba(exec.celebration, 0.34),
            }}
          >
            <ArrowRightLeft size={11} color={exec.celebration} />
            <Text style={{ fontFamily: FONT.uiBold, fontSize: 11, color: exec.celebration }} numberOfLines={1}>
              Sustituido
            </Text>
          </View>
          {canSubstitute && onUndoSubstitution && (
            <Pressable
              testID="btn-undo-substitute-v3"
              onPress={onUndoSubstitution}
              hitSlop={8}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
              accessibilityRole="button"
              accessibilityLabel="Deshacer la sustitución"
            >
              <Undo2 size={13} color={s.textMuted} />
              <Text style={{ fontFamily: FONT.uiSemibold, fontSize: 11, color: s.textMuted }}>Deshacer</Text>
            </Pressable>
          )}
        </View>
      ) : showSubstitute ? (
        <Pressable
          testID="btn-substitute-v3"
          onPress={onOpenSubstitute}
          hitSlop={8}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, borderWidth: 1.5, paddingHorizontal: 9, paddingVertical: 4, borderColor: s.borderStrong }}
          accessibilityRole="button"
          accessibilityLabel={`Cambiar ${exerciseName} por otro ejercicio de hoy`}
        >
          <ArrowRightLeft size={12} color={s.textMuted} />
          <Text style={{ fontFamily: FONT.uiSemibold, fontSize: 11, color: s.textMuted }}>Cambiar</Text>
        </Pressable>
      ) : null}

      {showSkip ? (
        <Pressable
          testID="btn-skip-block-v3"
          onPress={onOpenSkip}
          hitSlop={8}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, borderWidth: 1.5, paddingHorizontal: 9, paddingVertical: 4, borderColor: s.borderStrong }}
          accessibilityRole="button"
          accessibilityLabel={`Omitir ${exerciseName} por hoy`}
        >
          <SkipForward size={12} color={s.textMuted} />
          <Text style={{ fontFamily: FONT.uiSemibold, fontSize: 11, color: s.textMuted }}>Omitir</Text>
        </Pressable>
      ) : null}
    </View>
  )
}

/**
 * Mini-sheet de OMISIÓN: motivo OPCIONAL (radio, se puede deseleccionar) + confirmación explícita.
 * Es el único guard contra el toque accidental — omitir no tiene "deshacer" (la fila de omisión ya
 * viajó al registro del coach por el pipeline de guardado), así que la confirmación es deliberada.
 */
export function SkipBlockSheetV3({
  open,
  onClose,
  exerciseName,
  exec,
  reducedMotion = false,
  onConfirm,
}: {
  open: boolean
  onClose: () => void
  exerciseName: string
  exec: ExecTheme
  reducedMotion?: boolean
  /** Confirmar la omisión con el motivo elegido (`null` = sin declarar). */
  onConfirm: (reason: SkipReason | null) => void
}) {
  const s = exec.surface
  const [reason, setReason] = useState<SkipReason | null>(null)

  // Cada apertura arranca limpia: el motivo de un ejercicio no se hereda al siguiente.
  useEffect(() => {
    if (!open) setReason(null)
  }, [open])

  return (
    <Sheet
      open={open}
      onClose={onClose}
      forceDark
      nativeModal
      snapPoints={['62%']}
      dynamicSizing
      accessibilityLabel={`Omitir ${exerciseName} por hoy`}
    >
      <View style={{ gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
          <View
            style={{
              width: 26,
              height: 26,
              borderRadius: 9,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: hexToRgba(EXEC_SKIP_AMBER, 0.18),
              borderWidth: 1.5,
              borderColor: hexToRgba(EXEC_SKIP_AMBER, 0.4),
            }}
          >
            <SkipForward size={14} color={EXEC_SKIP_AMBER} />
          </View>
          <Text style={{ fontFamily: FONT.displayBlack, fontSize: 20, letterSpacing: -0.4, color: s.text }} numberOfLines={2}>
            Omitir por hoy
          </Text>
        </View>
        <Text style={{ fontFamily: FONT.uiSemibold, fontSize: 13.5, color: '#a8a8b3', marginTop: 2, marginBottom: 10 }} numberOfLines={2}>
          {exerciseName} queda fuera de la sesión de hoy. Tu plan no cambia.
        </Text>

        <Text style={{ fontFamily: FONT.uiBold, fontSize: 11, letterSpacing: 0.5, textTransform: 'uppercase', color: s.textMuted, marginBottom: 8 }}>
          Motivo (opcional)
        </Text>
        <View style={{ gap: 8 }} accessibilityRole="radiogroup" accessibilityLabel="Motivo de la omisión (opcional)">
          {SKIP_REASONS.map((r) => {
            const selected = reason === r
            return (
              <Pressable
                key={r}
                testID={`skip-reason-${r}`}
                // Segundo toque sobre el motivo elegido lo deselecciona: el motivo es OPCIONAL de verdad.
                onPress={() => setReason((prev) => (prev === r ? null : r))}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={SKIP_REASON_LABEL[r]}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    minHeight: 52,
                    paddingHorizontal: 13,
                    borderRadius: 14,
                    borderWidth: 2,
                    backgroundColor: selected ? hexToRgba(exec.accent, 0.1) : s.surface,
                    borderColor: selected ? exec.accent : s.border,
                  }}
                >
                  <View
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 12,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: selected ? exec.accent : '#202029',
                      borderWidth: 2,
                      borderColor: selected ? hexToRgba(exec.accent, 0.55) : s.borderStrong,
                    }}
                  >
                    {selected ? <Check size={13} color={exec.accentText} strokeWidth={3.5} /> : null}
                  </View>
                  <Text style={{ flex: 1, fontFamily: FONT.uiBold, fontSize: 15, color: selected ? s.text : '#eef0f2' }} numberOfLines={1}>
                    {SKIP_REASON_LABEL[r]}
                  </Text>
                </View>
              </Pressable>
            )
          })}
        </View>

        <View style={{ marginTop: 16, marginBottom: 8 }}>
          <JuicyButton
            testID="btn-skip-confirm-v3"
            label="Omitir ejercicio"
            icon={<SkipForward size={20} color={exec.accentText} />}
            onPress={() => onConfirm(reason)}
            exec={exec}
            height={60}
            fontSize={18}
            reducedMotion={reducedMotion}
            accessibilityLabel="Confirmar que omito este ejercicio hoy"
          />
        </View>
        <Text style={{ fontFamily: FONT.uiSemibold, fontSize: 11, color: '#8f8f9c', textAlign: 'center' }}>
          Tu coach lo verá en el registro
        </Text>
      </View>
    </Sheet>
  )
}
