import { useEffect, useRef, useState } from 'react'
import { Animated, Pressable, Text, View } from 'react-native'
import { Image } from 'expo-image'
import { cssInterop } from 'nativewind'
import { Check, Dumbbell, Info, Repeat, RotateCw, TriangleAlert } from 'lucide-react-native'
import { FONT } from '../../../../lib/typography'
import { hexToRgba } from '../../../../lib/theme'
import { exerciseGridThumb } from '../../../../lib/exercise-catalog'
import {
  equipmentLabel,
  fetchSubstituteCandidates,
  InvalidBlockIdError,
  type SubstituteCandidate,
} from '../../../../lib/workout/substitution'
import { Sheet } from '../../../Sheet'
import { JuicyButton } from './JuicyButton'
import type { ExecTheme } from './exec-theme'

// Deja que NativeWind maneje el color del icono lucide vía className en los estados error/vacío.
cssInterop(TriangleAlert, { className: { target: 'style', nativeStyleToProp: { color: true } } })
cssInterop(RotateCw, { className: { target: 'style', nativeStyleToProp: { color: true } } })
cssInterop(Dumbbell, { className: { target: 'style', nativeStyleToProp: { color: true } } })

const AMBER = '#f5b04a' // == --amber-a3d del mockup (badge "?" de "Máquina ocupada").

/**
 * SubstituteSheetV3 (Unidad B2 · QA1) — espejo RN del `SubstituteSheetV3` web. Re-piel del sheet de
 * sustitución "Máquina ocupada" del mockup `concepto-a-v32-estados` (pantalla 2), sobre el Sheet
 * NATIVO del repo (`nativeModal` — gotcha gorhom/reanimated).
 *
 * Contrato compatible con el `SubstituteExerciseSheet` RN legacy (swap 1:1 del import): mismas props
 * `open`/`onOpenChange`/`blockId`/`prescribedName`/`muscleGroup`/`onConfirm(option)` y MISMO data-layer
 * (`fetchSubstituteCandidates`, lazy al abrir, top-5). Las props `exec`/`reducedMotion` son añadidos V3
 * (el integrador V3 ya dispone del tema) — el resto es idéntico. Sólo cambia la piel + el patrón de
 * confirmación en 2 pasos:
 *   · Header: badge "?" ámbar + título "Máquina ocupada" + subtítulo "Cambia solo por hoy — mismo músculo".
 *   · Tarjetas con selección tipo RADIO (la primera preseleccionada) + check circular relleno de marca.
 *   · CTA juicy "Cambiar por hoy" (60px) → `onConfirm(seleccionado)` (mismo handler, sin tocar el log).
 *   · Nota "Tu coach lo verá en el registro".
 * Dark-only: superficies fijas de `exec.surface`; sólo el acento (marca) es dinámico.
 */

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Bloque a sustituir (fuente del candidate set en el server). */
  blockId: string | null
  /** Ejercicio prescrito (header + aria). */
  prescribedName: string
  /** Grupo muscular (subtítulo + estado vacío). */
  muscleGroup: string
  /** Confirmar la elección → swap in-place SOLO de esta sesión (el plan NO se toca). */
  onConfirm: (option: SubstituteCandidate) => void
  /** Tema del ejecutor (acento de marca + superficies dark). */
  exec: ExecTheme
  reducedMotion?: boolean
}

