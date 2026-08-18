import { type ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'
import { ChevronRight, Copy, Pencil, Star } from 'lucide-react-native'
import { useTheme } from '../../context/ThemeContext'
import type { NutritionV2PlanTemplateListItem } from '../../lib/nutrition-v2-plan-templates.api'
import { NutritionSkeleton, NutritionStatePanel } from './NutritionV2Kit'

/**
 * Biblioteca de plantillas del coach, como LISTA reutilizable.
 *
 * Existia solo dentro del sheet "Nuevo plan → Reutilizar" (`NewPlanPickerSheet`, T3.3b). Con la
 * paridad de tablist (QA T3.v: la web manda y su segunda pestaña es "Plantillas") el hub necesita
 * la MISMA lista como cuerpo de pestaña, asi que se extrae aca tal cual y las dos superficies la
 * comparten. Extraccion ADITIVA: el picker sigue pasando su propio verbo (`onOpen` = "partir de
 * esta plantilla") y su lapiz; la pestaña pasa el suyo (`onOpen` = abrir en el editor).
 *
 * Presentacion en tokens del DS (`bg-surface-*`, `border-*`, `text-*`): lo unico imperativo son
 * los colores de los glifos lucide, que exigen literal (no hay clase que tiña un SVG nativo).
 */

/**
 * Resumen de una plantilla en una linea — espejo de `summaryLine` de web
 * (`_components/PlanTemplatesLibrary.tsx:77-90`), mismo orden y mismos separadores. Sin datos
 * legibles cae a "Plantilla". `source` no viaja en el contrato mobile, asi que la coletilla
 * "rescatada de la version anterior" es la unica parte del espejo que no aplica.
 */
export function planTemplateSubtitle(template: NutritionV2PlanTemplateListItem): string {
  if (!template.readable) return 'No se puede abrir: se guardó con una versión anterior.'
  const parts = [
    template.summary?.calories ? `${template.summary.calories} kcal` : null,
    template.summary?.mealSlotCount ? `${template.summary.mealSlotCount} franjas` : null,
    template.summary?.dayVariantCount && template.summary.dayVariantCount > 1
      ? `${template.summary.dayVariantCount} días`
      : null,
    template.summary?.hasPortions ? 'con porciones' : null,
    template.usageCount > 0 ? `usada ${template.usageCount}×` : null,
  ].filter((part): part is string => part != null)
  return parts.length === 0 ? 'Plantilla' : parts.join(' · ')
}

export interface PlanTemplateListProps {
  /** `null` = la biblioteca todavia no se intento cargar (pestaña sin abrir). */
  templates: NutritionV2PlanTemplateListItem[] | null
  loading: boolean
  error: string | null
  onRetry: () => void
  /** Verbo primario de la fila. Una plantilla ilegible nunca lo dispara. */
  onOpen: (template: NutritionV2PlanTemplateListItem) => void
  /** Etiqueta accesible del verbo primario ("Partir de la plantilla X" / "Editar la plantilla X"). */
  openAccessibilityLabel: (name: string) => string
  /** Accion secundaria opcional (lapiz). Se omite y la fila queda con un solo verbo. */
  onEdit?: (template: NutritionV2PlanTemplateListItem) => void
  editAccessibilityLabel?: (name: string) => string
  /** Segunda linea con la descripcion guardada, cuando la haya. */
  showDescription?: boolean
  emptyMessage: string
  /** CTA del estado vacio (p. ej. "Nueva plantilla"). */
  emptyAction?: ReactNode
}

export function PlanTemplateList({
  templates,
  loading,
  error,
  onRetry,
  onOpen,
  openAccessibilityLabel,
  onEdit,
  editAccessibilityLabel,
  showDescription = false,
  emptyMessage,
  emptyAction,
}: PlanTemplateListProps) {
  const { theme } = useTheme()

  // Tambien durante el REINTENTO: sin esto, recargar tras un error mostraria el estado vacio
  // (la lista ya no es `null`) y parpadearia "Aún no tienes plantillas".
  if (loading) return <NutritionSkeleton variant="coach" rows={2} />

  if (error) {
    return (
      <NutritionStatePanel
        icon="error"
        tone="danger"
        title="No pudimos cargar tus plantillas"
        description={error}
        action={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Reintentar cargar plantillas"
            onPress={onRetry}
            className="min-h-11 flex-row items-center justify-center gap-1.5 rounded-control border border-default bg-surface-card px-3"
          >
            <Text className="text-sm font-semibold text-strong">Reintentar</Text>
          </Pressable>
        }
      />
    )
  }

  if ((templates?.length ?? 0) === 0) {
    return (
      <View className="items-center rounded-control border border-subtle bg-surface-sunken px-4 py-8">
        <Copy color={theme.textSecondary} size={26} />
        <Text className="mt-2 text-center text-sm text-muted">{emptyMessage}</Text>
        {emptyAction ? <View className="mt-3">{emptyAction}</View> : null}
      </View>
    )
  }

  return (
    // `gap-2` es el `space-y-2` de la web: el mismo aire entre filas en las dos plataformas.
    <View className="gap-2">
      {(templates ?? []).map((template) => (
        /* La TARJETA es el CONTENEDOR de la fila, no el verbo (QA del dueño en device, 18-08).
         *
         * Antes el borde y el fondo vivian en el Pressable primario y el lapiz quedaba FUERA, suelto
         * sobre el fondo de la pantalla: se leia como un glifo huerfano —no como la accion
         * secundaria de esa plantilla— y encima la tarjeta y el lapiz no compartian alineacion.
         * La web nunca tuvo ese problema porque su fila es un `<li>` con borde propio y TODOS los
         * verbos adentro (`PlanTemplatesLibrary.tsx:308-350`); aca se copia ese criterio en vez de
         * inventar uno nuevo.
         *
         * Dos Pressable HERMANOS dentro de la tarjeta, NO anidados: anidarlos deja el reparto del
         * toque al responder de RN, y con dos destinos distintos (aplicar vs. editar) esa es una
         * loteria que no hace falta correr.
         *
         * `overflow-hidden` para que el resalte `active:` de la zona primaria —que llega hasta el
         * borde izquierdo— quede recortado por el radio de la tarjeta: RN no clipea a los hijos.
         *
         * Ilegible ⇒ la opacidad baja va ahora en la TARJETA (antes en el Pressable, que ya no pinta
         * fondo). Esas filas ademas nunca traen lapiz, asi que no queda nada al 100% al lado.
         */
        <View
          key={template.id}
          className={`flex-row items-center overflow-hidden rounded-control border border-default bg-surface-card ${template.readable ? '' : 'opacity-50'}`}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !template.readable }}
            accessibilityLabel={openAccessibilityLabel(template.name)}
            disabled={!template.readable}
            onPress={() => onOpen(template)}
            // Gotcha del repo: `className` + `style` como FUNCION se descarta entero en css-interop,
            // asi que el estado `pressed` vive en la variante `active:` y jamas en un `style` callback.
            className="min-h-11 min-w-0 flex-1 flex-row items-center gap-3 px-3 py-2.5 active:bg-surface-sunken"
          >
            {template.isFavorite ? (
              <Star color={theme.warning} size={16} />
            ) : (
              <Copy color={theme.textSecondary} size={16} />
            )}
            <View className="min-w-0 flex-1">
              <Text className="font-semibold text-strong" numberOfLines={1}>
                {template.name}
              </Text>
              {showDescription && template.description ? (
                <Text className="text-xs text-body" numberOfLines={1}>
                  {template.description}
                </Text>
              ) : null}
              <Text className="text-xs text-muted" numberOfLines={1}>
                {planTemplateSubtitle(template)}
              </Text>
            </View>
            {/* Se queda: es la unica pista de que TOCAR la fila hace algo. En la web ese trabajo lo
                hace el boton «Aplicar», que aca seria un tercer target compitiendo en 360 dp. */}
            <ChevronRight color={theme.textSecondary} size={16} />
          </Pressable>
          {/* Solo si el draft guardado todavia valida: una plantilla ilegible abriria un editor
              en blanco y guardarla la vaciaria. */}
          {onEdit && template.readable ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                editAccessibilityLabel?.(template.name) ?? `Editar la plantilla ${template.name}`
              }
              onPress={() => onEdit(template)}
              // 44×44 de target real (regla del repo) con la caja VISIBLE de 36: el cuadrado lleno a
              // 44 se come la fila, y a 36 queda en la misma proporcion que la web (`p-2` sobre un
              // glifo de 16). `mr-1` deja los 4 dp que faltan hasta el borde de la tarjeta.
              className="mr-1 h-11 w-11 items-center justify-center active:opacity-70"
            >
              {/* El aro + la superficie hundida son lo que lo ancla como boton en vez de glifo suelto.
                  Funciona en los dos temas: en claro `surface-sunken` es mas oscuro que la tarjeta y
                  en oscuro es mas claro, asi que siempre se despega. */}
              <View className="h-9 w-9 items-center justify-center rounded-control border border-subtle bg-surface-sunken">
                <Pencil color={theme.textSecondary} size={16} />
              </View>
            </Pressable>
          ) : null}
        </View>
      ))}
    </View>
  )
}
