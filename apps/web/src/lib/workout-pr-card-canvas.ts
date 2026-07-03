// Client-side canvas generator for the workout RECORD-personal share-card (game-achievement style,
// story format 1080×1350). Mirrors the aesthetic of the server satori card (app/api/pr-card/route.tsx)
// but 100% client-side / zero-server: renders from the PR data already computed in the summary overlay.
// White-label: brand name/logo/accent come from the /c layout (DOM attrs + CSS vars) via readShareCardBrand()
// — already tier-gated there (free tier → no custom logo/color), so nothing is re-gated here.

import { fmtWeight } from '@/lib/records/pr-card'

const WIDTH = 1080
const HEIGHT = 1350
const INK_950 = '#0B0E13'
const INK_900 = '#12161D'
const SPORT_500 = '#2680FF'
const SUCCESS = '#34D399'
const PAD_X = 80

export interface WorkoutPRCardData {
    exerciseName: string
    newWeightKg: number
    prevWeightKg: number
    pct: number
    estimated1RM: number
}

export interface ShareCardBrand {
    brandName: string
    logoUrl: string | null
    accent: string
    displayFont: string
}

/** "3 de julio de 2026" — el record se logró HOY (recién finalizada la sesión). */
function todayLong(): string {
    return new Date().toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })
}

/** Porcentaje es-CL: 44.4 → "44,4"; enteros intactos. */
function fmtPct(p: number): string {
    return String(p).replace('.', ',')
}

/**
 * Lee la identidad white-label del alumno desde el DOM del layout /c (el overlay se portalea a
 * document.body, así que los data-attrs y las CSS vars viven en el árbol raíz, ya tier-gateados).
 * Fallbacks: marca "EVA", sin logo, acento sport por defecto.
 */
export function readShareCardBrand(): ShareCardBrand {
    if (typeof document === 'undefined') {
        return { brandName: 'EVA', logoUrl: null, accent: SPORT_500, displayFont: 'system-ui, sans-serif' }
    }
    const root = document.querySelector('[data-brand-name]')
    const brandName = root?.getAttribute('data-brand-name')?.trim() || 'EVA'
    const logoUrl = root?.getAttribute('data-logo-dark')?.trim() || null

    const cs = getComputedStyle(document.documentElement)
    const accent = cs.getPropertyValue('--theme-primary').trim() || cs.getPropertyValue('--sport-500').trim() || SPORT_500

    // Resolver la familia de fuente display real (next/font hashea el nombre): probe con la clase DS.
    let displayFont = 'system-ui, sans-serif'
    try {
        const probe = document.createElement('span')
        probe.className = 'font-display'
        probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none'
        document.body.appendChild(probe)
        displayFont = getComputedStyle(probe).fontFamily || displayFont
        probe.remove()
    } catch {
        /* fallback stack */
    }

    return { brandName, logoUrl, accent, displayFont }
}

/** Carga una imagen con CORS habilitado; si falla (403/CORS/red) resuelve null → fallback solo-texto. */
function loadImage(url: string): Promise<HTMLImageElement | null> {
    return new Promise((resolve) => {
        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.onload = () => resolve(img)
        img.onerror = () => resolve(null)
        img.src = url
    })
}

/** Normaliza cualquier color CSS (hex, rgb(), nombre) a {r,g,b} usando el propio canvas. */
function toRgb(ctx: CanvasRenderingContext2D, color: string): { r: number; g: number; b: number } {
    ctx.fillStyle = '#000000'
    ctx.fillStyle = color
    const norm = ctx.fillStyle
    if (norm.startsWith('#')) {
        const hex = norm.slice(1)
        const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex
        return {
            r: parseInt(full.slice(0, 2), 16),
            g: parseInt(full.slice(2, 4), 16),
            b: parseInt(full.slice(4, 6), 16),
        }
    }
    const m = norm.match(/rgba?\(([^)]+)\)/)
    if (m) {
        const [r, g, b] = m[1].split(',').map((n) => parseInt(n.trim(), 10))
        return { r: r || 0, g: g || 0, b: b || 0 }
    }
    return { r: 38, g: 128, b: 255 }
}

