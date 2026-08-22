import { useEffect, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { cssInterop } from 'nativewind'
import * as Haptics from 'expo-haptics'
import { Apple, Check, ChevronRight, Dumbbell, HeartPulse, PersonStanding, Sparkles } from 'lucide-react-native'
import type { LucideIcon } from 'lucide-react-native'
import { MotiView } from 'moti'
import { useReducedMotion } from 'react-native-reanimated'
import { SafeAreaView } from 'react-native-safe-area-context'
import { PERSONA_COPY, PERSONA_TILE_ORDER, type Persona } from '@eva/schemas'
import { AppBackground } from '../../../components/AppBackground'
import { Button } from '../../../components/Button'
import { SegmentedTabs } from '../../../components/SegmentedTabs'
import { resolvePostPersonaRoute, saveCoachPersona } from '../../../lib/coach-persona'

/**
 * «¿A qué te dedicas?» — primer ingreso del coach en la app (SPEC coach-onboarding-v2 §1 y §9,
 * TASKS W5 F5.1). Gemela de `/coach/onboarding/persona` en la web, con el molde de las cards de
 * rol de la entrada (`components/entry/RoleCards.tsx`): icon-tile 44, título, bajada y chevron.
 *
 * Reglas de diseño que NO son negociables:
 *  - Pantalla COMPLETA y sin «Saltar»: el escape es la quinta tarjeta («Otra cosa / todavía no lo
 *    tengo claro»), que dice qué pasa si la eliges. Una pregunta obligatoria sin escape se
 *    contesta al azar y envenena la segmentación.
 *  - La respuesta cambia algo visible en menos de 5 s: el CTA entra directo al interstitial
 *    «Armando tu panel…» y de ahí a la guía (o al panel mientras W5-B no cree la guía en RN).
 *  - La segunda pregunta es UNA línea inline, con «No» por defecto, y solo para las personas que
 *    la tienen (`PERSONA_COPY[persona].secondQuestion`).
 *
 * Colores: nunca literales de marca. Los iconos lucide toman su color por `className` gracias al
 * `cssInterop` de abajo, así que el `sport-*` del coach (white-label) y el dark mode se resuelven
 * en runtime igual que en el resto del panel.
 */

for (const Icon of [Apple, Check, ChevronRight, Dumbbell, HeartPulse, PersonStanding, Sparkles]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } })
}

/** Ícono por persona — el MISMO mapeo que la web (`PersonaPicker.tsx`). */
const PERSONA_ICONS: Record<Persona, LucideIcon> = {
  strength: Dumbbell,
  nutrition: Apple,
  rehab: PersonStanding,
  endurance: HeartPulse,
  other: Sparkles,
}

/** Mínimo que se muestra el interstitial. Corre EN PARALELO con el guardado, no lo demora. */
const MIN_BUILD_MS = 1200

const BUILD_STEPS = [
  { key: 'domains', label: 'Eligiendo tus módulos', atMs: 350 },
  { key: 'demo', label: 'Sembrando tu alumno de ejemplo', atMs: 750 },
  { key: 'guide', label: 'Preparando tu guía', atMs: 1150 },
] as const

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * «Armando tu panel…»: los tres pasos se tildan solos mientras el servidor escribe. La promesa se
 * cumple a la vista, no se anuncia con un spinner. Con reduce-motion los tildes igual aparecen
 * (la información no depende del movimiento), solo sin transición.
 */
function BuildingPanel() {
  const reduced = useReducedMotion()
  const [doneCount, setDoneCount] = useState(0)

  useEffect(() => {
    const timers = BUILD_STEPS.map((step, index) =>
      setTimeout(() => setDoneCount((current) => Math.max(current, index + 1)), step.atMs),
    )
    return () => timers.forEach(clearTimeout)
  }, [])

  return (
    <View accessibilityLiveRegion="polite" style={{ paddingTop: 24 }}>
      <Text className="font-display-black text-strong" style={{ fontSize: 26, letterSpacing: -0.5 }}>
        Armando tu panel…
      </Text>
      <View style={{ gap: 12, marginTop: 20 }}>
        {BUILD_STEPS.map((step, index) => {
          const done = index < doneCount
          return (
            <View key={step.key} className="flex-row items-center" style={{ gap: 12 }}>
              <MotiView
                animate={{ opacity: done ? 1 : 0.45 }}
                transition={reduced ? { type: 'timing', duration: 0 } : { type: 'timing', duration: 200 }}
                className={`items-center justify-center rounded-full ${done ? 'bg-sport-500' : 'bg-surface-sunken'}`}
                style={{ width: 26, height: 26 }}
              >
                <Check size={15} strokeWidth={3} className={done ? 'text-on-sport' : 'text-subtle'} />
              </MotiView>
              <Text
                className={done ? 'font-sans-bold text-strong' : 'font-sans text-muted'}
                style={{ flex: 1, fontSize: 14, lineHeight: 20 }}
              >
                {step.label}
              </Text>
            </View>
          )
        })}
      </View>
      <View className="rounded-card bg-surface-sunken" style={{ height: 96, marginTop: 24 }} />
      <View className="rounded-card bg-surface-sunken" style={{ height: 72, marginTop: 12 }} />
    </View>
  )
}

