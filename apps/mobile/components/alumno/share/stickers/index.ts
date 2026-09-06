/**
 * Share Entreno — barrel del único sticker del canvas.
 *
 * `StatsBlockSticker` es un componente visual PURO: recibe `{ data, k, stickerScale, tokens }`, NO
 * se posiciona solo (el canvas lo ubica según el `StickerState` del layout), no tiene estado, ni
 * gestos, ni acceso a ThemeContext.
 */

export { StatsBlockSticker } from './StatsBlockSticker'

// Vocabulario compartido (escaladores, contorno/sombra, contrato de props). El canvas toma de acá
// los dos literales de tinta (`INK_950`/`INK_900`) del fondo de marca y el composer usa `withAlpha`
// para sus velos: los MISMOS que el sticker, para que un cambio de tono no haya que cazarlo en dos
// archivos.
export * from './sticker-kit'