/** Envuelve texto en <=maxLines líneas al ancho dado; trunca la última con "…". */
function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
    const words = text.split(/\s+/)
    const lines: string[] = []
    let current = ''
    for (const word of words) {
        const candidate = current ? `${current} ${word}` : word
        if (ctx.measureText(candidate).width <= maxWidth || !current) {
            current = candidate
        } else {
            lines.push(current)
            current = word
            if (lines.length === maxLines - 1) break
        }
    }
    if (current && lines.length < maxLines) lines.push(current)
    // Si sobró texto, truncar la última línea con elipsis.
    const usedWords = lines.join(' ').split(/\s+/).length
    if (usedWords < words.length && lines.length > 0) {
        let last = lines[lines.length - 1]
        while (ctx.measureText(`${last}…`).width > maxWidth && last.length > 1) {
            last = last.slice(0, -1)
        }
        lines[lines.length - 1] = `${last}…`
    }
    return lines
}

/** Pill redondeado con texto; devuelve la altura ocupada. */
function drawPill(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    text: string,
    opts: { font: string; textColor: string; bg: string; padX?: number; padY?: number }
): number {
    const padX = opts.padX ?? 28
    const padY = opts.padY ?? 16
    ctx.font = opts.font
    const tw = ctx.measureText(text).width
    const fontSize = parseInt(opts.font.match(/(\d+)px/)?.[1] ?? '32', 10)
    const h = fontSize + padY * 2
    const w = tw + padX * 2
    ctx.fillStyle = opts.bg
    ctx.beginPath()
    ctx.roundRect(x, y, w, h, h / 2)
    ctx.fill()
    ctx.fillStyle = opts.textColor
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, x + padX, y + h / 2 + 1)
    ctx.textBaseline = 'alphabetic'
    return h
}

/**
 * Renderiza la share-card del record a Blob PNG. Zero-server: todo en <canvas> en el cliente.
 * Espera document.fonts.ready para rasterizar con la fuente display de la app (si carga).
 */
