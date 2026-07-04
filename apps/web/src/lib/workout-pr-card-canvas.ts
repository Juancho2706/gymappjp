// Client-side canvas generator for the workout share-cards (game-achievement style, story format
// 1080×1350). Mirrors the aesthetic of the server satori card (app/api/pr-card/route.tsx) but
// 100% client-side / zero-server: renders from data already computed in the app.
// White-label: brand name/logo/accent come from the /c layout (DOM attrs + CSS vars) via
// readShareCardBrand() — already tier-gated there (free tier → no custom logo/color), so nothing
// is re-gated here. Todas las cards comparten header/footer via helpers (drawBrandHeader /
// drawBrandFooter) para que la marca del coach viaje idéntica en las 4 plantillas.

import { fmtWeight } from '@/lib/records/pr-card'

const WIDTH = 1080
const HEIGHT = 1350
const INK_950 = '#0B0E13'
const INK_900 = '#12161D'
const SPORT_500 = '#2680FF'
const SUCCESS = '#34D399'
const EMBER_500 = '#FF6A3D'
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
    /** Motivo "racha" del DS (--ember-500). */
    ember: string
    displayFont: string
    /** Identificador público del coach en el URL (`data-coach-slug`); base de la URL corta. */
    coachSlug: string | null
    /** URL corta legible para el footer ("eva-app.cl/c/{slug}"); null si no hay slug. */
    shortUrl: string | null
}

export interface ProgressCardData {
    /** Nombre del alumno (para el subtítulo). */
    fullName: string
    /** Total de entrenos registrados (métrica hero). */
    totalWorkouts: number
    /** Racha en días. */
    streak: number
    /** Nombre del programa/plan activo (opcional). */
    programName: string | null
}

export interface StreakCardData {
    /** Nombre del alumno (para el subtítulo). */
    fullName: string
    /** Racha en días (métrica hero) — actividad = entreno O nutrición. */
    streak: number
    /** Marca del coach (opcional; la fuente de verdad tier-gateada es readShareCardBrand). */
    brandName?: string
}

export interface MonthlySummaryCardData {
    /** Nombre del alumno (para el subtítulo). */
    fullName: string
    /** Etiqueta del mes calendario ("Julio 2026"). */
    monthLabel: string
    /** Sesiones (días entrenados) del mes. */
    sessions: number
    /** Volumen total del mes en kg. */
    volumeKg: number
    /** Racha actual en días. */
    streak: number
    /** Marca del coach (opcional; la fuente de verdad tier-gateada es readShareCardBrand). */
    brandName?: string
}

/** "3 de julio de 2026" — el hito se logró HOY (recién finalizada la acción). */
function todayLong(): string {
    return new Date().toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })
}

/** Porcentaje es-CL: 44.4 → "44,4"; enteros intactos. */
function fmtPct(p: number): string {
    return String(p).replace('.', ',')
}

/** Volumen legible: ≥1000 kg → toneladas con 1 decimal ("45,2 t"); si no, "kg". */
function fmtVolume(kg: number): string {
    const n = Math.max(0, Math.round(kg))
    if (n >= 1000) {
        const t = Math.round((n / 1000) * 10) / 10
        return `${String(t).replace('.', ',')} t`
    }
    return `${n} kg`
}

/** Primer nombre del alumno (para el subtítulo). */
function firstName(full: string): string {
    return full.trim().split(/\s+/)[0] || full.trim()
}

/**
 * Lee la identidad white-label del alumno desde el DOM del layout /c (el overlay se portalea a
 * document.body, así que los data-attrs y las CSS vars viven en el árbol raíz, ya tier-gateados).
 * Fallbacks: marca "EVA", sin logo, acento sport por defecto, sin URL corta.
 */
