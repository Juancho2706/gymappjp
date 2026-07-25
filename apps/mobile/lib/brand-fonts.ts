/**
 * Tipografía white-label RN (2R-3) — espejo móvil de `apps/web/src/lib/brand-fonts.ts`.
 *
 * Evidencia web:
 * - El layout `/c` resuelve `brand_font_key` (gate Pro+ vía `isBrandingAllowed` + preset curado
 *   vía `resolvePresetBranding`) y lo inyecta como `--brand-font`
 *   (apps/web/src/app/c/[coach_slug]/layout.tsx:146-166, 194-195, 309).
 * - TODO heading h1..h6 bajo `/c` consume `var(--brand-font, ...)`
 *   (apps/web/src/app/globals.css:807-811) y la utilidad `font-display` también
 *   (globals.css:21). Decisión CEO #4: la fuente custom aplica SOLO a display/títulos;
 *   el body queda en la familia UI (web brand-fonts.ts:12).
 * - Catálogo CERRADO de 12 fuentes (web brand-fonts.ts:35-48; keys canónicas en
 *   `@eva/schemas` FONT_KEY_TUPLE). Nunca un string arbitrario (anti CSS/asset-injection).
 *
 * Cómo se propaga en RN (adaptación nativa documentada):
 * - RN no tiene CSS vars de fontFamily: las clases NativeWind (`font-display*`) y los roles
 *   de `lib/typography.ts` referencian los NOMBRES 'Archivo_600SemiBold'..'Archivo_900Black'.
 *   En vez de re-tocar ~86 archivos, el registro de fuentes del root (`app/_layout.tsx`)
 *   registra esos 4 NOMBRES de slot display apuntando al ASSET de la fuente de marca
 *   (o al Archivo real cuando no hay fuente custom). Cobertura 1:1 con el `h1..h6` web
 *   sin drift por callsite.
 * - Semántica de refresco: el mapeo se fija al ARRANQUE desde el branding almacenado
 *   (AsyncStorage). Un cambio de fuente del coach aplica al siguiente cold start — mismo
 *   contrato que web, donde `--brand-font` se fija por request y una PWA abierta necesita
 *   full reload para verla. Excepción conocida: la PRIMERA sesión inmediatamente después
 *   de vincular coach (codigo.tsx) muestra el display default hasta reiniciar la app.
 * - Web default sin fuente custom bajo `/c` = Montserrat (web brand-fonts.ts:62-64). El DS
 *   RN ya mapea display→Archivo como espejo documentado (tailwind.config.js:157-181,
 *   components/Sheet.tsx:31); "marca EVA se ve idéntica a hoy" ⇒ el default RN sigue
 *   siendo Archivo. NO es un hallazgo nuevo de esta unidad.
 *
 * Degradaciones de peso (el paquete estático no trae el peso → clamp al más cercano):
 * - space-grotesk: eje 300..700 en Google Fonts → 800/900 → SpaceGrotesk_700Bold
 *   (web tampoco tiene 800/900 reales; el browser los sintetiza, RN no puede).
 * - plus-jakarta / manrope / sora: eje máx 800 → 900 → _800ExtraBold.
 * - Resto del catálogo: 600/700/800/900 reales empaquetados.
 * Ninguna fuente del catálogo quedó SIN empaquetar; sólo hay clamps de peso.
 *
 * GOTCHA build: los TTF de @expo-google-fonts son assets del bundle nativo — las fuentes
 * nuevas llegan con BUILD NATIVA, no por OTA (misma clase que notify-kit).
 */
