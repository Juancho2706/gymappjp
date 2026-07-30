/**
 * Punto de entrada HISTORICO de los loaders (lo importan ~68 pantallas + el editor de marca).
 *
 * QA4 — el sistema de loaders de marca se porto de la web a RN y ahora vive en
 * `components/loaders/`:
 *   - `loaders/EvaLegacyLoader.tsx` → la rama EVA (figura + loader legacy texto/icono del coach).
 *   - `loaders/variants.tsx`        → las 6 variantes white-label + el compositor.
 *   - `loaders/BrandedLoader.tsx`   → el orquestador con la precedencia de la web
 *                                     (loader_config > loader_variant > legacy > EVA).
 *
 * Este archivo queda como fachada retrocompatible para no tocar los call sites:
 *   - `EvaLoader`       = la rama EVA legacy (mismo componente y props de siempre).
 *   - `EvaLoaderScreen` = el loader de RUTA, ahora brandeado (BrandedLoaderScreen).
 * La separacion en archivos tambien evita el ciclo de imports entre orquestador y rama EVA.
 */
export { EvaLegacyLoader as EvaLoader, type EvaLoaderSize } from './loaders/EvaLegacyLoader'
export { BrandedLoaderScreen as EvaLoaderScreen, BrandedLoader } from './loaders/BrandedLoader'
