import { View } from 'react-native'
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg'
import { useTheme } from '../context/ThemeContext'

interface SparklineProps {
  values: number[]
  width?: number
  height?: number
  color?: string
  /** Show area fill under the line. */
  filled?: boolean
  /**
   * Grosor del trazo. Default 1.75 (legacy). Los consumidores alumno pasan 2
   * (web WeightSparkline.tsx:57 `strokeWidth={2}`).
   */
  strokeWidth?: number
  /**
   * Opacidad inicial del gradiente del area. Default 0.35 (legacy). Los
   * consumidores alumno pasan 0.25 (web WeightSparkline.tsx:53 `stopOpacity={0.25}`).
   */
  gradientOpacity?: number
  /**
   * Interpolacion: 'linear' (legacy, polilinea) o 'monotone' (web recharts
   * `type="monotone"`, WeightSparkline.tsx:57) — cubica monotona Fritsch-Carlson.
   */
  curve?: 'linear' | 'monotone'
  /**
   * Punto final marcado sobre la curva (web WeightSparkline.tsx:31-45: circle r=4
   * fill sport-500/stroke color, ring `var(--surface-card)` strokeWidth 2.5).
   */
  endDot?: boolean
}

/** Path cubico monotono (equivalente a `curveMonotoneX` de recharts/d3). */
function monotonePath(points: ReadonlyArray<readonly [number, number]>): string {
  const n = points.length
  const dx: number[] = []
  const slopes: number[] = []
  for (let i = 0; i < n - 1; i++) {
    dx[i] = points[i + 1][0] - points[i][0]
    slopes[i] = (points[i + 1][1] - points[i][1]) / (dx[i] || 1)
  }
  const m: number[] = [slopes[0]]
  for (let i = 1; i < n - 1; i++) {
    if (slopes[i - 1] * slopes[i] <= 0) {
      m[i] = 0
    } else {
      const w1 = 2 * dx[i] + dx[i - 1]
      const w2 = dx[i] + 2 * dx[i - 1]
      m[i] = (w1 + w2) / (w1 / slopes[i - 1] + w2 / slopes[i])
    }
  }
  m[n - 1] = slopes[n - 2]
  let d = `M ${points[0][0].toFixed(2)} ${points[0][1].toFixed(2)}`
  for (let i = 0; i < n - 1; i++) {
    const c1x = points[i][0] + dx[i] / 3
    const c1y = points[i][1] + (m[i] * dx[i]) / 3
    const c2x = points[i + 1][0] - dx[i] / 3
    const c2y = points[i + 1][1] - (m[i + 1] * dx[i]) / 3
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)} ${c2x.toFixed(2)} ${c2y.toFixed(2)} ${points[i + 1][0].toFixed(2)} ${points[i + 1][1].toFixed(2)}`
  }
  return d
}

export function Sparkline({
  values,
  width = 120,
  height = 36,
  color,
  filled = true,
  strokeWidth = 1.75,
  gradientOpacity = 0.35,
  curve = 'linear',
  endDot = false,
}: SparklineProps) {
  const { theme } = useTheme()
  const stroke = color ?? theme.primary

  if (values.length < 2) {
    return <View style={{ width, height }} />
  }

  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const stepX = width / (values.length - 1)

  const points = values.map((v, i) => {
    const x = i * stepX
    const y = height - ((v - min) / range) * (height - 2) - 1
    return [x, y] as const
  })

  const line =
    curve === 'monotone'
      ? monotonePath(points)
      : points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`).join(' ')

  const area = `${line} L ${width} ${height} L 0 ${height} Z`

  // Id único por color — evita colisión de <defs> entre múltiples sparklines (todas
  // las áreas tomaban el gradiente de la primera = mismo color).
  const gradId = `spark-${stroke.replace(/[^a-zA-Z0-9]/g, '')}`

  const [lastX, lastY] = points[points.length - 1]

  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={stroke} stopOpacity={String(gradientOpacity)} />
          <Stop offset="1" stopColor={stroke} stopOpacity="0" />
        </LinearGradient>
      </Defs>
      {filled ? <Path d={area} fill={`url(#${gradId})`} /> : null}
      <Path d={line} stroke={stroke} strokeWidth={strokeWidth} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {endDot ? <Circle cx={lastX} cy={lastY} r={4} fill={stroke} stroke={theme.card} strokeWidth={2.5} /> : null}
    </Svg>
  )
}