export function SubstituteSheetV3({
  open,
  onOpenChange,
  blockId,
  prescribedName,
  muscleGroup,
  onConfirm,
  exec,
  reducedMotion = false,
}: Props) {
  const s = exec.surface
  const [loading, setLoading] = useState(false)
  const [options, setOptions] = useState<SubstituteCandidate[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const load = (id: string) => {
    setError(null)
    setOptions(null)
    setSelectedId(null)
    setLoading(true)
    fetchSubstituteCandidates(id)
      .then((set) => {
        // Paridad con el action web: top-5 (rankSubstitutes limit 5).
        if (!set) setError('No se pudo resolver el ejercicio de este bloque.')
        else setOptions(set.candidates.slice(0, 5))
      })
      .catch((e) =>
        setError(e instanceof InvalidBlockIdError ? 'Bloque inválido.' : 'No pudimos cargar alternativas. Revisa tu conexión.'),
      )
      .finally(() => setLoading(false))
  }

  // Pide sugerencias CADA vez que se abre para un bloque concreto; limpia al cerrar (paridad legacy).
  useEffect(() => {
    if (open && blockId) load(blockId)
    if (!open) {
      setOptions(null)
      setError(null)
      setSelectedId(null)
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, blockId])

  // Preselección: la PRIMERA alternativa queda elegida por defecto (mockup `.a3d-alt.sel`).
  useEffect(() => {
    if (options && options.length > 0) setSelectedId((prev) => prev ?? options[0].id)
  }, [options])

  const showLoading = loading || (open && options === null && error === null)
  const selected = options?.find((o) => o.id === selectedId) ?? null

  return (
    <Sheet
      open={open}
      onClose={() => onOpenChange(false)}
      forceDark
      nativeModal
      snapPoints={['72%']}
      dynamicSizing
      accessibilityLabel={`Cambiar ${prescribedName} por máquina ocupada`}
    >
      <View style={{ gap: 4 }}>
        {/* Header: badge "?" ámbar + título "Máquina ocupada". */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
          <View
            style={{
              width: 26,
              height: 26,
              borderRadius: 9,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: hexToRgba(AMBER, 0.18),
              borderWidth: 1.5,
              borderColor: hexToRgba(AMBER, 0.4),
            }}
          >
            <Text style={{ fontFamily: FONT.displayBlack, fontSize: 15, color: AMBER }}>?</Text>
          </View>
          <Text style={{ fontFamily: FONT.displayBlack, fontSize: 20, letterSpacing: -0.4, color: s.text }}>
            Máquina ocupada
          </Text>
        </View>
        <Text style={{ fontFamily: FONT.uiSemibold, fontSize: 13.5, color: '#a8a8b3', marginTop: 2, marginBottom: 8 }}>
          Cambia solo por hoy — mismo músculo
        </Text>

        {/* Rama exclusiva: cargando · error · vacío · lista. */}
        {showLoading ? (
          <LoadingSkeleton exec={exec} />
        ) : error ? (
          <View style={{ alignItems: 'center', gap: 12, paddingVertical: 40 }}>
            <TriangleAlert className="text-warning-500" size={32} strokeWidth={2} />
            <Text style={{ fontFamily: FONT.ui, fontSize: 14, color: s.textMuted, textAlign: 'center' }}>{error}</Text>
            {blockId ? (
              <Pressable testID="substitute-retry" onPress={() => load(blockId)} accessibilityRole="button" accessibilityLabel="Reintentar">
                {({ pressed }) => (
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 8,
                      minHeight: 44,
                      paddingHorizontal: 16,
                      borderRadius: 14,
                      borderWidth: 1.5,
                      borderColor: s.borderStrong,
                      backgroundColor: pressed ? s.surface : s.surfaceRaised,
                    }}
                  >
                    <RotateCw className="text-on-dark" size={16} />
                    <Text style={{ fontFamily: FONT.uiBold, fontSize: 14, color: s.text }}>Reintentar</Text>
                  </View>
                )}
              </Pressable>
            ) : null}
          </View>
        ) : options && options.length === 0 ? (
          <View style={{ alignItems: 'center', gap: 12, paddingVertical: 40 }}>
            <View style={{ width: 56, height: 56, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: hexToRgba('#ffffff', 0.06) }}>
              <Dumbbell className="text-on-dark-muted" size={28} />
            </View>
            <Text style={{ fontFamily: FONT.ui, fontSize: 14, color: s.textMuted, textAlign: 'center' }}>
              No encontramos alternativas equivalentes para{' '}
              <Text style={{ fontFamily: FONT.uiBold, color: '#eef0f2' }}>{muscleGroup}</Text> en tu catálogo.
            </Text>
          </View>
        ) : options && options.length > 0 ? (
          <>
            <View style={{ gap: 10 }} accessibilityRole="radiogroup" accessibilityLabel={`Alternativas para ${prescribedName}`}>
              {options.map((opt) => (
                <AltRow
                  key={opt.id}
                  opt={opt}
                  selected={opt.id === selectedId}
                  exec={exec}
                  onPress={() => setSelectedId(opt.id)}
                />
              ))}
            </View>

            <View style={{ marginTop: 16, marginBottom: 8 }}>
              <JuicyButton
                testID="btn-substitute-confirm"
                label="Cambiar por hoy"
                icon={<Repeat size={20} color={exec.accentText} />}
                onPress={() => selected && onConfirm(selected)}
                exec={exec}
                height={60}
                fontSize={18}
                reducedMotion={reducedMotion}
                disabled={!selected}
                accessibilityLabel="Cambiar el ejercicio por hoy"
              />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
              <Info size={14} color="#8f8f9c" />
              <Text style={{ fontFamily: FONT.uiSemibold, fontSize: 11, color: '#8f8f9c', textAlign: 'center' }}>
                Tu coach lo verá en el registro
              </Text>
            </View>
          </>
        ) : null}
      </View>
    </Sheet>
  )
}

/** Fila de alternativa: media 52x52 + nombre/músculo + check circular de marca (selección radio). */
function AltRow({
  opt,
  selected,
  exec,
  onPress,
}: {
  opt: SubstituteCandidate
  selected: boolean
  exec: ExecTheme
  onPress: () => void
}) {
  const s = exec.surface
  const thumb = exerciseGridThumb(opt)
  return (
    <Pressable
      testID={`substitute-option-${opt.id}`}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${opt.name} (${equipmentLabel(opt.equipment)})`}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          padding: 11,
          paddingHorizontal: 13,
          borderRadius: 16,
          borderWidth: 2,
          backgroundColor: selected ? hexToRgba(exec.accent, 0.1) : '#17171f',
          borderColor: selected ? exec.accent : '#2a2a34',
        }}
      >
        {/* Media 52x52 (silueta/miniatura). */}
        <View
          style={{
            width: 52,
            height: 52,
            borderRadius: 13,
            overflow: 'hidden',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#1d1d26',
            borderWidth: 1.5,
            borderColor: selected ? hexToRgba(exec.accent, 0.45) : '#34343f',
          }}
        >
          {thumb ? (
            <Image source={{ uri: thumb }} style={{ width: 52, height: 52, padding: 4 }} contentFit="contain" cachePolicy="memory-disk" recyclingKey={opt.id} />
          ) : (
            <Dumbbell className="text-on-dark-muted" size={20} />
          )}
        </View>
        {/* Nombre + músculo. */}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontFamily: FONT.displayBlack, fontSize: 15, letterSpacing: -0.15, color: selected ? '#ffffff' : '#eef0f2' }} numberOfLines={1}>
            {opt.name}
          </Text>
          <Text style={{ fontFamily: FONT.uiSemibold, fontSize: 12, color: '#93939f', marginTop: 3 }} numberOfLines={1}>
            {equipmentLabel(opt.equipment)}
            {opt.muscle_group ? ` · ${opt.muscle_group}` : ''}
          </Text>
        </View>
        {/* Check circular: relleno de marca + tinta on-brand cuando está seleccionado. */}
        <View
          style={{
            width: 26,
            height: 26,
            borderRadius: 13,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: selected ? exec.accent : '#202029',
            borderWidth: 2,
            borderColor: selected ? hexToRgba(exec.accent, 0.55) : '#34343f',
          }}
        >
          {selected ? <Check size={14} color={exec.accentText} strokeWidth={3.5} /> : null}
        </View>
      </View>
    </Pressable>
  )
}

/** 3 filas placeholder con pulse de opacidad (paridad web). */
function LoadingSkeleton({ exec }: { exec: ExecTheme }) {
  const opacity = useRef(new Animated.Value(0.5)).current
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ]),
    )
    anim.start()
    return () => anim.stop()
  }, [opacity])

  return (
    <View style={{ gap: 10 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {[0, 1, 2].map((i) => (
        <View
          key={i}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 11, paddingHorizontal: 13, borderRadius: 16, borderWidth: 2, borderColor: '#2a2a34', backgroundColor: '#17171f' }}
        >
          <Animated.View style={{ opacity, flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 52, height: 52, borderRadius: 13, backgroundColor: hexToRgba('#ffffff', 0.06) }} />
            <View style={{ flex: 1, gap: 8 }}>
              <View style={{ height: 14, width: '66%', borderRadius: 4, backgroundColor: hexToRgba('#ffffff', 0.06) }} />
              <View style={{ height: 12, width: '33%', borderRadius: 4, backgroundColor: hexToRgba('#ffffff', 0.05) }} />
            </View>
            <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: hexToRgba('#ffffff', 0.06) }} />
          </Animated.View>
        </View>
      ))}
    </View>
  )
}
