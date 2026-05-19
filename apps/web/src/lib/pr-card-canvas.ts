export interface PRCardOptions {
    title: string
    subtitle?: string
    statLabel: string
    statValue: string
    coachName?: string
    primaryColor?: string
    width?: number
    height?: number
}

const DEFAULT_WIDTH = 1080
const DEFAULT_HEIGHT = 1080
const DEFAULT_PRIMARY = '#10B981'

export async function renderPRCardToBlob(opts: PRCardOptions): Promise<Blob | null> {
    if (typeof document === 'undefined') return null

    const width = opts.width ?? DEFAULT_WIDTH
    const height = opts.height ?? DEFAULT_HEIGHT
    const primary = opts.primaryColor ?? DEFAULT_PRIMARY

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    const gradient = ctx.createLinearGradient(0, 0, width, height)
    gradient.addColorStop(0, '#0a0a0a')
    gradient.addColorStop(1, '#1a1a1a')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, width, height)

    ctx.fillStyle = primary
    ctx.beginPath()
    ctx.arc(width - 120, 120, 60, 0, Math.PI * 2)
    ctx.fill()

    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 96px system-ui, -apple-system, sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText(opts.title, 80, 280)

    if (opts.subtitle) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)'
        ctx.font = '32px system-ui, -apple-system, sans-serif'
        ctx.fillText(opts.subtitle, 80, 340)
    }

    ctx.fillStyle = primary
    ctx.font = 'bold 220px system-ui, -apple-system, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(opts.statValue, width / 2, height / 2 + 80)

    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)'
    ctx.font = '40px system-ui, -apple-system, sans-serif'
    ctx.fillText(opts.statLabel, width / 2, height / 2 + 160)

    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)'
    ctx.font = '28px system-ui, -apple-system, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(opts.coachName ? `vía ${opts.coachName} · EVA` : 'EVA', width / 2, height - 80)

    return new Promise((resolve) => {
        canvas.toBlob((blob) => resolve(blob), 'image/png')
    })
}

export async function renderPRCardToFile(opts: PRCardOptions, filename = 'eva-pr.png'): Promise<File | null> {
    const blob = await renderPRCardToBlob(opts)
    if (!blob) return null
    return new File([blob], filename, { type: 'image/png' })
}
