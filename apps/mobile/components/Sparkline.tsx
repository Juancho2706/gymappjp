import { View } from 'react-native'
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg'
import { useTheme } from '../context/ThemeContext'

interface SparklineProps {
  values: number[]
  width?: number
  height?: number
  color?: string
  /** Show area fill under the line. */
  filled?: boolean
}

export function Sparkline({
  values,
  width = 120,
  height = 36,
  color,
  filled = true,
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

  const line = points
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(' ')

  const area = `${line} L ${width} ${height} L 0 ${height} Z`

  const gradId = 'sparkline-fill'

  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={stroke} stopOpacity="0.35" />
          <Stop offset="1" stopColor={stroke} stopOpacity="0" />
        </LinearGradient>
      </Defs>
      {filled ? <Path d={area} fill={`url(#${gradId})`} /> : null}
      <Path d={line} stroke={stroke} strokeWidth={1.75} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}
