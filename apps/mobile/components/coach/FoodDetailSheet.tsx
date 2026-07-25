import { useEffect, useState } from 'react'
import { Linking, Pressable, Text, View } from 'react-native'
import { Image } from 'expo-image'
import { Barcode, ExternalLink, Maximize2 } from 'lucide-react-native'
import type { FoodCatalogItem } from '@eva/nutrition-v2'
import { Sheet } from '../Sheet'
import { PhotoLightbox } from '../PhotoLightbox'
import { FoodThumbnail } from '../nutrition-v2'
import { MacroChipRow } from '../nutrition-v2/MacroChipRow'
import { useTheme } from '../../context/ThemeContext'
import {
  formatBarcode,
  getFoodSourceAttribution,
  getFoodVerificationLabel,
  type FoodVerificationTone,
} from '../../lib/food-detail'
import { foodMediaThumbnailUrl } from '../../lib/nutrition-v2-food-media'

/**
 * Ficha de alimento del catálogo V2 (RN, read-only) — port de
 * `apps/web/src/components/coach/FoodDetailSheet.tsx:58-287`.
 *
 * Se abre desde `foods.tsx` con el `FoodCatalogItem` ya cargado por la búsqueda (sin
 * segundo fetch, igual que la web construye `FoodDetailData` con `foodCatalogItemToDetail`).
 * Secciones, en orden: header visual (foto ampliable o icono de categoría) · badge de
 * verificación · macros "Por {basis}" · micros presentes · porción casera/envase · código
 * de barras · fuente. `householdLabel`/`householdGrams` no viajan en el read model del
 * catálogo → la porción casera se oculta (paridad exacta con web).
 *
 * Montada sobre el `Sheet` DS con `nativeModal`: bajo este stack (@gorhom 5.2.14 +
 * reanimated 4 + Fabric) el path gorhom es frágil en cold-start (ver docs de la prop
 * `nativeModal` en components/Sheet.tsx); esta ficha se abre desde una pantalla recién
 * montada, así que usa el path `<Modal>` nativo probado.
 */

type Props = {
  open: boolean
  onClose: () => void
  item: FoodCatalogItem | null
}

// Tonos del badge de verificación mapeados a tokens del DS RN (mismo criterio que el kit
// `NutritionV2Kit.tsx` toneClasses: los raw emerald/sky/rose del web caen a semánticos
// success/info/danger que flipean en dark y respetan white-label; cero valores crudos).
const VERIFICATION_TONE_CLASSES: Record<FoodVerificationTone, { box: string; text: string }> = {
  verified: { box: 'border-success-500/30 bg-success-500/10', text: 'text-success-700' },
  community: { box: 'border-info-500/30 bg-info-500/10', text: 'text-info-600' },
  neutral: { box: 'border-border-subtle bg-surface-sunken', text: 'text-text-muted' },
  danger: { box: 'border-danger-500/30 bg-danger-500/10', text: 'text-danger-700' },
}

/** Entero sin decimales; resto con `digits` decimales (misma convención que la web). */
function fmt(value: number, digits = 1): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(digits)
}

/** Base de las macros: líquidos por 100 ml, sólidos por 100 g (web `unitBasis`). */
function unitBasis(item: FoodCatalogItem): string {
  return item.servingUnit === 'ml' ? '100 ml' : '100 g'
}

function MicroRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between py-1.5">
      <Text className="text-[13px] text-text-muted">{label}</Text>
      <Text
        className="text-[13px] font-semibold text-text-body"
        style={{ fontVariant: ['tabular-nums'] }}
      >
        {value}
      </Text>
    </View>
  )
}

