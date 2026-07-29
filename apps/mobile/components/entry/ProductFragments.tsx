import { StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import Svg, { Circle, Defs, LinearGradient as SvgLinearGradient, Path, Stop } from 'react-native-svg'
import { ENTRY_TOKENS } from '../../lib/theme'
import { FONT } from '../../lib/typography'

/**
 * ProductFragments — los 3 fragmentos de producto del frame 02.
 * Normativa: `docs/specs/entrada-dark-v1/DESIGN-SPEC.md` §3.2.1 a §3.2.4 (+ §3.2.6).
 *
 * Reemplazan a las 3 ilustraciones `webp` del walkthrough retirado: cero bitmaps, el
 * producto mostrandose a si mismo. Los datos estan **congelados** con los mismos valores
 * del mockup (§6 fila 6) — no son datos vivos y no deben conectarse a nada.
 *
 * Reglas duras que materializa este archivo:
 *  - `stopOpacity` SIEMPRE explicito (el alpha jamas dentro de `stopColor`): sin el,
 *    react-native-svg pinta el area del degradado SOLIDA (auditoria a1 §2.2).
 *  - Estatico por contrato (§4 fila X1): ni un nodo anima aca dentro. La cascada V1 la
 *    aplica el padre envolviendo CADA fila como UN solo nodo — la miniatura no entra
 *    elemento por elemento.
 *  - Nada de `className` junto a `style` funcion: aca no se usa `className` en absoluto.
 *  - Los tintes del anillo son los `accent-*` dark del DS a escala micro. Nunca un
 *    `bg-sport-100` pelado: en dark los `-100` son canales y dan color SOLIDO (a1 §3.2).
 */

/** Miniatura: 118x64, radio `control` (§3.2.1). */
const TILE_WIDTH = 118
const TILE_HEIGHT = 64

export interface ProductFragmentsProps {
  /**
   * §3.2.6 — colapso obligatorio: en pantallas de 667 pt el TERCER fragmento desaparece
   * y su copy se anexa al segundo. La card de alumno nunca queda bajo el fold.
   */
  collapse?: boolean
  /**
   * §3.2.6 — con `fontScale > 1.15` los captions bajan a 1 linea ANTES de tocar los
   * titulares (prioridad de sacrificio: caption 3 → frag 3 → caption 2 → foot).
   */
  captionLines?: number
  /** Envoltorio por fila: la cascada V1 entra por aca, un nodo por fragmento. */
  renderRow?: (row: React.ReactNode, index: number) => React.ReactNode
}

export function ProductFragments({ collapse = false, captionLines, renderRow }: ProductFragmentsProps) {
  const rows: React.ReactNode[] = [
    <FragmentRow
      key="week"
      index={0}
      tag="Hoy"
      title="Tu semana, ya armada"
      caption="El día de hoy viene marcado. No eliges qué hacer: lo abres y entrenas."
      captionLines={captionLines}
      thumb={<WeekThumb />}
    />,
    <FragmentRow
      key="macros"
      index={1}
      tag="Macros"
      title="Macros que ya cuadran"
      // Colapso §3.2.6: el copy del frag 3 se anexa al 2, no se pierde el mensaje.
      caption={
        collapse
          ? 'Porciones calculadas por comida. Y el mismo gráfico de progreso que ve tu coach.'
          : 'Porciones calculadas por comida. Cero planillas, cero conversiones a mano.'
      }
      captionLines={captionLines}
      thumb={<MacroRingThumb />}
    />,
  ]

  if (!collapse) {
    rows.push(
      <FragmentRow
        key="progress"
        index={2}
        tag="12 sem"
        title="Progreso que ven los dos"
        caption="El mismo gráfico en tu app y en el panel de tu coach. Sin capturas por chat."
        captionLines={captionLines}
        thumb={<ProgressThumb />}
      />,
    )
  }

  return <View style={styles.frags}>{rows.map((row, i) => renderRow?.(row, i) ?? row)}</View>
}

function FragmentRow({
  index,
  tag,
  title,
  caption,
  captionLines,
  thumb,
}: {
  index: number
  tag: string
  title: string
  caption: string
  captionLines?: number
  thumb: React.ReactNode
}) {
  return (
    // Separador SOLO entre filas: ni arriba de la primera ni bajo la ultima (§3.2.1).
    <View style={[styles.frag, index > 0 ? styles.fragDivider : null]}>
      <View style={styles.tile}>
        <LinearGradient
          colors={[ENTRY_TOKENS.glassTop, ENTRY_TOKENS.glassBottom] as const}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        {/* `inset 0 1px 0` no existe en RN: hairline dibujado (§0). */}
        <View style={styles.tileInset} pointerEvents="none" />
        <Text style={styles.tileTag} numberOfLines={1}>
          {tag}
        </Text>
        {thumb}
      </View>
      <View style={styles.fragText}>
        <Text style={styles.fragTitle}>{title}</Text>
        <Text style={styles.fragCaption} numberOfLines={captionLines}>
          {caption}
        </Text>
      </View>
    </View>
  )
}

/* ──────────────────────────────────────────────────────────────────────────
   Miniatura 1 — semana L-D (§3.2.2). Son `View`: no requiere svg.
   Patron congelado: L hecho · M hecho · M pendiente · J hecho · V HOY · S · D.
   `cta-fill` aparece una sola vez en toda la miniatura: la celda de hoy.
   ────────────────────────────────────────────────────────────────────────── */

type DayState = 'done' | 'today' | 'pending'
const WEEK: ReadonlyArray<{ label: string; state: DayState }> = [
  { label: 'L', state: 'done' },
  { label: 'M', state: 'done' },
  { label: 'M', state: 'pending' },
  { label: 'J', state: 'done' },
  { label: 'V', state: 'today' },
  { label: 'S', state: 'pending' },
  { label: 'D', state: 'pending' },
]

function WeekThumb() {
  return (
    <View style={styles.week}>
      {WEEK.map((day, i) => (
        <View key={`${day.label}-${i}`} style={styles.weekCol}>
          <Text style={[styles.weekLabel, day.state === 'today' ? styles.weekLabelToday : null]}>
            {day.label}
          </Text>
          <View
            style={[
              styles.weekBar,
              day.state === 'done' ? styles.weekBarDone : null,
              day.state === 'today' ? styles.weekBarToday : null,
            ]}
          >
            {day.state === 'today' ? (
              <>
                {/* traduce el `0 0 0 2px` del box-shadow: anillo dibujado, inset -2 */}
                <View style={styles.weekBarRing} pointerEvents="none" />
                <View style={styles.weekBarDot} pointerEvents="none" />
              </>
            ) : null}
          </View>
        </View>
      ))}
    </View>
  )
}

/* ──────────────────────────────────────────────────────────────────────────
   Miniatura 2 — anillo de macros (§3.2.3). Circunferencia = 2π × 17.5 = 109.96.
   La rotacion -90° va en el WRAPPER del Svg, nunca en los <Circle>; el label central
   es hermano FUERA de ese wrapper (si no, hereda la rotacion, §6 fila 23).
   ────────────────────────────────────────────────────────────────────────── */

const MACRO_ARCS: ReadonlyArray<{ stroke: string; dasharray: string; dashoffset: number }> = [
  { stroke: '#7FB0FF', dasharray: '39.3 70.7', dashoffset: 0 },
  { stroke: '#6FD3EA', dasharray: '43.7 66.3', dashoffset: -41.8 },
  { stroke: '#FF9D7E', dasharray: '19.5 90.5', dashoffset: -88 },
]

const MACRO_LEGEND: ReadonlyArray<{ color: string; label: string; value: string }> = [
  { color: '#7FB0FF', label: 'P', value: '138' },
  { color: '#6FD3EA', label: 'C', value: '196' },
  { color: '#FF9D7E', label: 'G', value: '58' },
]

function MacroRingThumb() {
  return (
    <View style={styles.ring}>
      <View style={styles.ringWrap}>
        <View style={styles.ringRotate}>
          <Svg width={48} height={48} viewBox="0 0 48 48">
            <Circle cx={24} cy={24} r={17.5} fill="none" stroke="rgba(255,255,255,0.09)" strokeWidth={4.6} />
            {MACRO_ARCS.map((arc) => (
              <Circle
                key={arc.stroke}
                cx={24}
                cy={24}
                r={17.5}
                fill="none"
                stroke={arc.stroke}
                strokeWidth={4.6}
                strokeLinecap="round"
                strokeDasharray={arc.dasharray}
                strokeDashoffset={arc.dashoffset}
              />
            ))}
          </Svg>
        </View>
        <View style={styles.ringCenter} pointerEvents="none">
          <Text style={styles.ringValue}>1.840</Text>
          <Text style={styles.ringUnit}>KCAL</Text>
        </View>
      </View>
      <View style={styles.legend}>
        {MACRO_LEGEND.map((entry) => (
          <View key={entry.label} style={styles.legendRow}>
            <View style={[styles.legendDot, { backgroundColor: entry.color }]} />
            <Text style={styles.legendLabel}>{entry.label}</Text>
            <Text style={styles.legendValue}>{entry.value}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}

/* ──────────────────────────────────────────────────────────────────────────
   Miniatura 3 — grafica de progreso (§3.2.4). 7 nodos de serie, 3 hairlines de
   grilla, ultimo punto con halo + plomada punteada. Los dos `stopOpacity` son
   obligatorios y explicitos.
   ────────────────────────────────────────────────────────────────────────── */

const PROGRESS_LINE = 'M3 12 L19 16 L35 13 L51 22 L67 20 L83 28 L98 31'

function ProgressThumb() {
  return (
    <View style={styles.chart}>
      <Svg width={102} height={42} viewBox="0 0 102 42">
        <Defs>
          <SvgLinearGradient id="entry-gprog" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#1A6BE6" stopOpacity={0.34} />
            <Stop offset="1" stopColor="#1A6BE6" stopOpacity={0} />
          </SvgLinearGradient>
        </Defs>
        <Path d="M0 9H102M0 21H102M0 33H102" stroke="rgba(255,255,255,0.055)" strokeWidth={1} />
        <Path d={`${PROGRESS_LINE} L98 41 L3 41 Z`} fill="url(#entry-gprog)" />
        <Path
          d={PROGRESS_LINE}
          fill="none"
          stroke="#7FB0FF"
          strokeWidth={1.7}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Path d="M98 31 V41" stroke="rgba(127,176,255,0.4)" strokeWidth={1} strokeDasharray="2 2.4" />
        <Circle cx={98} cy={31} r={4.6} fill="none" stroke="rgba(127,176,255,0.34)" strokeWidth={1} />
        <Circle cx={98} cy={31} r={2.5} fill="#F4F6F8" />
      </Svg>
    </View>
  )
}

const styles = StyleSheet.create({
  frags: { flexDirection: 'column' },
  frag: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10 },
  fragDivider: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.07)' },
  fragText: { flex: 1, minWidth: 0 },
  fragTitle: {
    fontFamily: FONT.uiExtra,
    fontSize: 13.5,
    lineHeight: 17,
    letterSpacing: -0.16,
    color: '#F4F6F8',
    marginBottom: 3,
  },
  fragCaption: {
    fontFamily: FONT.uiSemibold,
    fontSize: 11.5,
    lineHeight: 15,
    color: '#86919E',
  },

  tile: {
    width: TILE_WIDTH,
    height: TILE_HEIGHT,
    flexGrow: 0,
    flexShrink: 0,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileInset: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.085)',
  },
  tileTag: {
    position: 'absolute',
    top: 5,
    left: 7,
    zIndex: 3,
    fontFamily: FONT.monoBold,
    fontSize: 7,
    lineHeight: 9,
    letterSpacing: 0.84,
    textTransform: 'uppercase',
    color: ENTRY_TOKENS.textFaint,
  },

  week: { flexDirection: 'row', alignItems: 'flex-end', gap: 5, paddingTop: 8 },
  weekCol: { alignItems: 'center', gap: 4 },
  weekLabel: {
    fontFamily: FONT.monoBold,
    fontSize: 7,
    lineHeight: 9,
    letterSpacing: 0.14,
    color: '#69727C',
  },
  weekLabelToday: { color: '#F4F6F8' },
  weekBar: {
    width: 9,
    height: 20,
    borderRadius: 3,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  weekBarDone: { backgroundColor: 'rgba(244,246,248,0.30)', borderWidth: 0 },
  weekBarToday: { backgroundColor: ENTRY_TOKENS.lux, borderWidth: 0 },
  weekBarRing: {
    position: 'absolute',
    top: -2,
    left: -2,
    right: -2,
    bottom: -2,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: 'rgba(26,107,230,0.26)',
  },
  weekBarDot: {
    position: 'absolute',
    bottom: 4,
    alignSelf: 'center',
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: '#FFFFFF',
  },

  ring: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 6 },
  ringWrap: { width: 48, height: 48 },
  ringRotate: { width: 48, height: 48, transform: [{ rotate: '-90deg' }] },
  ringCenter: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  ringValue: {
    fontFamily: FONT.displayBlack,
    fontSize: 9.5,
    lineHeight: 9.5,
    letterSpacing: -0.33,
    color: '#F4F6F8',
  },
  ringUnit: {
    marginTop: 2,
    fontFamily: FONT.uiExtra,
    fontSize: 5.5,
    lineHeight: 6,
    letterSpacing: 0.55,
    color: ENTRY_TOKENS.textFaint,
  },
  legend: { width: 40, flexDirection: 'column', gap: 4 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 4, height: 4, borderRadius: 1 },
  legendLabel: { fontFamily: FONT.uiBold, fontSize: 7.5, lineHeight: 9, color: '#98A2B0' },
  legendValue: {
    marginLeft: 'auto',
    fontFamily: FONT.mono,
    fontSize: 7.5,
    lineHeight: 9,
    color: '#CDD3DB',
  },

  chart: { paddingTop: 8 },
})