function PersonaTile({
  persona,
  selected,
  onPress,
}: {
  persona: Persona
  selected: boolean
  onPress: () => void
}) {
  const reduced = useReducedMotion()
  const [pressed, setPressed] = useState(false)
  const copy = PERSONA_COPY[persona]
  const Icon = PERSONA_ICONS[persona]
  const isEscape = persona === 'other'

  return (
    <Pressable
      testID={`persona-tile-${persona}`}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={copy.tileTitle}
      accessibilityHint={copy.tileSubtitle}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onPress={() => {
        void Haptics.selectionAsync().catch(() => {})
        onPress()
      }}
    >
      <MotiView
        animate={{ scale: pressed && !reduced ? 0.985 : 1 }}
        transition={{ type: 'timing', duration: 120 }}
        className={`rounded-card ${selected ? 'border-[1.5px] bg-sport-100' : 'border bg-surface-card'} ${
          isEscape && !selected ? 'border-dashed border-subtle' : selected ? 'border-sport-500' : 'border-subtle'
        }`}
        style={{ padding: 14 }}
      >
        <View className="flex-row items-center" style={{ gap: 13 }}>
          <View
            className={`items-center justify-center rounded-control ${selected ? 'bg-sport-500' : 'bg-surface-sunken'}`}
            style={{ width: 44, height: 44 }}
          >
            <Icon size={21} strokeWidth={2} className={selected ? 'text-on-sport' : 'text-sport-600'} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text className="font-sans-bold text-strong" style={{ fontSize: 15, lineHeight: 20 }}>
              {copy.tileTitle}
            </Text>
            <Text className="font-sans text-muted" style={{ fontSize: 12.5, lineHeight: 17, marginTop: 3 }}>
              {copy.tileSubtitle}
            </Text>
          </View>
          {selected ? (
            <View className="items-center justify-center rounded-full bg-sport-500" style={{ width: 24, height: 24 }}>
              <Check size={14} strokeWidth={3} className="text-on-sport" />
            </View>
          ) : (
            <ChevronRight size={18} strokeWidth={2.4} className="text-subtle" />
          )}
        </View>
      </MotiView>
    </Pressable>
  )
}

export default function CoachPersonaScreen() {
  const router = useRouter()
  const [selected, setSelected] = useState<Persona | null>(null)
  const [alsoOther, setAlsoOther] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [building, setBuilding] = useState(false)

  const secondQuestion = selected ? PERSONA_COPY[selected].secondQuestion : null

  function choose(persona: Persona) {
    setSelected(persona)
    setError(null)
    // Cambiar de rama reinicia la segunda pregunta a su default («No»): la respuesta anterior era
    // sobre otra pregunta.
    setAlsoOther(false)
  }

  async function submit() {
    if (!selected || building) {
      if (!selected) setError('Elige una opción para continuar.')
      return
    }
    setError(null)
    setBuilding(true)
    const [result] = await Promise.all([
      saveCoachPersona({ persona: selected, alsoOther }),
      sleep(MIN_BUILD_MS),
    ])
    if (!result.ok) {
      setError(result.error)
      setBuilding(false)
      return
    }
    router.replace(resolvePostPersonaRoute())
  }

  return (
    <View className="flex-1 bg-surface-app">
      <AppBackground />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 32 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {building ? (
            <BuildingPanel />
          ) : (
            <>
              <Text
                className="font-sans-bold text-sport-600"
                style={{ fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase' }}
              >
                Primer ingreso · 1 pregunta
              </Text>
              <Text
                accessibilityRole="header"
                className="font-display-black text-strong"
                style={{ fontSize: 28, lineHeight: 33, letterSpacing: -0.6, marginTop: 8 }}
              >
                ¿A qué te dedicas?
              </Text>
              <Text className="font-sans text-muted" style={{ fontSize: 13.5, lineHeight: 19, marginTop: 10 }}>
                Con esto te dejamos el panel listo con lo que usas y sin lo que no. Puedes cambiarlo
                después en Opciones.
              </Text>

              <View
                accessibilityRole="radiogroup"
                accessibilityLabel="¿A qué te dedicas?"
                style={{ gap: 10, marginTop: 22 }}
              >
                {PERSONA_TILE_ORDER.map((persona) => (
                  <PersonaTile
                    key={persona}
                    persona={persona}
                    selected={selected === persona}
                    onPress={() => choose(persona)}
                  />
                ))}
              </View>

              {secondQuestion ? (
                <View
                  className="rounded-card border border-subtle bg-surface-card"
                  style={{ gap: 12, marginTop: 14, padding: 14 }}
                >
                  <Text className="font-sans-bold text-strong" style={{ fontSize: 14, lineHeight: 19 }}>
                    {secondQuestion}
                  </Text>
                  <SegmentedTabs
                    size="sm"
                    items={[
                      { value: 'si', label: 'Sí' },
                      { value: 'no', label: 'No' },
                    ]}
                    value={alsoOther ? 'si' : 'no'}
                    onChange={(value) => setAlsoOther(value === 'si')}
                  />
                </View>
              ) : null}

              {error ? (
                <Text
                  accessibilityLiveRegion="assertive"
                  className="font-sans-bold text-destructive"
                  style={{ fontSize: 13, lineHeight: 18, marginTop: 14 }}
                >
                  {error}
                </Text>
              ) : null}

              <Button
                testID="persona-submit"
                label="Armar mi panel"
                variant="sport"
                size="md"
                full
                style={{ marginTop: 18 }}
                onPress={() => {
                  void submit()
                }}
              />

              <Text
                className="font-sans text-subtle"
                style={{ fontSize: 11.5, lineHeight: 17, marginTop: 14, textAlign: 'center' }}
              >
                Lo puedes cambiar cuando quieras en Opciones › Mi panel. Nada se borra.
              </Text>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  )
}