export function readShareCardBrand(): ShareCardBrand {
    if (typeof document === 'undefined') {
        return {
            brandName: 'EVA',
            logoUrl: null,
            accent: SPORT_500,
            ember: EMBER_500,
            displayFont: 'system-ui, sans-serif',
            coachSlug: null,
            shortUrl: null,
        }
    }
    const root = document.querySelector('[data-brand-name]')
    const brandName = root?.getAttribute('data-brand-name')?.trim() || 'EVA'
    const logoUrl = root?.getAttribute('data-logo-dark')?.trim() || null
    const coachSlug = root?.getAttribute('data-coach-slug')?.trim() || null

    const cs = getComputedStyle(document.documentElement)
    const accent = cs.getPropertyValue('--theme-primary').trim() || cs.getPropertyValue('--sport-500').trim() || SPORT_500
    const ember = cs.getPropertyValue('--ember-500').trim() || EMBER_500

    // URL corta legible ("eva-app.cl/c/{slug}") — host desde NEXT_PUBLIC_SITE_URL, sin protocolo.
    const host = (process.env.NEXT_PUBLIC_SITE_URL || 'https://eva-app.cl')
        .replace(/^https?:\/\//, '')
        .replace(/\/$/, '')
    const shortUrl = coachSlug ? `${host}/c/${coachSlug}` : null

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

    return { brandName, logoUrl, accent, ember, displayFont, coachSlug, shortUrl }
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

/** Trunca una sola línea con "…" si excede maxWidth (para labels/CTA de una línea). */
function ellipsize(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
    if (ctx.measureText(text).width <= maxWidth) return text
    let s = text
    while (s.length > 1 && ctx.measureText(`${s}…`).width > maxWidth) {
        s = s.slice(0, -1)
    }
    return `${s}…`
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

/** Fondo dark del DS + glow de acento (el color del glow define el "motivo" de la card). */
function drawCardBase(ctx: CanvasRenderingContext2D, glow: { r: number; g: number; b: number }): void {
    const bg = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT)
    bg.addColorStop(0, INK_950)
    bg.addColorStop(1, INK_900)
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, WIDTH, HEIGHT)

    const g = ctx.createRadialGradient(WIDTH / 2, 240, 0, WIDTH / 2, 240, 700)
    g.addColorStop(0, `rgba(${glow.r}, ${glow.g}, ${glow.b}, 0.3)`)
    g.addColorStop(1, `rgba(${glow.r}, ${glow.g}, ${glow.b}, 0)`)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, WIDTH, 960)
}

/** Header de identidad de marca: logo (o inicial), nombre en mayúsculas y badge emoji. */
async function drawBrandHeader(
    ctx: CanvasRenderingContext2D,
    brand: ShareCardBrand,
    opts: { display: string; accent: string; emoji: string }
): Promise<void> {
    const { display, accent, emoji } = opts
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

    // Badge (emoji, coloreado por la fuente de sistema).
    ctx.textAlign = 'right'
    ctx.font = '92px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif'
    ctx.fillText(emoji, WIDTH - PAD_X, 172)
    ctx.textAlign = 'left'
}

/**
 * Footer white-label compartido por las 4 cards. Línea divisoria + nombre de la marca + CTA de
 * texto "Entrená con {marca}" + URL corta (eva-app.cl/c/{slug}) para captar sin QR. Conserva
 * "vía EVA" a la derecha TAL CUAL hoy (co-branding por tier, sin gating nuevo).
 */
function drawBrandFooter(
    ctx: CanvasRenderingContext2D,
    brand: ShareCardBrand,
    opts: { display: string; accent: string }
): void {
    const { display, accent } = opts

    ctx.strokeStyle = 'rgba(255,255,255,0.1)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(PAD_X, 1246)
    ctx.lineTo(WIDTH - PAD_X, 1246)
    ctx.stroke()

    // Fila 1: nombre de marca (izq) + "vía EVA" (der).
    ctx.fillStyle = 'rgba(255,255,255,0.55)'
    ctx.font = `700 26px ${display}`
    ctx.textAlign = 'left'
    ctx.letterSpacing = '2px'
    ctx.fillText(ellipsize(ctx, brand.brandName.toUpperCase(), WIDTH - PAD_X * 2 - 160), PAD_X, 1288)
    ctx.letterSpacing = '0px'

    ctx.fillStyle = 'rgba(255,255,255,0.38)'
    ctx.font = `600 24px ${display}`
    ctx.textAlign = 'right'
    ctx.fillText('vía EVA', WIDTH - PAD_X, 1288)

    // Fila 2: CTA de captación (izq, color de marca) + URL corta (der). Reservar el ancho de la
    // URL para no solaparla con el CTA en marcas de nombre largo.
    let urlW = 0
    if (brand.shortUrl) {
        ctx.font = `600 22px ${display}`
        urlW = ctx.measureText(brand.shortUrl).width
    }
    ctx.fillStyle = accent
    ctx.font = `700 25px ${display}`
    ctx.textAlign = 'left'
    const ctaMax = WIDTH - PAD_X * 2 - (urlW ? urlW + 32 : 0)
    ctx.fillText(ellipsize(ctx, `Entrená con ${brand.brandName}`, ctaMax), PAD_X, 1326)

    if (brand.shortUrl) {
        ctx.fillStyle = 'rgba(255,255,255,0.42)'
        ctx.font = `600 22px ${display}`
        ctx.textAlign = 'right'
        ctx.fillText(brand.shortUrl, WIDTH - PAD_X, 1326)
    }
    ctx.textAlign = 'left'
}

