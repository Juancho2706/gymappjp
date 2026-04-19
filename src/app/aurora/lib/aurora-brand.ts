/** Utilidades de marca Aurora / coach (white-label). */

export const AURORA_COLOR_PRESETS = [
  { id: 'purple', label: 'Purple', hex: '#7B5CFF' },
  { id: 'amber', label: 'Amber', hex: '#FF8A3D' },
  { id: 'teal', label: 'Teal', hex: '#50E3C2' },
  { id: 'coral', label: 'Coral', hex: '#FF3B82' },
  { id: 'ocean', label: 'Ocean', hex: '#0091FF' },
  { id: 'magenta', label: 'Magenta', hex: '#FF0080' },
] as const

function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim())
  if (!m) return null
  return {
    r: parseInt(m[1], 16),
    g: parseInt(m[2], 16),
    b: parseInt(m[3], 16),
  }
}

export function hexToRgbString(hex: string): string {
  const p = parseHex(hex)
  if (!p) return '123, 92, 255'
  return `${p.r}, ${p.g}, ${p.b}`
}

/** Mezcla dos hex (#RRGGBB) con ratio 0..1 (hacia `b`). */
export function mixHex(a: string, b: string, ratio: number): string {
  const A = parseHex(a)
  const B = parseHex(b)
  if (!A || !B) return a
  const t = Math.min(1, Math.max(0, ratio))
  const r = Math.round(A.r + (B.r - A.r) * t)
  const g = Math.round(A.g + (B.g - A.g) * t)
  const bl = Math.round(A.b + (B.b - A.b) * t)
  return `#${[r, g, bl].map((x) => x.toString(16).padStart(2, '0')).join('')}`
}

/** Secundario Aurora: mezcla primario con blanco (claro) o con gris oscuro (oscuro). */
export function coachSecondaryForTheme(primary: string, mode: 'light' | 'dark'): string {
  if (mode === 'light') {
    return mixHex(primary, '#FFFFFF', 0.38)
  }
  return mixHex(primary, '#1a1a24', 0.35)
}

export function hexToRgba(hex: string, alpha: number): string {
  const p = parseHex(hex)
  if (!p) return `rgba(123, 92, 255, ${alpha})`
  return `rgba(${p.r}, ${p.g}, ${p.b}, ${alpha})`
}
