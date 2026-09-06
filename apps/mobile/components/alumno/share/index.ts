/**
 * Share Entreno — superficie pública del módulo.
 *
 * El host (`SessionCompleteV3`) y el harness importan SOLO desde acá: `components/alumno/share`. Las
 * rutas internas (`./stickers/…`, `./share-layout`) son detalle de implementación y pueden moverse
 * sin tocar call sites.
 *
 * Capas, de adentro hacia afuera: contratos (`share-types`) → datos (`share-layout`,
 * `build-share-data`, `share-block`) → pintado (sticker + `ShareCanvas`) → salida
 * (`share-capture`, `share-photo`, `share-targets`).
 */

// ── Contratos ────────────────────────────────────────────────────────────────────────────────────
export {
    idleStickerTransform,
    liveDeltaFor,
    SHARE_CANVAS_H,
    SHARE_CANVAS_W,
    type ShareBackground,
    type ShareExercise,
    type ShareRecord,
    type StickerId,
    type StickerLiveTransform,
    type StickerSize,
    type StickerState,
    type WorkoutShareBrand,
    type WorkoutShareData,
} from './share-types'

// ── Datos: layout, adaptador sesión → card y las líneas del bloque ───────────────────────────────
export { cloneStickerLayout, SHARE_LAYOUT, STICKER_PAINT_ORDER, type ShareLayout } from './share-layout'
export {
    buildWorkoutShareData,
    formatKg,
    type BuildWorkoutShareDataInput,
} from './build-share-data'
export { blockLines, type ShareBlockLines, type ShareBlockTile } from './share-block'

// ── Pintado ──────────────────────────────────────────────────────────────────────────────────────
// El sticker del bloque + el vocabulario compartido (paleta del canvas oscuro, `sizer`, `withAlpha`…).
// `formatKg` viaja también en ese barrel, pero el re-export explícito de arriba tiene precedencia
// sobre el `export *` y ambos apuntan a la MISMA función (`build-share-data`): no hay ambigüedad.
export * from './stickers'
export { ShareCanvas, type ShareCanvasProps } from './ShareCanvas'

// ── Composer: la pantalla que arma el card ───────────────────────────────────────────────────────
export { WorkoutShareComposer, type WorkoutShareComposerProps } from './WorkoutShareComposer'

// ── Entrada (F8): el CTA del resumen post-entreno que abre el composer ───────────────────────────
export {
    SHARE_CTA_ENTER_DELAY_MS,
    ShareWorkoutCta,
    type ShareWorkoutCtaProps,
} from './ShareWorkoutCta'

// ── Edición: la capa de gestos que se monta ENCIMA del lienzo ────────────────────────────────────
export {
    StickerGestureLayer,
    STICKER_SCALE_MAX,
    STICKER_SCALE_MIN,
    type StickerGestureLayerProps,
} from './StickerGestureLayer'

// ── Salida: PNG y fuentes de foto ────────────────────────────────────────────────────────────────
export {
    captureShareCanvas,
    cleanupShareCapture,
    type CaptureShareCanvasOptions,
} from './share-capture'
export { pickSharePhoto, takeSharePhoto } from './share-photo'
// Destinos (F5): a dónde va el PNG una vez capturado.
export {
    hasFacebookAppId,
    runShareTarget,
    saveToGallery,
    shareToFacebookStories,
    shareToInstagramStories,
    shareToSheet,
    shareToWhatsApp,
    type ShareTarget,
    type ShareTargetInput,
    type ShareTargetOutcome,
    type ShareTargetResult,
} from './share-targets'
