import { StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { LinearGradient } from 'expo-linear-gradient'
import { ArrowRight } from 'lucide-react-native'
import { personaNoun, type Persona } from '@eva/schemas'
import { FIRST_STUDENT_RN_ROUTE, firstStudentCardCopy } from '@eva/onboarding'
import { Card } from '../Card'
import { Button } from '../Button'
import { useTheme } from '../../context/ThemeContext'

/**
 * «Tu primer alumno» — lo PRIMERO del home mientras el coach tenga 0 alumnos reales (plan B
 * «Activación», owner 01-10, maqueta `F1yd1V2b`). Paridad 1:1 con la web
 * (`apps/web/src/app/coach/dashboard/_components/FirstStudentCard.tsx`): mismo copy, que vive en
 * `@eva/onboarding`, y la misma superficie inversa que la tarjeta «Prioridad de hoy», a la que
 * reemplaza con 0 alumnos (decía «Ningún alumno en riesgo · Todo al día. Buen trabajo.»).
 *
 * El botón abre el alta guiada de 3 pasos del directorio (`?invite=1`), que ya termina en WhatsApp.
 */
export function FirstStudentCard({ persona }: { persona: Persona | null }) {
  const router = useRouter()
  const { resolvedScheme } = useTheme()
  const copy = firstStudentCardCopy(personaNoun(persona ?? 'other'))

  return (
    <Card variant="inverse" padding="md" radius="card" style={{ overflow: 'hidden' }}>
      <LinearGradient
        pointerEvents="none"
        colors={resolvedScheme === 'dark' ? ['#14191F', '#0E1117'] : ['#12161D', '#0B0E13']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Text className="font-sans-extra uppercase text-[11px] tracking-[0.88px] text-sport-400">{copy.eyebrow}</Text>
      <Text
        accessibilityRole="header"
        className="font-display-black text-[20px] text-on-dark"
        style={{ lineHeight: 22.4, letterSpacing: -0.4, marginTop: 10, marginBottom: 12 }}
      >
        {copy.title}
      </Text>
      <View style={{ gap: 9, marginBottom: 14 }}>
        {copy.steps.map((step, i) => (
          <View key={step.title} className="flex-row items-start" style={{ gap: 10 }}>
            <View
              className="h-[22px] w-[22px] items-center justify-center rounded-pill"
              style={{ backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' }}
            >
              <Text className="font-mono-bold text-[11px] text-on-dark">{i + 1}</Text>
            </View>
            <Text className="flex-1 font-sans text-[13px] text-on-dark-muted" style={{ lineHeight: 18 }}>
              <Text className="font-sans-bold text-on-dark">{step.title}.</Text> {step.hint}
            </Text>
          </View>
        ))}
      </View>
      <Button
        label={copy.cta}
        variant="sport"
        size="lg"
        rightIcon={ArrowRight}
        onPress={() => router.push(FIRST_STUDENT_RN_ROUTE as never)}
      />
      <Text className="font-sans text-[12px] text-on-dark-muted" style={{ textAlign: 'center', marginTop: 8 }}>
        {copy.hint}
      </Text>
    </Card>
  )
}