export async function renderWorkoutPRCardToBlob(data: WorkoutPRCardData, brand: ShareCardBrand): Promise<Blob | null> {
    if (typeof document === 'undefined') return null

    const canvas = document.createElement('canvas')
    canvas.width = WIDTH
    canvas.height = HEIGHT
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    const display = brand.displayFont || 'system-ui, sans-serif'
    const accent = brand.accent || SPORT_500

    try {
        await (document as unknown as { fonts?: { ready?: Promise<unknown> } }).fonts?.ready
    } catch {
        /* rasteriza con lo que haya */
    }

    const { r, g, b } = toRgb(ctx, accent)
    const accentRgb = (a: number) => `rgba(${r}, ${g}, ${b}, ${a})`

    // Fondo dark del DS.
    const bg = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT)
    bg.addColorStop(0, INK_950)
    bg.addColorStop(1, INK_900)
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, WIDTH, HEIGHT)

    // Glow de acento (marca) en la parte superior.
    const glow = ctx.createRadialGradient(WIDTH / 2, 240, 0, WIDTH / 2, 240, 700)
    glow.addColorStop(0, accentRgb(0.3))
    glow.addColorStop(1, accentRgb(0))
    ctx.fillStyle = glow
    ctx.fillRect(0, 0, WIDTH, 960)

    // ── Header: identidad de marca ──
    const logo = brand.logoUrl ? await loadImage(brand.logoUrl) : null
    ctx.save()
    if (logo) {
        ctx.beginPath()
        ctx.roundRect(PAD_X, 88, 76, 76, 20)
        ctx.clip()
        ctx.drawImage(logo, PAD_X, 88, 76, 76)
    } else {
        ctx.beginPath()
        ctx.roundRect(PAD_X, 88, 76, 76, 20)
        ctx.fillStyle = accent
        ctx.fill()
        ctx.fillStyle = '#ffffff'
        ctx.font = `800 42px ${display}`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(brand.brandName.charAt(0).toUpperCase(), PAD_X + 38, 88 + 40)
        ctx.textBaseline = 'alphabetic'
    }
    ctx.restore()

    ctx.fillStyle = 'rgba(255,255,255,0.88)'
    ctx.font = `800 34px ${display}`
    ctx.textAlign = 'left'
    ctx.letterSpacing = '1px'
    ctx.fillText(brand.brandName.toUpperCase(), PAD_X + 76 + 24, 140)
    ctx.letterSpacing = '0px'

    // Trofeo badge (emoji, coloreado por la fuente de sistema).
    ctx.textAlign = 'right'
    ctx.font = '92px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif'
    ctx.fillText('🏆', WIDTH - PAD_X, 172)

    // ── Bloque central ──
    ctx.textAlign = 'left'
    ctx.fillStyle = accent
    ctx.font = `800 38px ${display}`
    ctx.letterSpacing = '6px'
    ctx.fillText('RÉCORD PERSONAL', PAD_X, 470)
    ctx.letterSpacing = '0px'

    // Nombre del ejercicio (hasta 2 líneas).
    ctx.fillStyle = '#ffffff'
    ctx.font = `800 68px ${display}`
    const nameLines = wrapLines(ctx, data.exerciseName, WIDTH - PAD_X * 2, 2)
    nameLines.forEach((line, i) => ctx.fillText(line, PAD_X, 556 + i * 78))

    // Salto de peso grande.
    const weightStr = fmtWeight(data.newWeightKg)
    ctx.fillStyle = accent
    ctx.font = `800 230px ${display}`
    ctx.letterSpacing = '-4px'
    const weightBaseline = 858
    ctx.fillText(weightStr, PAD_X - 4, weightBaseline)
    const weightW = ctx.measureText(weightStr).width
    ctx.letterSpacing = '0px'
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    ctx.font = `800 68px ${display}`
    ctx.fillText('KG', PAD_X - 4 + weightW + 24, weightBaseline - 12)

    // Pill del salto: prev → new (+pct%).
    const hasJump = data.prevWeightKg > 0
    const jumpText = hasJump
        ? `${fmtWeight(data.prevWeightKg)} → ${weightStr} kg  ·  +${fmtPct(data.pct)}%`
        : 'Primer récord personal'
    drawPill(ctx, PAD_X, 908, jumpText, {
        font: `600 34px ${display}`,
        textColor: hasJump ? SUCCESS : 'rgba(255,255,255,0.7)',
        bg: hasJump ? 'rgba(52,211,153,0.14)' : 'rgba(255,255,255,0.08)',
    })

    // Fecha.
    ctx.fillStyle = 'rgba(255,255,255,0.58)'
    ctx.font = `600 32px ${display}`
    ctx.textAlign = 'left'
    ctx.fillText(todayLong(), PAD_X, 1052)

    // Pill 1RM estimado.
    drawPill(ctx, PAD_X, 1092, `1RM estimado · ${fmtWeight(data.estimated1RM)} kg`, {
        font: `600 32px ${display}`,
        textColor: 'rgba(255,255,255,0.82)',
        bg: 'rgba(255,255,255,0.06)',
    })

    // ── Footer white-label ──
    ctx.strokeStyle = 'rgba(255,255,255,0.1)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(PAD_X, 1250)
    ctx.lineTo(WIDTH - PAD_X, 1250)
    ctx.stroke()

    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    ctx.font = `600 26px ${display}`
    ctx.textAlign = 'left'
    ctx.letterSpacing = '2px'
    ctx.fillText(brand.brandName.toUpperCase(), PAD_X, 1306)
    ctx.letterSpacing = '0px'

    ctx.fillStyle = 'rgba(255,255,255,0.38)'
    ctx.font = `600 24px ${display}`
    ctx.textAlign = 'right'
    ctx.fillText('vía EVA', WIDTH - PAD_X, 1306)

    return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'))
}
