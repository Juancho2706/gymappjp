'use client'

interface Props {
    data: number[]
    color: string
    w?: number
    h?: number
}

/**
 * P1 — sparkline (área suave + línea). Reproducido VERBATIM del helper Sparkline de
 * coach-dashboard.jsx: gradiente de área + path de línea con draw animado + punto
 * final. Usado en el stat de adherencia del Pulse hero.
 */
export function Sparkline({ data, color, w = 60, h = 22 }: Props) {
    if (!data || data.length < 2) return null
    const min = Math.min(...data)
    const max = Math.max(...data)
    const rng = max - min || 1
    const pts = data.map(
        (v, i) =>
            [
                (i / (data.length - 1)) * w,
                h - 2 - ((v - min) / rng) * (h - 4),
            ] as [number, number]
    )
    const line = pts
        .map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1))
        .join(' ')
    const area = line + ` L ${w} ${h} L 0 ${h} Z`
    const gid = 'spark' + color.replace(/[^a-z0-9]/gi, '')

    return (
        <svg width={w} height={h} style={{ display: 'block', overflow: 'visible' }}>
            <defs>
                <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity="0.22" />
                    <stop offset="100%" stopColor={color} stopOpacity="0" />
                </linearGradient>
            </defs>
            <path d={area} fill={`url(#${gid})`} />
            <path
                d={line}
                fill="none"
                stroke={color}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <circle
                cx={pts[pts.length - 1][0]}
                cy={pts[pts.length - 1][1]}
                r="2.6"
                fill={color}
            />
        </svg>
    )
}