/** Tile de estadística (recap mensual): fondo tenue, emoji, valor (auto-fit) y label. */
function drawStatTile(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    opts: { emoji: string; value: string; label: string; accent: string; display: string }
): void {
    const { emoji, value, label, accent, display } = opts

    ctx.fillStyle = 'rgba(255,255,255,0.05)'
    ctx.beginPath()
    ctx.roundRect(x, y, w, h, 28)
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.roundRect(x, y, w, h, 28)
    ctx.stroke()

    const cx = x + w / 2
    const maxW = w - 32

    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    ctx.font = '54px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif'
    ctx.fillText(emoji, cx, y + 92)

    // Valor con auto-fit al ancho del tile.
    let fs = 72
    ctx.font = `800 ${fs}px ${display}`
    while (ctx.measureText(value).width > maxW && fs > 34) {
        fs -= 2
        ctx.font = `800 ${fs}px ${display}`
    }
    ctx.fillStyle = accent
    ctx.fillText(value, cx, y + 200)

    ctx.fillStyle = 'rgba(255,255,255,0.6)'
    ctx.font = `600 24px ${display}`
    ctx.fillText(ellipsize(ctx, label, maxW), cx, y + 250)
    ctx.textAlign = 'left'
}

/** Espera a que las fuentes estén listas (o rasteriza con lo que haya). */
async function waitFonts(): Promise<void> {
    try {
        await (document as unknown as { fonts?: { ready?: Promise<unknown> } }).fonts?.ready
    } catch {
        /* rasteriza con lo que haya */
    }
}

/** Crea el canvas 1080×1350 + contexto 2D, o null si el entorno no lo soporta. */
function makeCanvas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
    if (typeof document === 'undefined') return null
    const canvas = document.createElement('canvas')
    canvas.width = WIDTH
    canvas.height = HEIGHT
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    return { canvas, ctx }
}

/**
 * Renderiza la share-card del record a Blob PNG. Zero-server: todo en <canvas> en el cliente.
 * Espera document.fonts.ready para rasterizar con la fuente display de la app (si carga).
 */
export async function renderWorkoutPRCardToBlob(data: WorkoutPRCardData, brand: ShareCardBrand): Promise<Blob | null> {
    const made = makeCanvas()
    if (!made) return null
    const { canvas, ctx } = made

    const display = brand.displayFont || 'system-ui, sans-serif'
    const accent = brand.accent || SPORT_500

    await waitFonts()

    drawCardBase(ctx, toRgb(ctx, accent))
    await drawBrandHeader(ctx, brand, { display, accent, emoji: '🏆' })

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

    drawBrandFooter(ctx, brand, { display, accent })

    return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'))
}

/**
 * Renderiza la share-card de PROGRESO del alumno a Blob PNG. Misma estética 1080×1350 que el récord,
 * pero con las métricas que el perfil ya tiene (total de entrenos + racha). Zero-server.
 */
