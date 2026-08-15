import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { ArrowLeft, ExternalLink, Info } from 'lucide-react-native'
import { useTheme } from '../context/ThemeContext'
import { Card } from '../components'

/**
 * "Fuentes y método" — citas de la información nutricional y de salud que muestra EVA.
 *
 * POR QUE EXISTE: App Review rechazó la app por guideline 1.4.1 (Safety — Physical Harm): la sección
 * de Nutrición entrega recomendaciones y cálculos de salud SIN citar de dónde salen. Apple exige que
 * las citas estén EN la app y sean fáciles de encontrar, con links a las fuentes.
 *
 * REGLA: cada fórmula/umbral que la app calcula y muestra al usuario tiene que aparecer acá, con su
 * referencia y su link resoluble. Si se agrega un cálculo nuevo (nueva ecuación de BMR, un rango de
 * micronutrientes, un score), se agrega su fila acá EN EL MISMO CAMBIO.
 *
 * Las mismas referencias viven como comentario en el motor puro:
 * `packages/nutrition-engine/tdee.ts` y `packages/nutrition-engine/bodycomp.ts`.
 */

type Reference = {
  /** Qué calcula EVA con esto — en lenguaje del usuario, no en jerga. */
  used: string
  citation: string
  url: string
}

const ENERGY_REFERENCES: Reference[] = [
  {
    used: 'Metabolismo basal (calorías en reposo) a partir de peso, estatura, edad y sexo.',
    citation:
      'Mifflin MD, St Jeor ST, Hill LA, Scott BJ, Daugherty SA, Koh YO. A new predictive equation for resting energy expenditure in healthy individuals. Am J Clin Nutr. 1990;51(2):241–247.',
    url: 'https://doi.org/10.1093/ajcn/51.2.241',
  },
  {
    used: 'Gasto energético total: factores de actividad física (PAL) aplicados sobre el metabolismo basal.',
    citation:
      'FAO/WHO/UNU. Human energy requirements: Report of a Joint FAO/WHO/UNU Expert Consultation. Roma: FAO; 2004.',
    url: 'https://www.fao.org/4/y5686e/y5686e00.htm',
  },
  {
    used: 'Metabolismo basal cuando hay masa magra medida (composición corporal): ecuación de Cunningham.',
    citation:
      'Cunningham JJ. A reanalysis of the factors influencing basal metabolic rate in normal adults. Am J Clin Nutr. 1980;33(11):2372–2374.',
    url: 'https://doi.org/10.1093/ajcn/33.11.2372',
  },
  {
    used: 'Metabolismo basal por masa magra: ecuación de Katch-McArdle (370 + 21,6 × masa magra en kg).',
    citation:
      'Katch FI, McArdle WD, Katch VL. Exercise Physiology: Nutrition, Energy, and Human Performance. Filadelfia: Lippincott Williams & Wilkins.',
    url: 'https://search.worldcat.org/search?q=Exercise+Physiology+Katch+McArdle',
  },
]

const MACRO_REFERENCES: Reference[] = [
  {
    used: 'Proteína objetivo (1,6–2,2 g por kg de peso corporal según el objetivo).',
    citation:
      'Jäger R, Kerksick CM, Campbell BI, et al. International Society of Sports Nutrition Position Stand: protein and exercise. J Int Soc Sports Nutr. 2017;14:20.',
    url: 'https://doi.org/10.1186/s12970-017-0177-8',
  },
  {
    used: 'Rango de grasas (20–35% de las calorías totales) y reparto de carbohidratos.',
    citation:
      'Institute of Medicine. Dietary Reference Intakes for Energy, Carbohydrate, Fiber, Fat, Fatty Acids, Cholesterol, Protein, and Amino Acids. Washington DC: The National Academies Press; 2005.',
    url: 'https://doi.org/10.17226/10490',
  },
  {
    used: 'Calorías por gramo de cada macronutriente (4 / 4 / 9 kcal) — factores de Atwater.',
    citation:
      'FAO. Food energy — methods of analysis and conversion factors. FAO Food and Nutrition Paper 77. Roma: FAO; 2003.',
    url: 'https://www.fao.org/4/y5022e/y5022e00.htm',
  },
]

const FOOD_DATA_REFERENCES: Reference[] = [
  {
    used: 'Composición nutricional de los alimentos del catálogo (calorías y macronutrientes por 100 g/ml).',
    citation: 'U.S. Department of Agriculture, Agricultural Research Service. FoodData Central.',
    url: 'https://fdc.nal.usda.gov/',
  },
  {
    used: 'Datos de productos envasados leídos por el escáner de código de barras.',
    citation: 'Open Food Facts — base de datos abierta de productos alimenticios (licencia ODbL).',
    url: 'https://world.openfoodfacts.org/',
  },
]

