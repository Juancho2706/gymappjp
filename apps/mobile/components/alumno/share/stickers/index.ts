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

// Vocabulario compartido (paleta del canvas oscuro, escalador, contrato de props) — lo consume el
// canvas para pintar fondos/velos con los MISMOS literales que los stickers.
export * from './sticker-kit'