export async function renderProgressCardToBlob(data: ProgressCardData, brand: ShareCardBrand): Promise<Blob | null> {
    const made = makeCanvas()
    if (!made) return null
    const { canvas, ctx } = made

    const display = brand.displayFont || 'system-ui, sans-serif'
    const accent = brand.accent || SPORT_500

    await waitFonts()

    drawCardBase(ctx, toRgb(ctx, accent))
    await drawBrandHeader(ctx, brand, { display, accent, emoji: '💪' })

    // ── Bloque central ──
    ctx.textAlign = 'left'
    ctx.fillStyle = accent
    ctx.font = `800 38px ${display}`
    ctx.letterSpacing = '6px'
    ctx.fillText('MI PROGRESO', PAD_X, 470)
    ctx.letterSpacing = '0px'

    // Título "Constancia con <coach>" (hasta 2 líneas).
    ctx.fillStyle = '#ffffff'
    ctx.font = `800 68px ${display}`
    const titleLines = wrapLines(ctx, `Constancia con ${brand.brandName}`, WIDTH - PAD_X * 2, 2)
    titleLines.forEach((line, i) => ctx.fillText(line, PAD_X, 556 + i * 78))
    const titleBottom = 556 + (titleLines.length - 1) * 78

    // Nombre del alumno (subtítulo).
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    ctx.font = `600 34px ${display}`
    ctx.fillText(firstName(data.fullName), PAD_X, titleBottom + 52)

    // Métrica hero: total de entrenos.
    const totalStr = String(data.totalWorkouts)
    ctx.fillStyle = accent
    ctx.font = `800 230px ${display}`
    ctx.letterSpacing = '-4px'
    const heroBaseline = 900
    ctx.fillText(totalStr, PAD_X - 4, heroBaseline)
    const totalW = ctx.measureText(totalStr).width
    ctx.letterSpacing = '0px'
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    ctx.font = `800 60px ${display}`
    ctx.fillText(data.totalWorkouts === 1 ? 'entreno' : 'entrenos', PAD_X - 4 + totalW + 24, heroBaseline - 12)

    // Pill de racha.
    const streakText = data.streak > 0 ? `Racha · ${data.streak} ${data.streak === 1 ? 'día' : 'días'}` : 'Recién empezando'
    drawPill(ctx, PAD_X, 950, streakText, {
        font: `600 34px ${display}`,
        textColor: data.streak > 0 ? SUCCESS : 'rgba(255,255,255,0.7)',
        bg: data.streak > 0 ? 'rgba(52,211,153,0.14)' : 'rgba(255,255,255,0.08)',
    })

    // Fecha.
    ctx.fillStyle = 'rgba(255,255,255,0.58)'
    ctx.font = `600 32px ${display}`
    ctx.textAlign = 'left'
    ctx.fillText(todayLong(), PAD_X, 1094)

    // Pill del programa (si hay).
    if (data.programName) {
        drawPill(ctx, PAD_X, 1134, data.programName, {
            font: `600 32px ${display}`,
            textColor: 'rgba(255,255,255,0.82)',
            bg: 'rgba(255,255,255,0.06)',
        })
    }

    drawBrandFooter(ctx, brand, { display, accent })

    return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'))
}

/**
 * Renderiza la share-card de RACHA a Blob PNG. Hero = número de racha con motivo ember (--ember-500),
 * eyebrow "RACHA", copy "días seguidos activo" (racha = entreno O nutrición). Zero-server.
 */
export async function renderStreakCardToBlob(data: StreakCardData, brand: ShareCardBrand): Promise<Blob | null> {
    const made = makeCanvas()
    if (!made) return null
    const { canvas, ctx } = made

    const display = brand.displayFont || 'system-ui, sans-serif'
    const accent = brand.accent || SPORT_500
    const ember = brand.ember || EMBER_500

    await waitFonts()

    const emberRgb = toRgb(ctx, ember)
    drawCardBase(ctx, emberRgb)
    await drawBrandHeader(ctx, brand, { display, accent, emoji: '🔥' })

    const streak = Math.max(0, Math.round(data.streak))

    // ── Bloque central ──
    ctx.textAlign = 'left'
    ctx.fillStyle = ember
    ctx.font = `800 38px ${display}`
    ctx.letterSpacing = '6px'
    ctx.fillText('RACHA', PAD_X, 470)
    ctx.letterSpacing = '0px'

    // Título.
    ctx.fillStyle = '#ffffff'
    ctx.font = `800 68px ${display}`
    const titleLines = wrapLines(ctx, streak > 0 ? 'Racha encendida' : 'Encendé tu racha', WIDTH - PAD_X * 2, 2)
    titleLines.forEach((line, i) => ctx.fillText(line, PAD_X, 556 + i * 78))
    const titleBottom = 556 + (titleLines.length - 1) * 78

    // Nombre del alumno (subtítulo).
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    ctx.font = `600 34px ${display}`
    ctx.fillText(firstName(data.fullName), PAD_X, titleBottom + 52)

    // Métrica hero: racha en días.
    const streakStr = String(streak)
    ctx.fillStyle = ember
    ctx.font = `800 230px ${display}`
    ctx.letterSpacing = '-4px'
    const heroBaseline = 900
    ctx.fillText(streakStr, PAD_X - 4, heroBaseline)
    const streakW = ctx.measureText(streakStr).width
    ctx.letterSpacing = '0px'
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    ctx.font = `800 60px ${display}`
    ctx.fillText(streak === 1 ? 'día' : 'días', PAD_X - 4 + streakW + 24, heroBaseline - 12)

    // Copy: "seguidos activo" (junto al hero "N días" → "N días seguidos activo").
    drawPill(ctx, PAD_X, 950, streak > 0 ? 'seguidos activo' : 'Empezá hoy tu racha', {
        font: `600 34px ${display}`,
        textColor: streak > 0 ? ember : 'rgba(255,255,255,0.7)',
        bg: streak > 0 ? `rgba(${emberRgb.r}, ${emberRgb.g}, ${emberRgb.b}, 0.14)` : 'rgba(255,255,255,0.08)',
    })

    // Fecha.
    ctx.fillStyle = 'rgba(255,255,255,0.58)'
    ctx.font = `600 32px ${display}`
    ctx.textAlign = 'left'
    ctx.fillText(todayLong(), PAD_X, 1094)

    drawBrandFooter(ctx, brand, { display, accent })

    return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'))
}