export function FoodDetailSheet({ open, onClose, item }: Props) {
  const { theme } = useTheme()
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [headerFailed, setHeaderFailed] = useState(false)

  // Al cambiar de alimento, reinicia el estado de la foto del header (web:63-65).
  useEffect(() => {
    setHeaderFailed(false)
  }, [item?.id])

  const attribution = item ? getFoodSourceAttribution(item.source) : null
  const verification = item ? getFoodVerificationLabel(item.verificationStatus) : null
  const basis = item ? unitBasis(item) : '100 g'
  const photoUrl = item ? foodMediaThumbnailUrl(item.media) : null
  const showPhoto = !!photoUrl && !headerFailed

  const micros = item
    ? ([
        item.fiberG != null ? { label: 'Fibra', value: fmt(item.fiberG) + ' g' } : null,
        item.sugarG != null ? { label: 'Azúcares', value: fmt(item.sugarG) + ' g' } : null,
        item.saturatedFatG != null
          ? { label: 'Grasa saturada', value: fmt(item.saturatedFatG) + ' g' }
          : null,
        item.sodiumMg != null ? { label: 'Sodio', value: fmt(item.sodiumMg, 0) + ' mg' } : null,
      ].filter(Boolean) as { label: string; value: string }[])
    : []

  // Porción casera: null en el read model del catálogo → oculta casi siempre (paridad web).
  const household = null
  const pkg =
    item && item.packageQuantity && item.packageUnit
      ? fmt(item.packageQuantity, 0) + ' ' + item.packageUnit
      : null

  const metaLine = item
    ? [item.brand, item.category].filter(Boolean).join(' · ') || 'Ficha del alimento'
    : 'Ficha del alimento'

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={item?.name ?? 'Alimento'}
      description={metaLine}
      snapPoints={['90%']}
      nativeModal
      accessibilityLabel={item ? `Ficha de ${item.name}` : 'Ficha del alimento'}
    >
      {!item ? (
        <Text className="py-12 text-center text-sm text-text-muted">
          No se pudo cargar la ficha del alimento.
        </Text>
      ) : (
        <>
          {/* Header visual: foto de producto (ampliable) o icono de categoría (web:144-180). */}
          {showPhoto ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Ampliar foto de ${item.name}`}
              onPress={() => setLightboxOpen(true)}
              className="h-44 w-full items-center justify-center overflow-hidden rounded-card border border-border-subtle bg-surface-sunken"
            >
              <Image
                alt={item.name}
                source={{ uri: photoUrl! }}
                contentFit="contain"
                transition={120}
                onError={() => setHeaderFailed(true)}
                style={{ width: '100%', height: '100%', padding: 12 }}
              />
              <View className="absolute bottom-2 right-2 h-8 w-8 items-center justify-center rounded-full border border-border-subtle bg-surface-card">
                <Maximize2 color={theme.textSecondary} size={16} />
              </View>
            </Pressable>
          ) : (
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              className="h-36 w-full items-center justify-center rounded-card border border-border-subtle bg-surface-sunken"
            >
              <FoodThumbnail alt={item.name} src={null} fallbackCategory={item.category} size="lg" />
            </View>
          )}

          {verification ? (
            <View className="flex-row flex-wrap items-center gap-2">
              <View
                className={`self-start rounded-pill border px-2.5 py-1 ${VERIFICATION_TONE_CLASSES[verification.tone].box}`}
              >
                <Text
                  className={`text-[11px] font-bold ${VERIFICATION_TONE_CLASSES[verification.tone].text}`}
                >
                  {verification.label}
                </Text>
              </View>
            </View>
          ) : null}

          <View>
            <Text className="mb-2 text-[10px] font-black uppercase tracking-widest text-text-muted">
              Por {basis}
            </Text>
            <MacroChipRow
              calories={item.calories}
              proteinG={item.proteinG}
              carbsG={item.carbsG}
              fatsG={item.fatsG}
              size="md"
            />
          </View>

          {micros.length > 0 ? (
            <View className="rounded-card border border-border-subtle bg-surface-card px-4 py-2">
              <Text className="py-1.5 text-[10px] font-black uppercase tracking-widest text-text-muted">
                Detalle (por {basis})
              </Text>
              <View>
                {micros.map((m, index) => (
                  <View
                    key={m.label}
                    className={index > 0 ? 'border-t border-border-subtle/50' : undefined}
                  >
                    <MicroRow label={m.label} value={m.value} />
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {household || pkg ? (
            <View className="flex-row flex-wrap gap-2">
              {household ? (
                <View className="min-w-0 flex-1 rounded-control border border-border-subtle bg-surface-sunken px-3 py-2.5">
                  <Text className="text-[10px] font-black uppercase tracking-widest text-text-muted">
                    Porción casera
                  </Text>
                  <Text className="mt-0.5 text-[13px] font-semibold text-text-body">{household}</Text>
                </View>
              ) : null}
              {pkg ? (
                <View className="min-w-0 flex-1 rounded-control border border-border-subtle bg-surface-sunken px-3 py-2.5">
                  <Text className="text-[10px] font-black uppercase tracking-widest text-text-muted">
                    Envase
                  </Text>
                  <Text className="mt-0.5 text-[13px] font-semibold text-text-body">{pkg}</Text>
                </View>
              ) : null}
            </View>
          ) : null}

          {item.gtin ? (
            <View className="flex-row items-center gap-2.5 rounded-control border border-border-subtle bg-surface-sunken px-3.5 py-2.5">
              <View className="h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-surface-card">
                <Barcode color={theme.textSecondary} size={16} />
              </View>
              <View className="min-w-0 flex-1">
                <Text className="text-[10px] font-black uppercase tracking-widest text-text-muted">
                  Código de barras
                </Text>
                <Text
                  className="text-[13px] font-semibold text-text-body"
                  numberOfLines={1}
                  style={{ fontVariant: ['tabular-nums'] }}
                >
                  {formatBarcode(item.gtin)}
                </Text>
              </View>
            </View>
          ) : null}

          {attribution ? (
            <View className="rounded-card border border-border-subtle bg-surface-sunken px-4 py-3">
              <Text className="text-[10px] font-black uppercase tracking-widest text-text-muted">
                Fuente
              </Text>
              <Text className="mt-1 text-[13px] font-semibold text-text-body">{attribution.label}</Text>
              {attribution.href ? (
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel={attribution.attributionLine}
                  onPress={() => void Linking.openURL(attribution.href!)}
                  className="mt-1.5 flex-row items-center gap-1"
                >
                  <Text className="text-[12px] font-semibold text-primary">
                    {attribution.attributionLine}
                  </Text>
                  <ExternalLink color={theme.primary} size={12} />
                </Pressable>
              ) : (
                <Text className="mt-1 text-[11.5px] text-text-subtle">{attribution.attributionLine}</Text>
              )}
            </View>
          ) : null}
        </>
      )}

      <PhotoLightbox
        photos={photoUrl ? [photoUrl] : []}
        visible={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
      />
    </Sheet>
  )
}