function ReferenceRow({ reference, last }: { reference: Reference; last?: boolean }) {
  const { theme } = useTheme()
  return (
    // Gotcha css-interop (AGENTS mobile): `style` como FUNCIÓN en un Pressable pierde TODO el
    // estilo inline — la fila quedaba sin padding, sin layout de fila y con el texto pegado al
    // borde de la card. Estilo estático + estado pressed vía children-as-function.
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`Abrir la fuente: ${reference.citation}`}
      onPress={() => {
        void Linking.openURL(reference.url).catch(() => {})
      }}
      style={[
        styles.refRow,
        !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border },
      ]}
    >
      {({ pressed }) => (
        <View style={[styles.refInner, pressed && { opacity: 0.6 }]}>
          <View style={styles.refText}>
            <Text style={[styles.refUsed, { color: theme.foreground, fontFamily: theme.fontSans }]}>
              {reference.used}
            </Text>
            <Text style={[styles.refCitation, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
              {reference.citation}
            </Text>
            <Text style={[styles.refUrl, { color: theme.primary, fontFamily: theme.fontSans }]}>
              {reference.url}
            </Text>
          </View>
          <ExternalLink size={15} color={theme.mutedForeground} strokeWidth={2} style={{ marginTop: 2 }} />
        </View>
      )}
    </Pressable>
  )
}

function ReferenceGroup({ title, references }: { title: string; references: Reference[] }) {
  const { theme } = useTheme()
  return (
    <View style={{ gap: 10 }}>
      <Text style={[styles.groupTitle, { color: theme.foreground, fontFamily: theme.fontSans }]}>
        {title}
      </Text>
      <Card padding={0} radius="card">
        {references.map((reference, i) => (
          <ReferenceRow key={reference.url + i} reference={reference} last={i === references.length - 1} />
        ))}
      </Card>
    </View>
  )
}

export default function FuentesScreen() {
  const { theme } = useTheme()
  const router = useRouter()

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Volver"
          hitSlop={10}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        >
          <ArrowLeft size={22} color={theme.foreground} strokeWidth={2.2} />
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.title, { color: theme.foreground, fontFamily: 'Archivo_900Black' }]}>
            Fuentes y método
          </Text>
          <Text style={[styles.subtitle, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
            De dónde salen los cálculos de nutrición y salud de EVA
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Card padding={14} variant="sunken" radius="card" style={styles.disclaimer}>
          <Info size={16} color={theme.mutedForeground} strokeWidth={2} style={{ marginTop: 1 }} />
          <Text style={[styles.disclaimerText, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
            Las calorías, macronutrientes y estimaciones de gasto energético que muestra EVA son
            <Text style={{ fontWeight: '700' }}> estimaciones </Text>
            calculadas con las ecuaciones de referencia listadas abajo. No son un diagnóstico ni una
            indicación médica, no reemplazan la evaluación de un médico o de un nutricionista, y no
            deben usarse para tratar ninguna condición de salud. Si estás embarazada, en periodo de
            lactancia, tienes una condición médica o tomas medicamentos, consulta a un profesional de
            la salud antes de seguir cualquier plan de alimentación.
          </Text>
        </Card>

        <ReferenceGroup title="Gasto energético (calorías)" references={ENERGY_REFERENCES} />
        <ReferenceGroup title="Reparto de macronutrientes" references={MACRO_REFERENCES} />
        <ReferenceGroup title="Datos de los alimentos" references={FOOD_DATA_REFERENCES} />

        <Text style={[styles.footnote, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
          Cuando tu entrenador o nutricionista define tus objetivos a mano, EVA muestra esos valores
          tal cual y no aplica ninguna de estas ecuaciones. Las ecuaciones solo se usan para la
          sugerencia inicial y siempre son editables.
        </Text>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 14,
  },
  title: { fontSize: 21, letterSpacing: -0.42 },
  subtitle: { fontSize: 13, marginTop: 3, lineHeight: 18 },
  scroll: { paddingHorizontal: 20, paddingBottom: 40, gap: 22 },
  disclaimer: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  disclaimerText: { flex: 1, fontSize: 12, lineHeight: 18 },
  groupTitle: { fontSize: 13, letterSpacing: 0.2, textTransform: 'uppercase' },
  refRow: {
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  refInner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  refText: { flex: 1, minWidth: 0, gap: 5 },
  refUsed: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  refCitation: { fontSize: 11.5, lineHeight: 16 },
  refUrl: { fontSize: 11.5, lineHeight: 16 },
  footnote: { fontSize: 11.5, lineHeight: 17 },
})