/**
 * Renderiza la share-card de RESUMEN MENSUAL a Blob PNG. Estilo "recap": eyebrow del mes + grid de
 * 3 tiles (Sesiones / Volumen / Racha) del mes calendario en Santiago. v1 sin PRs. Zero-server.
 */
export async function renderMonthlySummaryCardToBlob(
    data: MonthlySummaryCardData,
    brand: ShareCardBrand
): Promise<Blob | null> {
    const made = makeCanvas()
    if (!made) return null
    const { canvas, ctx } = made

    const display = brand.displayFont || 'system-ui, sans-serif'
    const accent = brand.accent || SPORT_500

    await waitFonts()

    drawCardBase(ctx, toRgb(ctx, accent))
    await drawBrandHeader(ctx, brand, { display, accent, emoji: '📅' })

    // ── Bloque central ──
    ctx.textAlign = 'left'
    ctx.fillStyle = accent
    ctx.font = `800 38px ${display}`
    ctx.letterSpacing = '5px'
    ctx.fillText('RESUMEN DEL MES', PAD_X, 470)
    ctx.letterSpacing = '0px'

    // Título = etiqueta del mes ("Julio 2026").
    ctx.fillStyle = '#ffffff'
    ctx.font = `800 68px ${display}`
    const titleLines = wrapLines(ctx, data.monthLabel, WIDTH - PAD_X * 2, 2)
    titleLines.forEach((line, i) => ctx.fillText(line, PAD_X, 556 + i * 78))
    const titleBottom = 556 + (titleLines.length - 1) * 78

    // Nombre del alumno (subtítulo).
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    ctx.font = `600 34px ${display}`
    ctx.fillText(firstName(data.fullName), PAD_X, titleBottom + 48)

    // Grid de 3 tiles.
    const gap = 28
    const tileW = (WIDTH - PAD_X * 2 - gap * 2) / 3
    const tileH = 300
    const tileY = 728
    const tiles = [
        { emoji: '💪', value: String(Math.max(0, data.sessions)), label: 'Sesiones' },
        { emoji: '🏋️', value: fmtVolume(data.volumeKg), label: 'Volumen' },
        {
            emoji: '🔥',
            value: String(Math.max(0, Math.round(data.streak))),
            label: data.streak === 1 ? 'Día de racha' : 'Días de racha',
        },
    ]
    tiles.forEach((t, i) => {
        const x = PAD_X + i * (tileW + gap)
        drawStatTile(ctx, x, tileY, tileW, tileH, { ...t, accent, display })
    })

    // Fecha.
    ctx.fillStyle = 'rgba(255,255,255,0.58)'
    ctx.font = `600 32px ${display}`
    ctx.textAlign = 'left'
    ctx.fillText(todayLong(), PAD_X, 1120)

    drawBrandFooter(ctx, brand, { display, accent })

    return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'))
}
