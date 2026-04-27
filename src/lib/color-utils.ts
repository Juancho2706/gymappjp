/**
 * Utilidades para generar paletas de marca automáticamente
 * desde un color primario HEX. Sin dependencias externas.
 */

/**
 * Convierte HEX a HSL. Devuelve [h, s, l] donde h∈[0,360], s∈[0,100], l∈[0,100]
 */
export function hexToHsl(hex: string): [number, number, number] {
    const clean = hex.replace('#', '')
    const r = parseInt(clean.substring(0, 2), 16) / 255
    const g = parseInt(clean.substring(2, 4), 16) / 255
    const b = parseInt(clean.substring(4, 6), 16) / 255

    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    let h = 0
    let s = 0
    const l = (max + min) / 2

    if (max !== min) {
        const d = max - min
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
        switch (max) {
            case r:
                h = (g - b) / d + (g < b ? 6 : 0)
                break
            case g:
                h = (b - r) / d + 2
                break
            case b:
                h = (r - g) / d + 4
                break
        }
        h *= 60
    }

    return [Math.round(h), Math.round(s * 100), Math.round(l * 100)]
}

/**
 * Convierte HSL a HEX.
 */
export function hslToHex(h: number, s: number, l: number): string {
    const sNorm = s / 100
    const lNorm = l / 100

    const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
    const m = lNorm - c / 2

    let r = 0, g = 0, b = 0
    if (h < 60) { r = c; g = x; b = 0 }
    else if (h < 120) { r = x; g = c; b = 0 }
    else if (h < 180) { r = 0; g = c; b = x }
    else if (h < 240) { r = 0; g = x; b = c }
    else if (h < 300) { r = x; g = 0; b = c }
    else { r = c; g = 0; b = x }

    const toHex = (n: number) => {
        const hex = Math.round((n + m) * 255).toString(16)
        return hex.length === 1 ? '0' + hex : hex
    }

    return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

/**
 * Genera una paleta completa a partir de un color primario HEX.
 */
export function generateBrandPalette(primaryHex: string) {
    const [h, s, l] = hexToHsl(primaryHex)
    const contrast = getContrastInfo(primaryHex)

    return {
        primary: primaryHex,
        primaryDark: hslToHex(h, Math.min(s + 10, 100), Math.max(l - 15, 10)),
        primaryLight: hslToHex(h, Math.max(s - 10, 0), Math.min(l + 20, 95)),
        primarySurface: hslToHex(h, Math.max(s - 20, 0), Math.min(l + 35, 97)),
        primaryGlow: hslToHex(h, s, Math.min(l + 10, 90)),
        primaryRgb: hexToRgb(primaryHex),
        primaryForeground: contrast.textColor,
    }
}

export function hexToRgb(hex: string): string {
    const clean = hex.replace('#', '')
    const r = parseInt(clean.substring(0, 2), 16)
    const g = parseInt(clean.substring(2, 4), 16)
    const b = parseInt(clean.substring(4, 6), 16)
    return `${r}, ${g}, ${b}`
}

function toLinearChannel(c: number): number {
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

function getRelativeLuminance(hex: string): number {
    const clean = hex.replace('#', '')
    const r = toLinearChannel(parseInt(clean.substring(0, 2), 16) / 255)
    const g = toLinearChannel(parseInt(clean.substring(2, 4), 16) / 255)
    const b = toLinearChannel(parseInt(clean.substring(4, 6), 16) / 255)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Returns WCAG contrast info for the color against white and black text. */
export function getContrastInfo(hex: string): {
    ratio: number
    level: 'AA' | 'AA-large' | 'fail'
    textColor: '#ffffff' | '#000000'
} {
    const lum = getRelativeLuminance(hex)
    const ratioVsWhite = (1.05) / (lum + 0.05)
    const ratioVsBlack = (lum + 0.05) / (0.05)
    const ratio = Math.max(ratioVsWhite, ratioVsBlack)
    const textColor = ratioVsBlack >= ratioVsWhite ? '#000000' : '#ffffff'
    const level = ratio >= 4.5 ? 'AA' : ratio >= 3 ? 'AA-large' : 'fail'
    return { ratio, level, textColor }
}
