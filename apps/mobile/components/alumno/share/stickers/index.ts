/**
 * Share Entreno (F2) — barrel de los 9 stickers del canvas.
 *
 * Todos son componentes visuales PUROS: reciben `{ data, k, stickerScale, tokens }` y NO se
 * posicionan solos (el canvas los ubica según el `StickerState` del preset). Ninguno tiene estado,
 * gestos ni acceso a ThemeContext.
 */

export { VolumenHeroSticker, type VolumenHeroStickerProps } from './VolumenHeroSticker'
export { StatsRowSticker } from './StatsRowSticker'
export { MuscleFigureSticker, type MuscleFigureStickerProps } from './MuscleFigureSticker'
export { RecordsBandSticker } from './RecordsBandSticker'
export { SetlistSticker } from './SetlistSticker'
export { BrandFooterSticker, type BrandFooterStickerProps } from './BrandFooterSticker'
export { DateChipSticker } from './DateChipSticker'
export { StreakChipSticker } from './StreakChipSticker'
export { QrSticker } from './QrSticker'

// Vocabulario compartido (escaladores, contorno/sombra, contrato de props). El canvas toma de acá
// los dos literales de tinta (`INK_950`/`INK_900`) del fondo de marca y el composer usa `withAlpha`
// para sus velos: los MISMOS que los stickers, para que un cambio de tono no haya que cazarlo en
// nueve archivos.
export * from './sticker-kit'
