/**
 * White-label W1b — adaptador de UI de la galería de TEMAS curados sobre `@eva/brand-kit`.
 *
 * El catálogo canónico (`THEME_PRESETS` + `BrandPreset` + `getThemePreset` + `resolvePresetBranding`)
 * lo define W1a en `packages/brand-kit/presets.ts` (TS puro, compartido web+RN, re-exportado por el
 * index). Este módulo NO duplica esa lógica: re-exporta el lookup y agrega SOLO metadata de
 * presentación web (lista normalizada + labels/orden de "feel" + guard de validación) que consumen
 * la galería (Mi Marca) y el server action.
 */
import { THEME_PRESETS, getThemePreset, type BrandPreset, type PresetFeel } from '@eva/brand-kit'

export { getThemePreset }
export type { BrandPreset, PresetFeel }

export const FEEL_META: Record<PresetFeel, { label: string }> = {
    bold: { label: 'Intenso' },
    calm: { label: 'Sereno' },
    techy: { label: 'Techy' },
    warm: { label: 'Cálido' },
}

/** Orden de los chips de filtro por "feel" en la galería. */
export const FEEL_ORDER: PresetFeel[] = ['bold', 'calm', 'techy', 'warm']

/**
 * Lista normalizada de presets para renderizar la galería. Robusta a que el catálogo se exporte
 * como array (hoy) o como Record → en ambos casos obtenemos `BrandPreset[]`.
 */
export const THEME_PRESET_LIST: BrandPreset[] = Array.isArray(THEME_PRESETS)
    ? (THEME_PRESETS as readonly BrandPreset[]).slice()
    : (Object.values(THEME_PRESETS as unknown as Record<string, BrandPreset>) as BrandPreset[])

/** Type guard para validar `theme_preset_key` contra el catálogo (server action). */
export function isThemePresetKey(key: string | null | undefined): key is string {
    return !!getThemePreset(key)
}
