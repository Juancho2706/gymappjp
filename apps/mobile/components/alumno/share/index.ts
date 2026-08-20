/**
 * Share Entreno (F2) — superficie pública del módulo.
 *
 * El composer (F3) y el modo Acomodar (F4) importan SOLO desde acá: `components/alumno/share`. Las
 * rutas internas (`./stickers/…`, `./share-presets`) son detalle de implementación y pueden moverse
 * sin tocar call sites.
 *
 * Capas, de adentro hacia afuera: contratos (`share-types`) → datos (`share-presets`,
 * `build-share-data`) → pintado (stickers + `ShareCanvas`) → salida (`share-capture`,
 * `share-photo`).
 */

// ── Contratos ────────────────────────────────────────────────────────────────────────────────────
export {
    idleStickerTransform,
    liveDeltaFor,
    SHARE_CANVAS_H,
    SHARE_CANVAS_W,
    type MuscleView,
    type ShareBackground,
    type ShareExercise,
    type SharePreset,
    type SharePresetId,
    type ShareRecord,
    type StickerId,
    type StickerLiveTransform,
    type StickerSize,
    type StickerState,
    type WorkoutShareBrand,
    type WorkoutShareData,
} from './share-types'

// ── Datos: presets y adaptador sesión → card ─────────────────────────────────────────────────────
export {
    cloneStickerLayout,
    DEFAULT_SHARE_PRESET_ID,
    SHARE_PRESET_BY_ID,
    SHARE_PRESETS,
    STICKER_PAINT_ORDER,
} from './share-presets'
export {
    buildWorkoutShareData,
    formatKg,
    type BuildWorkoutShareDataInput,
} from './build-share-data'

// ── Pintado ──────────────────────────────────────────────────────────────────────────────────────
export { MuscleBodySvg, type MuscleBodySvgProps } from './MuscleBodySvg'
// Los 9 stickers + el vocabulario compartido (paleta del canvas oscuro, `sizer`, `withAlpha`…).
// `formatKg` viaja también en ese barrel, pero el re-export explícito de arriba tiene precedencia
// sobre el `export *` y ambos apuntan a la MISMA función (`build-share-data`): no hay ambigüedad.
export * from './stickers'
export { ShareCanvas, type ShareCanvasProps } from './ShareCanvas'

// ── Composer (F3): la pantalla que arma el card ──────────────────────────────────────────────────
export { WorkoutShareComposer, type WorkoutShareComposerProps } from './WorkoutShareComposer'

// ── Entrada (F8): el CTA del resumen post-entreno que abre el composer ───────────────────────────
export {
    SHARE_CTA_ENTER_DELAY_MS,
    ShareWorkoutCta,
    type ShareWorkoutCtaProps,
} from './ShareWorkoutCta'

// ── Acomodar (F4): la capa de edición que se monta ENCIMA del lienzo ─────────────────────────────
export {
    StickerGestureLayer,
    STICKER_LABEL,
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