import type { FontSource } from 'expo-font'
import { FONT_KEY_TUPLE, type FontKey } from '@eva/schemas'
import { resolvePresetBranding } from '@eva/brand-kit'
import { isBrandingAllowed, type SubscriptionTier } from '@eva/tiers'
import {
  Archivo_600SemiBold,
  Archivo_700Bold,
  Archivo_800ExtraBold,
  Archivo_900Black,
} from '@expo-google-fonts/archivo'
import { Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold, Inter_900Black } from '@expo-google-fonts/inter'
import { Montserrat_600SemiBold, Montserrat_700Bold, Montserrat_800ExtraBold, Montserrat_900Black } from '@expo-google-fonts/montserrat'
import { PlusJakartaSans_600SemiBold, PlusJakartaSans_700Bold, PlusJakartaSans_800ExtraBold } from '@expo-google-fonts/plus-jakarta-sans'
import { HankenGrotesk_600SemiBold, HankenGrotesk_700Bold, HankenGrotesk_800ExtraBold, HankenGrotesk_900Black } from '@expo-google-fonts/hanken-grotesk'
import { Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold } from '@expo-google-fonts/manrope'
import { Poppins_600SemiBold, Poppins_700Bold, Poppins_800ExtraBold, Poppins_900Black } from '@expo-google-fonts/poppins'
import { Sora_600SemiBold, Sora_700Bold, Sora_800ExtraBold } from '@expo-google-fonts/sora'
import { SpaceGrotesk_600SemiBold, SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk'
import { Outfit_600SemiBold, Outfit_700Bold, Outfit_800ExtraBold, Outfit_900Black } from '@expo-google-fonts/outfit'
import { Figtree_600SemiBold, Figtree_700Bold, Figtree_800ExtraBold, Figtree_900Black } from '@expo-google-fonts/figtree'
import { DMSans_600SemiBold, DMSans_700Bold, DMSans_800ExtraBold, DMSans_900Black } from '@expo-google-fonts/dm-sans'
import { Lexend_600SemiBold, Lexend_700Bold, Lexend_800ExtraBold, Lexend_900Black } from '@expo-google-fonts/lexend'
import type { CoachBranding } from './branding'

/** Assets por slot display (600/700/800/900 = los 4 pesos que usan las clases/roles RN). */
interface DisplayFaces {
  semibold: FontSource
  bold: FontSource
  extra: FontSource
  black: FontSource
}

/** Slot display del DS RN: los NOMBRES que ya consumen tailwind.config.js y lib/typography.ts. */
export const DISPLAY_SLOT_NAMES = [
  'Archivo_600SemiBold',
  'Archivo_700Bold',
  'Archivo_800ExtraBold',
  'Archivo_900Black',
] as const

/** Default EVA: Archivo real (idéntico a hoy — ver nota de adaptación en el header). */
const DEFAULT_DISPLAY_FACES: DisplayFaces = {
  semibold: Archivo_600SemiBold,
  bold: Archivo_700Bold,
  extra: Archivo_800ExtraBold,
  black: Archivo_900Black,
}

/** Catálogo cerrado — espejo de CURATED_FONTS (web brand-fonts.ts:35-48), assets Expo por peso. */
const CURATED_DISPLAY_FACES: Record<FontKey, DisplayFaces> = {
  'inter': { semibold: Inter_600SemiBold, bold: Inter_700Bold, extra: Inter_800ExtraBold, black: Inter_900Black },
  'montserrat': { semibold: Montserrat_600SemiBold, bold: Montserrat_700Bold, extra: Montserrat_800ExtraBold, black: Montserrat_900Black },
  // Eje 200..800 → black clampa a 800 (web sintetiza 900 en browser; RN no puede).
  'plus-jakarta': { semibold: PlusJakartaSans_600SemiBold, bold: PlusJakartaSans_700Bold, extra: PlusJakartaSans_800ExtraBold, black: PlusJakartaSans_800ExtraBold },
  'hanken': { semibold: HankenGrotesk_600SemiBold, bold: HankenGrotesk_700Bold, extra: HankenGrotesk_800ExtraBold, black: HankenGrotesk_900Black },
  'manrope': { semibold: Manrope_600SemiBold, bold: Manrope_700Bold, extra: Manrope_800ExtraBold, black: Manrope_800ExtraBold },
  'poppins': { semibold: Poppins_600SemiBold, bold: Poppins_700Bold, extra: Poppins_800ExtraBold, black: Poppins_900Black },
  'sora': { semibold: Sora_600SemiBold, bold: Sora_700Bold, extra: Sora_800ExtraBold, black: Sora_800ExtraBold },
  // Eje 300..700 → extra/black clampan a 700.
  'space-grotesk': { semibold: SpaceGrotesk_600SemiBold, bold: SpaceGrotesk_700Bold, extra: SpaceGrotesk_700Bold, black: SpaceGrotesk_700Bold },
  'outfit': { semibold: Outfit_600SemiBold, bold: Outfit_700Bold, extra: Outfit_800ExtraBold, black: Outfit_900Black },
  'figtree': { semibold: Figtree_600SemiBold, bold: Figtree_700Bold, extra: Figtree_800ExtraBold, black: Figtree_900Black },
  'dm-sans': { semibold: DMSans_600SemiBold, bold: DMSans_700Bold, extra: DMSans_800ExtraBold, black: DMSans_900Black },
  'lexend': { semibold: Lexend_600SemiBold, bold: Lexend_700Bold, extra: Lexend_800ExtraBold, black: Lexend_900Black },
}

/** Type guard fail-closed — espejo de `isFontKey` (web brand-fonts.ts:51-53). */
export function isFontKey(value: string | null | undefined): value is FontKey {
  return value != null && (FONT_KEY_TUPLE as readonly string[]).includes(value)
}

/**
 * Resuelve la key de fuente EFECTIVA para el branding almacenado — espejo exacto del gate
 * del layout web /c (apps/web/src/app/c/[coach_slug]/layout.tsx:146-166,194):
 * 1. tier < Pro (`isBrandingAllowed`) ⇒ sin fuente custom (web: `fontKey = ''`).
 * 2. preset curado vía `resolvePresetBranding` — la elección explícita del coach gana
 *    sobre la sugerencia del preset (presets.ts:275,282).
 * 3. key fuera del catálogo cerrado ⇒ null (fail-closed, default EVA).
 * Adaptación: RN no tiene el caso `isManagedBrand` (marca org/orphan) — el branding RN se
 * obtiene siempre por coach (slug/invite_code), sin superficies org.
 */
export function resolveBrandFontKey(branding: CoachBranding | null): FontKey | null {
  if (!branding) return null
  const allowed = branding.subscriptionTier
    ? isBrandingAllowed(branding.subscriptionTier as SubscriptionTier)
    : false
  if (!allowed) return null
  const preset = resolvePresetBranding({
    theme_preset_key: branding.themePresetKey ?? null,
    primary_color: branding.primaryColor ?? null,
    brand_secondary_color: branding.brandSecondaryColor ?? null,
    accent_light: branding.accentLight ?? null,
    accent_dark: branding.accentDark ?? null,
    neutral_tint: branding.neutralTint ?? null,
    brand_font_key: branding.brandFontKey ?? null,
    loader_variant: branding.loaderVariant ?? null,
  })
  return isFontKey(preset.brand_font_key) ? preset.brand_font_key : null
}

/**
 * Mapa de registro para `useFonts` del root: los 4 nombres de slot display apuntando al
 * asset de la fuente de marca resuelta (o Archivo real si no hay). Se spreadea DESPUÉS
 * de las familias estáticas en `app/_layout.tsx` para que estos slots ganen.
 */
export function brandDisplayFontMap(branding: CoachBranding | null): Record<(typeof DISPLAY_SLOT_NAMES)[number], FontSource> {
  const key = resolveBrandFontKey(branding)
  const faces = key ? CURATED_DISPLAY_FACES[key] : DEFAULT_DISPLAY_FACES
  return {
    Archivo_600SemiBold: faces.semibold,
    Archivo_700Bold: faces.bold,
    Archivo_800ExtraBold: faces.extra,
    Archivo_900Black: faces.black,
  }
}
